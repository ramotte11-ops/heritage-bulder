import { describe, expect, it } from "vitest";
import { PENDING_MEDIA_TTL_MS } from "@/config/media";
import { sweepAbandonedUploads } from "./orphan-sweep";
import { finalizeMediaUpload, reserveMediaUpload } from "./upload-lifecycle";
import {
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  OWNER_A,
  OWNER_B,
  createTestEngine,
  ownerActor,
} from "./test-fixtures";

async function abandonedUpload(
  engine: ReturnType<typeof createTestEngine>,
  options: { memorialId?: string; owner?: string; withBytes?: boolean } = {},
) {
  const memorialId = options.memorialId ?? MEMORIAL_A;
  const reserved = await reserveMediaUpload(engine, ownerActor(options.owner ?? OWNER_A), {
    memorialId,
    purpose: "gallery",
    declaredMimeType: "image/jpeg",
  });
  if (!reserved.ok) throw new Error("reservation failed");

  // The nastiest shape: bytes really did land, the user just never
  // finalized. Without a sweep these are the objects that would
  // accumulate forever.
  if (options.withBytes) engine.objectStore.put(reserved.value.storagePath, JPEG_BYTES);

  return reserved.value;
}

/**
 * Mission 030, section 13 — "zéro orphelin par conception".
 */
describe("sweepAbandonedUploads", () => {
  it("reclaims a reservation older than the TTL, object and row together", async () => {
    const engine = createTestEngine();
    const abandoned = await abandonedUpload(engine, { withBytes: true });

    engine.advance(PENDING_MEDIA_TTL_MS + 1000);
    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 1, reclaimed: 1 });
    expect(engine.mediaRepository.rows.has(abandoned.mediaId)).toBe(false);
    expect(engine.objectStore.objects.has(abandoned.storagePath)).toBe(false);
  });

  it("reclaims a reservation whose upload never produced any bytes", async () => {
    const engine = createTestEngine();
    const abandoned = await abandonedUpload(engine);

    engine.advance(PENDING_MEDIA_TTL_MS + 1000);
    await sweepAbandonedUploads(engine);

    expect(engine.mediaRepository.rows.has(abandoned.mediaId)).toBe(false);
  });

  it("leaves a reservation younger than the TTL alone", async () => {
    // Reclaiming a path while its upload is still in flight would turn
    // a slow success into a mysterious failure.
    const engine = createTestEngine();
    const fresh = await abandonedUpload(engine, { withBytes: true });

    engine.advance(PENDING_MEDIA_TTL_MS - 1000);
    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 0, reclaimed: 0 });
    expect(engine.mediaRepository.rows.has(fresh.mediaId)).toBe(true);
    expect(engine.objectStore.objects.has(fresh.storagePath)).toBe(true);
  });

  it("NEVER touches a finalized media, however old", async () => {
    // The worst bug this foundation could have: a family's photograph
    // reclaimed as garbage.
    const engine = createTestEngine();
    const kept = await abandonedUpload(engine, { withBytes: true });
    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: kept.mediaId,
    });

    engine.advance(PENDING_MEDIA_TTL_MS * 100);
    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 0, reclaimed: 0 });
    expect(engine.mediaRepository.rows.get(kept.mediaId)?.status).toBe("ready");
    expect(engine.objectStore.objects.has(kept.storagePath)).toBe(true);
  });

  it("reclaims abandoned uploads while leaving finalized ones untouched", async () => {
    const engine = createTestEngine();
    const abandoned = await abandonedUpload(engine, { withBytes: true });
    const kept = await abandonedUpload(engine, { withBytes: true });
    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: kept.mediaId,
    });

    engine.advance(PENDING_MEDIA_TTL_MS + 1000);
    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 1, reclaimed: 1 });
    expect(engine.mediaRepository.rows.has(abandoned.mediaId)).toBe(false);
    expect(engine.mediaRepository.rows.get(kept.mediaId)?.status).toBe("ready");
  });

  it("is idempotent — a second sweep finds nothing left", async () => {
    const engine = createTestEngine();
    await abandonedUpload(engine, { withBytes: true });

    engine.advance(PENDING_MEDIA_TTL_MS + 1000);
    await sweepAbandonedUploads(engine);
    const second = await sweepAbandonedUploads(engine);

    expect(second).toEqual({ examined: 0, reclaimed: 0 });
  });
});

