import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type {
  BeginGuestTransferRow,
  GuestDraftTransferRepository,
  GuestTransferState,
  RecordGuestTransferMediaOutcome,
} from "@/lib/guest-draft/guest-draft-transfer";

/**
 * SERVER ONLY. QG 008 Lot 2 — the four guest-draft transfer functions are
 * executable by `service_role` alone (service-role client only).
 *
 * Every response is read defensively: no row, an unknown outcome or a
 * malformed field fails CLOSED (`refused` / `null`), like the other
 * HERITAGE Direct adapters.
 */

function firstRow<T>(data: unknown): T | undefined {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows[0] as T | undefined;
}

function isMediaMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isTransferStatus(value: unknown): value is GuestTransferState["status"] {
  return value === "started" || value === "completed";
}

interface BeginRow {
  outcome: string;
  memorial_id: string | null;
  transfer_status: string | null;
  media_map: unknown;
  draft_revision: number | null;
  anchor_outcome: string | null;
  free_publish_until: string | null;
  free_draft_until: string | null;
}

interface FindRow {
  memorial_id: string | null;
  transfer_status: string | null;
  media_map: unknown;
  base_draft_revision: number | null;
}

export class SupabaseGuestDraftTransferRepository implements GuestDraftTransferRepository {
  constructor(private readonly client: SupabaseClient) {}

  async begin(input: {
    ownerId: string;
    transferKey: string;
    sourceRevision: number;
    skinVariant: SkinVariant;
    language: Language | null;
  }): Promise<BeginGuestTransferRow> {
    const { data, error } = await this.client.rpc("begin_guest_draft_transfer_v1", {
      p_owner_id: input.ownerId,
      p_transfer_key: input.transferKey,
      p_source_revision: input.sourceRevision,
      p_skin_variant: input.skinVariant,
      p_language: input.language,
    });
    if (error) throw error;

    const row = firstRow<BeginRow>(data);
    if (row === undefined) return { outcome: "refused" };
    if (row.outcome === "active_draft_exists") {
      return { outcome: "active_draft_exists", memorialId: typeof row.memorial_id === "string" ? row.memorial_id : null };
    }
    if (
      (row.outcome === "created" || row.outcome === "resumed") &&
      typeof row.memorial_id === "string" &&
      isTransferStatus(row.transfer_status) &&
      isMediaMap(row.media_map) &&
      typeof row.draft_revision === "number"
    ) {
      return {
        outcome: row.outcome,
        memorialId: row.memorial_id,
        status: row.transfer_status,
        mediaMap: row.media_map,
        baseDraftRevision: row.draft_revision,
        anchorOutcome: row.anchor_outcome,
        freePublishUntil: row.free_publish_until,
        freeDraftUntil: row.free_draft_until,
      };
    }
    return { outcome: "refused" };
  }

  async find(input: { ownerId: string; transferKey: string }): Promise<GuestTransferState | null> {
    const { data, error } = await this.client.rpc("find_guest_draft_transfer_v1", {
      p_owner_id: input.ownerId,
      p_transfer_key: input.transferKey,
    });
    if (error) throw error;
    const row = firstRow<FindRow>(data);
    if (
      row === undefined ||
      typeof row.memorial_id !== "string" ||
      !isTransferStatus(row.transfer_status) ||
      !isMediaMap(row.media_map) ||
      typeof row.base_draft_revision !== "number"
    ) {
      return null;
    }
    return {
      memorialId: row.memorial_id,
      status: row.transfer_status,
      mediaMap: row.media_map,
      baseDraftRevision: row.base_draft_revision,
    };
  }

  async recordMedia(input: {
    ownerId: string;
    transferKey: string;
    localId: string;
    mediaId: string;
    purpose: "hero" | "gallery";
  }): Promise<RecordGuestTransferMediaOutcome> {
    const { data, error } = await this.client.rpc("record_guest_draft_transfer_media_v1", {
      p_owner_id: input.ownerId,
      p_transfer_key: input.transferKey,
      p_local_id: input.localId,
      p_media_id: input.mediaId,
      p_purpose: input.purpose,
    });
    if (error?.code === "22023") return "refused";
    if (error) throw error;
    const outcome = firstRow<{ outcome: string }>(data)?.outcome;
    return outcome === "recorded" || outcome === "already_recorded" || outcome === "conflict" ? outcome : "refused";
  }

  async complete(input: { ownerId: string; transferKey: string }): Promise<"completed" | "already_completed" | "refused"> {
    const { data, error } = await this.client.rpc("complete_guest_draft_transfer_v1", {
      p_owner_id: input.ownerId,
      p_transfer_key: input.transferKey,
    });
    if (error) throw error;
    const outcome = firstRow<{ outcome: string }>(data)?.outcome;
    return outcome === "completed" || outcome === "already_completed" ? outcome : "refused";
  }
}
