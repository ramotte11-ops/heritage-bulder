import { uploadInChunks, type DirectUploadOptions, type DirectUploadResult } from "./direct-upload";
import type { VideoHostingActions, VideoUploadRefusalReason } from "./hosted-video-types";

/**
 * VID-07 — les envois en cours, le temps de la page (code navigateur).
 *
 * Comme le registre des fichiers (`local-video-registry.ts`), ils vivent au
 * niveau du module et non d'un composant : un envoi de plusieurs centaines de
 * Mo continue quand la famille passe à l'écran suivant du Builder ; il meurt
 * avec la page (fermeture, rechargement), et l'écran A16 propose alors de le
 * reprendre.
 *
 * Phases, vues par la famille :
 *  - `preparing`   : l'autorisation est demandée au serveur HERITAGE ;
 *  - `sending`     : le fichier part DIRECTEMENT vers l'hébergeur, avec sa progression ;
 *  - `sent`        : l'hébergeur a reçu le fichier entier ; la mise en forme
 *                    reste à confirmer par le serveur (jamais « enregistrée » ici) ;
 *  - `interrupted` : coupure durable, adresse expirée, refus de l'hébergeur ;
 *  - `cancelled`   : la famille a annulé ;
 *  - `refused`     : le serveur a refusé l'envoi (limites, offre).
 */

export type VideoTransferPhase = "preparing" | "sending" | "sent" | "interrupted" | "cancelled" | "refused";

export interface VideoTransfer {
  draftVideoId: string;
  phase: VideoTransferPhase;
  /** 0 à 100, arrondi vers le bas : 100 seulement quand tout est reçu. */
  percent: number;
  /** Ligne serveur de l'envoi, dès qu'elle est autorisée. */
  videoId: string | null;
  refusal: VideoUploadRefusalReason | null;
}

export interface StartVideoTransfer {
  draftVideoId: string;
  file: Blob;
  declaredDurationSeconds: number | null;
  hosting: Pick<VideoHostingActions, "request" | "cancel">;
  /** Envoi précédent du même emplacement (interrompu, expiré) : annulé avant d'en demander un autre. */
  previousVideoId?: string | null;
}

export interface VideoTransferManager {
  get(draftVideoId: string): VideoTransfer | null;
  /** Instantané immuable (nouvelle référence à chaque changement), pour `useSyncExternalStore`. */
  snapshot(): ReadonlyMap<string, VideoTransfer>;
  subscribe(listener: () => void): () => void;
  /** Sans effet si un envoi est déjà en préparation ou en cours pour cet emplacement. */
  start(input: StartVideoTransfer): Promise<void>;
  /** Annulation par la famille : l'envoi s'arrête, le serveur en est informé. */
  cancel(draftVideoId: string, hosting: Pick<VideoHostingActions, "cancel">): Promise<void>;
  /** Arrêt silencieux et oubli (vidéo retirée, remplacée). */
  forget(draftVideoId: string): void;
}

export function isTransferActive(transfer: VideoTransfer | null | undefined): boolean {
  return transfer?.phase === "preparing" || transfer?.phase === "sending";
}

export function createVideoTransferManager(deps: { upload?: (options: DirectUploadOptions) => Promise<DirectUploadResult> } = {}): VideoTransferManager {
  const upload = deps.upload ?? uploadInChunks;
  let state = new Map<string, VideoTransfer>();
  const controllers = new Map<string, AbortController>();
  const generations = new Map<string, number>();
  const listeners = new Set<() => void>();

  const write = (draftVideoId: string, transfer: VideoTransfer | null) => {
    const next = new Map(state);
    if (transfer === null) next.delete(draftVideoId);
    else next.set(draftVideoId, transfer);
    state = next;
    for (const listener of listeners) listener();
  };
  const bump = (draftVideoId: string) => {
    const generation = (generations.get(draftVideoId) ?? 0) + 1;
    generations.set(draftVideoId, generation);
    return generation;
  };
  const current = (draftVideoId: string, generation: number) => generations.get(draftVideoId) === generation;

  return {
    get: (id) => state.get(id) ?? null,
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async start(input) {
      const id = input.draftVideoId;
      if (isTransferActive(state.get(id))) return;
      const generation = bump(id);
      const base = { draftVideoId: id, percent: 0, videoId: null, refusal: null };
      write(id, { ...base, phase: "preparing" });

      if (input.previousVideoId) await input.hosting.cancel(input.previousVideoId).catch(() => undefined);
      if (!current(id, generation)) return;

      let granted: { videoId: string; uploadUrl: string };
      try {
        const result = await input.hosting.request(id, input.declaredDurationSeconds);
        if (!current(id, generation)) return;
        if (result.status !== "granted") {
          write(id, { ...base, phase: "refused", refusal: result.status === "refused" ? result.reason : "other" });
          return;
        }
        granted = result;
      } catch {
        if (current(id, generation)) write(id, { ...base, phase: "refused", refusal: "other" });
        return;
      }

      const controller = new AbortController();
      controllers.set(id, controller);
      write(id, { ...base, phase: "sending", videoId: granted.videoId });
      const total = input.file.size;
      const outcome = await upload({
        url: granted.uploadUrl,
        file: input.file,
        signal: controller.signal,
        onProgress: (received) => {
          if (!current(id, generation)) return;
          const percent = total === 0 ? 100 : Math.min(100, Math.floor((received / total) * 100));
          const before = state.get(id);
          if (before?.phase === "sending" && before.percent !== percent) write(id, { ...before, percent });
        },
      }).catch((): DirectUploadResult => ({ status: "failed" }));
      if (controllers.get(id) === controller) controllers.delete(id);
      if (!current(id, generation)) return;
      // Une annulation par la famille a déjà écrit son propre état.
      if (outcome.status === "aborted") return;
      write(id, {
        ...base,
        videoId: granted.videoId,
        phase: outcome.status === "done" ? "sent" : "interrupted",
        percent: outcome.status === "done" ? 100 : (state.get(id)?.percent ?? 0),
      });
    },

    async cancel(id, hosting) {
      const transfer = state.get(id);
      if (transfer?.phase !== "sending") return;
      bump(id);
      controllers.get(id)?.abort();
      controllers.delete(id);
      write(id, { ...transfer, phase: "cancelled" });
      if (transfer.videoId !== null) await hosting.cancel(transfer.videoId).catch(() => undefined);
    },

    forget(id) {
      bump(id);
      controllers.get(id)?.abort();
      controllers.delete(id);
      if (state.has(id)) write(id, null);
    },
  };
}

let pageTransfers: VideoTransferManager | null = null;

/** Les envois de la page (un seul gestionnaire par onglet). */
export function pageVideoTransfers(): VideoTransferManager {
  pageTransfers ??= createVideoTransferManager();
  return pageTransfers;
}
