import { describe, expect, it } from "vitest";
import { MAX_MEDIA_BYTES } from "@/config/media";
import { replaceMedia } from "./replace-media";
import { reserveMediaUpload, finalizeMediaUpload } from "./upload-lifecycle";
import {
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  OWNER_A,
  OWNER_B,
  SVG_BYTES,
  createTestEngine,
  ownerActor,
} from "./test-fixtures";

async function reserve(
  engine: ReturnType<typeof createTestEngine>,
  purpose: "hero" | "gallery" = "hero",
) {
  const reserved = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
    memorialId: MEMORIAL_A,
    purpose,
    declaredMimeType: "image/jpeg",
  });
  if (!reserved.ok) throw new Error("reservation failed");
  return reserved.value;
}

async function existingHero(engine: ReturnType<typeof createTestEngine>) {
  const media = await reserve(engine);
  engine.objectStore.put(media.storagePath, JPEG_BYTES);
  await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
    memorialId: MEMORIAL_A,
    mediaId: media.mediaId,
  });
  return media;
}

/**
 * Mission 030, section 13 — "ne jamais supprimer l'ancienne avant que la
 * nouvelle soit réellement prête".
 */
describe("replaceMedia — the old photograph survives every failure", () => {
  it("keeps the old media when the new upload never arrived", async () => {
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine); // reserved, never uploaded

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "upload_incomplete" });
    // THE assertion of this whole file.
    expect(engine.mediaRepository.rows.get(oldHero.mediaId)?.status).toBe("ready");
    expect(engine.objectStore.objects.has(oldHero.storagePath)).toBe(true);
  });

  it("keeps the old media when the new file is not really an image", async () => {
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, SVG_BYTES);

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
    expect(engine.mediaRepository.rows.get(oldHero.mediaId)?.status).toBe("ready");
    expect(engine.objectStore.objects.has(oldHero.storagePath)).toBe(true);
  });

  it("keeps the old media when the new file is too large", async () => {
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, JPEG_BYTES, MAX_MEDIA_BYTES + 1);

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "file_too_large" });
    expect(engine.mediaRepository.rows.get(oldHero.mediaId)?.status).toBe("ready");
  });

  it("reports WHY the replacement failed, so the UI can be specific", async () => {
    // Not a generic error: the family should read "trop lourde", not
    // "quelque chose s'est mal passé".
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);

    const tooBig = await reserve(engine);
    engine.objectStore.put(tooBig.storagePath, JPEG_BYTES, MAX_MEDIA_BYTES + 1);
    const sizeResult = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: tooBig.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    const bogus = await reserve(engine);
    engine.objectStore.put(bogus.storagePath, SVG_BYTES);
    const typeResult = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: bogus.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(sizeResult).toEqual({ ok: false, code: "file_too_large" });
    expect(typeResult).toEqual({ ok: false, code: "invalid_file" });
  });

  it("never removes the old media before the new one is ready", async () => {
    // Observed directly: at the instant the old object is removed, the
    // new media must already be `ready`.
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, JPEG_BYTES);

    let newWasReadyWhenOldRemoved: boolean | null = null;
    const store = engine.objectStore;
    const original = store.removeByPrefix.bind(store);
    store.removeByPrefix = async (input) => {
      if (input.prefix.includes(oldHero.mediaId)) {
        newWasReadyWhenOldRemoved =
          engine.mediaRepository.rows.get(newHero.mediaId)?.status === "ready";
      }
      return original(input);
    };

    await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(newWasReadyWhenOldRemoved).toBe(true);
  });
});

