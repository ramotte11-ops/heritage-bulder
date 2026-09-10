import { describe, expect, it } from "vitest";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { MemorialContent, MemorialVersion } from "@/types/memorial";
import { EMPTY_HERO_CONTENT } from "@/types/hero";
import { finalizeMediaUpload, reserveMediaUpload } from "@/lib/media/upload-lifecycle";
import {
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  OWNER_A,
  OWNER_B,
  VISITOR,
  createTestEngine,
  ownerActor,
} from "@/lib/media/test-fixtures";
import { isPageCComplete } from "./hero-step";
import { resolveHeroPhotoStepData } from "./resolve-hero-photo-step";

/** A minimal, in-memory DraftRepository double — this module only ever
 * calls `saveDraftContent`, so that is the only method exercised. */
class FakeDraftRepository implements Pick<DraftRepository, "saveDraftContent"> {
  public saved: { memorialId: string; content: MemorialContent }[] = [];
  public failWith: Error | null = null;

  async saveDraftContent(memorialId: string, content: MemorialContent): Promise<{ updatedAt: string }> {
    if (this.failWith) throw this.failWith;
    this.saved.push({ memorialId, content });
    return { updatedAt: "2026-01-01T00:00:00.000Z" };
  }
}

async function readyHeroMedia(
  engine: ReturnType<typeof createTestEngine>,
  memorialId = MEMORIAL_A,
  owner = OWNER_A,
) {
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

describe("resolveHeroPhotoStepData", () => {
  it("returns the content unchanged and no initialPhoto when there is no ready hero media at all", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      EMPTY_CONTENT,
    );

    expect(result).toEqual({ content: EMPTY_CONTENT, initialPhoto: null });
    expect(draftRepository.saved).toEqual([]);
  });

  it("returns the current photo, with a signed read URL, when the Hero already references it — no persistence needed", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const media = await readyHeroMedia(engine);

    const content: MemorialContent = {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: media.id, crop: null } },
    } as MemorialContent;

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(result.content).toBe(content);
    expect(result.initialPhoto?.media.id).toBe(media.id);
    expect(result.initialPhoto?.readUrl).toContain("signed");
    // Nothing changed, so nothing needed to be persisted.
    expect(draftRepository.saved).toEqual([]);
  });

  it("Mission 033 section 14 — reconciles and PERSISTS when finalize succeeded but the Hero was never linked", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const media = await readyHeroMedia(engine);

    // The Hero has no photo at all — exactly "finalize succeeded, the
    // draft write that should have linked it then failed".
    const content: MemorialContent = { hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(result.initialPhoto?.media.id).toBe(media.id);
    expect((result.content.hero as { photo: { mediaId: string } }).photo.mediaId).toBe(media.id);
    // The reconciled content was actually persisted — the whole point:
    // the next reader (including a plain page reload) sees the SAME
    // truth without needing to reconcile again.
    expect(draftRepository.saved).toEqual([{ memorialId: MEMORIAL_A, content: result.content }]);
    // Never marks T06 completed on its own — only an explicit Continue
    // click does that.
    expect(isPageCComplete(result.content)).toBe(false);
  });

  it("adopts the MOST RECENTLY CREATED ready hero media when several exist — Mission 030's own selection doctrine", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const older = await readyHeroMedia(engine);
    engine.advance(1000);
    const newer = await readyHeroMedia(engine);

    const content: MemorialContent = { hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(result.initialPhoto?.media.id).toBe(newer.id);
    expect(result.initialPhoto?.media.id).not.toBe(older.id);
  });

  it("never reconciles against another memorial's ready hero media", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    await readyHeroMedia(engine, MEMORIAL_B, OWNER_B); // belongs to a different memorial/owner

    const content: MemorialContent = { hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(result).toEqual({ content, initialPhoto: null });
    expect(draftRepository.saved).toEqual([]);
  });

  it("refuses nothing and degrades to 'nothing to reconcile' for a visitor/unauthorized actor — never throws", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      VISITOR,
      MEMORIAL_A,
      EMPTY_CONTENT,
    );

    expect(result).toEqual({ content: EMPTY_CONTENT, initialPhoto: null });
    expect(draftRepository.saved).toEqual([]);
  });

  it("never persists, and returns the content unchanged, over a corrupted stored hero", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    await readyHeroMedia(engine);

    const corrupted = { hero: "garbage" } as unknown as MemorialContent;

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      corrupted,
    );

    expect(result).toEqual({ content: corrupted, initialPhoto: null });
    expect(draftRepository.saved).toEqual([]);
  });
});

describe("resolveHeroPhotoStepData — MemorialVersion's own content shape", () => {
  it("takes exactly the content of a MemorialVersion, unwrapped by the caller", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const draft: MemorialVersion = { content: {}, updatedAt: "2026-01-01T00:00:00.000Z" };

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      draft.content,
    );

    expect(result.content).toBe(draft.content);
  });
});
