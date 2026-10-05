/**
 * Dette D1 — the A13 Gallery's draft content: `draft.content.gallery`.
 *
 * The family's photographs, in the family's order, and nothing else the
 * product does not need yet (QG D1 decision 3):
 *
 *  - `mediaId` — a reference to a `media` row (Mission 030), never a URL
 *    and never a `storage_path`. The bucket is private: a displayable URL
 *    is a short-lived signed one, minted per render by a media resolver
 *    (lib/memorial/assembly/media-resolver.ts), exactly like the Hero's
 *    `photo.mediaId` (types/hero.ts).
 *  - `caption` — the family's own words (≤ 32 characters), or `null`.
 *    Family content: never translated, never rewritten beyond whitespace
 *    normalization.
 *
 * The ARRAY ORDER is the authoritative order chosen by the family. The
 * A13 runtime maps `items[i]` to the i-th slot and the Full Album keeps
 * the same order; nothing re-sorts it.
 *
 * Deliberately absent: a stored alt text (QG D1 decision 4 — the family
 * does not type one; the renderer derives it from the caption or a
 * localized HERITAGE text), dimensions (they live on the `media` row,
 * measured at finalization), and any URL, path, crop or layout value.
 */
export interface GalleryItem {
  mediaId: string;
  caption: string | null;
}

export interface GalleryContent {
  items: GalleryItem[];
}

export const EMPTY_GALLERY_CONTENT: GalleryContent = { items: [] };
