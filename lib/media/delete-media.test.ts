import { describe, expect, it } from "vitest";
import { deleteMedia } from "./delete-media";
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

async function readyMedia(
  engine: ReturnType<typeof createTestEngine>,
  memorialId = MEMORIAL_A,
  ownerId = OWNER_A,
) {
  const reserved = await reserveMediaUpload(engine, ownerActor(ownerId), {
    memorialId,
    purpose: "gallery",
    declaredMimeType: "image/jpeg",
  });
  if (!reserved.ok) throw new Error("reservation failed");

  engine.objectStore.put(reserved.value.storagePath, JPEG_BYTES);

  const finalized = await finalizeMediaUpload(engine, ownerActor(ownerId), {
    memorialId,
    mediaId: reserved.value.mediaId,
  });
  if (!finalized.ok) throw new Error("finalization failed");

  return reserved.value;
}

describe("deleteMedia — the happy path", () => {
  it("removes both the object and the row", async () => {
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    const result = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: true, value: { removed: true } });
    expect(engine.objectStore.objects.size).toBe(0);
    expect(engine.mediaRepository.rows.size).toBe(0);
  });

  it("removes the whole media directory, not just the original", async () => {
    // Future derivatives (Missions 033/047) are siblings under the same
    // prefix. Deleting only the known path would orphan them the day
    // they exist.
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    const prefix = media.storagePath.slice(0, media.storagePath.lastIndexOf("/"));
    engine.objectStore.objects.set(`${prefix}/hero-1200.webp`, JPEG_BYTES);
    engine.objectStore.objects.set(`${prefix}/thumb.webp`, JPEG_BYTES);

    await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(engine.objectStore.objects.size).toBe(0);
  });

  it("leaves other media of the same memorial untouched", async () => {
    const engine = createTestEngine();
    const keep = await readyMedia(engine);
    const remove = await readyMedia(engine);

    await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: remove.mediaId,
    });

    expect(engine.mediaRepository.rows.has(keep.mediaId)).toBe(true);
    expect(engine.objectStore.objects.has(keep.storagePath)).toBe(true);
  });
});

describe("deleteMedia — idempotence", () => {
  it("succeeds when called repeatedly", async () => {
    // A retry after a lost response, a double-clicked button, a resumed
    // job — all must converge instead of erroring.
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    const first = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });
    const second = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });
    const third = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(first).toEqual({ ok: true, value: { removed: true } });
    expect(second).toEqual({ ok: true, value: { removed: false } });
    expect(third).toEqual({ ok: true, value: { removed: false } });
  });

  it("succeeds for a media that never existed", async () => {
    const engine = createTestEngine();

    const result = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: "77777777-7777-4777-8777-777777777777",
    });

    expect(result).toEqual({ ok: true, value: { removed: false } });
  });

  it("completes a half-finished deletion on the next call", async () => {
    // The recoverable window: the object went, the row survived a
    // crash. Calling again finishes the job — which is exactly why the
    // object is deleted first.
    const engine = createTestEngine();
    const media = await readyMedia(engine);
    engine.objectStore.objects.clear();

    const result = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: true, value: { removed: true } });
    expect(engine.mediaRepository.rows.size).toBe(0);
  });
});

describe("deleteMedia — ownership", () => {
  it("refuses Owner B deleting Owner A's media", async () => {
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    const result = await deleteMedia(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("leaves the media completely intact after a refused deletion", async () => {
    // The refusal must be total: no row touched, no object removed.
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    await deleteMedia(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(engine.mediaRepository.rows.get(media.mediaId)?.status).toBe("ready");
    expect(engine.objectStore.objects.has(media.storagePath)).toBe(true);
  });

  it("refuses Owner B naming their OWN memorial with Owner A's media id", async () => {
    // Ownership of MEMORIAL_B is real; the media id is not theirs. The
    // repository filters on both, so this finds nothing.
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    const result = await deleteMedia(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_B,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: true, value: { removed: false } });
    expect(engine.mediaRepository.rows.has(media.mediaId)).toBe(true);
    expect(engine.objectStore.objects.has(media.storagePath)).toBe(true);
  });

  it("refuses a visitor", async () => {
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    const result = await deleteMedia(engine, VISITOR, {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
    expect(engine.mediaRepository.rows.has(media.mediaId)).toBe(true);
  });
});

describe("deleteMedia — failure ordering", () => {
  it("keeps the row when the object cannot be removed", async () => {
    // Deleting the row after a failed object removal would create the
    // unrecoverable orphan this ordering exists to prevent.
    const engine = createTestEngine();
    const media = await readyMedia(engine);
    engine.objectStore.failOn.removeByPrefix = new Error("storage down");

    const result = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "storage_unavailable" });
    expect(engine.mediaRepository.rows.has(media.mediaId)).toBe(true);
    expect(engine.objectStore.objects.has(media.storagePath)).toBe(true);
  });

  it("never deletes the row before the object", async () => {
    // Asserted directly by observing the state at the moment removal
    // is attempted.
    const engine = createTestEngine();
    const media = await readyMedia(engine);

    let rowStillPresentWhenObjectRemoved = false;
    const store = engine.objectStore;
    const original = store.removeByPrefix.bind(store);
    store.removeByPrefix = async (input) => {
      rowStillPresentWhenObjectRemoved = engine.mediaRepository.rows.has(media.mediaId);
      return original(input);
    };

    await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(rowStillPresentWhenObjectRemoved).toBe(true);
  });

  it("refuses a row whose stored path points at another memorial", async () => {
    const engine = createTestEngine();
    const media = await readyMedia(engine);
    const row = engine.mediaRepository.rows.get(media.mediaId)!;
    engine.mediaRepository.rows.set(media.mediaId, {
      ...row,
      storagePath: `${MEMORIAL_B}/victim/original.jpg`,
    });
    engine.objectStore.objects.set(`${MEMORIAL_B}/victim/original.jpg`, JPEG_BYTES);

    const result = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: media.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "storage_unavailable" });
    // The other family's object is untouched.
    expect(engine.objectStore.objects.has(`${MEMORIAL_B}/victim/original.jpg`)).toBe(true);
  });
});

describe("deleteMedia — a pending reservation", () => {
  it("can be deleted like any other media", async () => {
    const engine = createTestEngine();
    const reserved = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "gallery",
      declaredMimeType: "image/jpeg",
    });
    if (!reserved.ok) throw new Error("reservation failed");

    const result = await deleteMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.value.mediaId,
    });

    expect(result).toEqual({ ok: true, value: { removed: true } });
    expect(engine.mediaRepository.rows.size).toBe(0);
  });
});
