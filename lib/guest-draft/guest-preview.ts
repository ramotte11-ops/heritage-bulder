import type { MemorialPreviewResult } from "@/components/builder/preview/BuilderPreviewHost";
import { assembleMemorial, type AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { MediaResolver, ResolvedMedia } from "@/lib/memorial/assembly/media-resolver";
import type { MemorialContent } from "@/types/memorial";
import type { GuestDraftPhotoAsset, GuestDraftV3 } from "./guest-draft-v3";
import type { GuestDraftV3ReadResult, GuestDraftV3StorageErrorCode } from "./guest-draft-v3-store";
import { GUEST_BUILDER_V1_SKIN } from "./guest-builder-runtime";
import { findGuestHeroReference, isGuestHeroRevealComplete } from "./guest-hero-media";
import { guestGalleryReferences } from "./guest-gallery-media";

/**
 * QG 003 — the guest Builder's Preview: the family's LOCAL draft (V3 +
 * IndexedDB blobs) assembled by the one real assembler (`assembleMemorial`)
 * and drawn by the one `BuilderPreviewHost` / `MemorialAssembly`, exactly
 * like the authenticated `loadMemorialPreviewAction` — no demo data, no
 * second rendering system, no network.
 *
 * ## The local / server media boundary
 *
 * The assembler reads photographs from `content.hero.photo` and
 * `content.gallery.items`, and resolves each reference through an injected
 * `MediaResolver`. A V3 guest draft deliberately holds neither: its
 * photographs are `draft.photos` references to local blobs, and the V3
 * validator refuses any server media reference in `content`
 * (`server_media_reference`). This module bridges the two WITHOUT touching
 * the V3 schema:
 *
 * - `projectGuestDraftForPreview` builds a transient, in-memory content for
 *   the assembler only. Its media slots carry each photograph's own stable
 *   `localId` — never an invented identifier. It is never saved (the V3
 *   validator would refuse it), never sent anywhere, and dropped with the
 *   Preview.
 * - The local resolver answers ONLY the `localId`s of this draft, for their
 *   own purpose, with a `blob:` URL of the stored blob: no server media can
 *   ever be resolved through it.
 * - The Hero crop comes from the local Hero placement, unchanged.
 * - Every Gallery photograph of the draft is projected, in the family's
 *   order: creation has no commercial cap (the « six souvenirs » limit
 *   belongs to a future free publication, never to the Builder).
 *
 * ## Fail visibly, never silently
 *
 * Anything that would make the Preview differ from the draft — an
 * unreadable draft, a missing or invalid blob, a photograph the Gallery
 * would leave out, a section the assembler refuses — makes the whole
 * Preview `unavailable` (the host then shows `preview.unavailable` and the
 * family stays in the Builder). The `reason` is kept for diagnosis. The
 * draft and its blobs are only ever read here: nothing is repaired,
 * replaced or deleted.
 *
 * ## Object URLs
 *
 * Every URL created for one opening belongs to its `GuestPreviewSession`;
 * `release()` revokes all of them exactly once. A failed opening releases
 * its own URLs before returning.
 */

export interface GuestPreviewStore {
  read(): Promise<GuestDraftV3ReadResult>;
  readPhoto(localId: string): Promise<
    | { ok: true; asset: GuestDraftPhotoAsset }
    | { ok: false; reason: GuestDraftV3StorageErrorCode | "photo_not_found" | "invalid_photo_asset" }
  >;
}

export type GuestPreviewUnavailableReason =
  | "draft_unreadable"
  | "photo_unreadable"
  | "photo_dimensions_unknown"
  | "hero_unassembled"
  | "section_unassembled"
  | "gallery_incomplete"
  | "assembly_failed";

export interface GuestPreviewSession {
  /** Revokes every object URL of this opening; idempotent. */
  release(): void;
}

export type GuestPreviewLoadResult =
  | { status: "ready"; assembled: AssembledMemorial; session: GuestPreviewSession }
  | { status: "locked" }
  | { status: "unavailable"; reason: GuestPreviewUnavailableReason; detail?: string };

export interface GuestPreviewOptions {
  store: GuestPreviewStore;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  /** Natural size of a legacy V2 photograph whose dimensions were never
   * measured (`legacy_unmeasured`). Read only, never written back. */
  measureImage?: (blob: Blob) => Promise<{ width: number; height: number } | null>;
}

export interface GuestPreviewProjection {
  content: MemorialContent;
  /** Every local photograph the projection references, in draft order. */
  photos: Array<{ localId: string; purpose: "hero" | "gallery" }>;
}

/** `null` while the local Hero is not revealed (T08): the Preview is locked. */
export function projectGuestDraftForPreview(draft: GuestDraftV3): GuestPreviewProjection | null {
  if (draft.language === null || draft.skinVariant === null || !isGuestHeroRevealComplete(draft)) return null;
  const heroReference = findGuestHeroReference(draft);
  if (heroReference === null || heroReference.placement.purpose !== "hero" || heroReference.placement.crop === null) {
    return null;
  }

  const content = structuredClone(draft.content) as Record<string, unknown>;
  const hero = content.hero;
  // A corrupted Hero is handed over as is: the Hero adapter refuses it.
  if (typeof hero === "object" && hero !== null && !Array.isArray(hero)) {
    content.hero = {
      ...hero,
      photo: { mediaId: heroReference.localId, crop: structuredClone(heroReference.placement.crop) },
    };
  }

  const gallery = guestGalleryReferences(draft);
  if (gallery.length > 0) {
    content.gallery = {
      items: gallery.map(({ localId, placement }) => ({
        mediaId: localId,
        caption: placement.purpose === "gallery" ? placement.caption : null,
      })),
    };
  }

  return {
    content: content as MemorialContent,
    photos: [
      { localId: heroReference.localId, purpose: "hero" },
      ...gallery.map(({ localId }) => ({ localId, purpose: "gallery" as const })),
    ],
  };
}

export async function measureImageBlob(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  }
}

