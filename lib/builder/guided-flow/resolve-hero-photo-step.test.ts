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
import { resolveHeroPhotoStepData, reconcileHeroMediaOnResume } from "./resolve-hero-photo-step";

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

describe("resolveHeroPhotoStepData — QG follow-up: durable retry for a failed retire", () => {
  it("adopts the newest ready hero media as canonical AND retires the other stale ready ones in the same read", async () => {
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
    // The stale, superseded media is gone — both the row and the object.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).toBeNull();
    expect(engine.objectStore.objects.has(older.storagePath)).toBe(false);
    // The canonical one is untouched.
    expect(
      await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: newer.id }),
    ).not.toBeNull();
  });

  it("never deletes the media currently canonical in the draft, even when it is not the most recently created one", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const older = await readyHeroMedia(engine);
    engine.advance(1000);
    const newer = await readyHeroMedia(engine);

    // The draft already, deliberately, points at the OLDER media — a
    // legitimate state (e.g. `newer` finished after this exact read
    // started). Reconciliation must leave an already-linked mediaId
    // alone rather than second-guessing it toward "most recent".
    const content: MemorialContent = {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: older.id, crop: null } },
    } as MemorialContent;

    const result = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(result.initialPhoto?.media.id).toBe(older.id);
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).not.toBeNull();
    // The one NOT referenced by the draft is the one retired.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: newer.id })).toBeNull();
  });

  it("a retire that fails leaves the stale media in place and the canonical untouched — the NEXT read retries and succeeds", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const older = await readyHeroMedia(engine);
    engine.advance(1000);
    const newer = await readyHeroMedia(engine);

    const content: MemorialContent = { hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;

    // Simulate a transient Storage failure on the retire attempt.
    engine.objectStore.failOn.removeByPrefix = new Error("storage unavailable");

    const first = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    // The read itself still succeeds — a cleanup failure is never the
    // caller's problem — and the canonical is already adopted+persisted.
    expect(first.initialPhoto?.media.id).toBe(newer.id);
    expect(first.content).not.toBe(content); // reconciliation persisted
    // The stale media SURVIVED the failed retry.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).not.toBeNull();

    // The next "resume" reads the now-persisted, already-linked content.
    engine.objectStore.failOn.removeByPrefix = undefined as unknown as Error;
    const second = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      first.content,
    );

    expect(second.initialPhoto?.media.id).toBe(newer.id);
    // The retry succeeded this time.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).toBeNull();
    // The canonical one was never at risk, through either read.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: newer.id })).not.toBeNull();
  });

  it("a retry that fails again does no damage — content/initialPhoto still resolve normally", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const older = await readyHeroMedia(engine);
    engine.advance(1000);
    const newer = await readyHeroMedia(engine);
    engine.objectStore.failOn.removeByPrefix = new Error("storage unavailable");

    const content: MemorialContent = {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: newer.id, crop: null } },
    } as MemorialContent;

    // Two consecutive reads, both hitting the same failure.
    const first = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );
    const second = await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      first.content,
    );

    expect(first.initialPhoto?.media.id).toBe(newer.id);
    expect(second.initialPhoto?.media.id).toBe(newer.id);
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).not.toBeNull();
  });

  it("never touches a ready hero media belonging to a different memorial while retiring stale ones", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const older = await readyHeroMedia(engine);
    engine.advance(1000);
    const newer = await readyHeroMedia(engine);
    const otherMemorialMedia = await readyHeroMedia(engine, MEMORIAL_B, OWNER_B);

    const content: MemorialContent = { hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;

    await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).toBeNull();
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: newer.id })).not.toBeNull();
    expect(
      await engine.mediaRepository.findById({
        memorialId: MEMORIAL_B,
        mediaId: otherMemorialMedia.id,
      }),
    ).not.toBeNull();
  });

  it("never retires anything when the Hero itself is corrupted — no canonical could be confirmed", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const older = await readyHeroMedia(engine);
    engine.advance(1000);
    await readyHeroMedia(engine);

    const corrupted = { hero: "garbage" } as unknown as MemorialContent;

    await resolveHeroPhotoStepData(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      corrupted,
    );

    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: older.id })).not.toBeNull();
  });
});

