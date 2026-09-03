import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivationKeyWriteOutcome,
  EntitlementRepository,
  IssueEntitlementOutcome,
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

/**
 * Mission 013: named explicitly rather than `*`. The service role still
 * holds table-wide SELECT, so `*` would work — but it would also drag
 * `activation_key_hash` into every read that has no business seeing it,
 * and into any log or error that ever prints a row. The hash is read in
 * exactly one place (findByActivationKeyHash filters on it, and even
 * there does not select it back).
 */
// Exported since Mission 015A: the Admin support adapter reads
// entitlements too, and the set of columns that are safe to select must
// be defined in exactly one place. Two hand-maintained lists would
// eventually diverge, and the way they would diverge is by one of them
// gaining `activation_key_hash`.
export const ENTITLEMENT_COLUMNS =
  "id, source, external_order_id, offer_id, status, owner_id, created_at, redeemed_at, updated_at";

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
  // Mission 013: the key that got us here is no longer the current one.
  HH410: "activationKeySuperseded",
};

/** PostgreSQL's unique_violation. Mission 013 never treats this as a key
 * collision on its own — see `issueWithActivationKey`. */
const UNIQUE_VIOLATION = "23505";

export class SupabaseEntitlementRepository implements EntitlementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(entitlementId: string): Promise<Entitlement | null> {
    const { data, error } = await this.client
      .from("entitlements")
      .select(ENTITLEMENT_COLUMNS)
      .eq("id", entitlementId)
      .maybeSingle<EntitlementRow>();

    if (error) throw error;
    return data ? toEntitlement(data) : null;
  }

  async findByActivationKeyHash(activationKeyHash: string): Promise<Entitlement | null> {
    // Exact equality on an opaque 64-char hex value. Never `ilike`, never
    // any pattern operator — this is an identity boundary.
    const { data, error } = await this.client
      .from("entitlements")
      .select(ENTITLEMENT_COLUMNS)
      .eq("activation_key_hash", activationKeyHash)
      .maybeSingle<EntitlementRow>();

    if (error) throw error;
    return data ? toEntitlement(data) : null;
  }

  async findByExternalOrder(
    source: EntitlementSource,
    externalOrderId: string,
  ): Promise<Entitlement | null> {
    const { data, error } = await this.client
      .from("entitlements")
      .select(ENTITLEMENT_COLUMNS)
      .eq("source", source)
      .eq("external_order_id", externalOrderId)
      .maybeSingle<EntitlementRow>();

    if (error) throw error;
    return data ? toEntitlement(data) : null;
  }

  async issueWithActivationKey({
    offerId,
    source,
    externalOrderId,
    activationKeyHash,
  }: {
    offerId: OfferId;
    source: EntitlementSource;
    externalOrderId?: string | null;
    activationKeyHash: string;
  }): Promise<IssueEntitlementOutcome> {
    // One INSERT: the right and its key hash land together or not at all.
    // No SELECT beforehand to "check whether the order exists" — that
    // would be exactly the check-then-act race the unique index removes.
    const { data, error } = await this.client
      .from("entitlements")
      .insert({
        offer_id: offerId,
        source,
        external_order_id: externalOrderId ?? null,
        activation_key_hash: activationKeyHash,
      })
      .select(ENTITLEMENT_COLUMNS)
      .single<EntitlementRow>();

    if (error?.code === UNIQUE_VIOLATION) {
      // Which constraint fired? Established by READING, not by parsing a
      // human-readable Postgres message — those are not a stable API.
      //
      // Only (source, external_order_id) can legitimately collide here.
      // A collision on the key hash would mean two 160-bit CSPRNG draws
      // matched, which does not happen: it would mean a broken generator,
      // and silently issuing another key would hide that. So anything we
      // cannot explain as a duplicate order is re-thrown, loudly.
      if (externalOrderId != null) {
        const existing = await this.findByExternalOrder(source, externalOrderId);
        if (existing) return { status: "duplicateExternalOrder", entitlement: existing };
      }
      throw error;
    }
    if (error) throw error;

    return { status: "issued", entitlement: toEntitlement(data) };
  }

  async swapActivationKey({
    entitlementId,
    expectedActivationKeyHash,
    nextActivationKeyHash,
  }: {
    entitlementId: string;
    expectedActivationKeyHash: string | null;
    nextActivationKeyHash: string | null;
  }): Promise<ActivationKeyWriteOutcome> {
    // Compare-and-swap in ONE statement. The `status` and current-hash
    // predicates are part of the match, so a right that has been redeemed,
    // revoked, or re-keyed by somebody else simply matches nothing —
    // never a silent overwrite.
    let query = this.client
      .from("entitlements")
      .update({ activation_key_hash: nextActivationKeyHash })
      .eq("id", entitlementId)
      .eq("status", "available");

    query =
      expectedActivationKeyHash === null
        ? query.is("activation_key_hash", null)
        : query.eq("activation_key_hash", expectedActivationKeyHash);

    const { data, error } = await query.select("id");

    if (error) throw error;
    return (data?.length ?? 0) === 1 ? { status: "updated" } : { status: "rejected" };
  }

  async redeemWithActivationKey({
    entitlementId,
    expectedActivationKeyHash,
    ownerId,
    memorialType,
    skinId,
  }: {
    entitlementId: string;
    expectedActivationKeyHash: string;
    ownerId: string;
    memorialType: MemorialType;
    skinId: Skin;
  }): Promise<RedeemEntitlementOutcome> {
    return this.callRedeem("redeem_entitlement_with_activation_key", {
      p_entitlement_id: entitlementId,
      p_expected_key_hash: expectedActivationKeyHash,
      p_owner_id: ownerId,
      p_memorial_type: memorialType,
      p_skin_id: skinId,
    });
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
    return this.callRedeem("redeem_entitlement", {
      p_entitlement_id: entitlementId,
      p_owner_id: ownerId,
      p_memorial_type: memorialType,
      p_skin_id: skinId,
    });
  }

  /**
   * The one place Mission 011A's and Mission 013's SQLSTATEs are
   * translated. Shared by both redemption entry points so the mapping —
   * and the guarantee that no SQL detail travels past this file — cannot
   * drift between them.
   */
  private async callRedeem(
    functionName: string,
    args: Record<string, string>,
  ): Promise<RedeemEntitlementOutcome> {
    const { data, error } = await this.client.rpc(functionName, args);

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
