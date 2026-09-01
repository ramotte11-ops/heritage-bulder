import type { Entitlement } from "@/types/entitlement";
import type { MemorialType } from "@/config/memorial";
import type { Skin } from "@/config/skins";

/**
 * Mission 011B — the contract over `entitlements`, including the one
 * call that consumes a right.
 *
 * `redeem` is the application-side face of Mission 011A's
 * `redeem_entitlement()` PostgreSQL function
 * (supabase/migrations/20260901120000_redeem_entitlement.sql). It is a
 * port rather than a direct RPC call so the domain can be tested without
 * a database, and so raw SQLSTATEs never travel past this boundary.
 */
export type RedeemEntitlementOutcome =
  /** Consumed now; this memorial was created by this call. */
  | { status: "redeemed"; memorialId: string }
  /** Already consumed by this same owner; this is the memorial that
   * already existed. The same owner retrying after a lost response is a
   * network event, not a corruption — see Mission 011A. */
  | { status: "alreadyRedeemed"; memorialId: string }
  /** No entitlement with this id. */
  | { status: "notFound" }
  /** Revoked, or in any state that is not consumable. Nothing created,
   * nothing mutated. */
  | { status: "notAvailable" }
  /** Consumed, but by somebody else. Refused outright. */
  | { status: "ownedByAnotherOwner" }
  /** Marked redeemed with no memorial behind it — impossible through the
   * 011A function, whose two writes commit together. Surfaced as an
   * anomaly, never "repaired" by minting a second memorial. */
  | { status: "integrityAnomaly" };

export interface EntitlementRepository {
  /** Reads the entitlement, or null when no such row exists. */
  findById(entitlementId: string): Promise<Entitlement | null>;

  /**
   * Consumes the entitlement and creates its one memorial, atomically.
   *
   * `memorialType` and `skinId` must already be derived and validated
   * from `OFFERS[entitlement.offerId]` by the caller — this port, like
   * the SQL function behind it, never decides them and knows nothing
   * about offers, allowed skins, cultures or sales channels.
   *
   * `ownerId` must come from server-side identity resolution, never from
   * a request payload.
   *
   * Every expected outcome, including every refusal, comes back as a
   * value. Only a genuine infrastructure failure rejects.
   */
  redeem(input: {
    entitlementId: string;
    ownerId: string;
    memorialType: MemorialType;
    skinId: Skin;
  }): Promise<RedeemEntitlementOutcome>;
}
