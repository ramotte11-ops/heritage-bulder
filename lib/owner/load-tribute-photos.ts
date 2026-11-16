import "server-only";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { MediaEngineDeps } from "@/lib/media/media-engine";
import { createMediaReadUrl } from "@/lib/media/read-media";
import {
  NEUTRAL_HERO_CROP,
  resolveHeroCropGeometry,
  type HeroCropWindowGeometry,
} from "@/lib/memorial/hero-crop-geometry";
import type { FamilyTribute } from "./family-space";

/**
 * Espace famille (Lot 1) — the Hero photo of each tribute card, reused
 * from the Builder: no second upload, no copy, no stored URL.
 *
 * Exactly the Builder's own read path (`createMediaReadUrl`, Mission 030):
 * the actor's ownership of the memorial is re-proven for every photo, the
 * media must be `ready` and inside that memorial's own folder, and what
 * comes back is a short-lived signed URL minted for this render only.
 *
 * `frame` places the photo inside the card's 4:5 window with the SAME
 * geometry as the Hero (`resolveHeroCropGeometry`), from the crop the
 * family confirmed — `null` when the stored dimensions are unknown, in
 * which case the card simply covers its window.
 *
 * A photo that cannot be read is absent, never an error: the card then
 * shows its « no photo yet » state and the family keeps every action.
 */
export interface FamilyTributePhoto {
  readUrl: string;
  frame: HeroCropWindowGeometry | null;
}

export async function loadTributePhotos(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  tributes: readonly FamilyTribute[],
): Promise<Map<string, FamilyTributePhoto>> {
  const photos = new Map<string, FamilyTributePhoto>();

  await Promise.all(
    tributes.map(async (tribute) => {
      if (tribute.photo === null) return;
      try {
        const result = await createMediaReadUrl(deps, actor, {
          memorialId: tribute.id,
          mediaId: tribute.photo.mediaId,
        });
        if (!result.ok) return;
        const { media, readUrl } = result.value;
        const frame =
          media.width !== null && media.height !== null && media.width > 0 && media.height > 0
            ? resolveHeroCropGeometry(
                { naturalWidth: media.width, naturalHeight: media.height },
                tribute.photo.crop ?? NEUTRAL_HERO_CROP,
              )
            : null;
        photos.set(tribute.id, { readUrl, frame });
      } catch (error) {
        console.error("Family space: tribute photo unavailable:", error instanceof Error ? error.message : error);
      }
    }),
  );

  return photos;
}
