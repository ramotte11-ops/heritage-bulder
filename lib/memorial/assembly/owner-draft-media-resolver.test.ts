import { describe, expect, it } from "vitest";
import { finalizeMediaUpload, reserveMediaUpload } from "@/lib/media/upload-lifecycle";
import {
  AUTHENTICATED_NON_OWNER,
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  OWNER_A,
  OWNER_B,
  VISITOR,
  createTestEngine,
  ownerActor,
} from "@/lib/media/test-fixtures";
import { createOwnerDraftMediaResolver } from "./owner-draft-media-resolver";

/**
 * Étape 2 — the Preview's resolver against the REAL media engine
 * (Mission 030's `createMediaReadUrl` over the in-memory fakes every
 * media test already uses): only the Owner's own, ready, hero-purpose
 * media ever resolves, and only `{ mediaId, readUrl }` comes back.
 */

type Engine = ReturnType<typeof createTestEngine>;

async function upload(
  engine: Engine,
  options: { purpose?: "hero" | "gallery"; memorialId?: string; owner?: string; finalize?: boolean } = {},
): Promise<string> {
  const memorialId = options.memorialId ?? MEMORIAL_A;
  const owner = options.owner ?? OWNER_A;
  const reserved = await reserveMediaUpload(engine, ownerActor(owner), {
    memorialId,
    purpose: options.purpose ?? "hero",
    declaredMimeType: "image/jpeg",
  });
  if (!reserved.ok) throw new Error("reservation failed");
  if (options.finalize === false) return reserved.value.mediaId;

  engine.objectStore.put(reserved.value.storagePath, JPEG_BYTES);
  const finalized = await finalizeMediaUpload(engine, ownerActor(owner), {
    memorialId,
    mediaId: reserved.value.mediaId,
  });
  if (!finalized.ok) throw new Error("finalization failed");
  return reserved.value.mediaId;
}

describe("createOwnerDraftMediaResolver", () => {
  it("resolves the Owner's own ready Hero media to { mediaId, readUrl } — nothing else", async () => {
    const engine = createTestEngine();
    const mediaId = await upload(engine);
    const resolve = createOwnerDraftMediaResolver(engine, ownerActor(OWNER_A), MEMORIAL_A);

    const resolved = await resolve({ mediaId, purpose: "hero" });
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved ?? {}).sort()).toEqual(["mediaId", "readUrl"]);
    expect(resolved?.mediaId).toBe(mediaId);
    expect(resolved?.readUrl).toContain("signed");
  });

  it("refuses a media of another purpose (the check createMediaReadUrl does not make)", async () => {
    const engine = createTestEngine();
    const mediaId = await upload(engine, { purpose: "gallery" });
    const resolve = createOwnerDraftMediaResolver(engine, ownerActor(OWNER_A), MEMORIAL_A);
    expect(await resolve({ mediaId, purpose: "hero" })).toBeNull();
  });

  it("refuses a pending (never verified) media", async () => {
    const engine = createTestEngine();
    const mediaId = await upload(engine, { finalize: false });
    const resolve = createOwnerDraftMediaResolver(engine, ownerActor(OWNER_A), MEMORIAL_A);
    expect(await resolve({ mediaId, purpose: "hero" })).toBeNull();
  });

  it("refuses an unknown media id", async () => {
    const engine = createTestEngine();
    await upload(engine);
    const resolve = createOwnerDraftMediaResolver(engine, ownerActor(OWNER_A), MEMORIAL_A);
    expect(await resolve({ mediaId: "cccccccc-cccc-4ccc-8ccc-ffffffffffff", purpose: "hero" })).toBeNull();
  });

  it.each([
    ["another owner", ownerActor(OWNER_B)],
    ["a visitor", VISITOR],
    ["an authenticated non-owner", AUTHENTICATED_NON_OWNER],
  ])("refuses %s", async (_label, actor) => {
    const engine = createTestEngine();
    const mediaId = await upload(engine);
    const resolve = createOwnerDraftMediaResolver(engine, actor, MEMORIAL_A);
    expect(await resolve({ mediaId, purpose: "hero" })).toBeNull();
  });

  it("refuses another memorial's media, even the same owner's resolver bound elsewhere", async () => {
    const engine = createTestEngine();
    const mediaId = await upload(engine, { memorialId: MEMORIAL_B, owner: OWNER_B });
    const resolve = createOwnerDraftMediaResolver(engine, ownerActor(OWNER_A), MEMORIAL_A);
    expect(await resolve({ mediaId, purpose: "hero" })).toBeNull();
  });

  it("a storage failure resolves to null, never an exception", async () => {
    const engine = createTestEngine();
    const mediaId = await upload(engine);
    engine.mediaRepository.failOn.findById = new Error("db down");
    const resolve = createOwnerDraftMediaResolver(engine, ownerActor(OWNER_A), MEMORIAL_A);
    await expect(resolve({ mediaId, purpose: "hero" })).resolves.toBeNull();

    engine.mediaRepository.failOn = {};
    engine.objectStore.failOn.createReadUrl = new Error("storage down");
    await expect(resolve({ mediaId, purpose: "hero" })).resolves.toBeNull();
  });
});
