import type { AccessLevel } from "@/config/access-levels";
import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import {
  projectMemorialPublication,
  type PublicationProjectionError,
} from "./publication-policy";
import { transitionMemorial } from "./status-transitions";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

export interface MemorialPublicationSnapshot {
  status: MemorialStatus;
  firstPublishedAt: string | null;
  language: Language | null;
  skin: Skin;
  skinVariant: SkinVariant;
  slug: string | null;
  /**
   * QG 008 — `memorials.access_level` as stored. Typed loosely on purpose:
   * the publication policy re-validates it at runtime and fails closed on
   * any other value, and the database re-checks it under lock.
   */
  accessLevel: AccessLevel | string | null;
  draft: {
    content: MemorialContent;
    updatedAt: string;
    revision: number;
  };
}

export interface MemorialPublicationCommit {
  memorialId: string;
  ownerId: string;
  expectedRevision: number;
  expectedStatus: "ready" | "editing";
  expectedFirstPublishedAt: string | null;
  expectedLanguage: Language;
  expectedSkin: Skin;
  expectedSkinVariant: SkinVariant;
  expectedSlug: string;
  /** The level the projection was computed for; re-read under lock. */
  expectedAccessLevel: AccessLevel;
  /** The exact private draft (compare-and-set only, never published). */
  expectedContent: MemorialContent;
  /** The server-side public projection: the only content ever published. */
  publishedContent: MemorialContent;
}

export interface MemorialPublicationResult {
  publishedAt: string;
  firstPublishedAt: string;
  revision: number;
}

/**
 * QG 008 — why the database refused a free publication. Raised by the
 * repository from the publication triggers' SQLSTATEs; the database, not
 * this layer, is the authority on deadlines and quotas.
 */
export type FreePublicationRefusal =
  | "free_requires_verified_save"
  | "free_window_closed"
  | "free_quota_reached"
  | "free_content_refused";

export class FreePublicationRefusedError extends Error {
  readonly code = "FREE_PUBLICATION_REFUSED";

  constructor(readonly refusal: FreePublicationRefusal) {
    super(`Free publication refused: ${refusal}`);
    this.name = "FreePublicationRefusedError";
  }
}

export interface MemorialPublicationRepository {
  load(memorialId: string): Promise<MemorialPublicationSnapshot | null>;
  commitPublication(input: MemorialPublicationCommit): Promise<MemorialPublicationResult>;
}

export type PublishMemorialResult =
  | ({ ok: true } & MemorialPublicationResult)
  | { ok: false; code: "not_found_or_forbidden" | "invalid_transition" | "revision_conflict" | "not_publishable" }
  | { ok: false; code: "publication_policy_refused"; policy: PublicationProjectionError }
  | { ok: false; code: FreePublicationRefusal };

export interface PublishMemorialInput {
  memorialId: string;
  ownerId: string;
  expectedRevision: number;
  /**
   * The family's ordered choice of gallery photos for a free publication
   * (at most six). Untrusted: validated by the publication policy against
   * the stored draft. Ignored for a complete memorial.
   */
  gallerySelection?: unknown;
}

/**
 * Validates the exact stored draft, computes its public projection for the
 * stored access level (QG 008 — premium content is never published for
 * free), then asks PostgreSQL to publish that projection. The repository
 * repeats ownership, lifecycle, access level, revision, content and active
 * Hero-retirement checks under locks, and the database triggers enforce the
 * free deadlines, quota and copy limits; this layer supplies the
 * application validation without pretending it is the transaction boundary.
 */
export async function publishMemorial(
  deps: { repository: MemorialPublicationRepository; resolveMedia: MediaResolver },
  input: PublishMemorialInput,
): Promise<PublishMemorialResult> {
  const snapshot = await deps.repository.load(input.memorialId);
  if (snapshot === null) return { ok: false, code: "not_found_or_forbidden" };
  if (snapshot.draft.revision !== input.expectedRevision) return { ok: false, code: "revision_conflict" };

  const transition = transitionMemorial(
    { status: snapshot.status, firstPublishedAt: snapshot.firstPublishedAt },
    "published",
  );
  const coherentFirstPublication = snapshot.status === "ready" && snapshot.firstPublishedAt === null;
  const coherentRepublication = snapshot.status === "editing" && snapshot.firstPublishedAt !== null;
  if (!transition.ok || (!coherentFirstPublication && !coherentRepublication)) {
    return { ok: false, code: "invalid_transition" };
  }

  if (snapshot.language === null || snapshot.slug === null || snapshot.slug.trim() === "") {
    return { ok: false, code: "not_publishable" };
  }

  const projected = projectMemorialPublication({
    draft: snapshot.draft.content,
    accessLevel: snapshot.accessLevel,
    skin: snapshot.skin,
    gallerySelection: input.gallerySelection,
  });
  if (!projected.ok) return { ok: false, code: "publication_policy_refused", policy: projected.error };
  // The policy accepted the level, so it is one of the two known values.
  const accessLevel = snapshot.accessLevel as AccessLevel;

  // What is assembled is what will be public: the projection, never the draft.
  const assembled = await assembleMemorial(
    {
      content: projected.projection.content,
      language: snapshot.language,
      skin: snapshot.skin,
      skinVariant: snapshot.skinVariant,
    },
    { resolveMedia: deps.resolveMedia },
  );
  if (assembled.status !== "assembled") return { ok: false, code: "not_publishable" };

  try {
    const committed = await deps.repository.commitPublication({
      memorialId: input.memorialId,
      ownerId: input.ownerId,
      expectedRevision: input.expectedRevision,
      expectedStatus: snapshot.status as "ready" | "editing",
      expectedFirstPublishedAt: snapshot.firstPublishedAt,
      expectedLanguage: snapshot.language,
      expectedSkin: snapshot.skin,
      expectedSkinVariant: snapshot.skinVariant,
      expectedSlug: snapshot.slug,
      expectedAccessLevel: accessLevel,
      expectedContent: snapshot.draft.content,
      publishedContent: projected.projection.content,
    });
    return { ok: true, ...committed };
  } catch (error) {
    if (error instanceof FreePublicationRefusedError) return { ok: false, code: error.refusal };
    throw error;
  }
}
