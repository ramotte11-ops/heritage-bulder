import type { DraftSaveResponse } from "@/lib/builder/draft-revision";
import { readGuidedFlowState, writeGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import { normalizeGalleryCaption } from "@/lib/memorial/gallery-content";
import type {
  LocalGalleryEditorialItem,
  LocalGalleryPhotoSnapshot,
  LocalGalleryPort,
  LocalGallerySaveResponse,
  PreparedLocalPhoto,
} from "@/lib/media/local-photo";
import {
  updateGuestDraftV3,
  type GuestDraftPhotoAsset,
  type GuestDraftPhotoReference,
  type GuestDraftV3,
  type GuestDraftV3ValidationReason,
} from "./guest-draft-v3";
import type {
  GuestDraftV3PhotoWriteResult,
  GuestDraftV3StorageErrorCode,
  GuestDraftV3WriteResult,
} from "./guest-draft-v3-store";

export type GuestGalleryMediaStore = {
  readPhoto(localId: string): Promise<
    | { ok: true; asset: GuestDraftPhotoAsset }
    | { ok: false; reason: GuestDraftV3StorageErrorCode | "photo_not_found" | "invalid_photo_asset" }
  >;
  addPhoto(
    input: {
      localId: string;
      blob: Blob;
      mimeType: PreparedLocalPhoto["mimeType"];
      width: number;
      height: number;
      originalFilename: string | null;
      lastModified: number | null;
      placement: { purpose: "gallery"; caption: string | null };
    },
    expectedRevision: number,
    now: string,
  ): Promise<GuestDraftV3PhotoWriteResult>;
  replacePhoto(
    replacedLocalId: string,
    input: {
      localId: string;
      blob: Blob;
      mimeType: PreparedLocalPhoto["mimeType"];
      width: number;
      height: number;
      originalFilename: string | null;
      lastModified: number | null;
      placement: { purpose: "gallery"; caption: string | null };
    },
    expectedRevision: number,
    now: string,
  ): Promise<GuestDraftV3PhotoWriteResult>;
  removePhoto(localId: string, expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult>;
  save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult>;
};

export class GuestGalleryMediaError extends Error {
  constructor(
    readonly reason: GuestDraftV3StorageErrorCode | GuestDraftV3ValidationReason | "photo_not_found" | "invalid_photo_asset" | "invalid_gallery_order",
  ) {
    super(`Guest Gallery persistence failed: ${reason}`);
    this.name = "GuestGalleryMediaError";
  }
}

export interface GuestGalleryMediaOptions {
  store: GuestGalleryMediaStore;
  getDraft: () => GuestDraftV3;
  acceptDraft: (draft: GuestDraftV3) => void;
  createId: () => string;
  now: () => string;
}

export function guestGalleryReferences(draft: GuestDraftV3): GuestDraftPhotoReference[] {
  return draft.photos.filter((photo) => photo.placement.purpose === "gallery");
}

function snapshot(asset: GuestDraftPhotoAsset, caption: string | null): LocalGalleryPhotoSnapshot {
  const dimensions = asset.source.dimensions;
  return {
    localId: asset.localId,
    blob: asset.blob,
    mimeType: asset.source.mimeType,
    width: dimensions.status === "known" ? dimensions.width : null,
    height: dimensions.status === "known" ? dimensions.height : null,
    caption,
  };
}

export async function loadGuestGalleryPhotos(
  store: Pick<GuestGalleryMediaStore, "readPhoto">,
  draft: GuestDraftV3,
): Promise<LocalGalleryPhotoSnapshot[]> {
  return Promise.all(guestGalleryReferences(draft).map(async (reference) => {
    if (reference.placement.purpose !== "gallery") throw new GuestGalleryMediaError("invalid_photo_asset");
    const read = await store.readPhoto(reference.localId);
    if (!read.ok) throw new GuestGalleryMediaError(read.reason);
    return snapshot(read.asset, reference.placement.caption);
  }));
}

function saved(draft: GuestDraftV3, photos?: LocalGalleryPhotoSnapshot[]): LocalGallerySaveResponse {
  return {
    status: "saved",
    updatedAt: draft.updatedAt,
    revision: draft.revision,
    ...(photos === undefined ? {} : { photos }),
  };
}

function writeFailure(result: Extract<GuestDraftV3WriteResult | GuestDraftV3PhotoWriteResult, { ok: false }>): never {
  throw new GuestGalleryMediaError(result.reason === "revision_conflict" ? "transaction_failed" : result.reason);
}

async function photoResult(
  options: GuestGalleryMediaOptions,
  result: GuestDraftV3PhotoWriteResult,
  adoptedLocalId?: string,
): Promise<LocalGallerySaveResponse> {
  if (!result.ok) {
    if (result.reason === "revision_conflict") return { status: "conflict" };
    return writeFailure(result);
  }
  options.acceptDraft(result.draft);
  const photos = await loadGuestGalleryPhotos(options.store, result.draft);
  return {
    ...saved(result.draft, photos),
    ...(adoptedLocalId === undefined ? {} : { photo: photos.find(({ localId }) => localId === adoptedLocalId) }),
  };
}

function preparedInput(photo: PreparedLocalPhoto, localId: string, caption: string | null) {
  return {
    localId,
    blob: photo.blob,
    mimeType: photo.mimeType,
    width: photo.width,
    height: photo.height,
    originalFilename: photo.originalFilename,
    lastModified: photo.lastModified,
    placement: { purpose: "gallery" as const, caption },
  };
}

export async function addPreparedGuestGalleryPhoto(
  options: GuestGalleryMediaOptions,
  photo: PreparedLocalPhoto,
  expectedRevision: number,
): Promise<LocalGallerySaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const localId = options.createId();
  return photoResult(
    options,
    await options.store.addPhoto(preparedInput(photo, localId, null), expectedRevision, options.now()),
    localId,
  );
}

export async function replacePreparedGuestGalleryPhoto(
  options: GuestGalleryMediaOptions,
  replacedLocalId: string,
  photo: PreparedLocalPhoto,
  expectedRevision: number,
): Promise<LocalGallerySaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const reference = guestGalleryReferences(current).find(({ localId }) => localId === replacedLocalId);
  if (reference === undefined || reference.placement.purpose !== "gallery") throw new GuestGalleryMediaError("photo_not_found");
  const localId = options.createId();
  return photoResult(
    options,
    await options.store.replacePhoto(
      replacedLocalId,
      preparedInput(photo, localId, reference.placement.caption),
      expectedRevision,
      options.now(),
    ),
    localId,
  );
}