function createSession(revokeObjectUrl: (url: string) => void) {
  const urls: string[] = [];
  let released = false;
  return {
    track(url: string) {
      if (released) {
        revokeObjectUrl(url);
        return;
      }
      urls.push(url);
    },
    release() {
      if (released) return;
      released = true;
      for (const url of urls.splice(0)) revokeObjectUrl(url);
    },
  };
}

/** Reads the SAVED local draft, assembles it, and owns its object URLs. */
export async function loadGuestPreview({
  store,
  createObjectUrl,
  revokeObjectUrl,
  measureImage = measureImageBlob,
}: GuestPreviewOptions): Promise<GuestPreviewLoadResult> {
  let read: GuestDraftV3ReadResult;
  try {
    read = await store.read();
  } catch {
    return { status: "unavailable", reason: "draft_unreadable" };
  }
  if (read.status !== "ready") {
    return read.status === "empty"
      ? { status: "locked" }
      : { status: "unavailable", reason: "draft_unreadable", detail: read.status };
  }
  const draft = read.draft;
  const projection = projectGuestDraftForPreview(draft);
  if (projection === null) return { status: "locked" };

  const session = createSession(revokeObjectUrl);
  const fail = (reason: GuestPreviewUnavailableReason, detail?: string): GuestPreviewLoadResult => {
    session.release();
    return { status: "unavailable", reason, ...(detail === undefined ? {} : { detail }) };
  };

  const resolved = new Map<string, ResolvedMedia & { purpose: "hero" | "gallery" }>();
  for (const photo of projection.photos) {
    let asset: GuestDraftPhotoAsset;
    try {
      const result = await store.readPhoto(photo.localId);
      if (!result.ok) return fail("photo_unreadable", result.reason);
      asset = result.asset;
    } catch {
      return fail("photo_unreadable");
    }
    let dimensions = asset.source.dimensions.status === "known"
      ? { width: asset.source.dimensions.width, height: asset.source.dimensions.height }
      : null;
    if (dimensions === null && photo.purpose === "gallery") dimensions = await measureImage(asset.blob);
    if (dimensions === null && photo.purpose === "gallery") return fail("photo_dimensions_unknown", photo.localId);

    let readUrl: string;
    try {
      readUrl = createObjectUrl(asset.blob);
    } catch {
      return fail("photo_unreadable", photo.localId);
    }
    session.track(readUrl);
    resolved.set(photo.localId, {
      mediaId: photo.localId,
      purpose: photo.purpose,
      readUrl,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    });
  }

  // Only this draft's own photographs, each for its own purpose.
  const resolveMedia: MediaResolver = async ({ mediaId, purpose }) => {
    const media = resolved.get(mediaId);
    if (media === undefined || media.purpose !== purpose) return null;
    return { mediaId: media.mediaId, readUrl: media.readUrl, width: media.width, height: media.height };
  };

  let assembled: AssembledMemorial;
  try {
    assembled = await assembleMemorial(
      {
        skin: GUEST_BUILDER_V1_SKIN,
        skinVariant: draft.skinVariant!,
        language: draft.language!,
        content: projection.content,
      },
      { resolveMedia },
    );
  } catch {
    return fail("assembly_failed");
  }

  if (assembled.status !== "assembled") return fail("hero_unassembled");
  if (assembled.failures.length > 0) {
    return fail("section_unassembled", assembled.failures.map(({ sectionId, reason }) => `${sectionId}:${reason}`).join(","));
  }
  const expectedGallery = projection.photos.filter(({ purpose }) => purpose === "gallery").length;
  const galleryShown = [...assembled.sections, ...assembled.archivedSections]
    .find((section) => section.rendererKey === "GalleryIntemporel");
  const shown = galleryShown?.rendererKey === "GalleryIntemporel" ? galleryShown.props.media.length : 0;
  // 0-1 photograph: no Gallery state exists (A13's own rule), nothing is lost.
  if (expectedGallery >= 2 && shown !== expectedGallery) {
    return fail("gallery_incomplete", `${shown}/${expectedGallery}`);
  }

  return { status: "ready", assembled, session };
}

/** The host's contract: only the status crosses into `BuilderPreviewHost`. */
export function toMemorialPreviewResult(result: GuestPreviewLoadResult): MemorialPreviewResult {
  return result.status === "ready" ? { status: "ready", assembled: result.assembled } : { status: result.status };
}
