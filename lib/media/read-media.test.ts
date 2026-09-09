import { describe, expect, it } from "vitest";
import { MEDIA_READ_URL_TTL_SECONDS } from "@/config/media";
import { createMediaReadUrl, listMemorialMedia } from "./read-media";
import { finalizeMediaUpload, reserveMediaUpload } from "./upload-lifecycle";
import {
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  OWNER_A,
  OWNER_B,
  VISITOR,
  createTestEngine,
  ownerActor,
} from "./test-fixtures";

async function ready(
  engine: ReturnType<typeof createTestEngine>,
  options: { purpose?: "hero" | "gallery"; memorialId?: string; owner?: string } = {},
) {
  const memorialId = options.memorialId ?? MEMORIAL_A;
  const owner = options.owner ?? OWNER_A;
  const reserved = await reserveMediaUpload(engine, ownerActor(owner), {
    memorialId,
    purpose: options.purpose ?? "gallery",
    declaredMimeType: "image/jpeg",
  });
  if (!reserved.ok) throw new Error("reservation failed");

  engine.objectStore.put(reserved.value.storagePath, JPEG_BYTES);
  await finalizeMediaUpload(engine, ownerActor(owner), {
    memorialId,
    mediaId: reserved.value.mediaId,
  });

  return reserved.value;
}

describe("createMediaReadUrl", () => {
  it("mints a short-lived signed URL for the owner's own media", async () => {
    const engine = createTestEngine();
    const media = await ready(engine);

    const result = await createMediaReadUrl(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.readUrl).toContain("signed");
    expect(result.value.expiresInSeconds).toBe(MEDIA_READ_URL_TTL_SECONDS);
  });

  it("expires — there is no permanent URL for an original", async () => {
    // The bucket is private (section 5). A URL that never expires would
    // be a permanent public link to a family's photograph.
    const engine = createTestEngine();
    const media = await ready(engine);

    const result = await createMediaReadUrl(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result.ok && result.value.expiresInSeconds).toBeGreaterThan(0);
    expect(result.ok && result.value.expiresInSeconds).toBeLessThanOrEqual(3600);
  });

  it("never persists the URL on the media row", async () => {
    // supabase/README.md's portability rule, and now also a security
    // property: a leaked row hands nobody a working link.
    const engine = createTestEngine();
    const media = await ready(engine);

    await createMediaReadUrl(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    const row = engine.mediaRepository.rows.get(media.mediaId)!;
    expect(JSON.stringify(row)).not.toContain("https://");
  });

  it("refuses another owner's media", async () => {
    const engine = createTestEngine();
    const media = await ready(engine);

    const result = await createMediaReadUrl(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("refuses a visitor — anon reaches no original", async () => {
    const engine = createTestEngine();
    const media = await ready(engine);

    const result = await createMediaReadUrl(engine, VISITOR, {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("refuses a pending media — nothing unverified is ever displayable", async () => {
    const engine = createTestEngine();
    const reserved = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });
    if (!reserved.ok) throw new Error("reservation failed");

    const result = await createMediaReadUrl(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.value.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "upload_incomplete" });
  });

  it("refuses a row pointing outside its memorial", async () => {
    const engine = createTestEngine();
    const media = await ready(engine);
    const row = engine.mediaRepository.rows.get(media.mediaId)!;
    engine.mediaRepository.rows.set(media.mediaId, {
      ...row,
      storagePath: `${MEMORIAL_B}/victim/original.jpg`,
    });

    const result = await createMediaReadUrl(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "storage_unavailable" });
  });
});

describe("listMemorialMedia", () => {
  it("returns only the memorial's own ready media", async () => {
    const engine = createTestEngine();
    await ready(engine);
    await ready(engine);
    await ready(engine, { memorialId: MEMORIAL_B, owner: OWNER_B });

    const result = await listMemorialMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
    });

    expect(result.ok && result.value).toHaveLength(2);
    expect(result.ok && result.value.every((m) => m.memorialId === MEMORIAL_A)).toBe(true);
  });

  it("never returns a pending media", async () => {
    const engine = createTestEngine();
    await ready(engine);
    await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "gallery",
      declaredMimeType: "image/jpeg",
    });

    const result = await listMemorialMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
    });

    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value.every((m) => m.status === "ready")).toBe(true);
  });

  it("filters by purpose — the ONLY difference between a hero and a gallery read", async () => {
    const engine = createTestEngine();
    await ready(engine, { purpose: "hero" });
    await ready(engine, { purpose: "gallery" });
    await ready(engine, { purpose: "gallery" });

    const heroes = await listMemorialMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "hero",
    });
    const gallery = await listMemorialMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "gallery",
    });

    expect(heroes.ok && heroes.value).toHaveLength(1);
    expect(gallery.ok && gallery.value).toHaveLength(2);
  });

  it("refuses another owner's memorial", async () => {
    const engine = createTestEngine();
    await ready(engine);

    const result = await listMemorialMedia(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_A,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("refuses a visitor", async () => {
    const engine = createTestEngine();
    await ready(engine);

    const result = await listMemorialMedia(engine, VISITOR, { memorialId: MEMORIAL_A });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });
});
