import { describe, expect, it } from "vitest";
import { readGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import { resolveGuestBuilderStage } from "./guest-builder-runtime";
import {
  createGuestDraftV3,
  createPreparedGuestDraftPhoto,
  updateGuestDraftV3,
  type GuestDraftPhotoAsset,
  type GuestDraftV3,
} from "./guest-draft-v3";
import type { GuestDraftV3PhotoWriteResult, GuestDraftV3WriteResult } from "./guest-draft-v3-store";
import {
  addPreparedGuestGalleryPhoto,
  loadGuestGalleryPhotos,
  removeGuestGalleryPhoto,
  replacePreparedGuestGalleryPhoto,
  resolveGuestGalleryStep,
  saveGuestGalleryEditorial,
  type GuestGalleryMediaOptions,
} from "./guest-gallery-media";

const T0 = "2026-10-27T08:00:00.000Z";
const T1 = "2026-10-27T08:01:00.000Z";

function initialDraft(): GuestDraftV3 {
  const created = createGuestDraftV3({
    draftId: "guest-gallery",
    transferKey: "guest-gallery-transfer",
    now: T0,
    language: "fr",
    skinVariant: "dark",
    content: {
      hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null },
      guidedFlow: {
        T04: { status: "skipped" },
        A00: { status: "completed", answer: "no" },
        T05: { status: "skipped" },
        T06: { status: "completed" },
        T07: { status: "completed" },
        T08: { status: "completed" },
      },
    } as never,
  });
  if (!created.ok) throw new Error(created.reason);
  return {
    ...created.draft,
    photos: [{
      localId: "hero-local",
      placement: { purpose: "hero", crop: { focalX: 0.5, focalY: 0.5, zoom: 1 } },
    }],
  };
}

class GalleryMemoryStore {
  draft = initialDraft();
  assets = new Map<string, GuestDraftPhotoAsset>([["hero-local", {
    localId: "hero-local",
    source: {
      blobRole: "legacy_unspecified",
      mimeType: "image/webp",
      sizeBytes: 1,
      dimensions: { status: "unknown", reason: "legacy_unmeasured" },
      originalFilename: "hero.webp",
      lastModified: 1,
    },
    blob: new Blob([new Uint8Array([7])], { type: "image/webp" }),
  }]]);
  failNext: "quota_exceeded" | "transaction_failed" | null = null;

  async readPhoto(localId: string) {
    const asset = this.assets.get(localId);
    return asset === undefined
      ? { ok: false as const, reason: "photo_not_found" as const }
      : { ok: true as const, asset: structuredClone(asset) };
  }

  private failure(): GuestDraftV3PhotoWriteResult | null {
    if (this.failNext === null) return null;
    const reason = this.failNext;
    this.failNext = null;
    return { ok: false, reason };
  }

