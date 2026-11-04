import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readPublicMemorial, isPublicSlugShape, READ_PUBLIC_MEMORIAL_RPC } = await import("./read-public-memorial");

/**
 * QG 016 / M2 — the reader only calls `read_public_memorial_v1` (M1) and
 * validates its row; it never re-decides visibility and never reads a table.
 */

const SLUG = "95bd2601eac8";
const MEMORIAL = "d64ad8ab-0c21-4e16-a0cb-e2e48b28d129";
const HERO = "cc775d61-4412-4e24-a9c3-726fec0995c6";

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
    content: { hero: { displayName: "Jeanne Test-S1" } },
    media: [{ media_id: HERO, purpose: "hero", storage_path: `${MEMORIAL}/${HERO}/original.webp`, width: 1600, height: 2000 }],
    ...overrides,
  };
}

function client(answer: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(answer);
  // Only `rpc` exists: any table read (`from`) would throw — the reader must not need one.
  return { rpc, client: { rpc } as unknown as Parameters<typeof readPublicMemorial>[0] };
}

describe("readPublicMemorial", () => {
  it("calls exactly read_public_memorial_v1 with the slug, and nothing else", async () => {
    const fake = client({ data: [row()], error: null });
    const result = await readPublicMemorial(fake.client, SLUG);
    expect(READ_PUBLIC_MEMORIAL_RPC).toBe("read_public_memorial_v1");
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("read_public_memorial_v1", { p_slug: SLUG });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.memorial).toMatchObject({
      memorialId: MEMORIAL,
      slug: SLUG,
      skin: "intemporel",
      skinVariant: "light",
      language: "fr",
      accessLevel: "avis",
      content: { hero: { displayName: "Jeanne Test-S1" } },
    });
    expect(result.memorial.media).toEqual([
      { mediaId: HERO, purpose: "hero", storagePath: `${MEMORIAL}/${HERO}/original.webp`, width: 1600, height: 2000 },
    ]);
  });

  it("zero rows (unknown, unpublished, withdrawn, expired — decided by the database) is notFound", async () => {
    const fake = client({ data: [], error: null });
    expect(await readPublicMemorial(fake.client, SLUG)).toEqual({ status: "notFound" });
  });

  it.each([
    ["empty", ""],
    ["upper case", "95BD2601EAC8"],
    ["too short", "95bd2601"],
    ["too long", "a".repeat(65)],
    ["not hex", "jeanne-test-s1"],
    ["path traversal", "../95bd2601eac8"],
    ["LIKE wildcard", "%"],
    ["not a string", 42],
    ["undefined", undefined],
  ])("a slug that publication never produces (%s) is notFound without any database call", async (_label, slug) => {
    const fake = client({ data: [row()], error: null });
    expect(await readPublicMemorial(fake.client, slug)).toEqual({ status: "notFound" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("accepts every slug length publication can produce (12 to 64 hex)", () => {
    expect(isPublicSlugShape("a".repeat(12))).toBe(true);
    expect(isPublicSlugShape("a".repeat(16))).toBe(true);
    expect(isPublicSlugShape("a".repeat(64))).toBe(true);
  });

  it("a database error throws (never mistaken for an answer about the memorial) and leaks nothing", async () => {
    const fake = client({ data: null, error: { message: "JWT secret sb_secret_XYZ details" } });
    await expect(readPublicMemorial(fake.client, SLUG)).rejects.toThrow("Public memorial read failed.");
    await expect(readPublicMemorial(fake.client, SLUG)).rejects.not.toThrow(/sb_secret/);
  });

  it.each([
    ["more than one row", [row(), row()]],
    ["a non-array answer", { not: "an array" }],
    ["a different slug echoed", [row({ slug: "ffffffffffff" })]],
    ["a non-uuid memorial id", [row({ memorial_id: "x" })]],
    ["content not an object", [row({ content: "x" })]],
    ["content an array", [row({ content: [] })]],
    ["media not an array", [row({ media: null })]],
    ["a media without storage path", [row({ media: [{ media_id: HERO, purpose: "hero", storage_path: "", width: 1, height: 1 }] })]],
    ["a media with an unknown purpose", [row({ media: [{ media_id: HERO, purpose: "video", storage_path: "p", width: 1, height: 1 }] })]],
    ["a media with a non-uuid id", [row({ media: [{ media_id: "x", purpose: "hero", storage_path: "p", width: 1, height: 1 }] })]],
    ["a media with a bad dimension", [row({ media: [{ media_id: HERO, purpose: "hero", storage_path: "p", width: -1, height: 1 }] })]],
    ["no published_at", [row({ published_at: null })]],
  ])("fails closed on a malformed answer: %s -> invalid", async (_label, data) => {
    const fake = client({ data, error: null });
    expect(await readPublicMemorial(fake.client, SLUG)).toEqual({ status: "invalid" });
  });

  it("null dimensions are kept as null (a media never measured)", async () => {
    const fake = client({ data: [row({ media: [{ media_id: HERO, purpose: "hero", storage_path: "p", width: null, height: null }] })], error: null });
    const result = await readPublicMemorial(fake.client, SLUG);
    expect(result.status === "found" && result.memorial.media[0]).toMatchObject({ width: null, height: null });
  });
});
