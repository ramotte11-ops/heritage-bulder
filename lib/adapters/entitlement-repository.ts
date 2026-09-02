import type { Entitlement } from "@/types/entitlement";
import type { EntitlementSource } from "@/config/entitlements";
import type { OfferId } from "@/config/offers";
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
  | { status: "integrityAnomaly" }
  /** Mission 013 — the presented activation key is no longer the current
   * one (replaced or invalidated), established under the row lock.
   * Nothing consumed, nothing created. */
  | { status: "activationKeySuperseded" };

/** Mission 013 — outcomes of issuing a right together with its key. */
export type IssueEntitlementOutcome =
  | { status: "issued"; entitlement: Entitlement }
  /** A right already exists for this (source, externalOrderId). Never a
   * second right for one order — see entitlements_external_order_unique. */
  | { status: "duplicateExternalOrder"; entitlement: Entitlement };

/** Mission 013 — outcomes of a compare-and-swap on the activation key. */
export type ActivationKeyWriteOutcome =
  | { status: "updated" }
  /** Nothing matched: the right is not `available`, or its key is no
   * longer the one the caller expected (somebody replaced or invalidated
   * it first). Never an overwrite. */
  | { status: "rejected" };

export interface EntitlementRepository {
  /** Reads the entitlement, or null when no such row exists. */
  findById(entitlementId: string): Promise<Entitlement | null>;

  /**
   * Mission 013 — resolves a right from the hash of the activation key
   * presented. Exact equality on an opaque value; never a pattern.
   * Returns null when no right carries that hash, which deliberately
   * conflates "never existed", "replaced" and "invalidated": the caller
   * must not be able to tell them apart.
   */
  findByActivationKeyHash(activationKeyHash: string): Promise<Entitlement | null>;

  /** Mission 013 — reads a right by its commercial order reference. Used
   * ONLY to explain a unique violation after the fact, never to decide
   * whether to insert (no check-then-act). */
  findByExternalOrder(source: EntitlementSource, externalOrderId: string): Promise<Entitlement | null>;

  /**
   * Mission 013 — creates one right carrying the hash of its activation
   * key, in a single INSERT (atomic by construction, no transaction
   * needed).
   *
   * Receives ONLY the hash: the raw key never reaches this layer, so it
   * cannot be persisted, logged, or attached to an error by accident.
   */
  issueWithActivationKey(input: {
    offerId: OfferId;
    source: EntitlementSource;
    externalOrderId?: string | null;
    activationKeyHash: string;
  }): Promise<IssueEntitlementOutcome>;

  /**
   * Mission 013 — compare-and-swap of the activation key on a right that
   * is still `available`. One atomic statement: it matches only when the
   * current hash is exactly what the caller expected, so two concurrent
   * replacements cannot both believe they won.
   *
   * `nextActivationKeyHash: null` invalidates the key without touching
   * the right's commercial status — invalidating a key is NOT revoking a
   * right (that belongs to Mission 015).
   */
  swapActivationKey(input: {
    entitlementId: string;
    expectedActivationKeyHash: string | null;
    nextActivationKeyHash: string | null;
  }): Promise<ActivationKeyWriteOutcome>;

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

  /**
   * Mission 013 — the same redemption, but re-verifying under the
   * entitlement's row lock that `expectedActivationKeyHash` is still the
   * current key.
   *
   * Deliberately a separate method rather than an optional argument on
   * `redeem`: a right granted directly by HERITAGE has no key at all and
   * must keep redeeming through the keyless path unchanged.
   */
  redeemWithActivationKey(input: {
    entitlementId: string;
    expectedActivationKeyHash: string;
    ownerId: string;
    memorialType: MemorialType;
    skinId: Skin;
  }): Promise<RedeemEntitlementOutcome>;
}
