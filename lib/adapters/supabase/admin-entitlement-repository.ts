import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminActivationKeyMutationOutcome,
  AdminEntitlementRepository,
  AdminRevokeEntitlementOutcome,
} from "@/lib/adapters/admin-entitlement-repository";

/**
 * SERVER ONLY. Mission 015B — the audited Admin mutations, wired to
 * PostgreSQL.
 *
 * Every WRITE here is exactly one `.rpc(...)` call and nothing else.
 * That is deliberate and load-bearing, not a style preference: this
 * class must never issue a direct UPDATE on `entitlements` (the way
 * `SupabaseEntitlementRepository.swapActivationKey` does), because that
 * would be a second, unaudited way to change `activation_key_hash` or
 * `status` from application code — the exact regression the Opus audit
 * flagged and lib/admin/admin-entitlement-repository-boundary.test.ts
 * exists to catch. If a future change to this file ever needs a direct
 * table write, it belongs in a new SQL function instead, with its own
 * audit row.
 *
 * `mutateActivationKey` also does exactly one plain, unlocked SELECT —
 * added after review, to give the RPC a real compare-and-swap without
 * ever asking the caller (which does not, and must not, know the raw
 * key) to supply the expected hash. This read is not itself the source
 * of correctness: it is a snapshot that may be stale by the time the
 * RPC's own `FOR UPDATE` runs, and that is fine, because the RPC
 * re-checks it against the row it just locked and refuses on a
 * mismatch. See admin_mutate_activation_key() in
 * supabase/migrations/20260904100000_admin_audit_and_mutations.sql.
 *
 * Uses the service-role client, like every other Admin adapter since
 * Mission 015A. Never import this from a Client Component —
 * lib/entitlement/server-only-boundary.test.ts enforces that.
 */

interface EntitlementHashRow {
  activation_key_hash: string | null;
}

interface MutateActivationKeyRow {
  outcome:
    | "replaced"
    | "invalidated"
    | "not_found"
    | "not_available"
    | "key_mismatch"
    | "no_activation_key";
}

interface RevokeEntitlementRow {
  outcome: "revoked" | "not_found" | "not_available";
  blocking_status: "available" | "redeemed" | "revoked" | null;
}

/** Both RPCs raise only for a genuine invariant failure (see the
 * migration) — every business refusal comes back as a row. A NULL
 * `admin_auth_user_id` reaching the database would mean the server-side
 * wiring itself is broken, which must reject rather than be
 * reinterpreted as a business outcome. */
function rethrowUnlessBusinessOutcome(error: PostgrestError): never {
  throw error;
}

/**
 * `returns table (...)` comes back as a row set, but postgrest-js's own
 * `.returns<T[]>()` type helper rejects being told the result is an
 * array in a way that fights its single-object detection here — the
 * same shape callRedeem() in ../supabase/entitlement-repository.ts
 * already works around. Normalising `unknown` by hand keeps a
 * single-object response from silently reading as "no row" instead.
 */
function firstRow<T>(data: unknown): T | undefined {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows[0] as T | undefined;
}

export class SupabaseAdminEntitlementRepository implements AdminEntitlementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async mutateActivationKey({
    entitlementId,
    nextActivationKeyHash,
    adminAuthUserId,
  }: {
    entitlementId: string;
    nextActivationKeyHash: string | null;
    adminAuthUserId: string;
  }): Promise<AdminActivationKeyMutationOutcome> {
    // The snapshot the RPC's own compare-and-swap will check against —
    // see this class's docstring. A missing row here (entitlement
    // already gone) simply reads as `null`; the RPC determines
    // `not_found` for itself, independently, under its own lock.
    const expectedActivationKeyHash = await this.readCurrentActivationKeyHash(entitlementId);

    const { data, error } = await this.client.rpc("admin_mutate_activation_key", {
      p_entitlement_id: entitlementId,
      p_admin_auth_user_id: adminAuthUserId,
      p_expected_activation_key_hash: expectedActivationKeyHash,
      p_next_activation_key_hash: nextActivationKeyHash,
    });

    if (error) rethrowUnlessBusinessOutcome(error);

    const row = firstRow<MutateActivationKeyRow>(data);
    switch (row?.outcome) {
      case "replaced":
        return { status: "replaced" };
      case "invalidated":
        return { status: "invalidated" };
      case "not_found":
        return { status: "notFound" };
      case "not_available":
        return { status: "notAvailable" };
      case "key_mismatch":
        return { status: "concurrentModification" };
      case "no_activation_key":
        return { status: "noActivationKey" };
      default:
        // The function always returns exactly one row. No row and no
        // error means the response does not match the contract — a
        // genuine anomaly, not a business outcome to guess at.
        throw new Error("admin_mutate_activation_key returned no row");
    }
  }

  /**
   * A plain, unlocked read of the entitlement's current
   * `activation_key_hash` — never returned to any caller of this class,
   * only handed straight to admin_mutate_activation_key() as the value
   * its own row lock will re-check. See this class's docstring for why
   * staleness here is harmless.
   */
  private async readCurrentActivationKeyHash(entitlementId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("entitlements")
      .select("activation_key_hash")
      .eq("id", entitlementId)
      .maybeSingle<EntitlementHashRow>();

    if (error) throw error;
    return data ? data.activation_key_hash : null;
  }

  async revokeEntitlement({
    entitlementId,
    adminAuthUserId,
  }: {
    entitlementId: string;
    adminAuthUserId: string;
  }): Promise<AdminRevokeEntitlementOutcome> {
    const { data, error } = await this.client.rpc("admin_revoke_entitlement", {
      p_entitlement_id: entitlementId,
      p_admin_auth_user_id: adminAuthUserId,
    });

    if (error) rethrowUnlessBusinessOutcome(error);

    const row = firstRow<RevokeEntitlementRow>(data);
    switch (row?.outcome) {
      case "revoked":
        return { status: "revoked" };
      case "not_found":
        return { status: "notFound" };
      case "not_available": {
        // The RPC only ever refuses `not_available` for a right that is
        // 'redeemed' or 'revoked' — 'available' would have succeeded,
        // and nothing else exists in ENTITLEMENT_STATUSES.
        const blockingStatus = row.blocking_status;
        if (blockingStatus !== "redeemed" && blockingStatus !== "revoked") {
          throw new Error(
            `admin_revoke_entitlement returned not_available with an unexpected blocking_status: ${String(blockingStatus)}`,
          );
        }
        return { status: "notAvailable", blockingStatus };
      }
      default:
        throw new Error("admin_revoke_entitlement returned no row");
    }
  }
}
