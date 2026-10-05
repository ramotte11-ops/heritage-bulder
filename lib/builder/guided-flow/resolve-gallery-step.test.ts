import { describe, expect, it } from "vitest";
import { finalizeMediaUpload, reserveMediaUpload } from "@/lib/media/upload-lifecycle";
import { JPEG_BYTES, MEMORIAL_A, MEMORIAL_B, OWNER_A, OWNER_B, createTestEngine, ownerActor } from "@/lib/media/test-fixtures";
import type { MemorialContent } from "@/types/memorial";
import { resolveGalleryStepData } from "./resolve-gallery-step";

/** A13 — thumbnails through the Owner draft resolver: own, ready, gallery-purpose media only. */

type Engine = ReturnType<typeof createTestEngine>;

async function upload(engine: Engine, options: { purpose?: "hero" | "gallery"; memorialId?: string; owner?: string } = {}): Promise<string> {
  const memorialId = options.memorialId ?? MEMORIAL_A;
  const actor = ownerActor(options.owner ?? OWNER_A);
  const reserved = await reserveMediaUpload(engine, actor, { memorialId, purpose: options.purpose ?? "gallery", declaredMimeType: "image/jpeg" });
  if (!reserved.ok) throw new Error("reservation failed");
  engine.objectStore.put(reserved.value.storagePath, JPEG_BYTES);
  const finalized = await finalizeMediaUpload(engine, actor, { memorialId, mediaId: reserved.value.mediaId });
  if (!finalized.ok) throw new Error("finalization failed");
  return reserved.value.mediaId;
}

const gallery = (...ids: string[]) => ({ gallery: { items: ids.map((mediaId) => ({ mediaId, caption: null })) } }) as unknown as MemorialContent;

describe("resolveGalleryStepData", () => {
  it("maps each of the family's photographs to a short-lived read URL — never a Media row or a path", async () => {
    const engine = createTestEngine();
    const a = await upload(engine);
    const b = await upload(engine);
    const data = await resolveGalleryStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, gallery(a, b));
    expect(data.status).toBe("ready");
    if (data.status !== "ready") return;
    expect(Object.keys(data.thumbnails)).toEqual([a, b]);
    for (const url of Object.values(data.thumbnails)) expect(typeof url).toBe("string");
  });

  it("a Hero media, a foreign memorial's media or another Owner's media never resolves (null, still listed)", async () => {
    const engine = createTestEngine();
    const hero = await upload(engine, { purpose: "hero" });
    const foreign = await upload(engine, { memorialId: MEMORIAL_B, owner: OWNER_B });
    const own = await upload(engine);
    const data = await resolveGalleryStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, gallery(hero, foreign, own));
    expect(data.status === "ready" && data.thumbnails[hero]).toBeNull();
    expect(data.status === "ready" && data.thumbnails[foreign]).toBeNull();
    expect(data.status === "ready" && typeof data.thumbnails[own]).toBe("string");
  });

  it("another Owner cannot read this memorial's thumbnails", async () => {
    const engine = createTestEngine();
    const own = await upload(engine);
    const data = await resolveGalleryStepData({ mediaEngine: engine }, ownerActor(OWNER_B), MEMORIAL_A, gallery(own));
    expect(data.status === "ready" && data.thumbnails[own]).toBeNull();
  });

  it("an empty Gallery resolves to no thumbnail; a corrupted one is reported, never guessed", async () => {
    const engine = createTestEngine();
    expect(await resolveGalleryStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, {})).toEqual({ status: "ready", thumbnails: {} });
    const corrupted = { gallery: { items: "x" } } as unknown as MemorialContent;
    expect(await resolveGalleryStepData({ mediaEngine: engine }, ownerActor(OWNER_A), MEMORIAL_A, corrupted)).toEqual({ status: "corrupted" });
  });
});
