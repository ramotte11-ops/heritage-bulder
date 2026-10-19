import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import type {
  MemorialPublicationCommit,
  MemorialPublicationRepository,
  MemorialPublicationResult,
  MemorialPublicationSnapshot,
} from "@/lib/memorial/publish-memorial";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

interface MemorialRow {
  status: MemorialStatus;
  first_published_at: string | null;
  language: Language | null;
  skin_id: Skin;
  skin_variant: SkinVariant;
  slug: string | null;
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

export class MemorialPublicationConflictError extends Error {
  readonly code = "MEMORIAL_PUBLICATION_CONFLICT";

  constructor() {
    super("The memorial changed while publication was being prepared.");
    this.name = "MemorialPublicationConflictError";
  }
}

function throwPublicationError(error: PostgrestError): never {
  if (error.code === "40001") throw new MemorialPublicationConflictError();
  throw error;
}

export class SupabaseMemorialPublicationRepository implements MemorialPublicationRepository {
  constructor(
    private readonly readClient: SupabaseClient,
    private readonly writeClient: SupabaseClient,
  ) {}

  async load(memorialId: string): Promise<MemorialPublicationSnapshot | null> {
    const [memorialResult, draftResult] = await Promise.all([
      this.readClient
        .from("memorials")
        .select("status, first_published_at, language, skin_id, skin_variant, slug")
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
      draft: {
        content: draftResult.data.content,
        updatedAt: draftResult.data.updated_at,
        revision: draftResult.data.revision,
      },
    };
  }

  async commitPublication(input: MemorialPublicationCommit): Promise<MemorialPublicationResult> {
    const { data, error } = await this.writeClient
      .rpc("commit_memorial_publication_v1", {
        p_memorial_id: input.memorialId,
        p_owner_id: input.ownerId,
        p_expected_revision: input.expectedRevision,
        p_expected_status: input.expectedStatus,
        p_expected_first_published_at: input.expectedFirstPublishedAt,
        p_expected_content: input.expectedContent,
      })
      .single<PublicationRow>();

    if (error) throwPublicationError(error);
    return {
      publishedAt: data.published_at,
      firstPublishedAt: data.first_published_at,
      revision: data.revision,
    };
  }
}

export function createSupabaseMemorialPublicationRepository(
  readClient: SupabaseClient,
): SupabaseMemorialPublicationRepository {
  return new SupabaseMemorialPublicationRepository(readClient, createServiceRoleSupabaseClient());
}
