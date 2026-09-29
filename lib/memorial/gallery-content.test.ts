import { describe, expect, it } from "vitest";
import { A13_VIEWER_CONTRACT } from "@/config/viewer-a13-desktop-v2";
import { normalizeViewerCaption } from "@/lib/memorial/viewer/viewer-layout";
import type { MemorialContent } from "@/types/memorial";
import {
  GALLERY_CAPTION_MAX_CHARACTERS,
  addGalleryMedia,
  galleryMediaIds,
  clampGalleryCaptionInput,
  galleryCaptionLength,
  inspectGallery,
  moveGalleryMedia,
  normalizeGalleryCaption,
  parseGalleryContent,
  readGallery,
  removeGalleryMedia,
  reorderGallery,
  replaceGalleryMedia,
  setGalleryCaption,
  updateGallery,
} from "./gallery-content";

/** Dette D1 — `draft.content.gallery`: closed shape, mediaId references only, the family's order. */

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const A = id(1);
const B = id(2);
const C = id(3);
const D = id(4);

describe("parseGalleryContent — the closed shape", () => {
  it("absent / null / an empty object are the legal 'no Gallery yet' state", () => {
    for (const raw of [undefined, null, {}, { items: [] }]) expect(parseGalleryContent(raw)).toEqual({ ok: true, gallery: { items: [] } });
  });

  it("keeps the family's order exactly — never sorted, never deduplicated silently", () => {
    const raw = { items: [{ mediaId: C, caption: "Le village" }, { mediaId: A, caption: null }, { mediaId: D }, { mediaId: B, caption: "Maman" }] };
    const parsed = parseGalleryContent(raw);
    expect(parsed.ok && galleryMediaIds(parsed.gallery)).toEqual([C, A, D, B]);
    expect(parsed.ok && parsed.gallery.items[2]).toEqual({ mediaId: D, caption: null });
  });

  it("stores references, never a URL or a storage path: anything but a media identifier is refused", () => {
    for (const mediaId of [
      "https://project.supabase.co/storage/v1/object/sign/memorial-media/x.jpg?token=abc",
      `${A}/${B}/original.jpg`,
      "memorial-media/original.jpg",
      "/pilot/a13-dynamic-polaroid/p1-portrait-3x4.jpg",
      "",
      42,
      null,
    ]) {
      expect(parseGalleryContent({ items: [{ mediaId, caption: null }] })).toEqual({ ok: false, reason: "mediaId" });
    }
  });

  it("refuses every extra field — no URL, path, alt, dimension or layout can ride along", () => {
    for (const extra of [{ url: "https://x" }, { storagePath: `${A}/${B}/original.jpg` }, { alt: "Photo" }, { width: 10 }, { order: 1 }]) {
      expect(parseGalleryContent({ items: [{ mediaId: A, caption: null, ...extra }] })).toEqual({ ok: false, reason: "unknownKey" });
    }
    expect(parseGalleryContent({ items: [], title: "Souvenirs" })).toEqual({ ok: false, reason: "unknownKey" });
  });

  it("refuses a malformed container, a malformed item and the same photograph twice", () => {
    expect(parseGalleryContent("x")).toEqual({ ok: false, reason: "not_an_object" });
    expect(parseGalleryContent([])).toEqual({ ok: false, reason: "not_an_object" });
    expect(parseGalleryContent({ items: {} })).toEqual({ ok: false, reason: "items" });
    expect(parseGalleryContent({ items: ["x"] })).toEqual({ ok: false, reason: "item" });
    expect(parseGalleryContent({ items: [{ mediaId: A }, { mediaId: A }] })).toEqual({ ok: false, reason: "duplicateMediaId" });
  });
});

