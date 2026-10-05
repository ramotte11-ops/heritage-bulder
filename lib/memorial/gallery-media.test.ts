import { describe, expect, it } from "vitest";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import { finalizeMediaUpload, reserveMediaUpload } from "@/lib/media/upload-lifecycle";
import { sweepAbandonedUploads } from "@/lib/media/orphan-sweep";
import { MEMORIAL_A, OWNER_A, OWNER_B, VISITOR, createTestEngine, jpegWithDimensions, ownerActor } from "@/lib/media/test-fixtures";
import { reconcileHeroMediaOnResume } from "@/lib/builder/guided-flow/resolve-hero-photo-step";
import { updateHero } from "@/lib/memorial/hero";
import { EMPTY_HERO_CONTENT } from "@/types/hero";
import type { MemorialContent, MemorialVersion } from "@/types/memorial";
import { addGalleryMedia, galleryMediaIds, readGallery, removeGalleryMedia, updateGallery } from "./gallery-content";
import { referencedMediaIds, retireGalleryMedia } from "./gallery-media";

/**
 * Dette D1 — the Gallery upload → reference → removal → retire cycle,
 * against the real media engine (in-memory fakes of its ports) and the
 * real content model. The central guarantee: a media the SAVED draft still
 * references is never deleted.
 */

class FakeDraftRepository implements DraftRepository {
  public content: MemorialContent = {};
  public failWith: Error | null = null;
  public unreachable = false;
  async getDraftContent(): Promise<MemorialVersion | null> {
    if (this.failWith) throw this.failWith;
    return this.unreachable ? null : { content: this.content, updatedAt: "2026-09-28T00:00:00.000Z" };
  }
  async saveDraftContent(_memorialId: string, content: MemorialContent): Promise<{ updatedAt: string }> {
    this.content = content;
    return { updatedAt: "2026-09-28T00:00:00.000Z" };
  }
}

const OWNER = ownerActor(OWNER_A);

function setup() {
  const engine = createTestEngine();
  const drafts = new FakeDraftRepository();
  return { engine, drafts, deps: { mediaEngine: engine, draftRepository: drafts } };
}

/** The Gallery upload cycle, as the actions run it: reserve (purpose gallery) → browser upload → finalize. */
async function uploadGalleryPhoto(engine: ReturnType<typeof createTestEngine>, width = 1200, height = 1600, purpose: "gallery" | "hero" = "gallery") {
  const reserved = await reserveMediaUpload(engine, OWNER, { memorialId: MEMORIAL_A, purpose, declaredMimeType: "image/jpeg" });
  if (!reserved.ok) throw new Error(reserved.code);
  engine.objectStore.put(reserved.value.storagePath, jpegWithDimensions(width, height));
  const finalized = await finalizeMediaUpload(engine, OWNER, { memorialId: MEMORIAL_A, mediaId: reserved.value.mediaId, expectedPurpose: purpose });
  if (!finalized.ok) throw new Error(finalized.code);
  return finalized.value;
}

function exists(engine: ReturnType<typeof createTestEngine>, mediaId: string) {
  const row = engine.mediaRepository.rows.get(mediaId);
  return { row: row !== undefined, object: row !== undefined && engine.objectStore.objects.has(row.storagePath) };
}

async function persistGallery(drafts: FakeDraftRepository, ids: string[]) {
  const written = updateGallery(drafts.content, { items: ids.map((mediaId) => ({ mediaId, caption: null })) });
  if (!written.ok) throw new Error(written.reason);
  await drafts.saveDraftContent(MEMORIAL_A, written.content);
}

