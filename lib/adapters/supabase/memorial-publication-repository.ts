import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import {
  FreePublicationRefusedError,
  type MemorialPublicationCommit,
  type MemorialPublicationRepository,
  type MemorialPublicationResult,
  type MemorialPublicationSnapshot,
} from "@/lib/memorial/publish-memorial";
import {
  EmailVerificationRequiredError,
  HeroPhotoRequiredError,
  type FirstPublicationCommit,
  type FirstPublicationResult,
  type MemorialFirstPublicationRepository,
} from "@/lib/memorial/publish-from-preview";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

interface MemorialRow {
  status: MemorialStatus;
  first_published_at: string | null;
  language: Language | null;
  skin_id: Skin;
  skin_variant: SkinVariant;
  slug: string | null;
  access_level: string | null;
}

interface DraftRow {
  content: MemorialContent;
  updated_at: string;
  revision: number;
}

interface PublicationRow {
  published_at: string;
  first_published_at: string;
  revision: number;
}

interface FirstPublicationRow extends PublicationRow {
  outcome: "published" | "already_published";
  /** Lot 3 v4 — the resolved public slug. */
  slug: string;
}

export class MemorialPublicationConflictError extends Error {
  readonly code = "MEMORIAL_PUBLICATION_CONFLICT";

  constructor() {
    super("The memorial changed while publication was being prepared.");
    this.name = "MemorialPublicationConflictError";
  }
}

/**
 * QG 008 — SQLSTATEs raised by the free-publication triggers
 * (guard_free_first_publication_v1, guard_avis_published_snapshot_v1).
 * HD403 covers both the quota and a refused free copy: only the quota
 * message is distinguished, everything else is a content refusal.
 */
/**
 * QG 008 Lot 3 — the database rejected the publication data itself
 * (23514: malformed or foreign gallery, incomplete configuration).
 */
export class MemorialPublicationRejectedError extends Error {
  readonly code = "MEMORIAL_PUBLICATION_REJECTED";
  constructor() {
    super("The database rejected the publication data.");
    this.name = "MemorialPublicationRejectedError";
  }
}

/** QG 008 Lot 3 — commit_memorial_publication_v4/v3's own refusals, then the shared ones. */
function throwFirstPublicationError(error: PostgrestError): never {
  if (error.code === "HD422") throw new HeroPhotoRequiredError();
  if (error.code === "23514") throw new MemorialPublicationRejectedError();
  throwPublicationError(error);
}

function throwPublicationError(error: PostgrestError): never {
  // QG 004-B — require_owner_email_verified_v1: no HERITAGE proof of the address.
  if (error.code === "HV403") throw new EmailVerificationRequiredError();
  if (error.code === "40001") throw new MemorialPublicationConflictError();
  if (error.code === "HD428") throw new FreePublicationRefusedError("free_requires_verified_save");
  if (error.code === "HD410") throw new FreePublicationRefusedError("free_window_closed");
  if (error.code === "HD403" && error.message.includes("quota")) {
    throw new FreePublicationRefusedError("free_quota_reached");
  }
  if (error.code === "HD403" || error.code === "HD413") {
    throw new FreePublicationRefusedError("free_content_refused");
  }
  throw error;
}

export class SupabaseMemorialPublicationRepository
  implements MemorialPublicationRepository, MemorialFirstPublicationRepository
{
  constructor(
    private readonly readClient: SupabaseClient,
    private readonly writeClient: SupabaseClient,
  ) {}

  async load(memorialId: string): Promise<MemorialPublicationSnapshot | null> {
    const [memorialResult, draftResult] = await Promise.all([
      this.readClient
        .from("memorials")
        .select("status, first_published_at, language, skin_id, skin_variant, slug, access_level")
        .eq("id", memorialId)
        .maybeSingle<MemorialRow>(),
      this.readClient
        .from("memorial_drafts")
        .select("content, updated_at, revision")
        .eq("memorial_id", memorialId)
        .maybeSingle<DraftRow>(),
    ]);

    if (memorialResult.error) throw memorialResult.error;
    if (draftResult.error) throw draftResult.error;
    if (!memorialResult.data || !draftResult.data) return null;

    return {
      status: memorialResult.data.status,
      firstPublishedAt: memorialResult.data.first_published_at,
      language: memorialResult.data.language,
      skin: memorialResult.data.skin_id,
      skinVariant: memorialResult.data.skin_variant,
      slug: memorialResult.data.slug,
      accessLevel: memorialResult.data.access_level,
      draft: {
        content: draftResult.data.content,
        updatedAt: draftResult.data.updated_at,
        revision: draftResult.data.revision,
      },
    };
  }

  async commitPublication(input: MemorialPublicationCommit): Promise<MemorialPublicationResult> {
    const { data, error } = await this.writeClient
      .rpc("commit_memorial_publication_v2", {
        p_memorial_id: input.memorialId,
        p_owner_id: input.ownerId,
        p_expected_revision: input.expectedRevision,
        p_expected_status: input.expectedStatus,
        p_expected_first_published_at: input.expectedFirstPublishedAt,
        p_expected_language: input.expectedLanguage,
        p_expected_skin: input.expectedSkin,
        p_expected_skin_variant: input.expectedSkinVariant,
        p_expected_slug: input.expectedSlug,
        p_expected_access_level: input.expectedAccessLevel,
        p_expected_content: input.expectedContent,
        p_published_content: input.publishedContent,
      })
      .single<PublicationRow>();

    if (error) throwPublicationError(error);
    return {
      publishedAt: data.published_at,
      firstPublishedAt: data.first_published_at,
      revision: data.revision,
    };
  }

  /**
   * QG 008 Lot 3 — first publication from the private preview:
   * draft -> ready -> published in ONE transaction (service_role only).
   * Lot 3 v4: the public slug is generated by the database when the
   * memorial has none (`p_expected_slug` NULL), then returned.
   */
  async commitFirstPublication(input: FirstPublicationCommit): Promise<FirstPublicationResult> {
    const { data, error } = await this.writeClient
      .rpc("commit_memorial_publication_v4", {
        p_memorial_id: input.memorialId,
        p_owner_id: input.ownerId,
        p_expected_revision: input.expectedRevision,
        p_expected_language: input.expectedLanguage,
        p_expected_skin: input.expectedSkin,
        p_expected_skin_variant: input.expectedSkinVariant,
        p_expected_slug: input.expectedSlug,
        p_expected_access_level: input.expectedAccessLevel,
        p_expected_content: input.expectedContent,
        p_published_content: input.publishedContent,
      })
      .single<FirstPublicationRow>();

    if (error) throwFirstPublicationError(error);
    if (data.outcome !== "published" && data.outcome !== "already_published") {
      throw new Error("Unexpected publication outcome.");
    }
    if (typeof data.slug !== "string" || data.slug.trim() === "") {
      throw new Error("Unexpected publication slug.");
    }
    return {
      outcome: data.outcome,
      publishedAt: data.published_at,
      firstPublishedAt: data.first_published_at,
      revision: data.revision,
      slug: data.slug,
    };
  }
}

export function createSupabaseMemorialPublicationRepository(
  readClient: SupabaseClient,
): SupabaseMemorialPublicationRepository {
  return new SupabaseMemorialPublicationRepository(readClient, createServiceRoleSupabaseClient());
}