describe("captions — family content, 32 characters, never translated", () => {
  it("normalizes whitespace only; blank → null", () => {
    expect(normalizeGalleryCaption("  Maman   et  Mamie\n1966 ")).toEqual({ ok: true, caption: "Maman et Mamie 1966" });
    expect(normalizeGalleryCaption("   \t ")).toEqual({ ok: true, caption: null });
    expect(normalizeGalleryCaption("MAMAN ET MAMIE, À MIMIZAN, 1966.")).toEqual({ ok: true, caption: "MAMAN ET MAMIE, À MIMIZAN, 1966." });
  });

  it("32 code points max, spaces included — the A13 Gallery / Viewer contract", () => {
    expect(GALLERY_CAPTION_MAX_CHARACTERS).toBe(32);
    expect(GALLERY_CAPTION_MAX_CHARACTERS).toBe(A13_VIEWER_CONTRACT.caption.maxCharacters);
    expect(normalizeGalleryCaption("x".repeat(32)).ok).toBe(true);
    expect(normalizeGalleryCaption("x".repeat(33))).toEqual({ ok: false, reason: "captionTooLong" });
    expect(normalizeGalleryCaption("é".repeat(32)).ok).toBe(true);
    expect(normalizeGalleryCaption("🌻".repeat(32)).ok).toBe(true);
  });

  it("same normalization as the Viewer's own caption rule", () => {
    for (const text of ["  a  b ", "Été 2010 · Cabourg", "x\n\ny", "   "]) {
      const ours = normalizeGalleryCaption(text);
      expect(ours.ok && ours.caption).toBe(normalizeViewerCaption(text));
    }
  });

  it("refuses non-strings and non-whitespace control characters", () => {
    expect(normalizeGalleryCaption(12)).toEqual({ ok: false, reason: "caption" });
    expect(normalizeGalleryCaption("a\u0000b")).toEqual({ ok: false, reason: "caption" });
    expect(normalizeGalleryCaption("a\u007fb")).toEqual({ ok: false, reason: "caption" });
  });

  it("stores the family's words verbatim otherwise (no casing, no translation)", () => {
    const parsed = parseGalleryContent({ items: [{ mediaId: A, caption: "tous les deux, sur la colline" }] });
    expect(parsed.ok && parsed.gallery.items[0].caption).toBe("tous les deux, sur la colline");
  });
});

describe("inspect / read / update", () => {
  it("distinguishes absent, valid and corrupted; a corrupted Gallery reads as empty", () => {
    expect(inspectGallery({}).status).toBe("absent");
    expect(inspectGallery({ gallery: { items: [{ mediaId: A, caption: null }] } }).status).toBe("valid");
    expect(inspectGallery({ gallery: { items: [{ mediaId: "https://x" }] } })).toEqual({ status: "corrupted", reason: "mediaId" });
    expect(readGallery({ gallery: { items: [{ mediaId: "https://x" }] } })).toEqual({ items: [] });
  });

  it("updateGallery validates, normalizes, never mutates its input, and writes only mediaId + caption", () => {
    const content: MemorialContent = { hero: { displayName: "Jeanne" } };
    const written = updateGallery(content, { items: [{ mediaId: B, caption: "  Maman  " }, { mediaId: A, caption: null }] });
    expect(content).toEqual({ hero: { displayName: "Jeanne" } });
    expect(written.ok && written.content).toEqual({ hero: { displayName: "Jeanne" }, gallery: { items: [{ mediaId: B, caption: "Maman" }, { mediaId: A, caption: null }] } });
    const json = JSON.stringify(written.ok && written.content.gallery);
    expect(json).not.toMatch(/https?:|storage|original\.|\.jpg|\.png|\.webp|url|path/i);
    expect(updateGallery(content, { items: [{ mediaId: "x", caption: null }] })).toEqual({ ok: false, reason: "mediaId" });
  });
});

