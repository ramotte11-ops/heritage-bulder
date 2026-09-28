import { A13_DESKTOP_CAPTION } from "@/config/gallery-a13-desktop-manifest";
import { isMediaIdentifier } from "@/lib/media/media-path";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_GALLERY_CONTENT, type GalleryContent, type GalleryItem } from "@/types/gallery";

/**
 * Dette D1 — parsing, validation and pure edits of `draft.content.gallery`
 * (types/gallery.ts). Pure, framework-free, no I/O — the same absent /
 * valid / corrupted doctrine as lib/memorial/hero.ts and
 * lib/memorial/loved-things.ts.
 *
 * ## What makes a URL or a storage path impossible here
 *
 * The shape is closed: `{ items }` only, each item `{ mediaId, caption }`
 * only (an unknown key is corruption, never silently kept), and
 * `mediaId` must be a media identifier — the canonical UUID form
 * `lib/media/media-path.ts` generates and accepts. A URL, a
 * `<memorial>/<media>/original.jpg` path or any other string is not a
 * UUID, so it cannot be stored as a reference, and there is no other
 * field to smuggle one into.
 *
 * ## Order
 *
 * `items` order is the family's order and is preserved verbatim by every
 * function below: parse never sorts, `removeGalleryMedia` keeps the
 * remaining order with no hole, `addGalleryMedia` appends, and
 * `reorderGallery` only accepts an exact permutation of the current ids.
 * The same `mediaId` twice is corruption (one photograph, one place).
 *
 * ## Captions
 *
 * The family's words, ≤ `A13_DESKTOP_CAPTION.maxChars` (32) characters,
 * spaces included, counted in code points — the Gallery V2.1 contract,
 * the same rule as `validateViewerCaption` (lib/memorial/viewer/
 * viewer-layout.ts). Normalization is whitespace only (runs of
 * whitespace → one space, trimmed; blank → `null`); nothing is
 * translated, cased or rewritten. A control character that is not
 * whitespace is refused.
 */

export const GALLERY_CAPTION_MAX_CHARACTERS: number = A13_DESKTOP_CAPTION.maxChars;

export type GalleryValidationReason =
  | "not_an_object"
  | "unknownKey"
  | "items"
  | "item"
  | "mediaId"
  | "caption"
  | "captionTooLong"
  | "duplicateMediaId";

export type GalleryValidationResult = { ok: true; gallery: GalleryContent } | { ok: false; reason: GalleryValidationReason };

const GALLERY_KEYS: ReadonlySet<string> = new Set(["items"]);
const ITEM_KEYS: ReadonlySet<string> = new Set(["mediaId", "caption"]);
const CONTROL_CHARACTER = /[\u0000-\u0008\u000e-\u001f\u007f]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKnownKeys(raw: Record<string, unknown>, known: ReadonlySet<string>): boolean {
  return Object.keys(raw).every((key) => known.has(key));
}

type CaptionResult = { ok: true; caption: string | null } | { ok: false; reason: "caption" | "captionTooLong" };

/** Whitespace normalization only; blank → null; ≤ 32 code points. */
export function normalizeGalleryCaption(raw: unknown): CaptionResult {
  if (raw === null || raw === undefined) return { ok: true, caption: null };
  if (typeof raw !== "string" || CONTROL_CHARACTER.test(raw)) return { ok: false, reason: "caption" };
  const caption = raw.replace(/\s+/g, " ").trim();
  if (caption === "") return { ok: true, caption: null };
  if ([...caption].length > GALLERY_CAPTION_MAX_CHARACTERS) return { ok: false, reason: "captionTooLong" };
  return { ok: true, caption };
}

/**
 * `undefined`/`null` is the legal "no Gallery yet" state (an old draft
 * with no `gallery` key). Anything else must be exactly the closed shape.
 */
