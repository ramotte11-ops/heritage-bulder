import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaPurpose, MediaStatus } from "@/config/media";
import type { MediaRepository } from "@/lib/adapters/media-repository";
import type { Media } from "@/types/media";
import { MediaSecurityConflictError, MediaSecurityDeniedError } from "@/lib/adapters/media-security-repository";

/**
 * SERVER ONLY. Reads and writes `media` with the service-role client
 * (lib/supabase/service-role-client.ts).
 *
 * ## Why service_role and not a session-scoped client
 *
 * The same reasoning as
 * lib/adapters/supabase/memorial-ownership-repository.ts, and the same
 * measured fact behind it: `authenticated` holds NO privilege on
 * `media` (Mission 013C, deliberately unchanged by Mission 030), so a
 * session-scoped client cannot perform these reads or writes at all.
 *
 * That is the model, not a workaround. Mission 030 chose model B —
 * no client-role access to media or to storage.objects, every
 * operation through a server primitive that proves ownership first
 * (see the migration's section 2). A session-scoped client would mean
 * re-implementing the ownership rule as an RLS policy expression, a
 * second copy of lib/auth/memorial-access.ts written in SQL.
 *
 * "Bypasses RLS" is only safe because of what this class cannot do:
 * every method takes a `memorialId` and filters on it, so a caller can
 * only ever reach rows of the memorial it named — and the ONE caller
 * of each method (lib/media/) has already proven the actor owns that
 * memorial before calling. This class never receives an owner id to
 * compare against and never returns a verdict; it cannot answer "is
 * this allowed", only "here are that memorial's rows".
 *
 * Never import this file from a Client Component or anything reachable
 * from one — lib/entitlement/server-only-boundary.test.ts enforces it.
 */

interface MediaRow {
  id: string;
  memorial_id: string;
  owner_id: string;
  storage_path: string;
  media_type: string;
  purpose: string;
  status: string;
  mime_type: string;
  original_filename: string | null;
  size_bytes: number | string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

const MEDIA_COLUMNS =
  "id, memorial_id, owner_id, storage_path, media_type, purpose, status, mime_type, original_filename, size_bytes, width, height, created_at, updated_at";

function throwMutationError(error: { code?: string }): never {
  if (error.code === "42501" || error.code === "23514") throw new MediaSecurityDeniedError();
  if (error.code === "40001") throw new MediaSecurityConflictError();
  throw error;
}

function toMedia(row: MediaRow): Media {
  return {
    id: row.id,
    memorialId: row.memorial_id,
    ownerId: row.owner_id,
    storagePath: row.storage_path,
    mediaType: row.media_type as Media["mediaType"],
    purpose: row.purpose as MediaPurpose,
    status: row.status as MediaStatus,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    // `size_bytes` is a bigint. PostgREST serializes bigints as JSON
    // numbers, but postgrest-js types them loosely and a driver change
    // could hand back a string; normalized here so a caller comparing
    // against MAX_MEDIA_BYTES never silently compares a string to a
    // number (`"99999999" > 15728640` is false — a size check that
    // fails open). Every photograph we accept is far below
    // Number.MAX_SAFE_INTEGER, so this conversion is exact.
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseMediaRepository implements MediaRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createPending(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    storagePath: string;
    purpose: MediaPurpose;
    declaredMimeType: string;
  }): Promise<Media> {
    const { data, error } = await this.client.rpc("reserve_memorial_media_upload_v1", {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_media_id: input.mediaId,
      p_storage_path: input.storagePath,
      p_purpose: input.purpose,
      p_declared_mime_type: input.declaredMimeType,
    }).single<MediaRow>();

    // Rethrown rather than swallowed. A reservation that failed must
    // not look like one that succeeded: the caller would then hand out
    // an upload permission for a path no row records, which is the one
    // way this design could manufacture an orphan.
    if (error) throwMutationError(error);

    return toMedia(data);
  }

  async markReady(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    expectedPurpose: MediaPurpose;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
  }): Promise<Media | null> {
    const { data, error } = await this.client.rpc("finalize_memorial_media_upload_v1", {
      p_memorial_id: input.memorialId,
      p_owner_id: input.ownerId,
      p_media_id: input.mediaId,
      p_expected_purpose: input.expectedPurpose,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
      p_width: input.width,
      p_height: input.height,
    }).maybeSingle<MediaRow>();

    if (error) throwMutationError(error);

    return data ? toMedia(data) : null;
  }

  async findById(input: { memorialId: string; mediaId: string }): Promise<Media | null> {
    const { data, error } = await this.client
      .from("media")
      .select(MEDIA_COLUMNS)
      // `.eq()` throughout, never a pattern operator: postgrest-js
      // appends the value verbatim, so `.like()`/`.ilike()` would let
      // characters inside a value act as wildcards. That was a real bug
      // at an identity boundary in Mission 011B and the discipline
      // applies at every boundary since.
      .eq("id", input.mediaId)
      // Both ids, always. This is what makes "a media of another
      // memorial is indistinguishable from a media that does not
      // exist" true at the query level rather than in a later `if`.
      .eq("memorial_id", input.memorialId)
      .maybeSingle<MediaRow>();

    if (error) throw error;

    return data ? toMedia(data) : null;
  }

  async listForMemorial(input: {
    memorialId: string;
    purpose?: MediaPurpose;
    status?: MediaStatus;
  }): Promise<Media[]> {
    let query = this.client
      .from("media")
      .select(MEDIA_COLUMNS)
      .eq("memorial_id", input.memorialId);

    if (input.purpose !== undefined) {
      query = query.eq("purpose", input.purpose);
    }

    if (input.status !== undefined) {
      query = query.eq("status", input.status);
    }

    // Newest first. This is the ordering the "current hero is the most
    // recently created ready hero" selection rule depends on — see
    // lib/media/replace-media.ts for why that is a selection rule and
    // not a unique index.
    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => toMedia(row as MediaRow));
  }

  async deleteById(input: { memorialId: string; mediaId: string }): Promise<boolean> {
    const { data, error } = await this.client
      .from("media")
      .delete()
      .eq("id", input.mediaId)
      .eq("memorial_id", input.memorialId)
      .select("id");

    if (error) throw error;

    // An empty result means there was nothing to delete, which is a
    // successful no-op rather than a failure — that is what makes
    // deletion idempotent for a retrying caller.
    return (data ?? []).length > 0;
  }

  async findExpiredPending(input: { olderThan: Date; limit: number }): Promise<Media[]> {
    const { data, error } = await this.client
      .from("media")
      .select(MEDIA_COLUMNS)
      // `pending` only. This filter is the entire reason the sweep is
      // allowed to run with no session and across memorials: it can
      // never see a finalized photograph belonging to a family.
      .eq("status", "pending")
      .lt("created_at", input.olderThan.toISOString())
      // Oldest first, so a backlog drains in the order it accumulated
      // instead of starving the earliest reservations.
      .order("created_at", { ascending: true })
      .limit(input.limit);

    if (error) throw error;

    return (data ?? []).map((row) => toMedia(row as MediaRow));
  }
}
