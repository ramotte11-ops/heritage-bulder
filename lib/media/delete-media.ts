import { authorizeMemorialAccess } from "@/lib/auth/memorial-access";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { Media } from "@/types/media";
import { mediaFailure, mediaSuccess, type MediaResult } from "./media-errors";
import { isPathWithinMemorial } from "./media-path";
import type { MediaEngineDeps } from "./media-engine";
import { authorizeMediaEdit, mediaTarget } from "./authorize-media-edit";
import { MediaSecurityDeniedError, MediaSecurityRetainedError } from "@/lib/adapters/media-security-repository";
import { cleanupPendingMedia } from "./cleanup-pending-media";

/**
 * Mission 030 — deleting a media, safely and repeatably.
 *
 * ## The ordering rule: durable retirement first, Storage after expiry
 *
 * A media lives in two systems that cannot be committed together. A
 * PostgreSQL transaction cannot roll back an S3-style object deletion,
 * and no amount of wrapping changes that — so this foundation claims no
 * atomicity it does not have (mission brief, section 13). What it does
 * instead retires a ready row transactionally into the non-displayable
 * `pending` state and creates a durable cleanup claim. The row and bytes stay
 * traceable until every signed upload permission for that path has certainly
 * expired; only then may the sweep remove Storage and close the claim.
 *
 * ## Idempotence
 *
 * Deleting an already-deleted media succeeds. A retry while cleanup is
 * deferred reuses the same claim; a retry after reclamation sees no row.
 */
export interface MediaDeletion {
  /** `false` when there was already nothing to delete. */
  removed: boolean;
  retained?: "referenced";
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

  let authorized;
  try {
    authorized = await authorizeMediaEdit(deps, actor, access, mediaTarget(media.purpose, "retire"));
  } catch {
    return mediaFailure("storage_unavailable");
  }
  if (authorized === null) return mediaFailure("access_denied");

  // The stored path is checked against the memorial we authorized
  // against before anything is removed. Ownership was proven for a
  // MEMORIAL; this is what stops a tampered row from pointing that
  // proven authority at another family's object.
  if (!isPathWithinMemorial(media.storagePath, access.memorialId)) {
    return mediaFailure("storage_unavailable");
  }

  // A pending upload is not usable and cannot be referenced by a published
  // memorial. Once the current lifecycle authorization has passed it can use
  // the existing idempotent cleanup path without a ready-media retirement
  // lease. In particular, a pending Hero is still refused after publication.
  if (media.status === "pending") {
    return await cleanupPendingMedia(deps, media)
      ? mediaSuccess({ removed: true })
      : mediaFailure("storage_unavailable");
  }

  let lease;
  try {
    lease = await deps.mediaSecurityRepository.reserveRetirement({
      memorialId: access.memorialId,
      ownerId: access.ownerId,
      mediaId: media.id,
      purpose: media.purpose,
      expectedRevision: authorized.draftRevision,
    });
  } catch (error) {
    if (error instanceof MediaSecurityRetainedError) {
      return mediaSuccess({ removed: false, retained: "referenced" });
    }
    return mediaFailure(error instanceof MediaSecurityDeniedError ? "access_denied" : "storage_unavailable");
  }

  try {
    // Logical retirement is committed first. PostgreSQL atomically hides the
    // ready row as pending, closes this lease and creates a durable pending
    // cleanup claim. That claim replaces the publication block before any
    // external Storage operation can have an ambiguous result.
    await deps.mediaSecurityRepository.finishRetirement({
      memorialId: access.memorialId,
      ownerId: access.ownerId,
      purpose: media.purpose,
      leaseId: lease.leaseId,
      outcome: "completed",
    });
  } catch {
    return mediaFailure("storage_unavailable");
  }

  return await cleanupPendingMedia(deps, media)
    ? mediaSuccess({ removed: true })
    : mediaFailure("storage_unavailable");
}
