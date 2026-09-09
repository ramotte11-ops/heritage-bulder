import { authorizeMemorialAccess } from "@/lib/auth/memorial-access";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { Media } from "@/types/media";
import { mediaFailure, mediaSuccess, type MediaResult } from "./media-errors";
import { buildMediaObjectPrefix, isPathWithinMemorial } from "./media-path";
import type { MediaEngineDeps } from "./media-engine";

/**
 * Mission 030 — deleting a media, safely and repeatably.
 *
 * ## The ordering rule: Storage first, row second
 *
 * A media lives in two systems that cannot be committed together. A
 * PostgreSQL transaction cannot roll back an S3-style object deletion,
 * and no amount of wrapping changes that — so this foundation claims no
 * atomicity it does not have (mission brief, section 13). What it does
 * instead is choose which side to leave inconsistent when a crash lands
 * between the two calls, and the choice is not arbitrary:
 *
 *   * object deleted, row survives -> the row points at nothing. It is
 *     VISIBLE, it is attributable to its memorial, and calling this
 *     function again finishes the job. Recoverable.
 *   * row deleted, object survives -> nothing anywhere records that the
 *     object exists. It cannot be listed by any owner-scoped query, it
 *     belongs to a family nobody can identify from the row (there is no
 *     row), and it lives in the bucket forever. Unrecoverable.
 *
 * The second is the definition of an orphan, which section 13 forbids
 * "par conception". So the object goes first, every time, and the
 * window of inconsistency is a stale row that the next delete cleans
 * up.
 *
 * ## Idempotence
 *
 * Deleting an already-deleted media succeeds. Both Storage removal and
 * the row delete are idempotent underneath, so a retry after a lost
 * response, a double-clicked button, or a resumed job all converge on
 * the same state instead of erroring. `removed` reports whether THIS
 * call was the one that found something, for callers that care;
 * nothing about the outcome depends on it.
 */
export interface MediaDeletion {
  /** `false` when there was already nothing to delete. */
  removed: boolean;
}

export async function deleteMedia(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  input: { memorialId: string; mediaId: string },
): Promise<MediaResult<MediaDeletion>> {
  const access = await authorizeMemorialAccess(deps, actor, input.memorialId);
  if (access.status !== "granted") {
    return mediaFailure("access_denied");
  }

  let media: Media | null;
  try {
    media = await deps.mediaRepository.findById({
      memorialId: access.memorialId,
      mediaId: input.mediaId,
    });
  } catch {
    return mediaFailure("storage_unavailable");
  }

  // Already gone, or never in this memorial. Reported as a successful
  // no-op rather than an error: that is what makes retries safe, and it
  // gives the same answer for "you already deleted this" and "that id
  // belongs to another family", so this cannot be used to probe for
  // media ids that exist elsewhere.
  if (media === null) {
    return mediaSuccess({ removed: false });
  }

  // The stored path is checked against the memorial we authorized
  // against before anything is removed. Ownership was proven for a
  // MEMORIAL; this is what stops a tampered row from pointing that
  // proven authority at another family's object.
  if (!isPathWithinMemorial(media.storagePath, access.memorialId)) {
    return mediaFailure("storage_unavailable");
  }

  try {
    // By prefix, not by the one known path: a media's future
    // derivatives (Missions 033/047) are siblings under the same
    // directory, and deleting only `original.jpg` would turn every one
    // of them into an orphan on the day they are introduced.
    await deps.objectStore.removeByPrefix({
      prefix: buildMediaObjectPrefix({
        memorialId: access.memorialId,
        mediaId: input.mediaId,
      }),
    });
  } catch {
    // The row is deliberately NOT deleted. Removing it now would
    // produce exactly the orphan this ordering exists to prevent.
    // Leaving both means the media still works and the caller can
    // retry.
    return mediaFailure("storage_unavailable");
  }

  try {
    const removed = await deps.mediaRepository.deleteById({
      memorialId: access.memorialId,
      mediaId: input.mediaId,
    });
    return mediaSuccess({ removed });
  } catch {
    // The recoverable half of the window described above: the object is
    // gone, the row survives, and calling again completes it.
    return mediaFailure("storage_unavailable");
  }
}
