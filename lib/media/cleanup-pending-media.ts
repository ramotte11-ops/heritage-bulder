import type { Media } from "@/types/media";
import { buildMediaObjectPrefix } from "./media-path";
import type { MediaEngineDeps } from "./media-engine";

/**
 * Claim a pending row before touching Storage. The claim and upload
 * finalization are mutually exclusive in PostgreSQL, so callers never act on
 * a stale `pending` read. An uncertain Storage result deliberately leaves the
 * durable claim open for an explicit retry/reconciliation.
 */
export async function cleanupPendingMedia(
  deps: MediaEngineDeps,
  media: Media,
  options: { createdBefore?: Date } = {},
): Promise<boolean> {
  let claim;
  try {
    claim = await deps.mediaSecurityRepository.reservePendingCleanup({
      memorialId: media.memorialId,
      ownerId: media.ownerId,
      mediaId: media.id,
      createdBefore: options.createdBefore?.toISOString(),
    });
  } catch {
    return false;
  }

  try {
    await deps.objectStore.removeByPrefix({
      prefix: buildMediaObjectPrefix({ memorialId: media.memorialId, mediaId: media.id }),
    });
  } catch {
    return false;
  }

  try {
    await deps.mediaSecurityRepository.finishPendingCleanup({
      memorialId: media.memorialId,
      ownerId: media.ownerId,
      claimId: claim.claimId,
    });
    return true;
  } catch {
    return false;
  }
}
