import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  MediaRetirementLease,
  PendingMediaCleanupClaim,
  MediaSecurityRepository,
  MediaSecuritySnapshot,
} from "@/lib/adapters/media-security-repository";
import {
  MediaSecurityConflictError,
  MediaSecurityDeniedError,
  MediaSecurityRetainedError,
} from "@/lib/adapters/media-security-repository";
import type { MemorialStatus } from "@/types/memorial";

interface MemorialRow {
  status: MemorialStatus;
  first_published_at: string | null;
}

interface DraftRow {
  revision: number;
}

interface LeaseRow {
  lease_id: string;
  expires_at: string;
}

interface PendingCleanupClaimRow {
  claim_id: string;
}

function throwSecurityError(error: PostgrestError): never {
  if (error.code === "40001") throw new MediaSecurityConflictError();
  if (error.code === "42501" || error.code === "23514") throw new MediaSecurityDeniedError();
  throw error;
}

export class SupabaseMediaSecurityRepository implements MediaSecurityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async load(input: { memorialId: string; ownerId: string }): Promise<MediaSecuritySnapshot | null> {
    const [memorial, draft] = await Promise.all([
      this.client
        .from("memorials")
        .select("status, first_published_at")
        .eq("id", input.memorialId)
        .eq("owner_id", input.ownerId)
        .maybeSingle<MemorialRow>(),
      this.client
        .from("memorial_drafts")
        .select("revision")
        .eq("memorial_id", input.memorialId)
        .maybeSingle<DraftRow>(),
    ]);
    if (memorial.error) throw memorial.error;
    if (draft.error) throw draft.error;
    if (!memorial.data || !draft.data) return null;
    return {
      status: memorial.data.status,
      firstPublishedAt: memorial.data.first_published_at,
      draftRevision: draft.data.revision,
    };
  }

  async reserveRetirement(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    purpose: "hero" | "gallery";
    expectedRevision: number;
  }): Promise<MediaRetirementLease> {
    const fn = input.purpose === "hero"
      ? "reserve_hero_media_retirement_v1"
      : "reserve_gallery_media_retirement_v1";
    const { data, error } = await this.client.rpc(fn, {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_media_id: input.mediaId,
      p_expected_revision: input.expectedRevision,
    }).single<LeaseRow>();
    if (error && input.purpose === "gallery" && error.code === "23514") {
      throw new MediaSecurityRetainedError();
    }
    if (error) throwSecurityError(error);
    return { leaseId: data.lease_id, expiresAt: data.expires_at };
  }

  async finishRetirement(input: {
    memorialId: string;
    ownerId: string;
    purpose: "hero" | "gallery";
    leaseId: string;
    outcome: "completed" | "cancelled";
  }): Promise<void> {
    const fn = input.purpose === "hero"
      ? "finish_hero_media_retirement_v1"
      : "finish_gallery_media_retirement_v1";
    const { error } = await this.client.rpc(fn, {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_lease_id: input.leaseId,
      p_outcome: input.outcome,
    });
    if (error) throwSecurityError(error);
  }

  async reservePendingCleanup(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    createdBefore?: string;
  }): Promise<PendingMediaCleanupClaim> {
    const { data, error } = await this.client.rpc("reserve_pending_media_cleanup_v1", {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_media_id: input.mediaId,
      p_created_before: input.createdBefore ?? null,
    }).single<PendingCleanupClaimRow>();
    if (error) throwSecurityError(error);
    return { claimId: data.claim_id };
  }

  async finishPendingCleanup(input: {
    memorialId: string;
    ownerId: string;
    claimId: string;
  }): Promise<void> {
    const { error } = await this.client.rpc("finish_pending_media_cleanup_v1", {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_claim_id: input.claimId,
    });
    if (error) throwSecurityError(error);
  }
}