describe("reconcileHeroMediaOnResume — QG follow-up #2: cleanup must outlive T06", () => {
  /** A Hero already fully done, T06 included — the exact shape a
   * memorial has once the family has clicked Continue on PAGE C. */
  function contentWithT06Completed(mediaId: string): MemorialContent {
    return {
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId, crop: null } },
      guidedFlow: { T06: { status: "completed" } },
    } as MemorialContent;
  }

  it("retries retiring a stale ready hero media even though T06 is already completed", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const canonical = await readyHeroMedia(engine);
    engine.advance(1000);
    // A later replacement whose retire never succeeded — T06 was
    // completed regardless (the family clicked Continue right after).
    const stale = await readyHeroMedia(engine);

    const content = contentWithT06Completed(canonical.id);

    const result = await reconcileHeroMediaOnResume(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    // The canonical mediaId in the draft is exactly what it was.
    expect((result.hero as { photo: { mediaId: string } }).photo.mediaId).toBe(canonical.id);
    expect(isPageCComplete(result)).toBe(true); // T06 stays completed — untouched.
    // The stale one is gone; the canonical one survives.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: stale.id })).toBeNull();
    expect(
      await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: canonical.id }),
    ).not.toBeNull();
  });

  it("a retire that fails after T06 is completed is retried on the NEXT resume/reload — durable, not one-shot", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const canonical = await readyHeroMedia(engine);
    engine.advance(1000);
    const stale = await readyHeroMedia(engine);
    const content = contentWithT06Completed(canonical.id);

    engine.objectStore.failOn.removeByPrefix = new Error("storage unavailable");
    const firstLoad = await reconcileHeroMediaOnResume(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );
    // Still there after the failed attempt.
    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: stale.id })).not.toBeNull();

    // A later Builder reload/resume — the retry mechanism this function
    // itself IS, called again exactly as page.tsx calls it on every load.
    engine.objectStore.failOn.removeByPrefix = undefined as unknown as Error;
    const secondLoad = await reconcileHeroMediaOnResume(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      firstLoad,
    );

    expect(await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: stale.id })).toBeNull();
    expect(
      await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: canonical.id }),
    ).not.toBeNull();
    expect((secondLoad.hero as { photo: { mediaId: string } }).photo.mediaId).toBe(canonical.id);
  });

  it("a still-unadopted new ready media is reconciled and PERSISTED before any cleanup runs — even after T06 is completed", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    // T06 completed and linked to `canonical` — but a LATER upload
    // finished and became ready, and its own draft-adoption write never
    // happened (the section 14 scenario), leaving it orphaned.
    const canonical = await readyHeroMedia(engine);
    engine.advance(1000);
    const orphanedReady = await readyHeroMedia(engine);
    const content = contentWithT06Completed(canonical.id);

    const result = await reconcileHeroMediaOnResume(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    // `reconcileHeroPhotoMedia`'s own rule: an already-linked mediaId is
    // left alone — it does NOT jump to "most recent" just because a
    // newer ready media exists. So `canonical` remains canonical here,
    // and `orphanedReady` — now provably not referenced by the draft —
    // is exactly what gets retired, only AFTER that (non-)adoption was
    // resolved.
    expect((result.hero as { photo: { mediaId: string } }).photo.mediaId).toBe(canonical.id);
    expect(
      await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: orphanedReady.id }),
    ).toBeNull();
  });

  it("never deletes the media currently canonical in the draft", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const canonical = await readyHeroMedia(engine);
    const content = contentWithT06Completed(canonical.id);

    await reconcileHeroMediaOnResume(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(
      await engine.mediaRepository.findById({ memorialId: MEMORIAL_A, mediaId: canonical.id }),
    ).not.toBeNull();
  });

  it("is a pure passthrough (no persistence, no cleanup) when there is no ready hero media at all", async () => {
    const engine = createTestEngine();
    const draftRepository = new FakeDraftRepository();
    const content: MemorialContent = { hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;

    const result = await reconcileHeroMediaOnResume(
      { mediaEngine: engine, draftRepository },
      ownerActor(OWNER_A),
      MEMORIAL_A,
      content,
    );

    expect(result).toBe(content);
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
