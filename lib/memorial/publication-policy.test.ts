import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GalleryItem } from "@/types/gallery";
import type { MemorialContent } from "@/types/memorial";
import {
  AVIS_SNAPSHOT_KEYS,
  FREE_PUBLICATION_GALLERY_LIMIT,
  projectMemorialPublication,
  type PublicationProjection,
} from "./publication-policy";

function mediaId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function galleryItems(count: number): GalleryItem[] {
  return Array.from({ length: count }, (_, index) => ({
    mediaId: mediaId(index + 1),
    caption: `Photo ${index + 1}`,
  }));
}

function draftWithGallery(count: number): MemorialContent {
  return { gallery: { items: galleryItems(count) } };
}

function project(
  draft: MemorialContent,
  accessLevel: unknown,
  gallerySelection?: unknown,
) {
  return projectMemorialPublication({
    draft,
    accessLevel,
    skin: "intemporel",
    gallerySelection,
  });
}

function successfulProjection(
  draft: MemorialContent,
  accessLevel: unknown,
  gallerySelection?: unknown,
): PublicationProjection {
  const result = project(draft, accessLevel, gallerySelection);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Projection failed: ${result.error.code}`);
  return result.projection;
}

function projectedGalleryItems(projection: PublicationProjection): GalleryItem[] {
  const gallery = projection.content.gallery as unknown as { items?: GalleryItem[] } | undefined;
  return gallery?.items ?? [];
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

describe("M1-B1 publication policy", () => {
  describe("avis gallery", () => {
    it.each([0, 1, 2, 3, 4, 5, 6])(
      "publishes the available photographs when the draft contains %i",
      (count) => {
        const projection = successfulProjection(draftWithGallery(count), "avis");
        expect(projectedGalleryItems(projection)).toEqual(galleryItems(count));
      },
    );

    it("uses the family's explicit selection and its explicit order", () => {
      const draft = draftWithGallery(12);
      const selection = [mediaId(9), mediaId(2), mediaId(12), mediaId(4), mediaId(7), mediaId(1)];

      const projection = successfulProjection(draft, "avis", selection);

      expect(projectedGalleryItems(projection).map((item) => item.mediaId)).toEqual(selection);
      expect(projectedGalleryItems(projection).map((item) => item.caption)).toEqual([
        "Photo 9",
        "Photo 2",
        "Photo 12",
        "Photo 4",
        "Photo 7",
        "Photo 1",
      ]);
    });

    it("refuses seven selected photographs", () => {
      const result = project(draftWithGallery(12), "avis", galleryItems(7).map((item) => item.mediaId));
      expect(result).toEqual({
        ok: false,
        error: { code: "too_many_gallery_media", maximum: FREE_PUBLICATION_GALLERY_LIMIT },
      });
    });

    it("refuses duplicate selected identifiers", () => {
      const duplicate = mediaId(3);
      const result = project(draftWithGallery(8), "avis", [duplicate, duplicate]);
      expect(result).toEqual({
        ok: false,
        error: { code: "duplicate_gallery_media", mediaId: duplicate },
      });
    });

    it("refuses an identifier absent from the draft", () => {
      const unknown = mediaId(99);
      const result = project(draftWithGallery(8), "avis", [mediaId(1), unknown]);
      expect(result).toEqual({
        ok: false,
        error: { code: "unknown_gallery_media", mediaId: unknown },
      });
    });

    it("refuses a malformed selection received at the trust boundary", () => {
      expect(project(draftWithGallery(8), "avis", [mediaId(1), 2])).toEqual({
        ok: false,
        error: { code: "invalid_gallery_selection" },
      });
    });

    it("requires an explicit non-empty selection above six prepared photographs", () => {
      expect(project(draftWithGallery(7), "avis")).toEqual({
        ok: false,
        error: { code: "gallery_selection_required" },
      });
      expect(project(draftWithGallery(7), "avis", [])).toEqual({
        ok: false,
        error: { code: "gallery_selection_required" },
      });
    });

    it("never exposes unselected photographs", () => {
      const selected = [mediaId(2), mediaId(6), mediaId(8)];
      const projection = successfulProjection(draftWithGallery(10), "avis", selected);
      const serialized = JSON.stringify(projection);

      expect(projectedGalleryItems(projection).map((item) => item.mediaId)).toEqual(selected);
      for (const omitted of [mediaId(1), mediaId(3), mediaId(4), mediaId(5), mediaId(7), mediaId(9), mediaId(10)]) {
        expect(serialized).not.toContain(omitted);
      }
    });

    it("does not demand a selection for a gallery hidden by the family", () => {
      const draft = {
        ...draftWithGallery(12),
        presentation: { hiddenSections: ["gallery"] },
      } as MemorialContent;

      const projection = successfulProjection(draft, "avis");

      expect(projection.content).not.toHaveProperty("gallery");
      expect(projection.content).toMatchObject({ presentation: { hiddenSections: ["gallery"] } });
    });

    it("refuses a corrupted gallery instead of publishing or truncating it", () => {
      const draft = { gallery: { items: [{ mediaId: mediaId(1), caption: null, leaked: true }] } } as MemorialContent;
      expect(project(draft, "avis")).toEqual({ ok: false, error: { code: "invalid_gallery" } });
    });
  });

  it("keeps the complete gallery in the family's draft order", () => {
    const projection = successfulProjection(draftWithGallery(12), "complet", [mediaId(2)]);
    expect(projectedGalleryItems(projection)).toEqual(galleryItems(12));
  });

  it("allows condolences for avis but excludes memorial contributions", () => {
    const projection = successfulProjection({}, "avis");
    expect(projection.allowedMessageTypes).toEqual(["condolence"]);
    expect(projection.allowedMessageTypes).not.toContain("testimonial");
    expect(projection.allowedMessageTypes).not.toContain("memory_message");
  });

  it("represents the complete message eligibility without inventing a renderer", () => {
    const draft = {
      condolences: { entries: ["condolence"] },
      testimonials: { entries: ["testimonial"] },
      memoryMessage: { entries: ["memory"] },
    } as unknown as MemorialContent;
    const projection = successfulProjection(draft, "complet");

    expect(projection.allowedMessageTypes).toEqual(["condolence", "memory_message", "testimonial"]);
    expect(projection.content).not.toHaveProperty("condolences");
    expect(projection.content).not.toHaveProperty("testimonials");
    expect(projection.content).not.toHaveProperty("memoryMessage");
  });

  it("never includes video in an avis projection", () => {
    const projection = successfulProjection(
      { video: { mediaId: "future-video", playbackUrl: "secret" } } as MemorialContent,
      "avis",
    );
    expect(projection.content).not.toHaveProperty("video");
    expect(JSON.stringify(projection)).not.toContain("future-video");
  });

  it("does not pretend video is operational for complet", () => {
    const projection = successfulProjection(
      { video: { mediaId: "future-video", playbackUrl: "secret" } } as MemorialContent,
      "complet",
    );
    expect(projection.content).not.toHaveProperty("video");
  });

  it("excludes a non-existent memory-book model for both access levels", () => {
    const draft = { memoryBook: { privateEntries: ["secret"] } } as unknown as MemorialContent;
    expect(successfulProjection(draft, "avis").content).toEqual({});
    expect(successfulProjection(draft, "complet").content).toEqual({});
  });

  it.each(["avis", "complet"] as const)(
    "does not publish the Preview-only symbolic-offerings renderer for %s",
    (accessLevel) => {
      const projection = successfulProjection({}, accessLevel);

      expect(projection.content).not.toHaveProperty("symbolicOfferings");
    },
  );

  it("excludes symbolic offerings only through public-renderer availability, never the avis premium rule", () => {
    const source = readFileSync(new URL("./publication-policy.ts", import.meta.url), "utf8");
    const publicRenderers = source.match(
      /const PUBLIC_RENDERERS:[\s\S]*?new Set\(\[([\s\S]*?)\]\);/,
    )?.[1];
    const premiumSectionIds = source.match(
      /const PREMIUM_SECTION_IDS:[\s\S]*?new Set\(\[([\s\S]*?)\]\);/,
    )?.[1];

    expect(publicRenderers).toBeDefined();
    expect(publicRenderers).not.toContain('"SymbolicOfferingsV1Section"');
    expect(premiumSectionIds).toBeDefined();
    expect(premiumSectionIds).not.toContain('"symbolicOfferings"');
  });

  it("preserves the private source byte-for-byte and shares no gallery references", () => {
    const draft = deepFreeze({
      ...draftWithGallery(9),
      video: { mediaId: "private-video" },
      testimonials: { entries: ["private-testimonial"] },
    } as MemorialContent);
    const before = JSON.stringify(draft);

    const projection = successfulProjection(draft, "avis", [mediaId(2), mediaId(4)]);
    projectedGalleryItems(projection)[0]!.caption = "Changed after projection";

    expect(JSON.stringify(draft)).toBe(before);
    expect(((draft.gallery as unknown as { items: GalleryItem[] }).items[1])).toEqual({
      mediaId: mediaId(2),
      caption: "Photo 2",
    });
  });

  it("fails closed on indirect and malformed fields instead of copying them", () => {
    const draft = {
      gallery: { items: [{ mediaId: mediaId(1), caption: "video is only a family caption" }] },
      guidedFlow: {
        A13: { status: "completed" },
        A00: { status: "completed", answer: "https://private.example/video.mp4" },
        T08: { status: "completed", answer: "indirect-known-step-video" },
        futurePremiumStep: { video: { mediaId: "indirect-video" } },
      },
      presentation: {
        hiddenSections: ["gallery", "video", "testimonials"],
        premiumPayload: { mediaId: "indirect-media" },
      },
      privateEnvelope: { testimonials: ["indirect-testimonial"] },
    } as unknown as MemorialContent;

    const projection = successfulProjection(draft, "avis");
    const serialized = JSON.stringify(projection);

    expect(projection.content).toEqual({
      guidedFlow: {
        T08: { status: "completed" },
        A13: { status: "completed" },
      },
      presentation: { hiddenSections: ["gallery"] },
    });
    expect(serialized).not.toContain("indirect-video");
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain("indirect-known-step-video");
    expect(serialized).not.toContain("indirect-media");
    expect(serialized).not.toContain("indirect-testimonial");
  });

  it("normalizes an operational section through its closed parser", () => {
    const draft = { hero: { displayName: "Jeanne", unexpectedPremium: { video: true } } } as MemorialContent;
    const projection = successfulProjection(draft, "avis");
    expect(projection.content).toEqual({
      hero: {
        displayName: "Jeanne",
        birth: null,
        death: null,
        shortPhrase: null,
        photo: null,
      },
    });
    expect(JSON.stringify(projection)).not.toContain("unexpectedPremium");
  });

  it.each([undefined, null, "free", "AVIS", { accessLevel: "avis" }])(
    "accepts no implicit access level (%j)",
    (accessLevel) => {
      expect(project({}, accessLevel)).toEqual({
        ok: false,
        error: { code: "unsupported_access_level" },
      });
    },
  );

  it("rejects an unknown skin rather than making a module available", () => {
    expect(
      projectMemorialPublication({ draft: {}, accessLevel: "avis", skin: "future-skin" }),
    ).toEqual({ ok: false, error: { code: "unsupported_skin" } });
  });

  it("returns the same projection for the same values", () => {
    const draft = {
      ...draftWithGallery(8),
      guidedFlow: { A13: { status: "completed" } },
    } as MemorialContent;
    const input = {
      draft,
      accessLevel: "avis",
      skin: "intemporel",
      gallerySelection: [mediaId(8), mediaId(1), mediaId(3)],
    } as const;

    expect(projectMemorialPublication(input)).toEqual(projectMemorialPublication(input));
  });
});

describe("QG 008 — the free copy's keys, mirrored by the database", () => {
  it("AVIS_SNAPSHOT_KEYS equals memorial_access_settings.avis_snapshot_keys in the migration", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20261031120000_qg008_free_offer_v8_alignment.sql", import.meta.url),
      "utf8",
    );
    const literal = migration.match(/avis_snapshot_keys = array\[([\s\S]*?)\]/)?.[1];
    expect(literal).toBeDefined();
    const sqlKeys = [...(literal ?? "").matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);
    expect([...sqlKeys].sort()).toEqual([...AVIS_SNAPSHOT_KEYS].sort());
  });

  it("no avis projection, even from a maximal draft, produces a key outside that list", () => {
    const maximal = {
      ...draftWithGallery(3),
      hero: { displayName: "Jeanne" },
      video: { items: [{ url: "https://vimeo.com/1" }] },
      testimonials: { enabled: true },
      memoryMessage: { enabled: true },
      condolences: { enabled: true },
      symbolicOfferings: { enabled: true },
      unknownFutureSection: { anything: true },
    } as unknown as MemorialContent;
    const keys = Object.keys(successfulProjection(maximal, "avis").content);
    expect(keys.every((key) => (AVIS_SNAPSHOT_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(keys).not.toEqual(expect.arrayContaining(["video"]));
  });

  it("the six-photo publication limit equals the database's avis_gallery_limit", () => {
    expect(FREE_PUBLICATION_GALLERY_LIMIT).toBe(6);
  });
});

