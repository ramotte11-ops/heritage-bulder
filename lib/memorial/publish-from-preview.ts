import type { AccessLevel } from "@/config/access-levels";
import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import { inspectHero } from "@/lib/memorial/hero";
import type { PublicationProjectionError } from "@/lib/memorial/publication-policy";
import { computePublicationPreview } from "@/lib/memorial/publication-preview";
import {
  FreePublicationRefusedError,
  type FreePublicationRefusal,
  type MemorialPublicationSnapshot,
} from "@/lib/memorial/publish-memorial";
import type { MemorialContent } from "@/types/memorial";
import type { PublishFromPreviewOutcome } from "@/lib/memorial/publication-preview-types";

/**
 * QG 008 Lot 3 — « Publier » from the private preview: the FIRST
 * publication of a draft, `draft -> ready -> published` in one database
 * transaction (commit_memorial_publication_v3).
 *
 * Nothing the browser sends is trusted: the server re-reads the stored
 * draft and the access level, recomputes the exact projection the preview
 * showed (computePublicationPreview) and refuses unless its fingerprint is
 * identical. The main photo is mandatory to publish (never to save).
 *
 * A second call (double click, second tab) succeeds ONLY when the database
 * proves, under lock, that the identical publication already exists
 * (`already_published`); anything else is a conflict, never a success.
 *
 * `publishMemorial` (the v2 path, `ready`/`editing`) is untouched.
 */

export interface FirstPublicationCommit {
  memorialId: string;
  ownerId: string;
  expectedRevision: number;
  expectedLanguage: Language;
  expectedSkin: Skin;
  expectedSkinVariant: SkinVariant;
  expectedSlug: string;
  expectedAccessLevel: AccessLevel;
  /** The exact private draft (compare-and-set only, never published). */
  expectedContent: MemorialContent;
  /** The server-side projection: the only content ever published. */
  publishedContent: MemorialContent;
}

export interface FirstPublicationResult {
  outcome: "published" | "already_published";
  publishedAt: string;
  firstPublishedAt: string;
  revision: number;
}

export interface MemorialFirstPublicationRepository {
  load(memorialId: string): Promise<MemorialPublicationSnapshot | null>;
  commitFirstPublication(input: FirstPublicationCommit): Promise<FirstPublicationResult>;
}

/** The database refused: no usable main photo (HD422). */
export class HeroPhotoRequiredError extends Error {
  readonly code = "HERO_PHOTO_REQUIRED";
  constructor() {
    super("Publication refused: the main photo is required.");
    this.name = "HeroPhotoRequiredError";
  }
}

export interface PublishFromPreviewInput {
  memorialId: string;
  ownerId: string;
  /** From the preview. Untrusted: compared with the stored draft. */
  expectedRevision: number;
  /** From the preview. Untrusted: compared with the recomputed projection. */
  expectedDigest: string;
  /** The family's gallery choice. Untrusted: revalidated by the policy. */
  gallerySelection?: unknown;
}

export type PublishFromPreviewResult =
  | ({ ok: true } & FirstPublicationResult)
  | {
      ok: false;
      code:
        | "not_found_or_forbidden"
        | "invalid_transition"
        | "revision_conflict"
        | "preview_outdated"
        | "publication_conflict"
        | "not_publishable"
        | "hero_photo_required";
    }
  | { ok: false; code: "publication_policy_refused"; policy: PublicationProjectionError }
  | { ok: false; code: FreePublicationRefusal };

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === code;
}

/** The main photo as the publication will show it: present, and readable by its owner. */
export async function heroPhotoUsable(content: MemorialContent, resolveMedia: MediaResolver): Promise<boolean> {
  const read = inspectHero(content);
  if (read.status !== "valid" || read.hero.photo === null) return false;
  const mediaId = read.hero.photo.mediaId;
  try {
    const resolved = await resolveMedia({ mediaId, purpose: "hero" });
    return resolved !== null && resolved.mediaId === mediaId;
  } catch {
    return false;
  }
}

export async function publishFromPreview(
  deps: { repository: MemorialFirstPublicationRepository; resolveMedia: MediaResolver },
  input: PublishFromPreviewInput,
): Promise<PublishFromPreviewResult> {
  const snapshot = await deps.repository.load(input.memorialId);
  if (snapshot === null) return { ok: false, code: "not_found_or_forbidden" };
  if (snapshot.draft.revision !== input.expectedRevision) return { ok: false, code: "revision_conflict" };

  // A first publication, or a second identical call the database will prove.
  const firstPublication = snapshot.status === "draft" && snapshot.firstPublishedAt === null;
  const alreadyPublished = snapshot.status === "published" && snapshot.firstPublishedAt !== null;
  if (!firstPublication && !alreadyPublished) return { ok: false, code: "invalid_transition" };

  if (snapshot.language === null || snapshot.slug === null || snapshot.slug.trim() === "") {
    return { ok: false, code: "not_publishable" };
  }

  const preview = computePublicationPreview({
    draft: snapshot.draft.content,
    accessLevel: snapshot.accessLevel,
    skin: snapshot.skin,
    requestedSelection: input.gallerySelection,
  });
  if (!preview.ok) return { ok: false, code: "publication_policy_refused", policy: preview.error };
  if (preview.digest !== input.expectedDigest) return { ok: false, code: "preview_outdated" };

  const publishedContent = preview.projection.content;
  if (!(await heroPhotoUsable(publishedContent, deps.resolveMedia))) {
    return { ok: false, code: "hero_photo_required" };
  }

  // What is assembled is what will be public: the projection, never the draft.
  const assembled = await assembleMemorial(
    { content: publishedContent, language: snapshot.language, skin: snapshot.skin, skinVariant: snapshot.skinVariant },
    { resolveMedia: deps.resolveMedia },
  );
  if (assembled.status !== "assembled") return { ok: false, code: "not_publishable" };

  try {
    const committed = await deps.repository.commitFirstPublication({
      memorialId: input.memorialId,
      ownerId: input.ownerId,
      expectedRevision: input.expectedRevision,
      expectedLanguage: snapshot.language,
      expectedSkin: snapshot.skin,
      expectedSkinVariant: snapshot.skinVariant,
      expectedSlug: snapshot.slug,
      // The policy accepted the level, so it is one of the two known values.
      expectedAccessLevel: snapshot.accessLevel as AccessLevel,
      expectedContent: snapshot.draft.content,
      publishedContent,
    });
    return { ok: true, ...committed };
  } catch (error) {
    if (error instanceof FreePublicationRefusedError) return { ok: false, code: error.refusal };
    if (error instanceof HeroPhotoRequiredError || hasCode(error, "HERO_PHOTO_REQUIRED")) {
      return { ok: false, code: "hero_photo_required" };
    }
    if (hasCode(error, "MEMORIAL_PUBLICATION_CONFLICT")) return { ok: false, code: "publication_conflict" };
    if (hasCode(error, "MEMORIAL_PUBLICATION_REJECTED")) return { ok: false, code: "not_publishable" };
    throw error;
  }
}

/** The plain outcome the Builder shows — never a technical message. */
export function publicationOutcomeOf(result: PublishFromPreviewResult): PublishFromPreviewOutcome {
  if (result.ok) return result.outcome;
  switch (result.code) {
    case "hero_photo_required":
      return "hero_photo_required";
    case "revision_conflict":
    case "preview_outdated":
    case "publication_conflict":
      return "preview_outdated";
    case "free_window_closed":
      return "free_window_closed";
    case "free_quota_reached":
      return "free_quota_reached";
    case "not_found_or_forbidden":
      return "signed_out";
    default:
      return "failed";
  }
}
