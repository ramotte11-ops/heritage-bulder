import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_HERO_CONTENT } from "@/types/hero";
import { finalizeMediaUpload, reserveMediaUpload } from "@/lib/media/upload-lifecycle";
import {
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  OWNER_A,
  OWNER_B,
  createTestEngine,
  ownerActor,
} from "@/lib/media/test-fixtures";
import { resolveHeroCropStepData } from "./resolve-hero-crop-step";

async function readyHeroMedia(engine: ReturnType<typeof createTestEngine>, memorialId = MEMORIAL_A, owner = OWNER_A) {
  const reserved = await reserveMediaUpload(engine, ownerActor(owner), {
    memorialId,
    purpose: "hero",
    declaredMimeType: "image/jpeg",
  });
  if (!reserved.ok) throw new Error("reservation failed");

  engine.objectStore.put(reserved.value.storagePath, JPEG_BYTES);
  const finalized = await finalizeMediaUpload(engine, ownerActor(owner), {
    memorialId,
    mediaId: reserved.value.mediaId,
  });
  if (!finalized.ok) throw new Error("finalize failed");

  return finalized.value;
}

const EMPTY_CONTENT: MemorialContent = {};

describe("resolveHeroCropStepData", () => {
  it("returns null when there is no Hero photo at all", async () => {
    const engine = createTestEngine();

    const result = await resolveHeroCropStepData(
      { mediaEngine: engine },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      EMPTY_CONTENT,
    );

    expect(result).toBeNull();
  });

  it("returns null for a corrupted stored hero", async () => {
    const engine = createTestEngine();
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;

    const result = await resolveHeroCropStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, corrupted);

    expect(result).toBeNull();
  });

  it("returns the media and a fresh signed read URL for the referenced photo", async () => {
    const engine = createTestEngine();
    const media = await readyHeroMedia(engine);
    const content: MemorialContent = {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: media.id, crop: null } },
    } as MemorialContent;

    const result = await resolveHeroCropStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, content);

    expect(result).not.toBeNull();
    expect(result?.media.id).toBe(media.id);
    expect(result?.readUrl).toContain(media.storagePath);
  });

  it("returns null when the referenced mediaId does not resolve to any real media", async () => {
    const engine = createTestEngine();
    const content: MemorialContent = {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: "does-not-exist", crop: null } },
    } as MemorialContent;

    const result = await resolveHeroCropStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, content);

    expect(result).toBeNull();
  });

  it("returns null when the referenced media belongs to a different memorial (never leaks cross-memorial)", async () => {
    const engine = createTestEngine();
    const media = await readyHeroMedia(engine, MEMORIAL_B, OWNER_B);
    const content: MemorialContent = {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: media.id, crop: null } },
    } as MemorialContent;

    // Reading media.id under MEMORIAL_A's own actor/memorial pairing —
    // the media actually lives under MEMORIAL_B.
    const result = await resolveHeroCropStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, content);

    expect(result).toBeNull();
  });
});
