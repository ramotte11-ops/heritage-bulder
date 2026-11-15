import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UNKNOWN_OWNER_FREE_PUBLICATION_STATUS,
  type OwnerFreePublicationStatus,
  type OwnerFreePublicationStatusRepository,
} from "@/lib/adapters/owner-free-publication-status-repository";

/** Raw row returned by owner_free_publication_status_v1. */
interface StatusRow {
  free_status?: unknown;
  window_status?: unknown;
  window_until?: unknown;
  renews_at?: unknown;
  renewal?: unknown;
  active_free_drafts?: unknown;
  max_free_drafts?: unknown;
}

function firstRow(data: unknown): StatusRow | null {
  if (Array.isArray(data)) {
    return data.length === 1 && data[0] !== null && typeof data[0] === "object"
      ? (data[0] as StatusRow)
      : null;
  }
  return data !== null && typeof data === "object" ? (data as StatusRow) : null;
}

function storedInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function countsOf(row: StatusRow): { activeFreeDrafts: number; maxFreeDrafts: number } | null {
  if (
    !Number.isInteger(row.active_free_drafts) ||
    !Number.isInteger(row.max_free_drafts) ||
    (row.active_free_drafts as number) < 0 ||
    (row.max_free_drafts as number) <= 0
  ) {
    return null;
  }
  return {
    activeFreeDrafts: row.active_free_drafts as number,
    maxFreeDrafts: row.max_free_drafts as number,
  };
}

/**
 * SERVER ONLY. The RPC is executable by `service_role` alone. Every malformed
 * or unavailable result maps to `unknown`; this adapter never reconstructs a
 * right from memorial rows.
 */
export class SupabaseOwnerFreePublicationStatusRepository
  implements OwnerFreePublicationStatusRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async read(ownerId: string): Promise<OwnerFreePublicationStatus> {
    let response: { data: unknown; error: unknown };
    try {
      response = await this.client.rpc("owner_free_publication_status_v1", {
        p_owner_id: ownerId,
      });
    } catch {
      return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;
    }
    if (response.error) return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;

    const row = firstRow(response.data);
    if (row === null) return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;
    const counts = countsOf(row);
    if (counts === null) return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;

    if (
      row.free_status === "window_open" &&
      (row.window_status === "inherit" || row.window_status === "waiver_inherit") &&
      row.renewal === "not_applicable" &&
      row.renews_at === null &&
      storedInstant(row.window_until)
    ) {
      return { status: "window_open", windowUntil: row.window_until, ...counts };
    }

    if (
      row.free_status === "opens_on_next_save" &&
      (row.window_status === "open_new" || row.window_status === "waiver_new") &&
      row.window_until === null &&
      row.renewal === "not_applicable" &&
      row.renews_at === null
    ) {
      return { status: "opens_on_next_save", ...counts };
    }

    if (
      (row.free_status === "used" || row.free_status === "expired") &&
      row.window_status === "unavailable" &&
      row.window_until === null &&
      (row.renewal === "scheduled" || row.renewal === "undetermined")
    ) {
      if (row.renewal === "scheduled" && !storedInstant(row.renews_at)) {
        return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;
      }
      if (row.renewal === "undetermined" && row.renews_at !== null) {
        return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;
      }
      return {
        status: row.free_status,
        renewsAt: row.renewal === "scheduled" ? (row.renews_at as string) : null,
        ...counts,
      };
    }

    return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;
  }
}
