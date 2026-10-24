import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkinVariant } from "@/config/skins";
import type {
  AnchorFreeMemorialOutcome,
  CreateFreeMemorialOutcome,
  MemorialAccessRepository,
  MemorialUpgradeSource,
  UpgradeMemorialAccessOutcome,
} from "@/lib/adapters/memorial-access-repository";

/**
 * SERVER ONLY. The three HERITAGE Direct M1-A functions are executable by
 * `service_role` alone, so this adapter only works with the service-role
 * client (lib/supabase/service-role-client.ts).
 *
 * Every response is read defensively: no row, or an outcome this
 * contract does not know, fails CLOSED (`refused`), exactly like
 * SupabaseSymbolicOfferingRepository.
 */

/** The free offer is Intemporel only at launch (D8). */
const FREE_SKIN = "intemporel";

/** upgrade_memorial_access_v1: the reference was consumed concurrently. */
const REFERENCE_ALREADY_USED = "HD409";

interface CreateRow {
  outcome: string;
  memorial_id: string | null;
}

interface AnchorRow {
  outcome: string;
  free_anchor_at: string | null;
  free_publish_until: string | null;
  free_draft_until: string | null;
}

interface OutcomeRow {
  outcome: string;
}

function firstRow<T>(data: unknown): T | undefined {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows[0] as T | undefined;
}

export class SupabaseMemorialAccessRepository implements MemorialAccessRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createFreeMemorial({
    ownerId,
    skinVariant,
  }: {
    ownerId: string;
    skinVariant: SkinVariant;
  }): Promise<CreateFreeMemorialOutcome> {
    const { data, error } = await this.client.rpc("create_free_memorial_v1", {
      p_owner_id: ownerId,
      p_skin_id: FREE_SKIN,
      p_skin_variant: skinVariant,
    });
    if (error) throw error;

    const row = firstRow<CreateRow>(data);
    if (row?.outcome === "created" && typeof row.memorial_id === "string") {
      return { outcome: "created", memorialId: row.memorial_id };
    }
    if (row?.outcome === "free_draft_limit") return { outcome: "freeDraftLimit" };
    return { outcome: "refused" };
  }

  async anchorFreeMemorial({
    memorialId,
    ownerId,
  }: {
    memorialId: string;
    ownerId: string;
  }): Promise<AnchorFreeMemorialOutcome> {
    const { data, error } = await this.client.rpc("anchor_free_memorial_v1", {
      p_memorial_id: memorialId,
      p_owner_id: ownerId,
    });
    if (error) throw error;

    const row = firstRow<AnchorRow>(data);
    if (
      (row?.outcome === "anchored" || row?.outcome === "already_anchored") &&
      typeof row.free_anchor_at === "string" &&
      typeof row.free_publish_until === "string" &&
      typeof row.free_draft_until === "string"
    ) {
      return {
        outcome: row.outcome === "anchored" ? "anchored" : "alreadyAnchored",
        freeAnchorAt: row.free_anchor_at,
        freePublishUntil: row.free_publish_until,
        freeDraftUntil: row.free_draft_until,
      };
    }
    if (row?.outcome === "not_free") return { outcome: "notFree" };
    return { outcome: "refused" };
  }

  async upgradeMemorialAccess({
    memorialId,
    ownerId,
    source,
    externalReference,
  }: {
    memorialId: string;
    ownerId: string;
    source: MemorialUpgradeSource;
    externalReference: string;
  }): Promise<UpgradeMemorialAccessOutcome> {
    const { data, error } = await this.client.rpc("upgrade_memorial_access_v1", {
      p_memorial_id: memorialId,
      p_owner_id: ownerId,
      p_source: source,
      p_external_reference: externalReference,
    });
    if (error?.code === REFERENCE_ALREADY_USED) return "referenceConflict";
    if (error) throw error;

    const outcome = firstRow<OutcomeRow>(data)?.outcome;
    if (outcome === "upgraded") return "upgraded";
    if (outcome === "already_complete") return "alreadyComplete";
    return "refused";
  }
}
