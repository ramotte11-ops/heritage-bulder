import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  EntitlementRepository,
  RedeemEntitlementOutcome,
} from "@/lib/adapters/entitlement-repository";
import type { EntitlementSource, EntitlementStatus } from "@/config/entitlements";
import type { MemorialType } from "@/config/memorial";
import type { OfferId } from "@/config/offers";
import type { Skin } from "@/config/skins";
import type { Entitlement } from "@/types/entitlement";

/**
 * SERVER ONLY. `entitlements` has no client-facing UPDATE policy and
 * `redeem_entitlement` is executable by `service_role` alone (Mission
 * 011A), so this repository only works with the service-role client
 * (lib/supabase/service-role-client.ts). Never import this file from a
 * Client Component or anything reachable from one —
 * lib/entitlement/server-only-boundary.test.ts enforces that.
 */

interface EntitlementRow {
  id: string;
  source: EntitlementSource;
  external_order_id: string | null;
  offer_id: OfferId;
  status: EntitlementStatus;
  owner_id: string | null;
  created_at: string;
  redeemed_at: string | null;
  updated_at: string;
}

interface RedeemRow {
  memorial_id: string;
  outcome: "redeemed" | "already_redeemed";
}

function toEntitlement(row: EntitlementRow): Entitlement {
  return {
    id: row.id,
    source: row.source,
    externalOrderId: row.external_order_id,
    offerId: row.offer_id,
    status: row.status,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The SQLSTATEs `redeem_entitlement()` raises, mapped to this
 * application's vocabulary. Translating them HERE is the point of the
 * adapter: no SQLSTATE, SQL message, hint or stack ever travels past
 * this file, so nothing downstream (and eventually no UI) can leak one.
 * See supabase/migrations/20260901120000_redeem_entitlement.sql.
 */
type RedeemRefusalStatus = Exclude<
  RedeemEntitlementOutcome["status"],
  "redeemed" | "alreadyRedeemed"
>;

const REDEEM_ERROR_STATUS: Record<string, RedeemRefusalStatus> = {
  HH404: "notFound",
  HH403: "ownedByAnotherOwner",
  HH409: "notAvailable",
  HH500: "integrityAnomaly",
};

export class SupabaseEntitlementRepository implements EntitlementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(entitlementId: string): Promise<Entitlement | null> {
    const { data, error } = await this.client
      .from("entitlements")
      .select("*")
      .eq("id", entitlementId)
      .maybeSingle<EntitlementRow>();

    if (error) throw error;
    return data ? toEntitlement(data) : null;
  }

  async redeem({
    entitlementId,
    ownerId,
    memorialType,
    skinId,
  }: {
    entitlementId: string;
    ownerId: string;
    memorialType: MemorialType;
    skinId: Skin;
  }): Promise<RedeemEntitlementOutcome> {
    const { data, error } = await this.client.rpc("redeem_entitlement", {
      p_entitlement_id: entitlementId,
      p_owner_id: ownerId,
      p_memorial_type: memorialType,
      p_skin_id: skinId,
    });

    if (error) {
      const mapped = REDEEM_ERROR_STATUS[(error as PostgrestError).code];
      if (mapped) return { status: mapped };
      // Anything else is a genuine infrastructure failure, not a
      // business outcome — it must reject rather than be flattened into
      // a refusal a caller could mistake for a decision.
      throw error;
    }

    // `returns table (...)` comes back as a row set. Normalised rather
    // than indexed blindly, so a single-object response shape cannot
    // silently read as "no row".
    const rows: RedeemRow[] = Array.isArray(data) ? data : data ? [data] : [];
    const row = rows[0];
    if (!row) {
      // The function always returns exactly one row on success. No row
      // and no error means the data does not match the contract.
      return { status: "integrityAnomaly" };
    }

    return row.outcome === "already_redeemed"
      ? { status: "alreadyRedeemed", memorialId: row.memorial_id }
      : { status: "redeemed", memorialId: row.memorial_id };
  }
}
