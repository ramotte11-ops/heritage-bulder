import { authorizeMemorialAccess } from "@/lib/auth/memorial-access";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { Media } from "@/types/media";
import { mediaFailure, mediaSuccess, type MediaResult } from "./media-errors";
import { deleteMedia } from "./delete-media";
import { finalizeMediaUpload } from "./upload-lifecycle";
import type { MediaEngineDeps } from "./media-engine";

/**
 * Mission 030 — replacing a media without ever risking the one that
 * already works.
 *
 * ## The rule this file exists to enforce
 *
 *     delete old
 *     upload new
 *     new upload fails
 *     => the family's Hero photograph is gone
 *
 * That sequence is forbidden (mission brief, section 13). The old media
 * is removed only after the new one has been fully verified and marked
 * `ready` — so at every instant in between, a working photograph
 * exists. If anything goes wrong at any step, the memorial still has
 * exactly what it had before.
 *
 * ## Why replacement is not "overwrite the object"
 *
 * The obvious implementation — upload the new bytes over the old path —
 * is the one that cannot be made safe: a partial write destroys the old
 * photograph with nothing to fall back on. Because every upload gets
 * its own media id and therefore its own directory
 * (lib/media/media-path.ts), the new file physically cannot land on top
 * of the old one, and "keep the old until the new is proven" needs no
 * locking, no versioning, and no transaction.
 *
 * It is also why the upload permission never enables overwrite
 * (MediaObjectStore.createUploadPermission).
 *
 * ## The one thing this does NOT guarantee, stated plainly
 *
 * If the new media is finalized and the old one's removal then fails,
 * this returns SUCCESS with `previousRemoved: false`. The replacement
 * genuinely happened; a superseded row survives.
 *
 * That leaves a memorial momentarily holding two `ready` media of the
 * same purpose, and this foundation does NOT forbid that with a unique
 * index — deliberately. A "one ready hero per memorial" constraint
 * would make safe replacement impossible, because safe replacement
 * requires both to be ready at the same instant. The invariant is
 * therefore a SELECTION rule, not a storage rule: whoever consumes a
 * hero (Mission 033) takes the most recently created `ready` one. Under
 * that rule a failed cleanup is a stale row to reclaim, never an
 * ambiguous memorial.
 */
export interface MediaReplacement {
  /** The new, verified, usable media. */
  media: Media;
  /**
   * Whether the superseded media was successfully removed. `false`
   * means the replacement succeeded but cleanup did not — the caller
   * may retry `deleteMedia` on the previous id at any time.
   */
  previousRemoved: boolean;
}

/**
 * Finalize a freshly uploaded media and, only then, retire the one it
 * replaces.
 *
 * The two ids are both verified against the SAME memorial, which the
 * actor is proven to own. There is no code path here that can touch a
 * media outside it.
 */
export async function replaceMedia(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  input: { memorialId: string; mediaId: string; previousMediaId: string },
): Promise<MediaResult<MediaReplacement>> {
  // Checked here as well as inside both primitives below. Redundant on
  // the happy path, and worth it: this function's contract is "the old
  // one survives unless the new one is good", and that promise should
  // not depend on the order in which its callees happen to check.
  const access = await authorizeMemorialAccess(deps, actor, input.memorialId);
  if (access.status !== "granted") {
    return mediaFailure("access_denied");
  }

  // Replacing a media with itself would finalize it and then delete it,
  // leaving the memorial with nothing — the exact loss this file
  // exists to prevent. Refused before anything is touched.
  if (input.mediaId === input.previousMediaId) {
    return mediaFailure("invalid_file");
  }

  // THE ordering. Every validation the mission requires — size, real
  // content type, completeness, ownership — happens inside this call,
  // and a failure returns before a single byte of the old media is
  // touched.
  const finalized = await finalizeMediaUpload(deps, actor, {
    memorialId: access.memorialId,
    mediaId: input.mediaId,
  });

  if (!finalized.ok) {
    // The old media is untouched and still works. The failure is
    // reported exactly as it happened, so the UI can say "trop lourde"
    // rather than "quelque chose s'est mal passe".
    return finalized;
  }

  // Only now. The new photograph exists, has been verified, and is
  // marked ready.
  const removal = await deleteMedia(deps, actor, {
    memorialId: access.memorialId,
    mediaId: input.previousMediaId,
  });

  // A cleanup failure is NOT propagated as a failure of the
  // replacement, because it is not one: the new media is live and
  // usable, and reporting an error here would invite a caller to
  // "retry" the replacement and upload the photograph a second time.
  return mediaSuccess({
    media: finalized.value,
    previousRemoved: removal.ok ? removal.value.removed : false,
  });
}
