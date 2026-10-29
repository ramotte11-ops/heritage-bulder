import { describe, expect, it } from "vitest";
import { createGuestDraftV3, createPreparedGuestDraftPhoto, updateGuestDraftV3, type GuestDraftPhotoAsset, type GuestDraftV3 } from "./guest-draft-v3";
import type { GuestDraftV3PhotoWriteResult, GuestDraftV3WriteResult } from "./guest-draft-v3-store";
import {
  completeGuestHeroCrop,
  completeGuestHeroPhoto,
  completeGuestHeroReveal,
  findGuestHeroReference,
  guestHeroStepProgress,
  isGuestHeroRevealComplete,
  loadGuestHeroPhoto,
  reopenGuestHeroPhoto,
  saveGuestHeroCrop,
  savePreparedGuestHeroPhoto,
  type GuestHeroMediaOptions,
} from "./guest-hero-media";
import { resolveGuestBuilderStage } from "./guest-builder-runtime";
import { readGuidedFlowState } from "@/lib/builder/guided-flow/hero-step";

const T0 = "2026-10-26T10:00:00.000Z";
const T1 = "2026-10-26T10:01:00.000Z";

function readyDraft(): GuestDraftV3 {
  const created = createGuestDraftV3({
    draftId: "guest-hero",
    transferKey: "guest-hero-transfer",
    now: T0,
    language: "fr",
    content: {
      hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null },
      guidedFlow: {
        T04: { status: "skipped" },
        A00: { status: "completed", answer: "no" },
        T05: { status: "skipped" },
      },
    } as never,
  });
  if (!created.ok) throw new Error(created.reason);
  return created.draft;
}

class HeroMemoryStore {
  draft = readyDraft();
  assets = new Map<string, GuestDraftPhotoAsset>();
  failNext: "quota_exceeded" | null = null;
  failSaveNext: "quota_exceeded" | null = null;

  async readPhoto(localId: string) {
    const asset = this.assets.get(localId);
    return asset === undefined
      ? { ok: false as const, reason: "photo_not_found" as const }
      : { ok: true as const, asset: structuredClone(asset) };
  }

  private current(expectedRevision: number) {
    return this.draft.revision === expectedRevision;
  }

  private failure(): GuestDraftV3PhotoWriteResult | null {
    if (this.failNext === null) return null;
    const reason = this.failNext;
    this.failNext = null;
    return { ok: false, reason };
  }

