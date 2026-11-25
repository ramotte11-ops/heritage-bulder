import type { HostedVideoRepository, HostedVideoRow, ReconcileRow, ReserveOutcome } from "./hosted-video-repository";
import type { MuxApi } from "./mux-api";
import type { HostedVideoEventInput } from "./mux-webhook";
import { signedVideoPlayback, type SignedPlaybackKey } from "./mux-playback";

/**
 * SERVER ONLY. VID-07 — l'orchestration de l'hébergement : la base (RPC sous
 * verrou) décide, Mux exécute. Toutes les dépendances sont injectées : les
 * tests l'exercent entièrement avec des doubles, sans compte Mux.
 *
 * Trois états distincts, jamais confondus :
 *  1. téléversement (réservation, envoi direct navigateur → Mux) ;
 *  2. disponibilité technique (webhook « asset ready » + durée vérifiée) ;
 *  3. publication (copie publiée de l'hommage, offre complète) — hors de ce
 *     service : aucune vidéo n'est publiée à la fin d'un envoi.
 */

export interface HostedVideoServiceDeps {
  repository: HostedVideoRepository;
  mux: MuxApi;
  playbackKey: SignedPlaybackKey;
  corsOrigin: string;
  /** Demander un MP4 720p à Mux (coût supplémentaire ; décision PO). */
  mp4Fallback: boolean;
  now: () => number;
}

export type UploadRequestResult =
  | { status: "granted"; videoId: string; uploadUrl: string; expiresAt: string }
  | { status: "refused"; reason: Exclude<ReserveOutcome, "reserved"> }
  | { status: "unavailable" };

export type { HostedVideoState, HostedVideoView } from "./hosted-video-types";
import type { HostedVideoState, HostedVideoView } from "./hosted-video-types";

const STATE: Record<HostedVideoRow["status"], HostedVideoState> = {
  reserved: "pending",
  uploading: "uploading",
  processing: "processing",
  ready: "ready",
  rejected: "failed",
  errored: "failed",
  cancelled: "failed",
  deletion_requested: "removing",
  deleted: "removing",
};

