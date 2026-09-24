import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { MediaEngineDeps } from "@/lib/media/media-engine";
import { createMediaReadUrl } from "@/lib/media/read-media";
import type { MediaResolver } from "./media-resolver";

/**
 * Étape 2 — the Preview's media resolver: the Owner's own draft media,
 * through Mission 030's private-read mechanism (a fresh, short-lived
 * signed URL per resolution, never persisted). No UI, no Preview
 * dependency — it only implements `MediaResolver` against the real
 * media engine.
 *
 * `createMediaReadUrl` already proves the actor may read this memorial,
 * that the media belongs to it and that it is `"ready"`. It does NOT
 * check the media's purpose; this resolver adds that check (the same
 * rule as `isHeroPhotoMediaUsable` in lib/memorial/hero.ts). The Hero's
 * readiness rule (`isPageEComplete`) is synchronous and never re-reads
 * the media, so this is where a Hero photo that was since deleted,
 * replaced or repurposed is refused.
 *
 * Only `{ mediaId, readUrl }` leaves this function — never the `Media`
 * row (`storagePath`, `ownerId`, ...).
 */
export function createOwnerDraftMediaResolver(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  memorialId: string,
): MediaResolver {
  return async (request) => {
    try {
      const result = await createMediaReadUrl(deps, actor, { memorialId, mediaId: request.mediaId });
      if (!result.ok) return null;

      const { media, readUrl } = result.value;
      if (media.id !== request.mediaId) return null;
      if (media.purpose !== request.purpose) return null;
      if (media.status !== "ready") return null;

      return { mediaId: media.id, readUrl };
    } catch {
      return null;
    }
  };
}