  async addPhoto(input: Parameters<typeof createPreparedGuestDraftPhoto>[0], expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult> {
    const failed = this.failure();
    if (failed) return failed;
    if (!this.current(expectedRevision)) return { ok: false, reason: "revision_conflict" };
    const prepared = createPreparedGuestDraftPhoto(input);
    if (!prepared.ok) return prepared;
    const updated = updateGuestDraftV3(this.draft, { now, photos: [...this.draft.photos, prepared.reference] });
    if (!updated.ok) return updated;
    this.assets.set(prepared.asset.localId, structuredClone(prepared.asset));
    this.draft = updated.draft;
    return { ok: true, draft: structuredClone(this.draft) };
  }

  async replacePhoto(
    replacedLocalId: string,
    input: Omit<Parameters<typeof createPreparedGuestDraftPhoto>[0], "placement"> & { placement?: Parameters<typeof createPreparedGuestDraftPhoto>[0]["placement"] },
    expectedRevision: number,
    now: string,
  ): Promise<GuestDraftV3PhotoWriteResult> {
    const failed = this.failure();
    if (failed) return failed;
    if (!this.current(expectedRevision)) return { ok: false, reason: "revision_conflict" };
    const previous = this.draft.photos.find(({ localId }) => localId === replacedLocalId);
    if (previous === undefined) return { ok: false, reason: "photo_not_found" };
    const prepared = createPreparedGuestDraftPhoto({ ...input, placement: input.placement ?? previous.placement });
    if (!prepared.ok) return prepared;
    const updated = updateGuestDraftV3(this.draft, {
      now,
      photos: this.draft.photos.map((photo) => photo.localId === replacedLocalId ? prepared.reference : photo),
    });
    if (!updated.ok) return updated;
    this.assets.set(prepared.asset.localId, structuredClone(prepared.asset));
    this.draft = updated.draft;
    return { ok: true, draft: structuredClone(this.draft) };
  }

  async updatePhotoPlacement(localId: string, placement: GuestDraftV3["photos"][number]["placement"], expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult> {
    if (!this.current(expectedRevision)) return { ok: false, reason: "revision_conflict" };
    const updated = updateGuestDraftV3(this.draft, {
      now,
      photos: this.draft.photos.map((photo) => photo.localId === localId ? { localId, placement } : photo),
    });
    if (!updated.ok) return updated;
    this.draft = updated.draft;
    return { ok: true, draft: structuredClone(this.draft) };
  }

  async save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult> {
    if (this.failSaveNext !== null) {
      const reason = this.failSaveNext;
      this.failSaveNext = null;
      return { ok: false, reason };
    }
    if (expectedRevision === null || !this.current(expectedRevision)) return { ok: false, reason: "revision_conflict" };
    this.draft = structuredClone(draft);
    return { ok: true };
  }
}

function harness(store = new HeroMemoryStore()) {
  let snapshot = store.draft;
  let sequence = 0;
  const options = (): GuestHeroMediaOptions => ({
    store,
    getDraft: () => snapshot,
    acceptDraft: (draft) => {
      snapshot = draft;
      store.draft = draft;
    },
    createId: () => `local-${++sequence}`,
    now: () => T1,
  });
  return { store, options, draft: () => snapshot };
}

function prepared(bytes = [1, 2, 3, 4]) {
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    mimeType: "image/webp" as const,
    width: 1600,
    height: 1200,
    originalFilename: "famille.jpg",
    lastModified: 123,
  };
}

describe("guest Hero local media", () => {
  it("stores a prepared Hero with reliable dimensions and no server media reference", async () => {
    const h = harness();
    const result = await savePreparedGuestHeroPhoto(h.options(), prepared(), 0);
    expect(result).toMatchObject({ status: "saved", revision: 1, photo: { localId: "local-1", width: 1600, height: 1200, crop: null } });
    expect(h.store.assets.get("local-1")).toMatchObject({
      source: { blobRole: "prepared_high_quality", dimensions: { status: "known", width: 1600, height: 1200 } },
    });
    expect(JSON.stringify(h.draft().content)).not.toMatch(/mediaId|memorialId/);
    expect(resolveGuestBuilderStage(h.draft())).toBe("heroPhoto");
  });

  it("persists T06, crop and T07 across a reload, then reaches the existing T08", async () => {
    const h = harness();
    await savePreparedGuestHeroPhoto(h.options(), prepared(), 0);
    await expect(completeGuestHeroPhoto(h.options(), 1)).resolves.toMatchObject({ status: "saved", revision: 2 });
    expect(resolveGuestBuilderStage(h.draft())).toBe("heroCrop");

    const crop = { focalX: 0.35, focalY: 0.7, zoom: 1.4 };
    await expect(saveGuestHeroCrop(h.options(), crop, 2)).resolves.toMatchObject({ status: "saved", revision: 3 });
    const reloaded = await loadGuestHeroPhoto(h.store, structuredClone(h.draft()));
    expect(reloaded).toMatchObject({ localId: "local-1", crop, width: 1600, height: 1200 });

    await expect(completeGuestHeroCrop(h.options(), crop, 3)).resolves.toMatchObject({ status: "saved", revision: 4 });
    expect(resolveGuestBuilderStage(h.draft())).toBe("heroReveal");
  });

  it("atomically persists the ambiance with T08, survives reload and stops before 2-C4", async () => {
    const h = harness();
    await savePreparedGuestHeroPhoto(h.options(), prepared(), 0);
    await completeGuestHeroPhoto(h.options(), 1);
    const crop = { focalX: 0.35, focalY: 0.7, zoom: 1.4 };
    await saveGuestHeroCrop(h.options(), crop, 2);
    await completeGuestHeroCrop(h.options(), crop, 3);
    const progressBefore = guestHeroStepProgress(h.draft());

    h.store.failSaveNext = "quota_exceeded";
    await expect(completeGuestHeroReveal(h.options(), "dark", 4)).rejects.toMatchObject({ reason: "quota_exceeded" });
    expect(h.draft().skinVariant).toBeNull();
    expect(readGuidedFlowState(h.draft().content).T08).toBeUndefined();

    await expect(completeGuestHeroReveal(h.options(), "dark", 4)).resolves.toMatchObject({
      status: "saved",
      revision: 5,
    });
    const reloaded = structuredClone(h.draft());
    expect(reloaded.skinVariant).toBe("dark");
    expect(readGuidedFlowState(reloaded.content).T08).toEqual({ status: "completed" });
    expect(isGuestHeroRevealComplete(reloaded)).toBe(true);
    expect(guestHeroStepProgress(reloaded)).toBeGreaterThan(progressBefore);
    expect(resolveGuestBuilderStage(reloaded)).toBe("postRevealPending");
    expect(JSON.stringify(reloaded)).not.toMatch(/mediaId|memorialId/);
  });

  it("blocks a stale reveal tab without partially changing ambiance or T08", async () => {
    const h = harness();
    await savePreparedGuestHeroPhoto(h.options(), prepared(), 0);
    await completeGuestHeroPhoto(h.options(), 1);
    const crop = { focalX: 0.5, focalY: 0.5, zoom: 1 };
    await saveGuestHeroCrop(h.options(), crop, 2);
    await completeGuestHeroCrop(h.options(), crop, 3);

    await expect(completeGuestHeroReveal(h.options(), "dark", 3)).resolves.toEqual({ status: "conflict" });
    expect(h.draft().skinVariant).toBeNull();
    expect(readGuidedFlowState(h.draft().content).T08).toBeUndefined();
  });

  it("keeps the previous asset on replacement and resets the new Hero crop", async () => {
    const h = harness();
    await savePreparedGuestHeroPhoto(h.options(), prepared([1]), 0);
    await completeGuestHeroPhoto(h.options(), 1);
    await saveGuestHeroCrop(h.options(), { focalX: 0.2, focalY: 0.8, zoom: 1.6 }, 2);
    await reopenGuestHeroPhoto(h.options(), 3);
    const replaced = await savePreparedGuestHeroPhoto(h.options(), prepared([9, 8]), 4);
    expect(replaced).toMatchObject({ status: "saved", photo: { localId: "local-2", crop: null } });
    expect(h.store.assets.has("local-1")).toBe(true);
    expect(h.store.assets.has("local-2")).toBe(true);
    expect(findGuestHeroReference(h.draft())).toMatchObject({ localId: "local-2", placement: { purpose: "hero", crop: null } });
  });

  it("preserves the last draft and asset on quota failure", async () => {
    const h = harness();
    await savePreparedGuestHeroPhoto(h.options(), prepared([1]), 0);
    const before = structuredClone(h.draft());
    h.store.failNext = "quota_exceeded";
    await expect(savePreparedGuestHeroPhoto(h.options(), prepared([2]), 1)).rejects.toMatchObject({ reason: "quota_exceeded" });
    expect(h.draft()).toEqual(before);
    expect(h.store.assets.size).toBe(1);
  });

  it("returns a blocking conflict for a stale tab", async () => {
    const h = harness();
    await savePreparedGuestHeroPhoto(h.options(), prepared(), 0);
    await expect(completeGuestHeroPhoto(h.options(), 0)).resolves.toEqual({ status: "conflict" });
    expect(h.draft().revision).toBe(1);
  });
});
