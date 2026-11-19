import { MEDIA_PENDING_TTL_MS } from "@/config/media";
import type { Media } from "@/types/media";
import type { MediaSecuritySnapshot } from "@/lib/adapters/media-security-repository";
import type { MediaEngineDeps } from "./media-engine";
import { isPathWithinMemorial } from "./media-path";
import { cleanupPendingMedia } from "./cleanup-pending-media";

/**
 * M8-E3/E4 — tâche de nettoyage des réservations abandonnées, PRÉPARÉE mais
 * NON ACTIVÉE (aucun nettoyage automatique en production sans GO QG).
 * Dossier de mise en service : docs/contributions-medias-abandonnes.md.
 *
 * Deux barrières indépendantes empêchent toute exécution aujourd'hui :
 *  1. aucune fonction planifiée n'existe dans `netlify/functions/` ;
 *  2. même déployée, la tâche ne supprime rien sans
 *     HERITAGE_MEDIA_SWEEP_MODE=apply : par défaut elle est inerte ;
 *     `dry-run` ne fait que LIRE et compter.
 *
 * Le traitement de chaque ligne est la primitive EXISTANTE du balayage
 * (`cleanupPendingMedia`, celle de `sweepAbandonedUploads`), sans second
 * mécanisme.
 *
 * Sécurité du nettoyage (revue M8-E4) :
 *  - seules les lignes `pending` sont vues (jamais un média `ready`, donc
 *    jamais une photo publiée ou en cours d'examen par la famille) ;
 *  - seulement au-delà de 3 h (MEDIA_PENDING_TTL_MS, plus long que la
 *    permission d'envoi de 2 h), PLUS une marge d'horloge de 15 min : un
 *    écart entre l'heure du serveur applicatif et celle de la base ne peut pas
 *    faire réclamer une réservation encore en cours ;
 *  - la réclamation (reserve_pending_media_cleanup_v1) exclut toute
 *    finalisation concurrente, côté base ;
 *  - un hommage archivé, un Hero après publication, un état incohérent : la
 *    base refuse la réclamation ; rien n'est supprimé. Ces lignes sont
 *    COMPTÉES à part (`blockedLifecycle`) pour décision QG, jamais forcées ;
 *  - un chemin hors de son hommage ou un hommage introuvable : ignoré et
 *    compté (`skipped`), jamais supprimé.
 * Journal : des nombres seulement.
 */

export type MediaSweepMode = "off" | "dry-run" | "apply";

/** Marge d'horloge ajoutée au délai de 3 h (serveur applicatif ↔ base). */
export const SWEEP_CLOCK_MARGIN_MS = 15 * 60 * 1000;

export function readMediaSweepMode(env: Record<string, string | undefined> = process.env): MediaSweepMode {
  const v = env.HERITAGE_MEDIA_SWEEP_MODE;
  return v === "apply" ? "apply" : v === "dry-run" ? "dry-run" : "off";
}

export interface MediaSweepReport {
  mode: MediaSweepMode;
  /** Réservations expirées vues (au plus `limit`). */
  examined: number;
  /** Nettoyables : la base accepterait la réclamation. */
  reclaimable: number;
  /** Refusées par le cycle de vie (archivé, Hero après publication, état incohérent) : décision QG. */
  blockedLifecycle: number;
  /** Chemin hors de l'hommage ou hommage introuvable : jamais touchées. */
  skipped: number;
  /** Réellement nettoyées (`apply` seulement). */
  reclaimed: number;
}

/** Même règle que reserve_pending_media_cleanup_v1 (migration 20261019130000). */
export function cleanupLifecycleAllows(memorial: MediaSecuritySnapshot, purpose: string): boolean {
  if (memorial.status === "archived") return false;
  if (memorial.firstPublishedAt === null && memorial.status !== "draft" && memorial.status !== "ready") return false;
  if (memorial.firstPublishedAt !== null && memorial.status !== "published" && memorial.status !== "editing") return false;
  if (purpose === "hero" && memorial.firstPublishedAt !== null) return false;
  return true;
}

async function classify(deps: MediaEngineDeps, expired: Media[]): Promise<Pick<MediaSweepReport, "reclaimable" | "blockedLifecycle" | "skipped"> & { candidates: Media[] }> {
  let reclaimable = 0;
  let blockedLifecycle = 0;
  let skipped = 0;
  const candidates: Media[] = [];
  for (const media of expired) {
    if (!isPathWithinMemorial(media.storagePath, media.memorialId)) {
      skipped += 1;
      continue;
    }
    const memorial = await deps.mediaSecurityRepository.load({ memorialId: media.memorialId, ownerId: media.ownerId });
    if (memorial === null) skipped += 1;
    else if (cleanupLifecycleAllows(memorial, media.purpose)) {
      reclaimable += 1;
      candidates.push(media);
    } else blockedLifecycle += 1;
  }
  return { reclaimable, blockedLifecycle, skipped, candidates };
}

export async function runScheduledMediaSweep(
  deps: MediaEngineDeps,
  options: { mode: MediaSweepMode; limit?: number },
): Promise<MediaSweepReport> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  if (options.mode === "off") return { mode: "off", examined: 0, reclaimable: 0, blockedLifecycle: 0, skipped: 0, reclaimed: 0 };
  // L'horloge reculée de la marge : le seuil de 3 h devient 3 h 15 pour tout le passage
  // (lecture, classement et balayage existant, qui lit la même horloge).
  const safe: MediaEngineDeps = { ...deps, now: () => new Date(deps.now().getTime() - SWEEP_CLOCK_MARGIN_MS) };
  const cutoff = new Date(safe.now().getTime() - MEDIA_PENDING_TTL_MS);
  const expired = await deps.mediaRepository.findExpiredPending({ olderThan: cutoff, limit });
  const { candidates, ...counts } = await classify(safe, expired);
  if (options.mode === "dry-run") return { mode: "dry-run", examined: expired.length, ...counts, reclaimed: 0 };
  // `apply` : la primitive existante du balayage (réclamation, octets, ligne),
  // appliquée aux seules lignes récupérables ; une ligne bloquée n'est jamais
  // soumise, même si une couche inférieure venait à l'accepter.
  let reclaimed = 0;
  for (const media of candidates) {
    try {
      if (await cleanupPendingMedia(safe, media, { createdBefore: cutoff })) reclaimed += 1;
    } catch {
      continue;
    }
  }
  return { mode: "apply", examined: expired.length, ...counts, reclaimed };
}

/** La ligne de journal, sans aucune donnée identifiante. */
export function formatMediaSweepReport(r: MediaSweepReport): string {
  return `media-sweep mode=${r.mode} examined=${r.examined} reclaimable=${r.reclaimable} blocked=${r.blockedLifecycle} skipped=${r.skipped} reclaimed=${r.reclaimed}`;
}
