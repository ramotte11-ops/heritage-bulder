import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement } from "@/lib/memorial/assembly/test-fixtures";
import { canonicalJson, computePublicationPreview, publicationDigest } from "./publication-preview";

/**
 * QG 008 Lot 3 — the one computation shared by the private Preview and
 * « Publier ». The publication policy underneath is the real one.
 */

const galleryId = (n: number) => `5e0c2a4b-1f3d-4e6a-8b7c-${String(n).padStart(12, "0")}`;

function withGallery(count: number, base: MemorialContent = fullAnnouncement()): MemorialContent {
  return {
    ...base,
    gallery: { items: Array.from({ length: count }, (_, i) => ({ mediaId: galleryId(i + 1), caption: i === 0 ? "Été 1972" : null })) },
  } as MemorialContent;
}

const publishedIds = (content: MemorialContent) =>
  ((content as { gallery?: { items: Array<{ mediaId: string }> } }).gallery?.items ?? []).map(({ mediaId }) => mediaId);

function ok(result: ReturnType<typeof computePublicationPreview>) {
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result;
}

describe("computePublicationPreview — avis gallery", () => {
  it("6 photos or fewer: no selection at all, every photo published", () => {
    const result = ok(computePublicationPreview({ draft: withGallery(6), accessLevel: "avis", skin: "intemporel" }));
    expect(result.gallery).toMatchObject({ limit: 6, selection: undefined, proposed: false });
    expect(publishedIds(result.projection.content)).toEqual([1, 2, 3, 4, 5, 6].map(galleryId));
  });

  it("7 photos: the six first in the Builder's order are PROPOSED, the 7th stays in the draft", () => {
    const draft = withGallery(7);
    const result = ok(computePublicationPreview({ draft, accessLevel: "avis", skin: "intemporel" }));
    expect(result.gallery).toMatchObject({ limit: 6, proposed: true, selection: [1, 2, 3, 4, 5, 6].map(galleryId) });
    expect(result.gallery.draftIds).toEqual([1, 2, 3, 4, 5, 6, 7].map(galleryId));
    expect(publishedIds(result.projection.content)).toEqual([1, 2, 3, 4, 5, 6].map(galleryId));
    expect(publishedIds(draft)).toHaveLength(7);
  });

  it("a family's choice is published in the BUILDER's order, whatever order it was ticked in", () => {
    const result = ok(
      computePublicationPreview({
        draft: withGallery(8),
        accessLevel: "avis",
        skin: "intemporel",
        requestedSelection: [galleryId(8), galleryId(2), galleryId(5)],
      }),
    );
    expect(result.gallery).toMatchObject({ proposed: false, selection: [2, 5, 8].map(galleryId) });
    expect(publishedIds(result.projection.content)).toEqual([2, 5, 8].map(galleryId));
  });

  it.each([
    ["more than six", [1, 2, 3, 4, 5, 6, 7].map(galleryId), "too_many_gallery_media"],
    ["a duplicate", [galleryId(1), galleryId(1)], "duplicate_gallery_media"],
    ["a photo of another draft", [galleryId(1), "9d8c7b6a-5f4e-4d3c-8b2a-000000000099"], "unknown_gallery_media"],
    ["not a list", "all", "invalid_gallery_selection"],
    ["an empty choice", [], "gallery_selection_required"],
  ])("a choice with %s is refused by the policy itself", (_label, requestedSelection, code) => {
    const result = computePublicationPreview({ draft: withGallery(7), accessLevel: "avis", skin: "intemporel", requestedSelection });
    expect(result).toMatchObject({ ok: false, error: { code } });
  });
});

describe("computePublicationPreview — complete tribute and premium sections", () => {
  it("complet: the whole gallery, no limit, no choice", () => {
    const result = ok(computePublicationPreview({ draft: withGallery(9), accessLevel: "complet", skin: "intemporel" }));
    expect(result.gallery).toMatchObject({ limit: null, selection: undefined, proposed: false });
    expect(publishedIds(result.projection.content)).toHaveLength(9);
  });

  it("avis: a filled premium section is reported and NOT published (video stays reserved to complet)", () => {
    const draft = { ...fullAnnouncement(), video: { items: [] } } as unknown as MemorialContent;
    const avis = ok(computePublicationPreview({ draft, accessLevel: "avis", skin: "intemporel" }));
    expect(avis.premiumSections).toEqual(["video"]);
    expect(avis.projection.content).not.toHaveProperty("video");
    expect(ok(computePublicationPreview({ draft, accessLevel: "complet", skin: "intemporel" })).premiumSections).toEqual([]);
  });

  it("an unknown access level is refused (fail closed)", () => {
    expect(computePublicationPreview({ draft: fullAnnouncement(), accessLevel: "premium", skin: "intemporel" }))
      .toMatchObject({ ok: false, error: { code: "unsupported_access_level" } });
  });

  it("never mutates the draft", () => {
    const draft = withGallery(7);
    const before = structuredClone(draft);
    computePublicationPreview({ draft, accessLevel: "avis", skin: "intemporel", requestedSelection: [galleryId(7)] });
    expect(draft).toEqual(before);
  });
});

describe("publication digest", () => {
  it("is stable for identical inputs and independent of key order (JSONB round trip)", () => {
    const a = { hero: { displayName: "Jeanne", photo: null }, gallery: { items: [] } } as unknown as MemorialContent;
    const b = { gallery: { items: [] }, hero: { photo: null, displayName: "Jeanne" } } as unknown as MemorialContent;
    expect(publicationDigest("avis", a)).toBe(publicationDigest("avis", b));
    expect(publicationDigest("avis", a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with the content, the gallery choice and the access level", () => {
    const draft = withGallery(7);
    const proposed = ok(computePublicationPreview({ draft, accessLevel: "avis", skin: "intemporel" })).digest;
    const chosen = ok(computePublicationPreview({ draft, accessLevel: "avis", skin: "intemporel", requestedSelection: [galleryId(7)] })).digest;
    const complet = ok(computePublicationPreview({ draft, accessLevel: "complet", skin: "intemporel" })).digest;
    expect(new Set([proposed, chosen, complet]).size).toBe(3);
    const renamed = { ...draft, hero: { ...(draft as { hero: object }).hero, displayName: "Autre nom" } } as MemorialContent;
    expect(ok(computePublicationPreview({ draft: renamed, accessLevel: "avis", skin: "intemporel" })).digest).not.toBe(proposed);
  });

  it("canonical JSON sorts keys at every level and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: undefined } })).toBe('{"a":{"d":[2,{"x":0,"y":1}]},"b":1}');
  });
});
