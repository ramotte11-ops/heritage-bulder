import { isLanguage, type Language } from "@/config/languages";
import { ALLOWED_IMAGE_MIME_TYPES, type AllowedImageMimeType, type MediaPurpose } from "@/config/media";
import { SKIN_VARIANTS, type SkinVariant } from "@/config/skins";
import { GALLERY_CAPTION_MAX_CHARACTERS, normalizeGalleryCaption } from "@/lib/memorial/gallery-content";
import type { HeroCrop } from "@/types/hero";
import type { MemorialContent } from "@/types/memorial";
import {
  migrateGuestDraftV1ToV2,
  validateGuestDraft as validateGuestDraftV2,
  type GuestDraftPhoto as GuestDraftPhotoV2,
  type GuestDraftTransferCheckpoint,
  type GuestDraftV1,
  type GuestDraftV2,
} from "./guest-draft";

export const GUEST_DRAFT_SCHEMA_VERSION = 3 as const;

export type GuestDraftPhotoPlacement = GuestDraftPhotoV2["placement"];

/** V3 keeps only the stable reference and its editorial placement in the draft row. */
export interface GuestDraftPhotoReference {
  localId: string;
  placement: GuestDraftPhotoPlacement;
}

export type GuestDraftPhotoBlobRole = "prepared_high_quality" | "legacy_unspecified";

export type GuestDraftPhotoDimensions =
  | { status: "known"; width: number; height: number }
  | { status: "unknown"; reason: "legacy_unmeasured" };

export interface GuestDraftPhotoAssetSource {
  blobRole: GuestDraftPhotoBlobRole;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  dimensions: GuestDraftPhotoDimensions;
  originalFilename: string | null;
  lastModified: number | null;
}

/** Stored in IndexedDB's media store, never in the V3 draft metadata row. */
export interface GuestDraftPhotoAsset {
  localId: string;
  source: GuestDraftPhotoAssetSource;
  blob: Blob;
}

export interface PreparedGuestDraftPhotoInput {
  localId: string;
  blob: Blob;
  mimeType: AllowedImageMimeType;
  width: number;
  height: number;
  originalFilename: string | null;
  lastModified: number | null;
  placement: GuestDraftPhotoPlacement;
}

export interface GuestDraftV3 {
  schemaVersion: typeof GUEST_DRAFT_SCHEMA_VERSION;
  draftId: string;
  transferKey: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  language: Language | null;
  skinVariant: SkinVariant | null;
  transfer: GuestDraftTransferCheckpoint;
  content: MemorialContent;
  /** Array order remains the family's Gallery order. */
  photos: GuestDraftPhotoReference[];
}

export interface CreateGuestDraftV3Input {
  draftId: string;
  transferKey: string;
  now: string;
  language?: Language | null;
  skinVariant?: SkinVariant | null;
  content?: MemorialContent;
}

export interface UpdateGuestDraftV3Input {
  now: string;
  language?: Language | null;
  skinVariant?: SkinVariant | null;
  transfer?: GuestDraftTransferCheckpoint;
  content?: MemorialContent;
  photos?: GuestDraftPhotoReference[];
}

export type GuestDraftV3ValidationReason =
  | "not_an_object"
  | "unknown_schema_version"
  | "invalid_identity"
  | "invalid_revision"
  | "invalid_timestamp"
  | "invalid_configuration"
  | "invalid_transfer_checkpoint"
  | "invalid_content"
  | "server_media_reference"
  | "invalid_photo"
  | "invalid_photo_asset"
  | "missing_photo_asset"
  | "duplicate_photo"
  | "multiple_hero_photos";

export type GuestDraftV3ValidationResult =
  | { ok: true; draft: GuestDraftV3 }
  | { ok: false; reason: GuestDraftV3ValidationReason; foundVersion?: number };

export interface GuestDraftV3Migration {
  draft: GuestDraftV3;
  assets: GuestDraftPhotoAsset[];
}

export interface GuestDraftTransferBundleV3 {
  schemaVersion: typeof GUEST_DRAFT_SCHEMA_VERSION;
  guestDraftId: string;
  idempotencyKey: string;
  sourceRevision: number;
  language: Language | null;
  skinVariant: SkinVariant | null;
  content: MemorialContent;
  photos: Array<{
    localPhotoId: string;
    purpose: MediaPurpose;
    blobRole: GuestDraftPhotoBlobRole;
    blob: Blob;
    mimeType: AllowedImageMimeType;
    sizeBytes: number;
    dimensions: GuestDraftPhotoDimensions;
    originalFilename: string | null;
    lastModified: number | null;
    crop: HeroCrop | null;
    caption: string | null;
  }>;
}

const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);
const ALLOWED_SKIN_VARIANTS = new Set<string>(SKIN_VARIANTS);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, seen))
    : isPlainObject(value) && Object.values(value).every((entry) => isJsonValue(entry, seen));
  seen.delete(value);
  return valid;
}

