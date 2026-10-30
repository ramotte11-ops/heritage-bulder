import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGuestDraftV3, updateGuestDraftV3, validateGuestDraftV3, type GuestDraftPhotoAsset, type GuestDraftV3 } from "./guest-draft-v3";
import type { GuestDraftV3ReadResult } from "./guest-draft-v3-store";
import { loadGuestPreview, projectGuestDraftForPreview, toMemorialPreviewResult, type GuestPreviewStore } from "./guest-preview";
import type { MemorialContent } from "@/types/memorial";

/**
 * QG 003 — the guest Preview adapter: the local V3 draft and its blobs,
 * assembled by the real `assembleMemorial`, with no server media id, no
 * write and no network.
 */

const HERO_ID = "0b7c4f0e-8d1a-4c33-9a57-7f2c1e9d0a01";
const galleryId = (index: number) => `5e0c2a4b-1f3d-4e6a-8b7c-${String(index).padStart(12, "0")}`;
const CROP = { focalX: 0.425, focalY: 0.6, zoom: 1.6 };

function asset(localId: string, width: number, height: number, known = true): GuestDraftPhotoAsset {
  return {
    localId,
    source: {
      blobRole: known ? "prepared_high_quality" : "legacy_unspecified",
      mimeType: "image/webp",
      sizeBytes: 1,
      dimensions: known ? { status: "known", width, height } : { status: "unknown", reason: "legacy_unmeasured" },
      originalFilename: `${localId}.webp`,
      lastModified: 1,
    },
    blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
  };
}

/** A complete guest draft past A13: Hero revealed, A00 = no, A04 = no,
 * the A10-A12 sheet partly written, `galleryCount` local photographs. */
function completeDraft({ galleryCount = 8, skinVariant = "dark" as const } = {}) {
  const created = createGuestDraftV3({
    draftId: "guest-preview-draft",
    transferKey: "guest-preview-transfer",
    now: "2026-10-30T09:00:00.000Z",
    language: "fr",
    skinVariant,
    content: {
      hero: {
        displayName: "Madeleine Arnaud",
        birth: { precision: "year", year: 1938 },
        death: { precision: "year", year: 2026 },
        shortPhrase: "Une femme lumineuse",
        photo: null,
      },
      personWords: { text: "Institutrice pendant quarante ans." },
      guidedFlow: {
        T04: { status: "skipped" },
        A00: { status: "completed", answer: "no" },
        T05: { status: "completed" },
        T06: { status: "completed" },
        T07: { status: "completed" },
        T08: { status: "completed" },
        A04: { status: "completed", answer: "no" },
        A10: { status: "completed" },
        A11: { status: "skipped" },
        A12: { status: "skipped" },
        A13: { status: galleryCount > 0 ? "completed" : "skipped" },
      },
    } as unknown as MemorialContent,
  });
  if (!created.ok) throw new Error(created.reason);
  const photos = [
    { localId: HERO_ID, placement: { purpose: "hero" as const, crop: CROP } },
    ...Array.from({ length: galleryCount }, (_, index) => ({
      localId: galleryId(index + 1),
      placement: { purpose: "gallery" as const, caption: index === 1 ? "Été 1972" : null },
    })),
  ];
  const updated = updateGuestDraftV3(created.draft, { now: "2026-10-30T09:01:00.000Z", photos });
  if (!updated.ok) throw new Error(updated.reason);
  const assets = [
    asset(HERO_ID, 1200, 1600),
    ...Array.from({ length: galleryCount }, (_, index) => asset(galleryId(index + 1), 1600 - index * 50, 1200)),
  ];
  return { draft: updated.draft, assets };
}

class ReadOnlyStore implements GuestPreviewStore {
  readonly reads: string[] = [];
  constructor(
    private readonly result: GuestDraftV3ReadResult,
    private readonly assets: Map<string, GuestDraftPhotoAsset>,
  ) {}
  async read(): Promise<GuestDraftV3ReadResult> {
    return structuredClone(this.result);
  }
  async readPhoto(localId: string) {
    this.reads.push(localId);
    const found = this.assets.get(localId);
    return found === undefined
      ? { ok: false as const, reason: "photo_not_found" as const }
      : { ok: true as const, asset: found };
  }
}

function setup(draft: GuestDraftV3, assets: GuestDraftPhotoAsset[]) {
  const store = new ReadOnlyStore({ status: "ready", draft }, new Map(assets.map((a) => [a.localId, a])));
  let sequence = 0;
  const createObjectUrl = vi.fn(() => `blob:preview-${++sequence}`);
  const revokeObjectUrl = vi.fn();
  return { store, createObjectUrl, revokeObjectUrl };
}

