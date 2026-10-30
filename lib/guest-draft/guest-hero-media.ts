import type { AllowedImageMimeType } from "@/config/media";
import type { SkinVariant } from "@/config/skins";
import type { DraftSaveResponse } from "@/lib/builder/draft-revision";
import { guidedFlowProgress } from "@/lib/builder/guided-flow/engine";
import { readGuidedFlowState, resolveHeroFlowState } from "@/lib/builder/guided-flow/hero-step";
import { humanFlowDefinition } from "@/lib/builder/guided-flow/human-steps";
import { writeGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import type { LocalPhotoSnapshot, PreparedLocalPhoto } from "@/lib/media/local-photo";
import { readHero } from "@/lib/memorial/hero";
import type { HeroCrop } from "@/types/hero";
import { updateGuestDraftV3, type GuestDraftPhotoAsset, type GuestDraftV3 } from "./guest-draft-v3";
import type { GuestDraftV3PhotoWriteResult, GuestDraftV3Store, GuestDraftV3WriteResult } from "./guest-draft-v3-store";

export type GuestHeroMediaStore = Pick<
  GuestDraftV3Store,
  "readPhoto" | "addPhoto" | "replacePhoto" | "updatePhotoPlacement" | "save"
>;

export class GuestHeroMediaError extends Error {
  constructor(readonly reason: string) {
    super(`Guest Hero media operation failed: ${reason}`);
    this.name = "GuestHeroMediaError";
  }
}

export interface GuestHeroMediaOptions {
  store: GuestHeroMediaStore;
  getDraft(): GuestDraftV3;
  acceptDraft(draft: GuestDraftV3): void;
  createId(): string;
  now(): string;
}

export function findGuestHeroReference(draft: GuestDraftV3) {
  return draft.photos.find(({ placement }) => placement.purpose === "hero") ?? null;
}

export function isGuestHeroPhotoComplete(draft: GuestDraftV3): boolean {
  return findGuestHeroReference(draft) !== null && readGuidedFlowState(draft.content).T06?.status === "completed";
}

export function isGuestHeroCropComplete(draft: GuestDraftV3): boolean {
  const hero = findGuestHeroReference(draft);
  return hero?.placement.purpose === "hero"
    && hero.placement.crop !== null
    && readGuidedFlowState(draft.content).T07?.status === "completed";
}

export function isGuestHeroRevealComplete(draft: GuestDraftV3): boolean {
  return draft.skinVariant !== null
    && isGuestHeroCropComplete(draft)
    && readGuidedFlowState(draft.content).T08?.status === "completed";
}

/** The route's own Hero flow state (`resolveHeroFlowState`: T03/T04
 * derived from the Hero content), with only T06-T08 read from the local
 * Hero contract — QG 005-B: the same progress the authenticated route
 * shows for the same answers. */
export function guestHeroStepProgress(draft: GuestDraftV3): number {
  const flow = resolveHeroFlowState(draft.content, readHero(draft.content));
  if (isGuestHeroPhotoComplete(draft)) flow.T06 = { status: "completed" };
  else delete flow.T06;
  if (isGuestHeroCropComplete(draft)) flow.T07 = { status: "completed" };
  else delete flow.T07;
  if (isGuestHeroRevealComplete(draft)) flow.T08 = { status: "completed" };
  else delete flow.T08;
  return guidedFlowProgress(humanFlowDefinition(), flow);
}

function snapshot(asset: GuestDraftPhotoAsset, crop: HeroCrop | null): LocalPhotoSnapshot {
  if (asset.source.dimensions.status !== "known") throw new GuestHeroMediaError("unknown_dimensions");
  return {
    localId: asset.localId,
    blob: asset.blob,
    mimeType: asset.source.mimeType,
    width: asset.source.dimensions.width,
    height: asset.source.dimensions.height,
    crop,
  };
}

export async function loadGuestHeroPhoto(
  store: GuestHeroMediaStore,
  draft: GuestDraftV3,
): Promise<LocalPhotoSnapshot | null> {
  const reference = findGuestHeroReference(draft);
  if (reference === null || reference.placement.purpose !== "hero") return null;
  const read = await store.readPhoto(reference.localId);
  if (!read.ok) throw new GuestHeroMediaError(read.reason);
  return snapshot(read.asset, reference.placement.crop);
}

function savedResponse(draft: GuestDraftV3): DraftSaveResponse {
  return { status: "saved", updatedAt: draft.updatedAt, revision: draft.revision };
}

function photoFailure(result: Extract<GuestDraftV3PhotoWriteResult, { ok: false }>): DraftSaveResponse {
  if (result.reason === "revision_conflict") return { status: "conflict" };
  throw new GuestHeroMediaError(result.reason);
}

function draftFailure(result: Extract<GuestDraftV3WriteResult, { ok: false }>): DraftSaveResponse {
  if (result.reason === "revision_conflict") return { status: "conflict" };
  throw new GuestHeroMediaError(result.reason);
}

export async function savePreparedGuestHeroPhoto(
  options: GuestHeroMediaOptions,
  prepared: PreparedLocalPhoto,
  expectedRevision: number,
): Promise<DraftSaveResponse & { photo?: LocalPhotoSnapshot }> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const previous = findGuestHeroReference(current);
  const localId = options.createId();
  const media = {
    localId,
    blob: prepared.blob,
    mimeType: prepared.mimeType,
    width: prepared.width,
    height: prepared.height,
    originalFilename: prepared.originalFilename,
    lastModified: prepared.lastModified,
  };
  const result = previous === null
    ? await options.store.addPhoto({ ...media, placement: { purpose: "hero", crop: null } }, expectedRevision, options.now())
    : await options.store.replacePhoto(previous.localId, {
        ...media,
        placement: { purpose: "hero", crop: null },
      }, expectedRevision, options.now());
  if (!result.ok) return photoFailure(result);
  options.acceptDraft(result.draft);
  return {
    ...savedResponse(result.draft),
    photo: {
      localId,
      blob: prepared.blob,
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      crop: null,
    },
  };
}

