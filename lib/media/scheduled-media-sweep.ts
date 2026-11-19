import { MEDIA_PENDING_TTL_MS } from "@/config/media";
import type { MediaEngineDeps } from "./media-engine";
import { sweepAbandonedUploads } from "./orphan-sweep";

/**
 * M8-E3 — tâche de nettoyage des réservations abandonnées, PRÉPARÉE mais NON
 * ACTIVÉE (directive PO / QG : aucun nettoyage automatique en production
 * sans GO). Analyse complète : docs/contributions-medias-abandonnes.md.
 *
 * Deux barrières indépendantes empêchent toute exécution aujourd'hui :
 *  1. aucune fonction planifiée n'existe dans `netlify/functions/` ; le
 *     gabarit à ajouter au GO est dans la documentation (§ 4) ;
 *  2. même déployée, la tâche ne supprime rien sans
 *     HERITAGE_MEDIA_SWEEP_MODE=apply : par défaut elle est inerte ;
 *     `dry-run` ne fait que COMPTER (aucune réclamation, aucune suppression).
 *
 * Elle réutilise le seul mécanisme existant (`sweepAbandonedUploads`,
 * réclamation puis suppression des octets puis de la ligne, médias
 * `pending` de plus de 3 h seulement). Journal : des nombres, jamais un
 * chemin, un identifiant ni une donnée de famille ou de proche.
 */

export type MediaSweepMode = "off" | "dry-run" | "apply";

export function readMediaSweepMode(env: Record<string, string | undefined> = process.env): MediaSweepMode {
  const v = env.HERITAGE_MEDIA_SWEEP_MODE;
  return v === "apply" ? "apply" : v === "dry-run" ? "dry-run" : "off";
}

export interface MediaSweepReport {
  mode: MediaSweepMode;
  /** Réservations expirées vues (au plus `limit`). */
  examined: number;
  /** Réservations réellement nettoyées (`apply` seulement). */
  reclaimed: number;
}

export async function runScheduledMediaSweep(
  deps: MediaEngineDeps,
  options: { mode: MediaSweepMode; limit?: number },
): Promise<MediaSweepReport> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  if (options.mode === "off") return { mode: "off", examined: 0, reclaimed: 0 };
  if (options.mode === "dry-run") {
    const expired = await deps.mediaRepository.findExpiredPending({
      olderThan: new Date(deps.now().getTime() - MEDIA_PENDING_TTL_MS),
      limit,
    });
    return { mode: "dry-run", examined: expired.length, reclaimed: 0 };
  }
  const result = await sweepAbandonedUploads(deps, { limit });
  return { mode: "apply", examined: result.examined, reclaimed: result.reclaimed };
}

/** La ligne de journal, sans aucune donnée identifiante. */
export function formatMediaSweepReport(r: MediaSweepReport): string {
  return `media-sweep mode=${r.mode} examined=${r.examined} reclaimed=${r.reclaimed}`;
}
