import type { MemorialContent } from "@/types/memorial";
import type { GuestDraftPhotoReference, GuestDraftV3 } from "./guest-draft-v3";

/**
 * QG 008 Lot 2 — the pure part of « Builder invité → brouillon durable ».
 *
 * The guest draft lives in the browser (IndexedDB V3). Its content is the
 * canonical Guided Builder content, but its photographs are LOCAL: the
 * content holds no media reference (validateGuestDraftV3 refuses one), and
 * `draft.photos` carries each photo's local id and placement (Hero crop,
 * Gallery caption, Gallery order).
 *
 * The durable draft holds SERVER media ids. The transfer therefore:
 *   1. uploads each local photo through the existing media chain
 *      (reserve → signed upload → finalize, which verifies the bytes);
 *   2. records, on the server, local id → server media id;
 *   3. rebuilds the durable content HERE, from the validated guest draft and
 *      that server-side map only — never from media ids the browser claims.
 *
 * Nothing in this module talks to the network or the clock.
 */

/** local photo id → server media id, as recorded on the server. */
export type GuestTransferMediaMap = Readonly<Record<string, string>>;

export interface PendingGuestPhoto {
  localId: string;
  purpose: "hero" | "gallery";
}

/**
 * The photos still to upload, in the family's order (Hero first, then the
 * Gallery in its order). A photo already mapped on the server is never
 * uploaded twice — a resumed transfer continues where it stopped.
 */
export function pendingGuestPhotos(draft: GuestDraftV3, mediaMap: GuestTransferMediaMap): PendingGuestPhoto[] {
  return orderedPhotos(draft)
    .filter(({ localId }) => mediaMap[localId] === undefined)
    .map(({ localId, placement }) => ({ localId, purpose: placement.purpose }));
}

function orderedPhotos(draft: GuestDraftV3): GuestDraftPhotoReference[] {
  return [
    ...draft.photos.filter(({ placement }) => placement.purpose === "hero"),
    ...draft.photos.filter(({ placement }) => placement.purpose === "gallery"),
  ];
}

export type TransferredContentResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "missing_media"; localId: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The durable draft's content: the guest content as the family wrote it,
 * with the Hero photograph (and its crop) and the Gallery (order and
 * captions) pointing at the server media the transfer uploaded.
 *
 * Any `hero.photo` or `gallery` already present in the guest content is
 * replaced — only `draft.photos` and the server-side map are trusted.
 */
export function buildTransferredContent(
  draft: GuestDraftV3,
  mediaMap: GuestTransferMediaMap,
): TransferredContentResult {
  const content = structuredClone(draft.content) as Record<string, unknown>;

  for (const photo of orderedPhotos(draft)) {
    if (mediaMap[photo.localId] === undefined) return { ok: false, reason: "missing_media", localId: photo.localId };
  }

  const hero = draft.photos.find(({ placement }) => placement.purpose === "hero");
  if (isPlainObject(content.hero)) {
    content.hero = {
      ...content.hero,
      photo: hero !== undefined && hero.placement.purpose === "hero"
        ? { mediaId: mediaMap[hero.localId], crop: structuredClone(hero.placement.crop) }
        : null,
    };
  }

  const gallery = draft.photos.filter(({ placement }) => placement.purpose === "gallery");
  if (gallery.length > 0) {
    content.gallery = {
      items: gallery.map(({ localId, placement }) => ({
        mediaId: mediaMap[localId],
        caption: placement.purpose === "gallery" ? placement.caption : null,
      })),
    };
  } else {
    delete content.gallery;
  }

  return { ok: true, content: content as MemorialContent };
}

/**
 * The JSON form of a guest draft the browser sends to the server: the V3
 * metadata row exactly (no blob). The server re-validates it with
 * `validateGuestDraftV3` before trusting a single field.
 */
export function serializableGuestDraft(draft: GuestDraftV3): GuestDraftV3 {
  return structuredClone(draft);
}
