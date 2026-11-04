import { describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";

vi.mock("server-only", () => ({}));
const { loadPublicMemorial, publicContentFor } = await import("./load-public-memorial");
const { fullAnnouncementWithTraditions } = await import("@/lib/memorial/assembly/test-fixtures");
const { updateGallery } = await import("@/lib/memorial/gallery-content");

/**
 * QG 016 / M2 — the public page's single server step: M1 read → public
 * MediaResolver → the existing assembler. Exercised end to end through a
 * fake `rpc` (the database answer) and a fake signer; no real Supabase.
 */

const SLUG = "95bd2601eac8";
const MEMORIAL = "d64ad8ab-0c21-4e16-a0cb-e2e48b28d129";
const HERO = "cc775d61-4412-4e24-a9c3-726fec0995c6";
const G = ["b09b82fc-2b94-400f-b8ba-252682e048b2", "0664b553-f7b8-45ee-9dba-45d8ca882cfe", "a5bd46c5-dd16-4805-8dd3-47f1dd953707"];
const NOT_RETURNED = "e0000000-0000-4000-8000-000000000009";

/** A snapshot built through the real Guided Flow writers, with real-shaped (uuid) media ids. */
function snapshot(galleryIds: readonly string[] = G): MemorialContent {
  const base = fullAnnouncementWithTraditions() as Record<string, unknown>;
  const hero = base.hero as Record<string, unknown>;
  const withHero = { ...base, hero: { ...hero, photo: { ...(hero.photo as Record<string, unknown>), mediaId: HERO } } } as MemorialContent;
  const gallery = updateGallery(withHero, { items: galleryIds.map((mediaId) => ({ mediaId, caption: null })) });
  if (!gallery.ok) throw new Error(`fixture gallery refused: ${gallery.reason}`);
  return gallery.content;
}

function media(ids: readonly string[] = G) {
  return [
    { media_id: HERO, purpose: "hero", storage_path: `${MEMORIAL}/${HERO}/original.webp`, width: 1600, height: 2000 },
    ...ids.map((id) => ({ media_id: id, purpose: "gallery", storage_path: `${MEMORIAL}/${id}/original.jpg`, width: 1600, height: 1200 })),
  ];
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    memorial_id: MEMORIAL,
    slug: SLUG,
    skin: "intemporel",
    skin_variant: "light",
    language: "fr",
    access_level: "avis",
    first_published_at: "2026-11-04T16:55:22.809753+00:00",
    published_at: "2026-11-04T16:55:22.809753+00:00",
    content: snapshot(),
    media: media(),
    ...overrides,
  };
}

function deps(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  const from = vi.fn(() => {
    throw new Error("the public loader must not read any table");
  });
  const sign = vi.fn(async (path: string) => `https://storage.test/object/sign/memorial-media/${path}?token=signed`);
  return { rpc, from, sign, deps: { client: { rpc, from, storage: {} } as never, sign } };
}