describe("projectGuestDraftForPreview", () => {
  it("references every local photograph by its own localId, in order, without touching the draft", () => {
    const { draft } = completeDraft({ galleryCount: 8 });
    const before = structuredClone(draft);
    const projection = projectGuestDraftForPreview(draft)!;

    const content = projection.content as unknown as {
      hero: { photo: unknown; displayName: string };
      gallery: { items: Array<{ mediaId: string; caption: string | null }> };
    };
    expect(content.hero.photo).toEqual({ mediaId: HERO_ID, crop: CROP });
    expect(content.hero.displayName).toBe("Madeleine Arnaud");
    // No commercial cap: all eight, the family's order, their captions.
    expect(content.gallery.items).toEqual(
      Array.from({ length: 8 }, (_, index) => ({ mediaId: galleryId(index + 1), caption: index === 1 ? "Été 1972" : null })),
    );
    expect(projection.photos.map(({ localId }) => localId)).toEqual([HERO_ID, ...Array.from({ length: 8 }, (_, i) => galleryId(i + 1))]);
    expect(draft).toEqual(before);
    // The projection is never a V3 draft: the validator refuses it.
    expect(validateGuestDraftV3({ ...draft, content: projection.content })).toEqual({ ok: false, reason: "server_media_reference" });
  });

  it("is locked before T08 or without an ambiance", () => {
    const { draft } = completeDraft();
    const flow = (draft.content as unknown as { guidedFlow: Record<string, unknown> }).guidedFlow;
    const beforeReveal = { ...draft, content: { ...draft.content, guidedFlow: { ...flow, T08: undefined } } } as GuestDraftV3;
    expect(projectGuestDraftForPreview(beforeReveal)).toBeNull();
    expect(projectGuestDraftForPreview({ ...draft, skinVariant: null })).toBeNull();
  });
});