describe("upload → reference → remove → retire (the full cycle)", () => {
  it("a Gallery upload is ready, purpose gallery, with MEASURED natural dimensions", async () => {
    const { engine } = setup();
    const media = await uploadGalleryPhoto(engine, 4032, 3024);
    expect(media).toMatchObject({ purpose: "gallery", status: "ready", width: 4032, height: 3024 });
  });

  it("removing one photograph: reference gone (order kept, no hole), then the media is deleted — row and object", async () => {
    const { engine, drafts, deps } = setup();
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push((await uploadGalleryPhoto(engine)).id);
    await persistGallery(drafts, ids);

    // 1. the family removes the second photograph; the draft is saved first
    const withoutSecond = updateGallery(drafts.content, removeGalleryMedia(readGallery(drafts.content), ids[1]));
    if (!withoutSecond.ok) throw new Error(withoutSecond.reason);
    await drafts.saveDraftContent(MEMORIAL_A, withoutSecond.content);
    expect(galleryMediaIds(readGallery(drafts.content))).toEqual([ids[0], ids[2], ids[3]]);

    // 2. only then is it retired
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: ids[1] })).toEqual({ ok: true, value: { removed: true } });
    expect(exists(engine, ids[1])).toEqual({ row: false, object: false });
    for (const kept of [ids[0], ids[2], ids[3]]) expect(exists(engine, kept)).toEqual({ row: true, object: true });
  });

  it("is idempotent: retiring again reports alreadyAbsent, never an error", async () => {
    const { engine, drafts, deps } = setup();
    const media = await uploadGalleryPhoto(engine);
    await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: media.id });
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: true, value: { removed: false, retained: "alreadyAbsent" } });
    expect(drafts.content).toEqual({});
  });
});

describe("a media the saved draft still references is NEVER deleted", () => {
  it("still in content.gallery (the caller skipped the draft save) → kept, row and object intact", async () => {
    const { engine, drafts, deps } = setup();
    const a = await uploadGalleryPhoto(engine);
    const b = await uploadGalleryPhoto(engine);
    await persistGallery(drafts, [a.id, b.id]);
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: b.id })).toEqual({ ok: true, value: { removed: false, retained: "stillReferenced" } });
    expect(exists(engine, b.id)).toEqual({ row: true, object: true });
  });

  it("referenced as the Hero photograph → kept", async () => {
    const { engine, drafts, deps } = setup();
    const media = await uploadGalleryPhoto(engine);
    await drafts.saveDraftContent(MEMORIAL_A, updateHero({}, { ...EMPTY_HERO_CONTENT, photo: { mediaId: media.id, crop: null } }));
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: true, value: { removed: false, retained: "stillReferenced" } });
    expect(exists(engine, media.id).row).toBe(true);
  });

  it("the draft's Gallery or Hero is corrupted → 'unreferenced' cannot be proven → kept (fail closed)", async () => {
    for (const content of [{ gallery: { items: "broken" } }, { hero: "broken" }] as unknown as MemorialContent[]) {
      const { engine, drafts, deps } = setup();
      const media = await uploadGalleryPhoto(engine);
      drafts.content = content;
      expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: true, value: { removed: false, retained: "contentUnreadable" } });
      expect(exists(engine, media.id).row).toBe(true);
    }
  });

  it("the draft cannot be read → refused, nothing deleted", async () => {
    const failing = setup();
    const m1 = await uploadGalleryPhoto(failing.engine);
    failing.drafts.failWith = new Error("db down");
    expect(await retireGalleryMedia(failing.deps, OWNER, { memorialId: MEMORIAL_A, mediaId: m1.id })).toEqual({ ok: false, code: "storage_unavailable" });
    expect(exists(failing.engine, m1.id).row).toBe(true);

    const unreachable = setup();
    const m2 = await uploadGalleryPhoto(unreachable.engine);
    unreachable.drafts.unreachable = true;
    expect(await retireGalleryMedia(unreachable.deps, OWNER, { memorialId: MEMORIAL_A, mediaId: m2.id })).toEqual({ ok: false, code: "access_denied" });
    expect(exists(unreachable.engine, m2.id).row).toBe(true);
  });

  it("the guard reads the SAVED draft — the only input is (memorialId, mediaId), no client content", () => {
    type Input = Parameters<typeof retireGalleryMedia>[2];
    // @ts-expect-error — a caller cannot hand in a content of its own
    const forged: Input = { memorialId: MEMORIAL_A, mediaId: "x", content: {} };
    void forged;
    expect(referencedMediaIds({ hero: "broken" } as unknown as MemorialContent)).toBeNull();
  });
});

