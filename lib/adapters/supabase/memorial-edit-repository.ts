import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  MemorialEditConflictError,
  type ConfigurationEditCommit,
  type DraftEditCommit,
  type MemorialEditRepository,
  type MemorialEditSnapshot,
} from "@/lib/adapters/memorial-edit-repository";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

interface MemorialEditRow {
  status: MemorialStatus;
  first_published_at: string | null;
  language: Language | null;
  skin_id: Skin;
  skin_variant: SkinVariant;
}

interface DraftEditRow {
  content: MemorialContent;
  updated_at: string;
  revision: number;
}

interface DraftCommitRow {
  updated_at: string;
  revision: number;
}

const SERIALIZATION_FAILURE = "40001";

function throwPersistenceError(error: PostgrestError): never {
  if (error.code === SERIALIZATION_FAILURE) throw new MemorialEditConflictError();
  throw error;
}

/**
 * Reads through the request's session-scoped client, preserving RLS as a
 * second ownership check. Writes use narrowly granted service-role-only RPCs:
 * each RPC repeats the owner check, locks the durable state, performs its CAS,
 * writes the audit row and commits as one PostgreSQL transaction.
 */
export class SupabaseMemorialEditRepository implements MemorialEditRepository {
  constructor(
    private readonly readClient: SupabaseClient,
    private readonly writeClient: SupabaseClient,
  ) {}

  async load(memorialId: string): Promise<MemorialEditSnapshot | null> {
    const [memorialResult, draftResult] = await Promise.all([
      this.readClient
        .from("memorials")
        .select("status, first_published_at, language, skin_id, skin_variant")
        .eq("id", memorialId)
        .maybeSingle<MemorialEditRow>(),
      this.readClient
        .from("memorial_drafts")
        .select("content, updated_at, revision")
        .eq("memorial_id", memorialId)
        .maybeSingle<DraftEditRow>(),
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
      draft: {
        content: draftResult.data.content,
        updatedAt: draftResult.data.updated_at,
        revision: draftResult.data.revision,
      },
    };
  }

  async commitDraft(input: DraftEditCommit): Promise<{ updatedAt: string; revision: number }> {
    const { data, error } = await this.writeClient
      .rpc("commit_memorial_draft_edit_v1", {
        p_memorial_id: input.memorialId,
        p_owner_id: input.ownerId,
        p_expected_revision: input.expectedRevision,
        p_expected_status: input.expectedStatus,
        p_expected_first_published_at: input.expectedFirstPublishedAt,
        p_content: input.content,
        p_operation: input.operation,
        p_mutation_targets: [...input.mutationTargets],
      })
      .single<DraftCommitRow>();

    if (error) throwPersistenceError(error);
    return { updatedAt: data.updated_at, revision: data.revision };
  }

  async commitConfiguration(input: ConfigurationEditCommit): Promise<void> {
    const { error } = await this.writeClient.rpc("commit_memorial_configuration_edit_v1", {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_expected_status: input.expectedStatus,
      p_expected_first_published_at: input.expectedFirstPublishedAt,
      p_target: input.target,
      p_expected_value: input.expectedValue,
      p_value: input.value,
      p_mutation_targets: [...input.mutationTargets],
    });

    if (error) throwPersistenceError(error);
  }
}

export function createSupabaseMemorialEditRepository(
  readClient: SupabaseClient,
): SupabaseMemorialEditRepository {
  return new SupabaseMemorialEditRepository(readClient, createServiceRoleSupabaseClient());
}