describe("loadPublicMemorial", () => {
  it("a published, visible memorial assembles from its snapshot with the real renderers", async () => {
    const fake = deps([row()]);
    const view = await loadPublicMemorial(SLUG, fake.deps);
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    const ids = view.assembled.sections.map((section) => section.sectionId);
    expect(ids[0]).toBe("hero");
    expect(ids).toContain("gallery");
    expect(view.assembled.skinVariant).toBe("light");
    expect(view.assembled.language).toBe("fr");
    expect(fake.rpc).toHaveBeenCalledWith("read_public_memorial_v1", { p_slug: SLUG });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("unknown / unpublished / withdrawn / expired (zero rows) is unavailable, without signing anything", async () => {
    const fake = deps([]);
    expect(await loadPublicMemorial(SLUG, fake.deps)).toEqual({ status: "unavailable" });
    expect(fake.sign).not.toHaveBeenCalled();
  });

  it("a malformed slug is unavailable without any database call", async () => {
    const fake = deps([row()]);
    expect(await loadPublicMemorial("jeanne-test-s1", fake.deps)).toEqual({ status: "unavailable" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("renders the SNAPSHOT given by the database, never anything else (no draft is ever read)", async () => {
    const content = snapshot();
    const hero = content.hero as Record<string, unknown>;
    const published = { ...content, hero: { ...hero, displayName: "Nom publié" } } as MemorialContent;
    const fake = deps([row({ content: published })]);
    const view = await loadPublicMemorial(SLUG, fake.deps);
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(JSON.stringify(view.assembled.sections[0].props)).toContain("Nom publié");
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("only the photographs the database returned are signed; a gallery id it did not return is never resolved", async () => {
    const fake = deps([row({ content: snapshot([...G, NOT_RETURNED]), media: media(G) })]);
    const view = await loadPublicMemorial(SLUG, fake.deps);
    expect(view.status).toBe("ready");
    const signedPaths = fake.sign.mock.calls.map(([path]) => path);
    expect(signedPaths.some((path) => path.includes(NOT_RETURNED))).toBe(false);
    expect(signedPaths).toContain(`${MEMORIAL}/${HERO}/original.webp`);
    if (view.status !== "ready") return;
    expect(JSON.stringify(view.assembled)).not.toContain(NOT_RETURNED + "/original");
  });

  it("no storage path leaves the server: the assembled memorial carries only signed URLs", async () => {
    const fake = deps([row()]);
    const view = await loadPublicMemorial(SLUG, fake.deps);
    expect(view.status).toBe("ready");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("storage_path");
    for (const entry of media()) {
      // The path may only appear inside a signed URL (…/object/sign/memorial-media/<path>?token=…), never bare.
      const bare = serialized.split(entry.storage_path).length - 1;
      const signed = serialized.split(`memorial-media/${entry.storage_path}?token=signed`).length - 1;
      expect(bare).toBe(signed);
    }
  });

  it("the Hero photo missing from what the database returned makes the whole memorial unavailable (QG D1)", async () => {
    const fake = deps([row({ media: media(G).filter((entry) => entry.purpose !== "hero") })]);
    expect(await loadPublicMemorial(SLUG, fake.deps)).toEqual({ status: "unavailable" });
  });

  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
  ])("keeps the memorial's own %s variant", async (_label, variant) => {
    const fake = deps([row({ skin_variant: variant })]);
    const view = await loadPublicMemorial(SLUG, fake.deps);
    expect(view.status === "ready" && view.assembled.skinVariant).toBe(variant);
  });

  it.each([
    ["a missing variant", { skin_variant: null }],
    ["an unknown variant", { skin_variant: "sepia" }],
    ["a missing language", { language: null }],
    ["an unknown language", { language: "de" }],
    ["an unknown access level", { access_level: "premium" }],
    ["an unknown skin", { skin: "occidental" }],
  ])("fails closed on %s", async (_label, overrides) => {
    const fake = deps([row(overrides)]);
    expect(await loadPublicMemorial(SLUG, fake.deps)).toEqual({ status: "unavailable" });
  });

  it("a database error propagates (an infrastructure failure, not a 404)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(loadPublicMemorial(SLUG, { client: { rpc, storage: {} } as never, sign: vi.fn() })).rejects.toThrow();
  });
});

describe("publicContentFor (offer defence in depth)", () => {
  const premium = {
    hero: { displayName: "X" },
    gallery: { items: [] },
    video: { url: "https://video.test/secret" },
    testimonials: { items: ["t"] },
    memoryMessage: { text: "m" },
    condolences: { items: ["c"] },
    story: { text: "s" },
    symbolicOfferings: { enabled: true },
    personWords: { text: "p" },
  } as unknown as MemorialContent;

  it("an avis keeps only the keys an avis snapshot may hold: no video, no premium section", () => {
    const kept = publicContentFor(premium, "avis") as Record<string, unknown>;
    expect(Object.keys(kept).sort()).toEqual(["gallery", "hero", "personWords"]);
    expect(JSON.stringify(kept)).not.toContain("video.test");
  });

  it("a complet keeps its snapshot as published", () => {
    expect(publicContentFor(premium, "complet")).toBe(premium);
  });

  it("an unknown access level renders nothing", () => {
    expect(publicContentFor(premium, "gratuit")).toBeNull();
    expect(publicContentFor(premium, null)).toBeNull();
  });

  it("an avis with a video key in its snapshot never reaches the assembler with it", async () => {
    const withVideo = { ...snapshot(), video: { url: "https://video.test/secret" } } as MemorialContent;
    const fake = deps([row({ content: withVideo })]);
    const view = await loadPublicMemorial(SLUG, fake.deps);
    expect(view.status).toBe("ready");
    expect(JSON.stringify(view)).not.toContain("video.test");
  });
});