function containsServerMediaReference(content: MemorialContent): boolean {
  const hero = (content as Record<string, unknown>).hero;
  if (isPlainObject(hero) && hero.photo !== undefined && hero.photo !== null) return true;
  const gallery = (content as Record<string, unknown>).gallery;
  if (!isPlainObject(gallery) || gallery.items === undefined) return false;
  return !Array.isArray(gallery.items) || gallery.items.length > 0;
}

function isCrop(value: unknown): value is HeroCrop {
  return isPlainObject(value)
    && Number.isFinite(value.focalX) && (value.focalX as number) >= 0 && (value.focalX as number) <= 1
    && Number.isFinite(value.focalY) && (value.focalY as number) >= 0 && (value.focalY as number) <= 1
    && Number.isFinite(value.zoom) && (value.zoom as number) >= 1;
}

function isPlacement(value: unknown): value is GuestDraftPhotoPlacement {
  if (!isPlainObject(value)) return false;
  if (value.purpose === "hero") return value.crop === null || isCrop(value.crop);
  if (value.purpose !== "gallery") return false;
  const caption = normalizeGalleryCaption(value.caption);
  return caption.ok && caption.caption === value.caption
    && (caption.caption === null || [...caption.caption].length <= GALLERY_CAPTION_MAX_CHARACTERS);
}

function isTransferCheckpoint(value: unknown, revision: number): value is GuestDraftTransferCheckpoint {
  if (!isPlainObject(value)) return false;
  if (value.status === "not_started") return Object.keys(value).length === 1;
  return value.status === "pending"
    && Number.isSafeInteger(value.sourceRevision)
    && (value.sourceRevision as number) >= 0
    && (value.sourceRevision as number) <= revision
    && isIsoTimestamp(value.startedAt)
    && Object.keys(value).length === 3;
}

function isPhotoReference(value: unknown): value is GuestDraftPhotoReference {
  return isPlainObject(value) && isNonEmptyString(value.localId) && isPlacement(value.placement);
}

export function validateGuestDraftV3(value: unknown): GuestDraftV3ValidationResult {
  if (!isPlainObject(value)) return { ok: false, reason: "not_an_object" };
  if (value.schemaVersion !== GUEST_DRAFT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unknown_schema_version",
      ...(typeof value.schemaVersion === "number" ? { foundVersion: value.schemaVersion } : {}),
    };
  }
  if (!isNonEmptyString(value.draftId) || !isNonEmptyString(value.transferKey)) return { ok: false, reason: "invalid_identity" };
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return { ok: false, reason: "invalid_revision" };
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) return { ok: false, reason: "invalid_timestamp" };
  if (!isPlainObject(value.content) || !isJsonValue(value.content)) return { ok: false, reason: "invalid_content" };
  if (containsServerMediaReference(value.content as MemorialContent)) return { ok: false, reason: "server_media_reference" };
  if (value.language !== null && (typeof value.language !== "string" || !isLanguage(value.language))) return { ok: false, reason: "invalid_configuration" };
  if (value.skinVariant !== null && (typeof value.skinVariant !== "string" || !ALLOWED_SKIN_VARIANTS.has(value.skinVariant))) return { ok: false, reason: "invalid_configuration" };
  if (!isTransferCheckpoint(value.transfer, value.revision as number)) return { ok: false, reason: "invalid_transfer_checkpoint" };
  if (!Array.isArray(value.photos) || !value.photos.every(isPhotoReference)) return { ok: false, reason: "invalid_photo" };
  const photos = value.photos as GuestDraftPhotoReference[];
  if (new Set(photos.map(({ localId }) => localId)).size !== photos.length) return { ok: false, reason: "duplicate_photo" };
  if (photos.filter(({ placement }) => placement.purpose === "hero").length > 1) return { ok: false, reason: "multiple_hero_photos" };
  return { ok: true, draft: value as unknown as GuestDraftV3 };
}

export function validateGuestDraftPhotoAsset(value: unknown): value is GuestDraftPhotoAsset {
  if (!isPlainObject(value) || !isNonEmptyString(value.localId) || !(value.blob instanceof Blob)) return false;
  if (!isPlainObject(value.source)) return false;
  if (value.source.blobRole !== "prepared_high_quality" && value.source.blobRole !== "legacy_unspecified") return false;
  if (!ALLOWED_MIME_TYPES.has(String(value.source.mimeType))) return false;
  if (value.blob.type !== value.source.mimeType || value.blob.size === 0 || value.source.sizeBytes !== value.blob.size) return false;
  if (value.source.originalFilename !== null && typeof value.source.originalFilename !== "string") return false;
  if (value.source.lastModified !== null && (!Number.isInteger(value.source.lastModified) || (value.source.lastModified as number) < 0)) return false;
  if (!isPlainObject(value.source.dimensions)) return false;
  if (value.source.dimensions.status === "unknown") return value.source.dimensions.reason === "legacy_unmeasured";
  return value.source.dimensions.status === "known"
    && Number.isSafeInteger(value.source.dimensions.width) && (value.source.dimensions.width as number) > 0
    && Number.isSafeInteger(value.source.dimensions.height) && (value.source.dimensions.height as number) > 0;
}

