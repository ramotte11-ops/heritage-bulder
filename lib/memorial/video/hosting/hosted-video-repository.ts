import type { SupabaseClient } from "@supabase/supabase-js";
import type { HostedVideoEventInput } from "./mux-webhook";

/**
 * SERVER ONLY. VID-07 — accès aux vidéos hébergées : uniquement par les RPC
 * de supabase/migrations/20261125090000_vid07_memorial_videos.sql, avec le
 * client service_role et un `ownerId` résolu côté serveur (jamais transmis
 * par le navigateur). Toutes les règles de capacité vivent dans ces RPC,
 * sous le verrou de l'hommage.
 */

export type HostedVideoStatus =
  | "reserved"
  | "uploading"
  | "processing"
  | "ready"
  | "rejected"
  | "errored"
  | "cancelled"
  | "deletion_requested"
  | "deleted";

export type ReserveOutcome =
  | "reserved"
  | "invalid"
  | "refused"
  | "refused_offer"
  | "refused_archived"
  | "refused_in_progress"
  | "refused_too_many"
  | "refused_duration"
  | "refused_unknown_pending";

export type EventOutcome = "duplicate" | "unknown" | "applied" | "ignored" | "accepted" | "rejected" | "delete_asset" | "invalid";

export interface HostedVideoRow {
  videoId: string;
  draftVideoId: string;
  status: HostedVideoStatus;
  declaredDurationMs: number | null;
  verifiedDurationMs: number | null;
  playbackId: string | null;
  uploadExpiresAt: string | null;
  failureReason: string | null;
  updatedAt: string;
  /** Serveur seulement (réconciliation) ; jamais transmis au navigateur. */
  uploadId: string | null;
  assetId: string | null;
}

export interface ReconcileRow {
  videoId: string;
  memorialId: string;
  status: HostedVideoStatus;
  uploadId: string | null;
  assetId: string | null;
  uploadExpiresAt: string | null;
}

export interface RemovalRow {
  videoId: string;
  uploadId: string | null;
  assetId: string | null;
  previousStatus: HostedVideoStatus;
}

export interface HostedVideoRepository {
  reserve(input: { ownerId: string; memorialId: string; draftVideoId: string; declaredDurationMs: number | null }): Promise<{ outcome: ReserveOutcome; videoId: string | null }>;
  attachUpload(input: { videoId: string; uploadId: string; expiresAt: string }): Promise<"attached" | "not_found" | "not_reserved" | "invalid">;
  failUpload(input: { videoId: string; reason: "upload_failed" | "hosting_unavailable" }): Promise<void>;
  cancelUpload(input: { ownerId: string; memorialId: string; videoId: string }): Promise<{ outcome: "cancelled" | "ignored" | "refused"; uploadId: string | null }>;
  applyEvent(event: HostedVideoEventInput): Promise<{ outcome: EventOutcome; videoId: string | null; assetToDelete: string | null; supersededAsset: string | null }>;
  listForOwner(input: { ownerId: string; memorialId: string }): Promise<HostedVideoRow[]>;
  listToReconcile(input: { staleBefore: string; limit: number }): Promise<ReconcileRow[]>;
  requestRemoval(input: { ownerId: string; memorialId: string; draftVideoId: string }): Promise<{ refused: boolean; rows: RemovalRow[] }>;
  confirmDeleted(videoId: string): Promise<void>;
}