async function saveDraftUpdate(
  options: GuestHeroMediaOptions,
  expectedRevision: number,
  update: (draft: GuestDraftV3) => GuestDraftV3 | null,
): Promise<DraftSaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const next = update(current);
  if (next === null) throw new GuestHeroMediaError("invalid_photo");
  const result = await options.store.save(next, expectedRevision);
  if (!result.ok) return draftFailure(result);
  options.acceptDraft(next);
  return savedResponse(next);
}

function updateFlowAndCrop(
  draft: GuestDraftV3,
  now: string,
  step: "T06" | "T07",
  crop?: HeroCrop,
): GuestDraftV3 | null {
  const hero = findGuestHeroReference(draft);
  if (hero === null || hero.placement.purpose !== "hero") return null;
  const content = writeGuidedFlowState(draft.content, {
    ...readGuidedFlowState(draft.content),
    [step]: { status: "completed" },
  });
  const updated = updateGuestDraftV3(draft, {
    now,
    content,
    photos: crop === undefined
      ? draft.photos
      : draft.photos.map((photo) => photo.localId === hero.localId
          ? { localId: photo.localId, placement: { purpose: "hero", crop } }
          : photo),
  });
  return updated.ok ? updated.draft : null;
}

export function completeGuestHeroPhoto(options: GuestHeroMediaOptions, expectedRevision: number) {
  return saveDraftUpdate(options, expectedRevision, (draft) => updateFlowAndCrop(draft, options.now(), "T06"));
}

export async function saveGuestHeroCrop(
  options: GuestHeroMediaOptions,
  crop: HeroCrop,
  expectedRevision: number,
): Promise<DraftSaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const hero = findGuestHeroReference(current);
  if (hero === null) throw new GuestHeroMediaError("photo_not_found");
  const result = await options.store.updatePhotoPlacement(
    hero.localId,
    { purpose: "hero", crop },
    expectedRevision,
    options.now(),
  );
  if (!result.ok) return photoFailure(result);
  options.acceptDraft(result.draft);
  return savedResponse(result.draft);
}

export function completeGuestHeroCrop(options: GuestHeroMediaOptions, crop: HeroCrop, expectedRevision: number) {
  return saveDraftUpdate(options, expectedRevision, (draft) => updateFlowAndCrop(draft, options.now(), "T07", crop));
}

export function completeGuestHeroReveal(
  options: GuestHeroMediaOptions,
  skinVariant: SkinVariant,
  expectedRevision: number,
) {
  return saveDraftUpdate(options, expectedRevision, (draft) => {
    if (!isGuestHeroCropComplete(draft)) return null;
    const content = writeGuidedFlowState(draft.content, {
      ...readGuidedFlowState(draft.content),
      T08: { status: "completed" },
    });
    const updated = updateGuestDraftV3(draft, {
      now: options.now(),
      skinVariant,
      content,
    });
    return updated.ok ? updated.draft : null;
  });
}

export function reopenGuestHeroPhoto(options: GuestHeroMediaOptions, expectedRevision: number) {
  return saveDraftUpdate(options, expectedRevision, (draft) => {
    const flow = readGuidedFlowState(draft.content);
    delete flow.T06;
    const updated = updateGuestDraftV3(draft, {
      now: options.now(),
      content: writeGuidedFlowState(draft.content, flow),
    });
    return updated.ok ? updated.draft : null;
  });
}

/** Compile-time guard: guest prepared media only admits the repository image allowlist. */
export type GuestHeroPreparedMimeType = AllowedImageMimeType;