describe("boundaries of the Gallery path", () => {
  it("never retires a Hero media — purpose-bound", async () => {
    const { engine, deps } = setup();
    const hero = await uploadGalleryPhoto(engine, 10, 10, "hero");
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: hero.id })).toEqual({ ok: true, value: { removed: false, retained: "notGalleryMedia" } });
    expect(exists(engine, hero.id)).toEqual({ row: true, object: true });
  });

  it("another owner, a visitor → access_denied, nothing deleted; a non-identifier → alreadyAbsent", async () => {
    const { engine, deps } = setup();
    const media = await uploadGalleryPhoto(engine);
    expect(await retireGalleryMedia(deps, ownerActor(OWNER_B), { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: false, code: "access_denied" });
    expect(await retireGalleryMedia(deps, VISITOR, { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: false, code: "access_denied" });
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: "https://x/original.jpg" })).toEqual({ ok: true, value: { removed: false, retained: "alreadyAbsent" } });
    expect(exists(engine, media.id)).toEqual({ row: true, object: true });
  });

  it("a Storage failure is reported, and the row survives for a retry (deleteMedia's own ordering)", async () => {
    const { engine, deps } = setup();
    const media = await uploadGalleryPhoto(engine);
    engine.objectStore.failOn.removeByPrefix = new Error("storage down");
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: false, code: "storage_unavailable" });
    expect(exists(engine, media.id).row).toBe(true);
    engine.objectStore.failOn = {};
    expect(await retireGalleryMedia(deps, OWNER, { memorialId: MEMORIAL_A, mediaId: media.id })).toEqual({ ok: true, value: { removed: true } });
  });
});

describe("no other mechanism touches a Gallery media", () => {
  it("the Hero reconciliation (the only ready-unreferenced policy) is purpose-bound: Gallery media survive it", async () => {
    const { engine, drafts } = setup();
    const galleryUnreferenced = await uploadGalleryPhoto(engine);
    const galleryReferenced = await uploadGalleryPhoto(engine);
    await persistGallery(drafts, [galleryReferenced.id]);
    const heroOld = await uploadGalleryPhoto(engine, 10, 10, "hero");
    const heroNew = await uploadGalleryPhoto(engine, 10, 10, "hero");
    await drafts.saveDraftContent(MEMORIAL_A, updateHero(drafts.content, { ...EMPTY_HERO_CONTENT, photo: { mediaId: heroNew.id, crop: null } }));

    await reconcileHeroMediaOnResume({ mediaEngine: engine, draftRepository: drafts }, OWNER, MEMORIAL_A, drafts.content);

    expect(exists(engine, heroOld.id).row).toBe(false); // the Hero's own stale media — its documented policy
    expect(exists(engine, heroNew.id).row).toBe(true);
    expect(exists(engine, galleryUnreferenced.id)).toEqual({ row: true, object: true });
    expect(exists(engine, galleryReferenced.id)).toEqual({ row: true, object: true });
  });

  it("the abandoned-upload sweep only ever reclaims pending rows — a ready Gallery media is untouched, even long after", async () => {
    const { engine } = setup();
    const ready = await uploadGalleryPhoto(engine);
    const pending = await reserveMediaUpload(engine, OWNER, { memorialId: MEMORIAL_A, purpose: "gallery", declaredMimeType: "image/jpeg" });
    engine.advance(24 * 60 * 60 * 1000);
    await sweepAbandonedUploads(engine);
    expect(exists(engine, ready.id).row).toBe(true);
    expect(pending.ok && engine.mediaRepository.rows.has(pending.value.mediaId)).toBe(false);
  });

  it("add → the draft references; addGalleryMedia on the real content model keeps the family's order", async () => {
    const { engine, drafts } = setup();
    const a = await uploadGalleryPhoto(engine);
    const b = await uploadGalleryPhoto(engine);
    const first = addGalleryMedia(readGallery(drafts.content), b.id);
    const second = first.ok ? addGalleryMedia(first.gallery, a.id) : first;
    expect(second.ok && galleryMediaIds(second.gallery)).toEqual([b.id, a.id]);
  });
});