export function parseGalleryContent(raw: unknown): GalleryValidationResult {
  if (raw === null || raw === undefined) return { ok: true, gallery: { items: [] } };
  if (!isPlainObject(raw)) return { ok: false, reason: "not_an_object" };
  if (!hasOnlyKnownKeys(raw, GALLERY_KEYS)) return { ok: false, reason: "unknownKey" };
  if (raw.items === undefined) return { ok: true, gallery: { items: [] } };
  if (!Array.isArray(raw.items)) return { ok: false, reason: "items" };

  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw.items) {
    if (!isPlainObject(entry)) return { ok: false, reason: "item" };
    if (!hasOnlyKnownKeys(entry, ITEM_KEYS)) return { ok: false, reason: "unknownKey" };
    if (!isMediaIdentifier(entry.mediaId)) return { ok: false, reason: "mediaId" };
    if (seen.has(entry.mediaId)) return { ok: false, reason: "duplicateMediaId" };
    const caption = normalizeGalleryCaption(entry.caption);
    if (!caption.ok) return { ok: false, reason: caption.reason };
    seen.add(entry.mediaId);
    items.push({ mediaId: entry.mediaId, caption: caption.caption });
  }
  return { ok: true, gallery: { items } };
}

interface GalleryBearingContent {
  gallery?: unknown;
}

export type GalleryReadResult =
  | { status: "absent"; gallery: GalleryContent }
  | { status: "valid"; gallery: GalleryContent }
  | { status: "corrupted"; reason: GalleryValidationReason };

/** How `content.gallery` is actually found. */
export function inspectGallery(content: MemorialContent): GalleryReadResult {
  const raw = (content as GalleryBearingContent).gallery;
  if (raw === undefined || raw === null) return { status: "absent", gallery: { items: [] } };
  const parsed = parseGalleryContent(raw);
  return parsed.ok ? { status: "valid", gallery: parsed.gallery } : { status: "corrupted", reason: parsed.reason };
}

/** Fail-safe read: a corrupted Gallery reads as empty (no photograph is ever invented). */
export function readGallery(content: MemorialContent): GalleryContent {
  const read = inspectGallery(content);
  return read.status === "corrupted" ? { items: [...EMPTY_GALLERY_CONTENT.items] } : read.gallery;
}

/** The referenced media ids, in the family's order. */
export function galleryMediaIds(gallery: GalleryContent): string[] {
  return gallery.items.map((item) => item.mediaId);
}

export type GalleryWriteResult = { ok: true; content: MemorialContent } | { ok: false; reason: GalleryValidationReason };

/** Validates (and normalizes) `gallery` before writing it into `content`; never mutates `content`. */
export function updateGallery(content: MemorialContent, gallery: GalleryContent): GalleryWriteResult {
  const parsed = parseGalleryContent(gallery);
  if (!parsed.ok) return parsed;
  return { ok: true, content: { ...content, gallery: parsed.gallery as unknown as Record<string, unknown> } };
}

export type GalleryEditResult = { ok: true; gallery: GalleryContent } | { ok: false; reason: GalleryValidationReason | "unknownMediaId" | "notAPermutation" };

/** Appends a photograph at the end of the family's order. */
export function addGalleryMedia(gallery: GalleryContent, mediaId: string, caption: string | null = null): GalleryEditResult {
  return parseGalleryContent({ items: [...gallery.items, { mediaId, caption }] });
}

/** Removes a photograph's reference; the remaining order is kept, with no hole. A no-op when absent. */
export function removeGalleryMedia(gallery: GalleryContent, mediaId: string): GalleryContent {
  return { items: gallery.items.filter((item) => item.mediaId !== mediaId) };
}

/** The family's new order: exactly the current ids, each once. */
export function reorderGallery(gallery: GalleryContent, orderedMediaIds: readonly string[]): GalleryEditResult {
  const current = galleryMediaIds(gallery);
  if (orderedMediaIds.length !== current.length || new Set(orderedMediaIds).size !== current.length || !orderedMediaIds.every((id) => current.includes(id))) {
    return { ok: false, reason: "notAPermutation" };
  }
  const byId = new Map(gallery.items.map((item) => [item.mediaId, item]));
  return { ok: true, gallery: { items: orderedMediaIds.map((id) => byId.get(id)!) } };
}

/** Sets (or clears) one photograph's caption. */
export function setGalleryCaption(gallery: GalleryContent, mediaId: string, caption: string | null): GalleryEditResult {
  if (!gallery.items.some((item) => item.mediaId === mediaId)) return { ok: false, reason: "unknownMediaId" };
  return parseGalleryContent({ items: gallery.items.map((item) => (item.mediaId === mediaId ? { mediaId, caption } : item)) });
}