export async function removeGuestGalleryPhoto(
  options: GuestGalleryMediaOptions,
  localId: string,
  expectedRevision: number,
): Promise<LocalGallerySaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  if (!guestGalleryReferences(current).some((photo) => photo.localId === localId)) {
    throw new GuestGalleryMediaError("photo_not_found");
  }
  return photoResult(options, await options.store.removePhoto(localId, expectedRevision, options.now()));
}

function normalizedEditorial(
  current: readonly GuestDraftPhotoReference[],
  items: readonly LocalGalleryEditorialItem[],
): LocalGalleryEditorialItem[] | null {
  if (items.length !== current.length) return null;
  const expected = new Set(current.map(({ localId }) => localId));
  if (new Set(items.map(({ localId }) => localId)).size !== items.length) return null;
  const normalized: LocalGalleryEditorialItem[] = [];
  for (const item of items) {
    if (!expected.has(item.localId)) return null;
    const caption = normalizeGalleryCaption(item.caption);
    if (!caption.ok) return null;
    normalized.push({ localId: item.localId, caption: caption.caption });
  }
  return normalized;
}

export async function saveGuestGalleryEditorial(
  options: GuestGalleryMediaOptions,
  items: readonly LocalGalleryEditorialItem[],
  expectedRevision: number,
): Promise<LocalGallerySaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const references = guestGalleryReferences(current);
  const normalized = normalizedEditorial(references, items);
  if (normalized === null) throw new GuestGalleryMediaError("invalid_gallery_order");

  let galleryIndex = 0;
  const photos = current.photos.map((reference) => {
    if (reference.placement.purpose !== "gallery") return reference;
    const item = normalized[galleryIndex++];
    return { localId: item.localId, placement: { purpose: "gallery" as const, caption: item.caption } };
  });
  const updated = updateGuestDraftV3(current, { now: options.now(), photos });
  if (!updated.ok) throw new GuestGalleryMediaError(updated.reason);
  const result = await options.store.save(updated.draft, expectedRevision);
  if (!result.ok) {
    if (result.reason === "revision_conflict") return { status: "conflict" };
    return writeFailure(result);
  }
  options.acceptDraft(updated.draft);
  return saved(updated.draft, await loadGuestGalleryPhotos(options.store, updated.draft));
}

export async function resolveGuestGalleryStep(
  options: GuestGalleryMediaOptions,
  action: "continue" | "skip",
  expectedRevision: number,
): Promise<DraftSaveResponse> {
  const current = options.getDraft();
  if (current.revision !== expectedRevision) return { status: "conflict" };
  const status = action === "skip" || guestGalleryReferences(current).length === 0 ? "skipped" : "completed";
  const content = writeGuidedFlowState(current.content, {
    ...readGuidedFlowState(current.content),
    A13: { status },
  });
  const updated = updateGuestDraftV3(current, { now: options.now(), content });
  if (!updated.ok) throw new GuestGalleryMediaError(updated.reason);
  const result = await options.store.save(updated.draft, expectedRevision);
  if (!result.ok) {
    if (result.reason === "revision_conflict") return { status: "conflict" };
    return writeFailure(result);
  }
  options.acceptDraft(updated.draft);
  return { status: "saved", updatedAt: updated.draft.updatedAt, revision: updated.draft.revision };
}

/** Builds the narrow, network-free port consumed by the existing A13 workshop. */
export function createGuestGalleryPort(
  options: GuestGalleryMediaOptions,
  initialPhotos: LocalGalleryPhotoSnapshot[],
): LocalGalleryPort {
  return {
    initialPhotos,
    addPreparedPhoto: (photo, expectedRevision) =>
      addPreparedGuestGalleryPhoto(options, photo, expectedRevision),
    replacePreparedPhoto: (localId, photo, expectedRevision) =>
      replacePreparedGuestGalleryPhoto(options, localId, photo, expectedRevision),
    removePhoto: (localId, expectedRevision) =>
      removeGuestGalleryPhoto(options, localId, expectedRevision),
    saveEditorial: (items, expectedRevision) =>
      saveGuestGalleryEditorial(options, items, expectedRevision),
    resolveStep: (action, expectedRevision) =>
      resolveGuestGalleryStep(options, action, expectedRevision),
  };
}
