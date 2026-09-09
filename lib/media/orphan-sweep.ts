import { MEDIA_PENDING_TTL_MS } from "@/config/media";
import { buildMediaObjectPrefix, isPathWithinMemorial } from "./media-path";
import type { MediaEngineDeps } from "./media-engine";

/**
 * Mission 030 — the explicit answer to "what happens to an upload
 * nobody finished".
 *
 * ## Why an abandoned upload cannot become an orphan
 *
 * The anti-orphan strategy is not this file — it is the ordering in
 * lib/media/upload-lifecycle.ts, where the `pending` row is written
 * BEFORE any upload permission is issued. Because of that, every path
 * HERITAGE has ever handed out is recorded, so there is no such thing
 * as bytes in the bucket that no row knows about. An abandoned attempt
 * is not an unknown object; it is a known row in a known state.
 *
 * This file is the second half: the reclamation. A `pending` row older
 * than the TTL is an attempt that is never going to complete — the
 * user closed the tab, the connection died, the permission expired
 * long ago — so its directory and its row are removed together.
 *
 * ## What this is not
 *
 * Not a scheduler. Mission 030 builds the primitive and wires no cron,
 * no route and no background job — that is deployment work, and
 * inventing a trigger for it here would be building something nobody
 * asked for (mission brief, section 3). What matters for this mission
 * is that the strategy is explicit, correct and tested rather than
 * left as a comment saying "cleanup TBD".
 *
 * ## Why it takes no actor
 *
 * This is maintenance, running with no session, across memorials. That
 * is only defensible because of what it can reach: `pending` rows
 * only. A pending media has never been finalized, so it holds no
 * verified content and nothing displays it. The sweep cannot touch a
 * single `ready` media of a single family — which is what keeps
 * "no actor" from meaning "no boundary".
 *
 * Being server-only maintenance, it must never be reachable from a
 * request path without a deliberate, audited wiring — the same rule as
 * every other service-role capability in this codebase.
 */
export interface OrphanSweepResult {
  /** Reservations examined. */
  examined: number;
  /** Reservations fully reclaimed — object directory and row both gone. */
  reclaimed: number;
}

export async function sweepAbandonedUploads(
  deps: MediaEngineDeps,
  options: { limit?: number } = {},
): Promise<OrphanSweepResult> {
  // Bounded on purpose. A sweep that tried to reclaim everything it
  // found in one pass would be an unbounded amount of Storage work in a
  // single invocation; a batch converges over repeated runs instead,
  // and cannot itself become the outage.
  const limit = options.limit ?? 100;

  const cutoff = new Date(deps.now().getTime() - MEDIA_PENDING_TTL_MS);

  const expired = await deps.mediaRepository.findExpiredPending({
    olderThan: cutoff,
    limit,
  });

  let reclaimed = 0;

  for (const media of expired) {
    // Belt and braces on a maintenance path that runs with no session:
    // a row whose stored path does not sit under its own memorial is
    // corrupt, and this is the one caller with no ownership check in
    // front of it. Skipped rather than acted on — a sweep must never
    // be the thing that deletes an object it cannot account for.
    if (!isPathWithinMemorial(media.storagePath, media.memorialId)) {
      continue;
    }

    try {
      // Storage first, then the row — the same ordering rule as
      // lib/media/delete-media.ts, for the same reason. If this throws,
      // the row survives and the next sweep retries it; the reverse
      // order would leave the object with nothing pointing at it.
      await deps.objectStore.removeByPrefix({
        prefix: buildMediaObjectPrefix({
          memorialId: media.memorialId,
          mediaId: media.id,
        }),
      });

      await deps.mediaRepository.deleteById({
        memorialId: media.memorialId,
        mediaId: media.id,
      });

      reclaimed += 1;
    } catch {
      // One bad row must not abort the batch: the remaining
      // reservations are unrelated, and this one is simply retried on
      // the next run. The counters report the difference honestly.
      continue;
    }
  }

  return { examined: expired.length, reclaimed };
}