describe("loadGuestPreview", () => {
  it("assembles the real Memorial from local blobs: Hero crop kept, every Gallery photograph, offerings", async () => {
    const { draft, assets } = completeDraft({ galleryCount: 8, skinVariant: "dark" });
    const { store, createObjectUrl, revokeObjectUrl } = setup(draft, assets);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl });
    vi.unstubAllGlobals();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const { assembled } = result;
    expect(assembled.status).toBe("assembled");
    expect(assembled.skinVariant).toBe("dark");
    expect(assembled.failures).toEqual([]);
    expect(assembled.sections.map(({ sectionId }) => sectionId)).toEqual(["hero", "story", "gallery", "symbolicOfferings"]);

    const hero = assembled.sections.find((section) => section.rendererKey === "HeroIntemporel")!;
    if (hero.rendererKey !== "HeroIntemporel") throw new Error("hero");
    expect(hero.props.photo).toEqual({ readUrl: "blob:preview-1" });
    expect(hero.props.hero.photo).toEqual({ mediaId: HERO_ID, crop: CROP });

    const gallery = assembled.sections.find((section) => section.rendererKey === "GalleryIntemporel")!;
    if (gallery.rendererKey !== "GalleryIntemporel") throw new Error("gallery");
    expect(gallery.props.media.map(({ mediaId }) => mediaId)).toEqual(Array.from({ length: 8 }, (_, i) => galleryId(i + 1)));
    expect(gallery.props.media.map(({ src }) => src)).toEqual(Array.from({ length: 8 }, (_, i) => `blob:preview-${i + 2}`));
    expect(gallery.props.media[1]).toMatchObject({ caption: "Été 1972", alt: "Été 1972", width: 1550, height: 1200 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledTimes(9);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    result.session.release();
    result.session.release();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(9);
    expect(new Set(revokeObjectUrl.mock.calls.map(([url]) => url)).size).toBe(9);
    expect(toMemorialPreviewResult(result)).toEqual({ status: "ready", assembled });
  });

  it("shows the optional matters the family left empty as the validated renderers do, and omits what does not apply", async () => {
    const { draft, assets } = completeDraft({ galleryCount: 1 });
    const { store, createObjectUrl, revokeObjectUrl } = setup(draft, assets);
    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    // One photograph is no Gallery state (A13's own rule) — nothing lost.
    expect(result.assembled.sections.map(({ sectionId }) => sectionId)).toEqual(["hero", "story", "symbolicOfferings"]);
  });

  it("measures a legacy photograph whose dimensions were never stored, without writing them back", async () => {
    const { draft, assets } = completeDraft({ galleryCount: 2 });
    assets[2] = asset(galleryId(2), 0, 0, false);
    const { store, createObjectUrl, revokeObjectUrl } = setup(draft, assets);
    const measureImage = vi.fn(async () => ({ width: 900, height: 1200 }));
    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl, measureImage });
    expect(result.status).toBe("ready");
    expect(measureImage).toHaveBeenCalledTimes(1);
    expect(assets[2].source.dimensions).toEqual({ status: "unknown", reason: "legacy_unmeasured" });

    const unmeasurable = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl, measureImage: async () => null });
    expect(unmeasurable).toEqual({ status: "unavailable", reason: "photo_dimensions_unknown", detail: galleryId(2) });
  });

  it("is locked without a draft or before T08", async () => {
    const empty = new ReadOnlyStore({ status: "empty" }, new Map());
    expect(await loadGuestPreview({ store: empty, createObjectUrl: vi.fn(), revokeObjectUrl: vi.fn() })).toEqual({ status: "locked" });

    const { draft, assets } = completeDraft();
    const { store, createObjectUrl, revokeObjectUrl } = setup({ ...draft, skinVariant: null }, assets);
    expect(await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl })).toEqual({ status: "locked" });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["corrupted", { status: "corrupted", reason: "invalid_content" }],
    ["incompatible", { status: "incompatible", foundVersion: 9 }],
  ] as const)("refuses a %s draft visibly, reading nothing else", async (detail, read) => {
    const store = new ReadOnlyStore(read as GuestDraftV3ReadResult, new Map());
    expect(await loadGuestPreview({ store, createObjectUrl: vi.fn(), revokeObjectUrl: vi.fn() }))
      .toEqual({ status: "unavailable", reason: "draft_unreadable", detail });
    expect(store.reads).toEqual([]);
  });

  it("refuses the whole Preview when one Gallery blob is missing, and revokes what it had created", async () => {
    const { draft, assets } = completeDraft({ galleryCount: 8 });
    const { store, createObjectUrl, revokeObjectUrl } = setup(draft, assets.filter(({ localId }) => localId !== galleryId(5)));
    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl });

    expect(result).toEqual({ status: "unavailable", reason: "photo_unreadable", detail: "photo_not_found" });
    expect(toMemorialPreviewResult(result)).toEqual({ status: "unavailable" });
    expect(createObjectUrl).toHaveBeenCalledTimes(5);
    expect(revokeObjectUrl.mock.calls.map(([url]) => url)).toEqual(createObjectUrl.mock.results.map(({ value }) => value));
  });

  it("refuses a corrupted Hero rather than drawing a Memorial without it", async () => {
    const { draft, assets } = completeDraft();
    const corrupted = { ...draft, content: { ...draft.content, hero: { ...(draft.content.hero as object), displayName: 42 } } } as GuestDraftV3;
    const { store, createObjectUrl, revokeObjectUrl } = setup(corrupted, assets);
    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl });
    expect(result).toEqual({ status: "unavailable", reason: "hero_unassembled" });
    expect(revokeObjectUrl).toHaveBeenCalledTimes(createObjectUrl.mock.calls.length);
  });

  it("refuses a Gallery the assembler could not show whole (a reference that is not a media identifier)", async () => {
    const { draft, assets } = completeDraft({ galleryCount: 2 });
    const legacy = {
      ...draft,
      photos: draft.photos.map((photo, index) => (index === 2 ? { ...photo, localId: "legacy-photo" } : photo)),
    };
    const { store, createObjectUrl, revokeObjectUrl } = setup(legacy, [...assets, asset("legacy-photo", 800, 600)]);
    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl });
    expect(result).toEqual({ status: "unavailable", reason: "gallery_incomplete", detail: "0/2" });
    expect(revokeObjectUrl).toHaveBeenCalledTimes(3);
  });

  it("only ever reads: the adapter has no write path and no network or server dependency", () => {
    const source = readFileSync(join(import.meta.dirname, "guest-preview.ts"), "utf8");
    expect(source).not.toMatch(/\.save\(|addPhoto|removePhoto|replacePhoto|updatePhotoPlacement/);
    expect(source).not.toMatch(/@supabase|lib\/supabase|fetch\s*\(|XMLHttpRequest|WebSocket|server-media|owner-draft-media-resolver|"use server"/);
  });
});
