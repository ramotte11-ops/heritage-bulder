import { authorizeMemorialAccess } from "@/lib/auth/memorial-access";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import { deleteMedia } from "@/lib/media/delete-media";
import { mediaFailure, mediaSuccess, type MediaResult } from "@/lib/media/media-errors";
import { isMediaIdentifier } from "@/lib/media/media-path";
import type { MediaEngineDeps } from "@/lib/media/media-engine";
import { inspectHero } from "@/lib/memorial/hero";
import { galleryMediaIds, inspectGallery } from "@/lib/memorial/gallery-content";
import type { Media } from "@/types/media";
import type { MemorialContent } from "@/types/memorial";

/**
 * Dette D1 — retiring a Gallery photograph the family removed.
 *
 * ## The ordering, same as the Hero's "Changer la photo"
 *
 *   1. the caller removes the reference from `content.gallery`
 *      (`removeGalleryMedia`) and PERSISTS the draft (autosave /
 *      `saveDraftAction`) — the remaining order is kept, with no hole;
 *   2. only then does it ask for the media to be retired, here.
 *
 * ## The guarantee this file adds: a referenced media is never deleted
 *
 * The Hero's retire action trusts its caller's ordering. This one does
 * not: before anything is deleted it RE-READS the saved draft,
 * server-side, and refuses to delete a media that the draft still
 * references — in `content.gallery` or as the Hero photograph. It also
 * fails closed when the draft cannot be read with certainty (a corrupted
 * Gallery or Hero): unable to prove the media is unreferenced, it keeps
 * it. So a client that skipped step 1, a stale tab, or a replayed request
 * can at worst leave a stale row — never delete a photograph the
 * Memorial still shows.
 *
 * ## One deletion system
 *
 * The deletion itself is `lib/media/delete-media.ts`'s `deleteMedia` —
 * ownership check, path check, Storage first then row, idempotent. Nothing
 * here removes an object or a row by any other means. It only ever
 * retires a `"gallery"`-purpose media: a Hero media can never be reached
 * through the Gallery path.
 *
 * ## What is deliberately NOT here
 *
 * No reconciliation of "ready but unreferenced" Gallery media (an upload
 * finalized whose draft write then failed, or a removal whose delete
 * failed). The Hero adopts such media automatically, but for the Gallery
 * the two cases cannot be told apart — adopting would resurrect a
 * photograph the family removed, retiring would delete one it just
 * added — so that policy is a product decision, left open. Such a row is
 * inert: nothing displays an unreferenced media, and calling this again
 * retires it.
 *
 * `retained` answers are successes, not errors: retiring is a background
 * cleanup the family never sees, exactly like `retireHeroPhotoUploadAction`.
 */

export interface GalleryMediaDeps {
  mediaEngine: MediaEngineDeps;
  draftRepository: DraftRepository;
}

export type GalleryRetirement =
  | { removed: true }
  | {
      removed: false;
      /**
       * - `alreadyAbsent`: nothing to delete (already retired, never in
       *   this memorial, or not a media identifier) — the idempotent case;
       * - `stillReferenced`: the saved draft still shows it — kept;
       * - `contentUnreadable`: the draft's Gallery or Hero is corrupted, so
       *   "unreferenced" cannot be proven — kept (fail closed);
       * - `notGalleryMedia`: a media of another purpose — never touched here.
       */
      retained: "alreadyAbsent" | "stillReferenced" | "contentUnreadable" | "notGalleryMedia";
    };

/** Every media id the draft references, or `null` when that cannot be established with certainty. */
export function referencedMediaIds(content: MemorialContent): Set<string> | null {
  const gallery = inspectGallery(content);
  const hero = inspectHero(content);
  if (gallery.status === "corrupted" || hero.status === "corrupted") return null;
  const ids = new Set(galleryMediaIds(gallery.gallery));
  if (hero.hero.photo !== null) ids.add(hero.hero.photo.mediaId);
  return ids;
}

export async function retireGalleryMedia(
  deps: GalleryMediaDeps,
  actor: HeritageActor,
  input: { memorialId: string; mediaId: string },
): Promise<MediaResult<GalleryRetirement>> {
  const access = await authorizeMemorialAccess(deps.mediaEngine, actor, input.memorialId);
  if (access.status !== "granted") return mediaFailure("access_denied");

  if (!isMediaIdentifier(input.mediaId)) return mediaSuccess({ removed: false, retained: "alreadyAbsent" });

  let media: Media | null;
  try {
    media = await deps.mediaEngine.mediaRepository.findById({ memorialId: access.memorialId, mediaId: input.mediaId });
  } catch {
    return mediaFailure("storage_unavailable");
  }
  if (media === null) return mediaSuccess({ removed: false, retained: "alreadyAbsent" });
  if (media.purpose !== "gallery") return mediaSuccess({ removed: false, retained: "notGalleryMedia" });

  // THE guard: the SAVED draft, re-read now, server-side — never a
  // content the client sends.
  let content: MemorialContent;
  try {
    const draft = await deps.draftRepository.getDraftContent(access.memorialId);
    if (draft === null) return mediaFailure("access_denied");
    content = draft.content;
  } catch {
    return mediaFailure("storage_unavailable");
  }

  const referenced = referencedMediaIds(content);
  if (referenced === null) return mediaSuccess({ removed: false, retained: "contentUnreadable" });
  if (referenced.has(media.id)) return mediaSuccess({ removed: false, retained: "stillReferenced" });

  const deletion = await deleteMedia(deps.mediaEngine, actor, { memorialId: access.memorialId, mediaId: media.id });
  if (!deletion.ok) return deletion;
  return mediaSuccess(deletion.value.removed ? { removed: true } : { removed: false, retained: "alreadyAbsent" });
}