export function createPreparedGuestDraftPhoto(input: PreparedGuestDraftPhotoInput):
  | { ok: true; reference: GuestDraftPhotoReference; asset: GuestDraftPhotoAsset }
  | { ok: false; reason: GuestDraftV3ValidationReason } {
  const reference: GuestDraftPhotoReference = { localId: input.localId, placement: structuredClone(input.placement) };
  const asset: GuestDraftPhotoAsset = {
    localId: input.localId,
    source: {
      blobRole: "prepared_high_quality",
      mimeType: input.mimeType,
      sizeBytes: input.blob.size,
      dimensions: { status: "known", width: input.width, height: input.height },
      originalFilename: input.originalFilename,
      lastModified: input.lastModified,
    },
    blob: input.blob,
  };
  if (!isPhotoReference(reference) || !validateGuestDraftPhotoAsset(asset)) return { ok: false, reason: "invalid_photo_asset" };
  return { ok: true, reference, asset };
}

export function createGuestDraftV3(input: CreateGuestDraftV3Input): GuestDraftV3ValidationResult {
  return validateGuestDraftV3({
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    draftId: input.draftId,
    transferKey: input.transferKey,
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
    language: input.language ?? null,
    skinVariant: input.skinVariant ?? null,
    transfer: { status: "not_started" },
    content: input.content ?? {},
    photos: [],
  });
}

export function updateGuestDraftV3(current: GuestDraftV3, input: UpdateGuestDraftV3Input): GuestDraftV3ValidationResult {
  return validateGuestDraftV3({
    ...current,
    revision: current.revision + 1,
    updatedAt: input.now,
    language: input.language === undefined ? current.language : input.language,
    skinVariant: input.skinVariant === undefined ? current.skinVariant : input.skinVariant,
    transfer: input.transfer ?? current.transfer,
    content: input.content ?? current.content,
    photos: input.photos ?? current.photos,
  });
}

export function migrateGuestDraftV2ToV3(previous: GuestDraftV2):
  | { ok: true; migration: GuestDraftV3Migration }
  | { ok: false; reason: GuestDraftV3ValidationReason } {
  const checked = validateGuestDraftV2(previous);
  if (!checked.ok) return { ok: false, reason: checked.reason === "unknown_schema_version" ? "unknown_schema_version" : checked.reason };
  const assets: GuestDraftPhotoAsset[] = previous.photos.map((photo) => ({
    localId: photo.localId,
    source: {
      blobRole: "legacy_unspecified",
      mimeType: photo.source.mimeType,
      sizeBytes: photo.source.blob.size,
      dimensions: { status: "unknown", reason: "legacy_unmeasured" },
      originalFilename: photo.source.originalFilename,
      lastModified: photo.source.lastModified,
    },
    blob: photo.source.blob,
  }));
  if (!assets.every(validateGuestDraftPhotoAsset)) return { ok: false, reason: "invalid_photo_asset" };
  const draft = validateGuestDraftV3({
    ...structuredClone(previous),
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    photos: previous.photos.map(({ localId, placement }) => ({ localId, placement: structuredClone(placement) })),
  });
  return draft.ok ? { ok: true, migration: { draft: draft.draft, assets } } : draft;
}

export function migrateGuestDraftV1ToV3(legacy: GuestDraftV1):
  | { ok: true; migration: GuestDraftV3Migration }
  | { ok: false; reason: GuestDraftV3ValidationReason } {
  const v2 = migrateGuestDraftV1ToV2(legacy);
  if (!v2.ok) return { ok: false, reason: v2.reason === "unknown_schema_version" ? "unknown_schema_version" : v2.reason };
  return migrateGuestDraftV2ToV3(v2.draft);
}

export function prepareGuestDraftTransferV3(draft: GuestDraftV3, assets: readonly GuestDraftPhotoAsset[]): GuestDraftTransferBundleV3 {
  const byId = new Map(assets.map((asset) => [asset.localId, asset]));
  return {
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    guestDraftId: draft.draftId,
    idempotencyKey: draft.transferKey,
    sourceRevision: draft.revision,
    language: draft.language,
    skinVariant: draft.skinVariant,
    content: structuredClone(draft.content),
    photos: draft.photos.map((photo) => {
      const asset = byId.get(photo.localId);
      if (asset === undefined || !validateGuestDraftPhotoAsset(asset)) throw new Error(`Missing local photo asset: ${photo.localId}`);
      return {
        localPhotoId: photo.localId,
        purpose: photo.placement.purpose,
        blobRole: asset.source.blobRole,
        blob: asset.blob,
        mimeType: asset.source.mimeType,
        sizeBytes: asset.source.sizeBytes,
        dimensions: structuredClone(asset.source.dimensions),
        originalFilename: asset.source.originalFilename,
        lastModified: asset.source.lastModified,
        crop: photo.placement.purpose === "hero" ? structuredClone(photo.placement.crop) : null,
        caption: photo.placement.purpose === "gallery" ? photo.placement.caption : null,
      };
    }),
  };
}