  async addPhoto(
    input: Parameters<typeof createPreparedGuestDraftPhoto>[0],
    expectedRevision: number,
    now: string,
  ): Promise<GuestDraftV3PhotoWriteResult> {
    const failure = this.failure();
    if (failure) return failure;
    if (this.draft.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
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
    input: Parameters<typeof createPreparedGuestDraftPhoto>[0],
    expectedRevision: number,
    now: string,
  ): Promise<GuestDraftV3PhotoWriteResult> {
    const failure = this.failure();
    if (failure) return failure;
    if (this.draft.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
    if (!this.draft.photos.some(({ localId }) => localId === replacedLocalId)) return { ok: false, reason: "photo_not_found" };
    const prepared = createPreparedGuestDraftPhoto(input);
    if (!prepared.ok) return prepared;
    const updated = updateGuestDraftV3(this.draft, {
      now,
      photos: this.draft.photos.map((reference) => reference.localId === replacedLocalId ? prepared.reference : reference),
    });
    if (!updated.ok) return updated;
    this.assets.set(prepared.asset.localId, structuredClone(prepared.asset));
    this.draft = updated.draft;
    return { ok: true, draft: structuredClone(this.draft) };
  }

  async removePhoto(localId: string, expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult> {
    const failure = this.failure();
    if (failure) return failure;
    if (this.draft.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
    const updated = updateGuestDraftV3(this.draft, {
      now,
      photos: this.draft.photos.filter((reference) => reference.localId !== localId),
    });
    if (!updated.ok) return updated;
    this.draft = updated.draft;
    return { ok: true, draft: structuredClone(this.draft) };
  }

  async save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult> {
    if (this.failNext !== null) {
      const reason = this.failNext;
      this.failNext = null;
      return { ok: false, reason };
    }
    if (expectedRevision === null || this.draft.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
    this.draft = structuredClone(draft);
    return { ok: true };
  }
}

function harness(store = new GalleryMemoryStore()) {
  let snapshot = store.draft;
  let sequence = 0;
  const options = (): GuestGalleryMediaOptions => ({
    store,
    getDraft: () => snapshot,
    acceptDraft: (draft) => {
      snapshot = draft;
      store.draft = draft;
    },
    createId: () => `gallery-local-${++sequence}`,
    now: () => T1,
  });
  return { store, options, draft: () => snapshot };
}

function prepared(bytes: number[]) {
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    mimeType: "image/webp" as const,
    width: 1600,
    height: 1067,
    originalFilename: "souvenir.jpg",
    lastModified: 123,
  };
}

describe("guest Gallery local media", () => {
  it("adds sequentially, reloads blobs and persists order and 32-character captions without server references", async () => {
    const h = harness();
    await addPreparedGuestGalleryPhoto(h.options(), prepared([1]), 0);
    await addPreparedGuestGalleryPhoto(h.options(), prepared([2]), 1);
    const caption = "12345678901234567890123456789012";
    await expect(saveGuestGalleryEditorial(h.options(), [
      { localId: "gallery-local-2", caption },
      { localId: "gallery-local-1", caption: " Jardin " },
    ], 2)).resolves.toMatchObject({ status: "saved", revision: 3 });

    const reloaded = await loadGuestGalleryPhotos(h.store, structuredClone(h.draft()));
    expect(reloaded.map(({ localId, caption: value }) => [localId, value])).toEqual([
      ["gallery-local-2", caption],
      ["gallery-local-1", "Jardin"],
    ]);
    await expect(reloaded[0].blob.arrayBuffer()).resolves.toEqual(new Uint8Array([2]).buffer);
    expect(JSON.stringify(h.draft())).not.toMatch(/mediaId|memorialId/);
  });

  it("replaces in place, preserves caption and order, and retains superseded and removed blobs", async () => {
    const h = harness();
    await addPreparedGuestGalleryPhoto(h.options(), prepared([1]), 0);
    await addPreparedGuestGalleryPhoto(h.options(), prepared([2]), 1);
    await saveGuestGalleryEditorial(h.options(), [
      { localId: "gallery-local-1", caption: "Été" },
      { localId: "gallery-local-2", caption: null },
    ], 2);

    await expect(replacePreparedGuestGalleryPhoto(h.options(), "gallery-local-1", prepared([9]), 3)).resolves.toMatchObject({
      status: "saved",
      photos: [
        { localId: "gallery-local-3", caption: "Été" },
        { localId: "gallery-local-2", caption: null },
      ],
    });
    expect(h.store.assets.has("gallery-local-1")).toBe(true);
    await expect(removeGuestGalleryPhoto(h.options(), "gallery-local-2", 4)).resolves.toMatchObject({
      status: "saved",
      photos: [{ localId: "gallery-local-3" }],
    });
    expect(h.store.assets.has("gallery-local-2")).toBe(true);
  });

  it("keeps the last valid draft on quota or interrupted transaction and permits later sequential additions", async () => {
    const h = harness();
    await addPreparedGuestGalleryPhoto(h.options(), prepared([1]), 0);
    const before = structuredClone(h.draft());
    h.store.failNext = "quota_exceeded";
    await expect(addPreparedGuestGalleryPhoto(h.options(), prepared([2]), 1)).rejects.toMatchObject({ reason: "quota_exceeded" });
    expect(h.draft()).toEqual(before);
    expect(h.store.assets.size).toBe(2);

    h.store.failNext = "transaction_failed";
    await expect(replacePreparedGuestGalleryPhoto(h.options(), "gallery-local-1", prepared([3]), 1)).rejects.toMatchObject({ reason: "transaction_failed" });
    expect(h.draft()).toEqual(before);
    await expect(addPreparedGuestGalleryPhoto(h.options(), prepared([4]), 1)).resolves.toMatchObject({ status: "saved", revision: 2 });
  });

  it("blocks stale tabs for structural and editorial writes", async () => {
    const h = harness();
    await addPreparedGuestGalleryPhoto(h.options(), prepared([1]), 0);
    await expect(addPreparedGuestGalleryPhoto(h.options(), prepared([2]), 0)).resolves.toEqual({ status: "conflict" });
    await expect(saveGuestGalleryEditorial(h.options(), [{ localId: "gallery-local-1", caption: "Ancien" }], 0)).resolves.toEqual({ status: "conflict" });
    expect(h.draft().photos.filter(({ placement }) => placement.purpose === "gallery")).toEqual([
      { localId: "gallery-local-1", placement: { purpose: "gallery", caption: null } },
    ]);
  });

  it("prepares atomic A13 continue/skip writes without routing the guest runtime past postRevealPending", async () => {
    const h = harness();
    await addPreparedGuestGalleryPhoto(h.options(), prepared([1]), 0);
    await expect(resolveGuestGalleryStep(h.options(), "continue", 1)).resolves.toMatchObject({ status: "saved", revision: 2 });
    expect(readGuidedFlowState(h.draft().content).A13).toEqual({ status: "completed" });
    expect(resolveGuestBuilderStage(h.draft())).toBe("postRevealPending");

    const skipped = harness();
    await resolveGuestGalleryStep(skipped.options(), "skip", 0);
    expect(readGuidedFlowState(skipped.draft().content).A13).toEqual({ status: "skipped" });
    expect(resolveGuestBuilderStage(skipped.draft())).toBe("postRevealPending");
  });
});
