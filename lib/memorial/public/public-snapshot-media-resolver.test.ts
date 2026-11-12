import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createPublicSnapshotMediaResolver, createStorageSigner } = await import("./public-snapshot-media-resolver");
const { MEDIA_BUCKET, MEDIA_READ_URL_TTL_SECONDS } = await import("@/config/media");

/**
 * QG 016 / M2 — the public MediaResolver resolves ONLY the media
 * `read_public_memorial_v1` returned (those the published snapshot cites),
 * with their exact purpose, signs server side, and never lets
 * `storagePath` out.
 */

const HERO = "cc775d61-4412-4e24-a9c3-726fec0995c6";
const G1 = "b09b82fc-2b94-400f-b8ba-252682e048b2";
const EXCLUDED = "e0000000-0000-4000-8000-000000000001";
const ALLOWED = [
  { mediaId: HERO, purpose: "hero" as const, storagePath: "m/hero/original.webp", width: 1600, height: 2000 },
  { mediaId: G1, purpose: "gallery" as const, storagePath: "m/g1/original.jpg", width: 1600, height: 1200 },
];

function signer() {
  const sign = vi.fn(async (path: string) => `https://storage.test/sign/${encodeURIComponent(path)}?token=t`);
  return sign;
}

describe("createPublicSnapshotMediaResolver", () => {
  it("resolves an allowed media to { mediaId, readUrl, width, height } only — never the storage path", async () => {
    const sign = signer();
    const resolve = createPublicSnapshotMediaResolver(ALLOWED, sign);
    const resolved = await resolve({ mediaId: HERO, purpose: "hero" });
    expect(resolved).toEqual({
      mediaId: HERO,
      readUrl: "https://storage.test/sign/m%2Fhero%2Foriginal.webp?token=t",
      width: 1600,
      height: 2000,
    });
    expect(Object.keys(resolved ?? {}).sort()).toEqual(["height", "mediaId", "readUrl", "width"]);
    expect(JSON.stringify(resolved)).not.toContain("storagePath");
    expect(sign).toHaveBeenCalledWith("m/hero/original.webp");
  });

  it("an id the snapshot does not cite is refused and nothing is signed", async () => {
    const sign = signer();
    const resolve = createPublicSnapshotMediaResolver(ALLOWED, sign);
    expect(await resolve({ mediaId: EXCLUDED, purpose: "gallery" })).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it("the right id with the wrong purpose is refused (a Hero photo is not a gallery photo, and vice versa)", async () => {
    const sign = signer();
    const resolve = createPublicSnapshotMediaResolver(ALLOWED, sign);
    expect(await resolve({ mediaId: HERO, purpose: "gallery" })).toBeNull();
    expect(await resolve({ mediaId: G1, purpose: "hero" })).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it("an empty allow-list resolves nothing", async () => {
    const sign = signer();
    const resolve = createPublicSnapshotMediaResolver([], sign);
    expect(await resolve({ mediaId: HERO, purpose: "hero" })).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it("a signature failure is null (fail closed), never a throw", async () => {
    const resolve = createPublicSnapshotMediaResolver(ALLOWED, vi.fn().mockRejectedValue(new Error("down")));
    expect(await resolve({ mediaId: HERO, purpose: "hero" })).toBeNull();
  });

  it("signs each media once per render, however many renderers ask", async () => {
    const sign = signer();
    const resolve = createPublicSnapshotMediaResolver(ALLOWED, sign);
    await Promise.all([resolve({ mediaId: HERO, purpose: "hero" }), resolve({ mediaId: HERO, purpose: "hero" })]);
    await resolve({ mediaId: HERO, purpose: "hero" });
    expect(sign).toHaveBeenCalledTimes(1);
  });
});

describe("createStorageSigner", () => {
  it("signs in the private memorial-media bucket with the standard short TTL", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://x/signed" }, error: null });
    const from = vi.fn(() => ({ createSignedUrl }));
    const sign = createStorageSigner({ storage: { from } } as never);
    expect(await sign("m/hero/original.webp")).toBe("https://x/signed");
    expect(from).toHaveBeenCalledWith(MEDIA_BUCKET);
    expect(MEDIA_BUCKET).toBe("memorial-media");
    expect(createSignedUrl).toHaveBeenCalledWith("m/hero/original.webp", MEDIA_READ_URL_TTL_SECONDS);
  });

  it("a storage error throws a message without detail", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: "secret detail" } });
    const sign = createStorageSigner({ storage: { from: () => ({ createSignedUrl }) } } as never);
    await expect(sign("p")).rejects.toThrow("Public media signature failed.");
  });
});
