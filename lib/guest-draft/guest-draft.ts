import { isLanguage, type Language } from "@/config/languages";
import type { AllowedImageMimeType, MediaPurpose } from "@/config/media";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/config/media";
import { SKIN_VARIANTS, type SkinVariant } from "@/config/skins";
import { GALLERY_CAPTION_MAX_CHARACTERS, normalizeGalleryCaption } from "@/lib/memorial/gallery-content";
import type { HeroCrop } from "@/types/hero";
import type { MemorialContent } from "@/types/memorial";

/**
 * Local guest drafts deliberately have their own schema version. This is
 * unrelated to IndexedDB's physical database version and to a server draft's
 * optimistic-concurrency revision.
 */
export const LEGACY_GUEST_DRAFT_SCHEMA_VERSION = 1 as const;
export const GUEST_DRAFT_SCHEMA_VERSION = 2 as const;

export interface GuestDraftPhotoSource {
  blob: Blob;
  mimeType: AllowedImageMimeType;
  originalFilename: string | null;
  lastModified: number | null;
}

export type GuestDraftPhotoPlacement =
  | { purpose: "hero"; crop: HeroCrop | null }
  | { purpose: "gallery"; caption: string | null };

/**
 * A browser-local photograph. `localId` is intentionally not a media id:
 * there is no Supabase media row before authentication and upload.
 * Gallery array order is the family's chosen order.
 */
export interface GuestDraftPhoto {
  localId: string;
  source: GuestDraftPhotoSource;
  placement: GuestDraftPhotoPlacement;
}

interface GuestDraftCore {
  draftId: string;
  /** Stable future server idempotency key. It is persisted, never regenerated on a retry. */
  transferKey: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /**
   * The canonical Guided Builder JSON content, including `guidedFlow`.
   * Guest photographs stay in `photos`; this content must not contain a
   * Hero/Gallery server media reference.
   */
  content: MemorialContent;
  photos: GuestDraftPhoto[];
}

/** Exact persisted shape of Lot 1, retained solely for lossless migration. */
export interface GuestDraftV1 extends GuestDraftCore {
  schemaVersion: typeof LEGACY_GUEST_DRAFT_SCHEMA_VERSION;
}

/**
 * Minimal local checkpoint for a future idempotent hand-off. It deliberately
 * records no memorial id and no server media id. A future transfer can look up
 * server-side progress with `transferKey`; `sourceRevision` identifies the
 * immutable local snapshot that attempt started from.
 */
export type GuestDraftTransferCheckpoint =
  | { status: "not_started" }
  | { status: "pending"; sourceRevision: number; startedAt: string };

export interface GuestDraftV2 extends GuestDraftCore {
  schemaVersion: typeof GUEST_DRAFT_SCHEMA_VERSION;
  /** `null` means the family has not made (or V1 did not record) this choice. */
  language: Language | null;
  /** `null` means the family has not made (or V1 did not record) this choice. */
  skinVariant: SkinVariant | null;
  transfer: GuestDraftTransferCheckpoint;
}

export interface CreateGuestDraftInput {
  draftId: string;
  transferKey: string;
  now: string;
  language?: Language | null;
  skinVariant?: SkinVariant | null;
  content?: MemorialContent;
  photos?: GuestDraftPhoto[];
}

export interface UpdateGuestDraftInput {
  now: string;
  language?: Language | null;
  skinVariant?: SkinVariant | null;
  transfer?: GuestDraftTransferCheckpoint;
  content?: MemorialContent;
  photos?: GuestDraftPhoto[];
}

export type GuestDraftValidationReason =
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
  | "duplicate_photo"
  | "multiple_hero_photos";

export type GuestDraftValidationResult =
  | { ok: true; draft: GuestDraftV2 }
  | { ok: false; reason: GuestDraftValidationReason; foundVersion?: number };

export type GuestDraftV1ValidationResult =
  | { ok: true; draft: GuestDraftV1 }
  | { ok: false; reason: GuestDraftValidationReason; foundVersion?: number };

export interface GuestDraftTransferBundle {
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
    blob: Blob;
    mimeType: AllowedImageMimeType;
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
  if (!isPlainObject(value)) return false;
  if (!Number.isFinite(value.focalX) || !Number.isFinite(value.focalY) || !Number.isFinite(value.zoom)) return false;
  return (value.focalX as number) >= 0 && (value.focalX as number) <= 1
    && (value.focalY as number) >= 0 && (value.focalY as number) <= 1
    && (value.zoom as number) >= 1;
}

function isPhoto(value: unknown): value is GuestDraftPhoto {
  if (!isPlainObject(value) || !isNonEmptyString(value.localId)) return false;
  if (!isPlainObject(value.source) || !(value.source.blob instanceof Blob)) return false;
  if (!ALLOWED_MIME_TYPES.has(String(value.source.mimeType))) return false;
  if (value.source.blob.type !== value.source.mimeType || value.source.blob.size === 0) return false;
  if (value.source.originalFilename !== null && typeof value.source.originalFilename !== "string") return false;
  if (value.source.lastModified !== null && (!Number.isInteger(value.source.lastModified) || (value.source.lastModified as number) < 0)) return false;
  if (!isPlainObject(value.placement)) return false;

  if (value.placement.purpose === "hero") {
    return value.placement.crop === null || isCrop(value.placement.crop);
  }
  if (value.placement.purpose !== "gallery") return false;
  const caption = normalizeGalleryCaption(value.placement.caption);
  return caption.ok && caption.caption === value.placement.caption
    && (caption.caption === null || [...caption.caption].length <= GALLERY_CAPTION_MAX_CHARACTERS);
}