describe("replaceMedia — the happy path", () => {
  it("finalizes the new media and retires the old one", async () => {
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, JPEG_BYTES);

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.media.status).toBe("ready");
    expect(result.value.previousRemoved).toBe(true);
    expect(engine.mediaRepository.rows.has(oldHero.mediaId)).toBe(false);
    expect(engine.objectStore.objects.has(oldHero.storagePath)).toBe(false);
  });

  it("never writes the new file over the old object", async () => {
    // Every upload gets its own directory, which is what makes
    // "keep the old until the new is proven" need no locking at all.
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);

    expect(newHero.storagePath).not.toBe(oldHero.storagePath);
  });

  it("reports a cleanup failure without failing the replacement", async () => {
    // The new photograph is live; reporting an error would invite the
    // caller to re-upload it.
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, JPEG_BYTES);

    const store = engine.objectStore;
    const original = store.removeByPrefix.bind(store);
    store.removeByPrefix = async (input) => {
      if (input.prefix.includes(oldHero.mediaId)) throw new Error("storage down");
      return original(input);
    };

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.previousRemoved).toBe(false);
    expect(engine.mediaRepository.rows.get(newHero.mediaId)?.status).toBe("ready");
  });

  it("allows two ready heroes to coexist, which is what makes it safe", async () => {
    // A "one ready hero" unique constraint would forbid the overlap
    // that guarantees the family is never left with nothing.
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, JPEG_BYTES);

    const store = engine.objectStore;
    const original = store.removeByPrefix.bind(store);
    let bothReady = false;
    store.removeByPrefix = async (input) => {
      if (input.prefix.includes(oldHero.mediaId)) {
        bothReady =
          engine.mediaRepository.rows.get(oldHero.mediaId)?.status === "ready" &&
          engine.mediaRepository.rows.get(newHero.mediaId)?.status === "ready";
      }
      return original(input);
    };

    await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(bothReady).toBe(true);
  });
});

describe("replaceMedia — ownership", () => {
  it("refuses another owner, touching nothing", async () => {
    const engine = createTestEngine();
    const oldHero = await existingHero(engine);
    const newHero = await reserve(engine);
    engine.objectStore.put(newHero.storagePath, JPEG_BYTES);

    const result = await replaceMedia(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_A,
      mediaId: newHero.mediaId,
      previousMediaId: oldHero.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
    expect(engine.mediaRepository.rows.get(oldHero.mediaId)?.status).toBe("ready");
    expect(engine.mediaRepository.rows.get(newHero.mediaId)?.status).toBe("pending");
  });

  it("cannot be used to delete another memorial's media", async () => {
    // The attack this signature invites: finalize something of mine,
    // name someone else's media as "previous". Both ids are resolved
    // within the one memorial the actor owns, so the victim is never
    // found.
    const engine = createTestEngine();

    const victim = await reserveMediaUpload(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_B,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });
    if (!victim.ok) throw new Error("setup failed");
    engine.objectStore.put(victim.value.storagePath, JPEG_BYTES);
    await finalizeMediaUpload(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_B,
      mediaId: victim.value.mediaId,
    });

    const mine = await reserve(engine);
    engine.objectStore.put(mine.storagePath, JPEG_BYTES);

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: mine.mediaId,
      previousMediaId: victim.value.mediaId,
    });

    // The replacement succeeds for the attacker's own media, and the
    // victim is untouched.
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.previousRemoved).toBe(false);
    expect(engine.mediaRepository.rows.get(victim.value.mediaId)?.status).toBe("ready");
    expect(engine.objectStore.objects.has(victim.value.storagePath)).toBe(true);
  });

  it("refuses to replace a media with itself", async () => {
    // Would finalize then delete the same media, leaving nothing —
    // the exact loss this file prevents.
    const engine = createTestEngine();
    const hero = await reserve(engine);
    engine.objectStore.put(hero.storagePath, JPEG_BYTES);

    const result = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: hero.mediaId,
      previousMediaId: hero.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
    expect(engine.objectStore.objects.has(hero.storagePath)).toBe(true);
  });
});

describe("replaceMedia — gallery uses the same engine", () => {
  it("replaces a gallery media with the same guarantees", async () => {
    // Not a Hero-only primitive (section 15).
    const engine = createTestEngine();

    const oldItem = await reserve(engine, "gallery");
    engine.objectStore.put(oldItem.storagePath, JPEG_BYTES);
    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: oldItem.mediaId,
    });

    const newItem = await reserve(engine, "gallery");
    engine.objectStore.put(newItem.storagePath, SVG_BYTES);

    const failed = await replaceMedia(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: newItem.mediaId,
      previousMediaId: oldItem.mediaId,
    });

    expect(failed).toEqual({ ok: false, code: "invalid_file" });
    expect(engine.mediaRepository.rows.get(oldItem.mediaId)?.status).toBe("ready");
  });
});
