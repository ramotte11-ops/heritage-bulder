import type { AccessLevel } from "@/config/access-levels";

/**
 * QG 008 Lot 3 — what the private preview tells the authenticated Builder
 * about the publication it shows. Plain data, safe for the browser: the
 * server computes every field from the SAVED draft and re-checks all of
 * them when the family confirms (lib/memorial/publish-memorial.ts).
 */

/** A gallery photo the family can choose for an `avis` publication. */
export interface PreviewGalleryChoice {
  mediaId: string;
  /** Owner-only signed URL; `null` when the photo cannot be read right now. */
  readUrl: string | null;
}

export interface PreviewGallery {
  /** Photos prepared in the draft (all kept, published or not). */
  total: number;
  /** `6` for an `avis` gallery, `null` when the level has no limit. */
  limit: number | null;
  /**
   * The ids that will be published, in the Builder's order. `undefined`
   * when there is nothing to choose (6 photos or fewer, or `complet`).
   */
  selection: readonly string[] | undefined;
  /** `true` when the selection is the default (the first six). */
  proposed: boolean;
  /** Every draft photo, in the Builder's order — only when there is a choice. */
  choices: readonly PreviewGalleryChoice[];
}

export type PublicationReadiness =
  /** A draft never published, with its main photo: « Publier » is offered. */
  | "publishable"
  /** A draft without a usable main photo: saving works, publishing does not. */
  | "hero_photo_required"
  /** Already published: no « Publier » (republication is a separate project). */
  | "published"
  /** Any other lifecycle state: nothing is offered. */
  | "unavailable";

export interface PreviewPublication {
  /** The draft revision this preview was computed from. */
  revision: number;
  accessLevel: AccessLevel;
  /** Server-computed fingerprint of exactly what will be published. */
  digest: string;
  gallery: PreviewGallery;
  /** Filled sections reserved to the complete tribute, not published. */
  premiumSections: readonly string[];
  readiness: PublicationReadiness;
}

/** What the confirmation returns to the Builder (no technical message). */
export type PublishFromPreviewOutcome =
  | "published"
  | "already_published"
  | "hero_photo_required"
  | "preview_outdated"
  | "free_window_closed"
  | "free_quota_reached"
  | "signed_out"
  | "access_refused"
  | "failed";