describe("pure edits keep the family's order", () => {
  const gallery = { items: [{ mediaId: A, caption: "a" }, { mediaId: B, caption: null }, { mediaId: C, caption: "c" }, { mediaId: D, caption: null }] };

  it("add appends at the end; a duplicate or a non-identifier is refused", () => {
    const added = addGalleryMedia({ items: gallery.items.slice(0, 2) }, C, "Le village");
    expect(added.ok && added.gallery.items).toEqual([{ mediaId: A, caption: "a" }, { mediaId: B, caption: null }, { mediaId: C, caption: "Le village" }]);
    expect(addGalleryMedia(gallery, A)).toEqual({ ok: false, reason: "duplicateMediaId" });
    expect(addGalleryMedia(gallery, "https://x")).toEqual({ ok: false, reason: "mediaId" });
  });

  it("remove keeps the remaining order with no hole; removing an absent id is a no-op", () => {
    expect(galleryMediaIds(removeGalleryMedia(gallery, B))).toEqual([A, C, D]);
    expect(removeGalleryMedia(gallery, B).items).toHaveLength(3);
    expect(removeGalleryMedia(gallery, id(9))).toEqual(gallery);
    // down to one photograph and to none: the count alone later decides the Gallery state (0–1 → absent)
    expect(galleryMediaIds(removeGalleryMedia(removeGalleryMedia(removeGalleryMedia(gallery, A), B), C))).toEqual([D]);
  });

  it("reorder accepts only an exact permutation, and keeps each caption with its photograph", () => {
    const reordered = reorderGallery(gallery, [D, C, B, A]);
    expect(reordered.ok && reordered.gallery.items).toEqual([{ mediaId: D, caption: null }, { mediaId: C, caption: "c" }, { mediaId: B, caption: null }, { mediaId: A, caption: "a" }]);
    for (const bad of [[A, B, C], [A, B, C, C], [A, B, C, id(9)], [A, B, C, D, id(9)]]) expect(reorderGallery(gallery, bad)).toEqual({ ok: false, reason: "notAPermutation" });
  });

  it("setCaption normalizes, clears, and refuses an unknown photograph or a too-long caption", () => {
    const set = setGalleryCaption(gallery, B, "  Tous les deux ");
    expect(set.ok && set.gallery.items[1]).toEqual({ mediaId: B, caption: "Tous les deux" });
    expect(set.ok && galleryMediaIds(set.gallery)).toEqual([A, B, C, D]);
    const cleared = setGalleryCaption(gallery, A, null);
    expect(cleared.ok && cleared.gallery.items[0].caption).toBeNull();
    expect(setGalleryCaption(gallery, id(9), "x")).toEqual({ ok: false, reason: "unknownMediaId" });
    expect(setGalleryCaption(gallery, A, "x".repeat(33))).toEqual({ ok: false, reason: "captionTooLong" });
  });

  it("replace swaps only the reference: same position, same caption; unknown or duplicate refused", () => {
    const E = id(5);
    const replaced = replaceGalleryMedia(gallery, C, E);
    expect(replaced.ok && replaced.gallery.items).toEqual([{ mediaId: A, caption: "a" }, { mediaId: B, caption: null }, { mediaId: E, caption: "c" }, { mediaId: D, caption: null }]);
    expect(replaceGalleryMedia(gallery, id(9), E)).toEqual({ ok: false, reason: "unknownMediaId" });
    expect(replaceGalleryMedia(gallery, C, A)).toEqual({ ok: false, reason: "duplicateMediaId" });
    expect(replaceGalleryMedia(gallery, C, "https://x/original.jpg")).toEqual({ ok: false, reason: "mediaId" });
    expect(galleryMediaIds(gallery)).toEqual([A, B, C, D]); // input never mutated
  });

  it("move shifts one place, the caption travels with its photograph; the ends refuse to go further", () => {
    const down = moveGalleryMedia(gallery, A, 1);
    expect(down.ok && down.gallery.items.slice(0, 2)).toEqual([{ mediaId: B, caption: null }, { mediaId: A, caption: "a" }]);
    const up = moveGalleryMedia(gallery, C, -1);
    expect(up.ok && galleryMediaIds(up.gallery)).toEqual([A, C, B, D]);
    expect(moveGalleryMedia(gallery, A, -1)).toEqual({ ok: false, reason: "notAPermutation" });
    expect(moveGalleryMedia(gallery, D, 1)).toEqual({ ok: false, reason: "notAPermutation" });
    expect(moveGalleryMedia(gallery, id(9), 1)).toEqual({ ok: false, reason: "unknownMediaId" });
    expect(galleryMediaIds(gallery)).toEqual([A, B, C, D]);
  });

  it("galleryCaptionLength counts exactly what normalizeGalleryCaption measures (code points, collapsed spaces)", () => {
    expect(galleryCaptionLength("  Tous   les deux ")).toBe(13);
    expect(galleryCaptionLength("😀".repeat(32))).toBe(32);
    expect(normalizeGalleryCaption("😀".repeat(32)).ok).toBe(true);
    expect(galleryCaptionLength("😀".repeat(33))).toBe(GALLERY_CAPTION_MAX_CHARACTERS + 1);
    expect(normalizeGalleryCaption("😀".repeat(33))).toEqual({ ok: false, reason: "captionTooLong" });
    expect(galleryCaptionLength("   ")).toBe(0);
  });

  it("clampGalleryCaptionInput keeps typing intact and stops a long paste exactly at the stored limit", () => {
    expect(clampGalleryCaptionInput("Tous les deux ")).toBe("Tous les deux ");
    expect(clampGalleryCaptionInput("x".repeat(40))).toBe("x".repeat(32));
    expect(clampGalleryCaptionInput("😀".repeat(40))).toBe("😀".repeat(32));
    expect(clampGalleryCaptionInput("  " + "x".repeat(40))).toBe("  " + "x".repeat(32)); // leading spaces do not count once stored
    expect(clampGalleryCaptionInput("a\u0001b")).toBe("ab");
    const clamped = clampGalleryCaptionInput("Le village de ma grand-mère, été 1966");
    expect(normalizeGalleryCaption(clamped).ok).toBe(true);
    expect(galleryCaptionLength(clamped)).toBe(GALLERY_CAPTION_MAX_CHARACTERS);
  });
});