function validateCore(value: Record<string, unknown>): GuestDraftValidationReason | null {
  if (!isNonEmptyString(value.draftId) || !isNonEmptyString(value.transferKey)) {
    return "invalid_identity";
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    return "invalid_revision";
  }
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    return "invalid_timestamp";
  }
  if (!isPlainObject(value.content) || !isJsonValue(value.content)) {
    return "invalid_content";
  }
  if (containsServerMediaReference(value.content as MemorialContent)) {
    return "server_media_reference";
  }
  if (!Array.isArray(value.photos) || !value.photos.every(isPhoto)) {
    return "invalid_photo";
  }
  const photos = value.photos as GuestDraftPhoto[];
  const localIds = photos.map((photo) => photo.localId);
  if (new Set(localIds).size !== localIds.length) return "duplicate_photo";
  if (photos.filter((photo) => photo.placement.purpose === "hero").length > 1) {
    return "multiple_hero_photos";
  }
  return null;
}

function validateVersion(
  value: unknown,
  expected: number,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: GuestDraftValidationReason; foundVersion?: number } {
  if (!isPlainObject(value)) return { ok: false, reason: "not_an_object" };
  if (value.schemaVersion !== expected) {
    return {
      ok: false,
      reason: "unknown_schema_version",
      ...(typeof value.schemaVersion === "number" ? { foundVersion: value.schemaVersion } : {}),
    };
  }
  return { ok: true, value };
}

/** Defensive parser for a legacy V1 record read from browser storage. */
export function validateGuestDraftV1(value: unknown): GuestDraftV1ValidationResult {
  const versioned = validateVersion(value, LEGACY_GUEST_DRAFT_SCHEMA_VERSION);
  if (!versioned.ok) return versioned;
  const reason = validateCore(versioned.value);
  return reason === null
    ? { ok: true, draft: versioned.value as unknown as GuestDraftV1 }
    : { ok: false, reason };
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

/** Defensive parser for the current V2 record read from browser storage. */
export function validateGuestDraft(value: unknown): GuestDraftValidationResult {
  const versioned = validateVersion(value, GUEST_DRAFT_SCHEMA_VERSION);
  if (!versioned.ok) return versioned;
  const candidate = versioned.value;
  const reason = validateCore(candidate);
  if (reason !== null) return { ok: false, reason };
  if (
    candidate.language !== null
    && (typeof candidate.language !== "string" || !isLanguage(candidate.language))
  ) {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (
    candidate.skinVariant !== null
    && (typeof candidate.skinVariant !== "string" || !ALLOWED_SKIN_VARIANTS.has(candidate.skinVariant))
  ) {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (!isTransferCheckpoint(candidate.transfer, candidate.revision as number)) {
    return { ok: false, reason: "invalid_transfer_checkpoint" };
  }
  return { ok: true, draft: candidate as unknown as GuestDraftV2 };
}

export function createGuestDraft(input: CreateGuestDraftInput): GuestDraftValidationResult {
  return validateGuestDraft({
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
    photos: input.photos ?? [],
  });
}

export function updateGuestDraft(current: GuestDraftV2, input: UpdateGuestDraftInput): GuestDraftValidationResult {
  return validateGuestDraft({
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

/** Pure, lossless V1 -> V2 migration. No storage is touched here. */
export function migrateGuestDraftV1ToV2(legacy: GuestDraftV1): GuestDraftValidationResult {
  return validateGuestDraft({
    ...structuredClone(legacy),
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    // V1 never recorded these choices. `null` preserves that fact instead
    // of inventing a language or an artistic ambiance during migration.
    language: null,
    skinVariant: null,
    transfer: { status: "not_started" },
  });
}

/**
 * Pure future hand-off contract. Producing the bundle performs no upload,
 * authentication, fetch, Supabase call or local deletion.
 */
export function prepareGuestDraftTransfer(draft: GuestDraftV2): GuestDraftTransferBundle {
  return {
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    guestDraftId: draft.draftId,
    idempotencyKey: draft.transferKey,
    sourceRevision: draft.revision,
    language: draft.language,
    skinVariant: draft.skinVariant,
    content: structuredClone(draft.content),
    photos: draft.photos.map((photo) => ({
      localPhotoId: photo.localId,
      purpose: photo.placement.purpose,
      blob: photo.source.blob,
      mimeType: photo.source.mimeType,
      originalFilename: photo.source.originalFilename,
      lastModified: photo.source.lastModified,
      crop: photo.placement.purpose === "hero" ? structuredClone(photo.placement.crop) : null,
      caption: photo.placement.purpose === "gallery" ? photo.placement.caption : null,
    })),
  };
}