function rowsOf<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : data === null || data === undefined ? [] : [data as T];
}

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function createSupabaseHostedVideoRepository(client: SupabaseClient): HostedVideoRepository {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`Hosted video RPC ${name} failed.`);
    return data;
  }

  return {
    async reserve({ ownerId, memorialId, draftVideoId, declaredDurationMs }) {
      const row = rowsOf<{ outcome: ReserveOutcome; video_id: string | null }>(
        await rpc("reserve_memorial_video_upload_v1", {
          p_owner_id: ownerId,
          p_memorial_id: memorialId,
          p_draft_video_id: draftVideoId,
          p_declared_duration_ms: declaredDurationMs,
        }),
      )[0];
      return { outcome: row?.outcome ?? "refused", videoId: row?.video_id ?? null };
    },
    async attachUpload({ videoId, uploadId, expiresAt }) {
      return (await rpc("attach_memorial_video_upload_v1", { p_video_id: videoId, p_upload_id: uploadId, p_expires_at: expiresAt })) as
        | "attached"
        | "not_found"
        | "not_reserved"
        | "invalid";
    },
    async failUpload({ videoId, reason }) {
      await rpc("fail_memorial_video_upload_v1", { p_video_id: videoId, p_reason: reason });
    },
    async cancelUpload({ ownerId, memorialId, videoId }) {
      const row = rowsOf<{ outcome: "cancelled" | "ignored" | "refused"; upload_id: string | null }>(
        await rpc("cancel_memorial_video_upload_v1", { p_owner_id: ownerId, p_memorial_id: memorialId, p_video_id: videoId }),
      )[0];
      return { outcome: row?.outcome ?? "refused", uploadId: row?.upload_id ?? null };
    },
    async applyEvent(event) {
      const row = rowsOf<{ outcome: EventOutcome; video_id: string | null; asset_to_delete: string | null; superseded_asset: string | null }>(
        await rpc("apply_memorial_video_event_v1", {
          p_event_id: event.eventId,
          p_event_type: event.type,
          p_video_id: event.videoId,
          p_upload_id: event.uploadId,
          p_asset_id: event.assetId,
          p_playback_id: event.playbackId,
          p_duration_ms: event.durationMs,
        }),
      )[0];
      return {
        outcome: row?.outcome ?? "invalid",
        videoId: row?.video_id ?? null,
        assetToDelete: row?.asset_to_delete ?? null,
        supersededAsset: row?.superseded_asset ?? null,
      };
    },
    async listForOwner({ ownerId, memorialId }) {
      return rowsOf<Record<string, unknown>>(await rpc("list_memorial_videos_v1", { p_owner_id: ownerId, p_memorial_id: memorialId })).map((r) => ({
        videoId: String(r.video_id),
        draftVideoId: String(r.draft_video_id),
        status: r.status as HostedVideoStatus,
        declaredDurationMs: num(r.declared_duration_ms),
        verifiedDurationMs: num(r.verified_duration_ms),
        playbackId: str(r.playback_id),
        uploadExpiresAt: str(r.upload_expires_at),
        failureReason: str(r.failure_reason),
        updatedAt: String(r.updated_at),
        uploadId: str(r.upload_id),
        assetId: str(r.asset_id),
      }));
    },
    async listToReconcile({ staleBefore, limit }) {
      return rowsOf<Record<string, unknown>>(await rpc("list_memorial_videos_to_reconcile_v1", { p_stale_before: staleBefore, p_limit: limit })).map((r) => ({
        videoId: String(r.video_id),
        memorialId: String(r.memorial_id),
        status: r.status as HostedVideoStatus,
        uploadId: str(r.upload_id),
        assetId: str(r.asset_id),
        uploadExpiresAt: str(r.upload_expires_at),
      }));
    },
    async requestRemoval({ ownerId, memorialId, draftVideoId }) {
      const rows = rowsOf<Record<string, unknown>>(
        await rpc("request_memorial_video_removal_v1", { p_owner_id: ownerId, p_memorial_id: memorialId, p_draft_video_id: draftVideoId }),
      );
      if (rows.some((r) => r.outcome === "refused")) return { refused: true, rows: [] };
      return {
        refused: false,
        rows: rows.map((r) => ({
          videoId: String(r.video_id),
          uploadId: str(r.upload_id),
          assetId: str(r.asset_id),
          previousStatus: r.previous_status as HostedVideoStatus,
        })),
      };
    },
    async confirmDeleted(videoId) {
      await rpc("confirm_memorial_video_deleted_v1", { p_video_id: videoId });
    },
  };
}