export function createHostedVideoService(deps: HostedVideoServiceDeps) {
  async function deleteAssetQuietly(assetId: string | null): Promise<boolean> {
    if (assetId === null) return true;
    try {
      await deps.mux.deleteAsset(assetId);
      return true;
    } catch {
      return false; // repris par la réconciliation
    }
  }

  async function handleEvent(event: HostedVideoEventInput) {
    const result = await deps.repository.applyEvent(event);
    if (result.assetToDelete !== null) {
      // La base garde l'état visible par la famille (refusée, en échec) ;
      // la confirmation note seulement que l'asset n'existe plus.
      const deleted = await deleteAssetQuietly(result.assetToDelete);
      if (deleted && result.videoId !== null) await deps.repository.confirmDeleted(result.videoId);
    }
    if (result.supersededAsset !== null) await deleteAssetQuietly(result.supersededAsset);
    return result;
  }

  /** Une ligne restée sans nouvelle : interroger Mux et rejouer la transition (identifiant d'événement stable). */
  async function reconcileRow(row: ReconcileRow): Promise<boolean> {
    const base = { videoId: row.videoId, uploadId: row.uploadId, assetId: row.assetId, playbackId: null, durationMs: null };
    try {
      if (row.status === "deletion_requested" || row.status === "rejected" || row.status === "errored" || row.status === "cancelled") {
        if (row.uploadId !== null && row.assetId === null) await deps.mux.cancelUpload(row.uploadId).catch(() => {});
        if (await deleteAssetQuietly(row.assetId)) {
          await deps.repository.confirmDeleted(row.videoId);
          return true;
        }
        return false;
      }
      if (row.status === "processing" && row.assetId !== null) {
        const asset = await deps.mux.getAsset(row.assetId);
        if (asset === null) {
          await handleEvent({ ...base, eventId: `reconcile:${row.videoId}:asset_missing`, type: "asset_errored" });
          return true;
        }
        if (asset.status === "ready") {
          await handleEvent({ ...base, eventId: `reconcile:${row.videoId}:asset_ready`, type: "asset_ready", playbackId: asset.signedPlaybackId, durationMs: asset.durationMs });
          return true;
        }
        if (asset.status === "errored") {
          await handleEvent({ ...base, eventId: `reconcile:${row.videoId}:asset_errored`, type: "asset_errored" });
          return true;
        }
        return false;
      }
      if (row.uploadId !== null && (row.status === "uploading" || row.status === "processing")) {
        const upload = await deps.mux.getUpload(row.uploadId);
        if (upload.status === "asset_created" && upload.assetId !== null) {
          await handleEvent({ ...base, eventId: `reconcile:${row.videoId}:asset_created`, type: "upload_asset_created", assetId: upload.assetId });
          return true;
        }
        if (upload.status === "timed_out" || upload.status === "cancelled") {
          await handleEvent({ ...base, eventId: `reconcile:${row.videoId}:upload_${upload.status}`, type: upload.status === "timed_out" ? "upload_expired" : "upload_cancelled" });
          return true;
        }
        if (upload.status === "errored") {
          await handleEvent({ ...base, eventId: `reconcile:${row.videoId}:upload_errored`, type: "upload_errored" });
          return true;
        }
        return false;
      }
      if (row.status === "reserved" && row.uploadExpiresAt === null) {
        // Réservation dont l'adresse d'envoi n'a jamais été créée.
        await deps.repository.failUpload({ videoId: row.videoId, reason: "hosting_unavailable" });
        return true;
      }
    } catch {
      // Mux indisponible : la ligne reste à réconcilier au prochain passage.
    }
    return false;
  }

  return {
    /** Réservation sous verrou, puis adresse d'envoi direct Mux, puis rattachement. */
    async requestUpload(input: { ownerId: string; memorialId: string; draftVideoId: string; declaredDurationSeconds: number | null }): Promise<UploadRequestResult> {
      const declared =
        input.declaredDurationSeconds === null || !Number.isFinite(input.declaredDurationSeconds) || input.declaredDurationSeconds <= 0
          ? null
          : Math.ceil(input.declaredDurationSeconds * 1000 - 1e-6);
      const reservation = await deps.repository.reserve({ ownerId: input.ownerId, memorialId: input.memorialId, draftVideoId: input.draftVideoId, declaredDurationMs: declared });
      if (reservation.outcome !== "reserved" || reservation.videoId === null) {
        return { status: "refused", reason: reservation.outcome === "reserved" ? "refused" : reservation.outcome };
      }
      const videoId = reservation.videoId;
      let upload;
      try {
        upload = await deps.mux.createDirectUpload({ videoId, corsOrigin: deps.corsOrigin, mp4Fallback: deps.mp4Fallback });
      } catch {
        await deps.repository.failUpload({ videoId, reason: "hosting_unavailable" });
        return { status: "unavailable" };
      }
      const attached = await deps.repository.attachUpload({ videoId, uploadId: upload.uploadId, expiresAt: upload.expiresAt });
      if (attached !== "attached") {
        await deps.mux.cancelUpload(upload.uploadId).catch(() => {});
        return { status: "unavailable" };
      }
      return { status: "granted", videoId, uploadUrl: upload.url, expiresAt: upload.expiresAt };
    },

    async cancelUpload(input: { ownerId: string; memorialId: string; videoId: string }): Promise<"cancelled" | "ignored" | "refused"> {
      const result = await deps.repository.cancelUpload(input);
      if (result.outcome === "cancelled" && result.uploadId !== null) await deps.mux.cancelUpload(result.uploadId).catch(() => {});
      return result.outcome;
    },

    /**
     * Notification vérifiée (ou réconciliation) → base, puis nettoyage chez
     * Mux de ce que la base désigne : vidéo refusée, vidéo arrivée après
     * annulation, ancienne vidéo remplacée.
     */
    handleEvent,

    /** Retrait d'une vidéo : la base d'abord (audit, plus de lecture), puis Mux. */
    async removeVideo(input: { ownerId: string; memorialId: string; draftVideoId: string }): Promise<"removed" | "pending_cleanup" | "refused"> {
      const removal = await deps.repository.requestRemoval(input);
      if (removal.refused) return "refused";
      let complete = true;
      for (const row of removal.rows) {
        if (row.uploadId !== null && row.assetId === null) await deps.mux.cancelUpload(row.uploadId).catch(() => {});
        const deleted = await deleteAssetQuietly(row.assetId);
        if (deleted) await deps.repository.confirmDeleted(row.videoId);
        else complete = false;
      }
      return complete ? "removed" : "pending_cleanup";
    },

    /** Reconnexion : les vidéos de l'hommage, avec une lecture signée pour celles qui sont prêtes. */
    async listForOwner(input: { ownerId: string; memorialId: string }): Promise<HostedVideoView[]> {
      const rows = await deps.repository.listForOwner(input);
      return rows.map((row) => {
        const duration = row.verifiedDurationMs ?? row.declaredDurationMs;
        return {
          videoId: row.videoId,
          draftVideoId: row.draftVideoId,
          state: STATE[row.status],
          durationSeconds: duration === null ? null : duration / 1000,
          durationVerified: row.verifiedDurationMs !== null,
          failure: (row.failureReason as HostedVideoView["failure"]) ?? null,
          uploadExpiresAt: row.uploadExpiresAt,
          playback:
            row.status === "ready" && row.playbackId !== null && row.verifiedDurationMs !== null
              ? signedVideoPlayback({ key: deps.playbackKey, playbackId: row.playbackId, durationMs: row.verifiedDurationMs, nowMs: deps.now(), mp4Available: deps.mp4Fallback })
              : null,
        };
      });
    },

    /**
     * Réconciliation (notification manquée) : interroge Mux pour les lignes
     * restées sans nouvelle et rejoue les MÊMES transitions, avec des
     * identifiants d'événement stables (idempotent si rejouée).
     */
    async reconcile(input: { staleBefore: string; limit?: number }): Promise<{ examined: number; applied: number }> {
      const rows = await deps.repository.listToReconcile({ staleBefore: input.staleBefore, limit: input.limit ?? 50 });
      let applied = 0;
      for (const row of rows) if (await reconcileRow(row)) applied += 1;
      return { examined: rows.length, applied };
    },

    /**
     * À l'ouverture de l'étape A16 : les vidéos de CET hommage restées sans
     * nouvelle depuis `staleMs` (2 min par défaut) sont réinterrogées chez
     * Mux, avant l'affichage. Une notification manquée ne bloque donc jamais
     * la famille.
     */
    async refreshForOwner(input: { ownerId: string; memorialId: string; staleMs?: number }): Promise<number> {
      const rows = await deps.repository.listForOwner(input);
      const limit = deps.now() - (input.staleMs ?? 120_000);
      let applied = 0;
      for (const row of rows) {
        const stale = Date.parse(row.updatedAt) < limit;
        const pending = row.status === "reserved" || row.status === "uploading" || row.status === "processing";
        if (!stale || !pending) continue;
        if (await reconcileRow({ videoId: row.videoId, memorialId: input.memorialId, status: row.status, uploadId: row.uploadId, assetId: row.assetId, uploadExpiresAt: row.uploadExpiresAt })) {
          applied += 1;
        }
      }
      return applied;
    },
  };
}

export type HostedVideoService = ReturnType<typeof createHostedVideoService>;