describe("sweepAbandonedUploads — ordering and resilience", () => {
  it("removes the object before the row", async () => {
    // Same rule as deleteMedia: the reverse order would leave an object
    // nothing points at.
    const engine = createTestEngine();
    const abandoned = await abandonedUpload(engine, { withBytes: true });
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);

    let rowPresentWhenObjectRemoved = false;
    const store = engine.objectStore;
    const original = store.removeByPrefix.bind(store);
    store.removeByPrefix = async (input) => {
      rowPresentWhenObjectRemoved = engine.mediaRepository.rows.has(abandoned.mediaId);
      return original(input);
    };

    await sweepAbandonedUploads(engine);

    expect(rowPresentWhenObjectRemoved).toBe(true);
  });

  it("keeps the row for a later retry when the object cannot be removed", async () => {
    const engine = createTestEngine();
    const abandoned = await abandonedUpload(engine, { withBytes: true });
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);
    engine.objectStore.failOn.removeByPrefix = new Error("storage down");

    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 1, reclaimed: 0 });
    expect(engine.mediaRepository.rows.has(abandoned.mediaId)).toBe(true);
  });

  it("does not let one bad row abort the batch", async () => {
    const engine = createTestEngine();
    const bad = await abandonedUpload(engine, { withBytes: true });
    const good = await abandonedUpload(engine, { withBytes: true });
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);

    const store = engine.objectStore;
    const original = store.removeByPrefix.bind(store);
    store.removeByPrefix = async (input) => {
      if (input.prefix.includes(bad.mediaId)) throw new Error("one bad object");
      return original(input);
    };

    const result = await sweepAbandonedUploads(engine);

    expect(result.examined).toBe(2);
    expect(result.reclaimed).toBe(1);
    expect(engine.mediaRepository.rows.has(good.mediaId)).toBe(false);
    expect(engine.mediaRepository.rows.has(bad.mediaId)).toBe(true);
  });

  it("skips a row whose stored path is not under its own memorial", async () => {
    // The sweep runs with no session, so it must never delete an object
    // it cannot account for.
    const engine = createTestEngine();
    const abandoned = await abandonedUpload(engine, { withBytes: true });
    const row = engine.mediaRepository.rows.get(abandoned.mediaId)!;
    engine.mediaRepository.rows.set(abandoned.mediaId, {
      ...row,
      storagePath: `${MEMORIAL_B}/victim/original.jpg`,
    });
    engine.objectStore.objects.set(`${MEMORIAL_B}/victim/original.jpg`, JPEG_BYTES);
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);

    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 1, reclaimed: 0 });
    expect(engine.objectStore.objects.has(`${MEMORIAL_B}/victim/original.jpg`)).toBe(true);
  });

  it("skips a row whose media id is not an identifier, without aborting the batch", async () => {
    // The prefix is built through the validated builder, which refuses
    // anything that is not a pair of UUIDs. A corrupt row therefore
    // fails safely — it is skipped and retried, never turned into a
    // hand-rolled path that could point anywhere.
    const engine = createTestEngine();
    const corrupt = await abandonedUpload(engine, { withBytes: true });
    const healthy = await abandonedUpload(engine, { withBytes: true });

    const row = engine.mediaRepository.rows.get(corrupt.mediaId)!;
    engine.mediaRepository.rows.set(corrupt.mediaId, { ...row, id: "../../escape" });
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);

    const result = await sweepAbandonedUploads(engine);

    expect(result.examined).toBe(2);
    expect(result.reclaimed).toBe(1);
    expect(engine.mediaRepository.rows.has(healthy.mediaId)).toBe(false);
    expect(engine.objectStore.objects.has(corrupt.storagePath)).toBe(true);
  });

  it("is bounded, so a backlog drains over repeated runs", async () => {
    const engine = createTestEngine();
    for (let i = 0; i < 5; i += 1) {
      await abandonedUpload(engine, { withBytes: true });
    }
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);

    const first = await sweepAbandonedUploads(engine, { limit: 2 });
    expect(first).toEqual({ examined: 2, reclaimed: 2 });

    const second = await sweepAbandonedUploads(engine, { limit: 2 });
    expect(second).toEqual({ examined: 2, reclaimed: 2 });

    const third = await sweepAbandonedUploads(engine, { limit: 2 });
    expect(third).toEqual({ examined: 1, reclaimed: 1 });

    expect(engine.mediaRepository.rows.size).toBe(0);
  });

  it("reclaims across memorials, which is why it is bounded to pending rows", async () => {
    const engine = createTestEngine();
    await abandonedUpload(engine, { withBytes: true });
    await abandonedUpload(engine, { memorialId: MEMORIAL_B, owner: OWNER_B, withBytes: true });
    engine.advance(PENDING_MEDIA_TTL_MS + 1000);

    const result = await sweepAbandonedUploads(engine);

    expect(result).toEqual({ examined: 2, reclaimed: 2 });
    expect(engine.objectStore.objects.size).toBe(0);
  });
});
