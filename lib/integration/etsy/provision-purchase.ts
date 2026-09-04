import type { EntitlementSource } from "@/config/entitlements";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import { issueEntitlementWithActivationKey } from "@/lib/entitlement/issue-entitlement";
import type { Entitlement } from "@/types/entitlement";
import type { ValidatedEtsyPurchase } from "./validate-purchase";

/**
 * Mission 018 — turning Mission 017's `ValidatedEtsyPurchase` into
 * exactly ONE HERITAGE right, with exactly ONE activation key issued at
 * the first provisioning.
 *
 * This module is pure composition. It owns no persistence logic, no key
 * generation, no uniqueness strategy of its own: it translates Etsy's
 * vocabulary into the channel-agnostic input Mission 013's
 * `issueEntitlementWithActivationKey` already takes, and translates that
 * mission's outcome back into an Etsy-side result. Everything that makes
 * this safe under concurrency — the single INSERT, the raw key that
 * never reaches persistence — lives there and in the repository, and is
 * reused rather than re-implemented.
 *
 * It lives under `lib/integration/etsy/` and not in `lib/entitlement/`
 * for the same reason Missions 016/017 do: the dependency runs one way.
 * Etsy may know about HERITAGE's domain; the domain must never learn
 * that Etsy exists (see etsy-boundary.test.ts).
 *
 * Mission 018 creates NO Memorial, NO Owner, and carries NO buyer
 * identity. A right issued here is `available` with `owner_id = NULL`;
 * the Owner is resolved later, at redemption, from verified Auth
 * identity — never from an Etsy payload. A paid order is a commercial
 * fact, not an authentication.
 */

/** The channel label the schema already carries. Declared here, in the
 * Etsy layer, so nothing in `lib/entitlement/` ever has to name Etsy. */
const ETSY_SOURCE: EntitlementSource = "etsy";

/**
 * Product rule, V1: one purchase grants one right, which grants one
 * memorial. A multi-unit purchase is therefore refused explicitly rather
 * than silently provisioned as one — and never fanned out into several
 * rights, which would need several `externalOrderId`s the order does not
 * have. Supporting quantity > 1 is a product decision (and a schema
 * conversation about per-unit order references), not something this
 * module may improvise.
 */
const SUPPORTED_QUANTITY = 1;

export type EtsyProvisioningRejectionReason =
  /** The purchase is for more (or fewer) than one unit. Nothing written. */
  | { reason: "unsupportedQuantity"; quantity: number }
  /** The offer id is not one this build knows. Structurally unreachable
   * from a genuine `ValidatedEtsyPurchase` (Mission 016 resolves listings
   * against the configured mapping), kept because this is a boundary: a
   * value that crossed a network is checked, not trusted. Nothing
   * written. */
  | { reason: "invalidOffer" };

export type ProvisionEtsyPurchaseResult =
  | {
      status: "provisioned";
      entitlement: Entitlement;
      /**
       * The one and only moment this value exists outside the buyer's
       * hands. It is never stored, never logged, and deliberately absent
       * from every other result below.
       */
      rawActivationKey: string;
    }
  /**
   * This purchase already has its right — the same delivery replayed, or
   * two deliveries racing. The existing right is returned as-is.
   *
   * No key. That is a deliberate product decision, not an omission: the
   * raw key is not stored and cannot be re-read, so a retry cannot
   * legitimately produce it again. Minting a fresh one here would silently
   * invalidate the key the buyer may already hold, on nothing more than a
   * duplicate webhook delivery. If a first provisioning committed but its
   * response was lost, recovery is Mission 015B's explicit, audited Admin
   * key rotation — a support action, never an automatic side effect.
   */
  | { status: "alreadyProvisioned"; entitlement: Entitlement }
  | ({ status: "rejected" } & EtsyProvisioningRejectionReason);

export interface ProvisionEtsyPurchaseDeps {
  entitlementRepository: EntitlementRepository;
}

/**
 * Provisions a validated Etsy purchase.
 *
 * Idempotent by construction, not by inspection: there is no "does this
 * order already exist?" read before the write anywhere on this path. The
 * attempt is always made, and PostgreSQL's
 * `entitlements_external_order_unique (source, external_order_id)` is
 * what decides. A check-then-insert would leave a window in which two
 * concurrent deliveries of the same receipt both see nothing and both
 * insert; the unique index has no such window.
 *
 * Only three values ever reach the domain: the resolved `offerId`, the
 * `"etsy"` channel label, and Etsy's own order reference. `listingId`
 * stays here — it is Etsy's identifier for its own catalogue, useful for
 * support inside this layer and meaningless past it.
 */
export async function provisionEtsyPurchase(
  { entitlementRepository }: ProvisionEtsyPurchaseDeps,
  purchase: ValidatedEtsyPurchase,
): Promise<ProvisionEtsyPurchaseResult> {
  if (purchase.quantity !== SUPPORTED_QUANTITY) {
    // Refused before the repository is touched at all: an unsupported
    // quantity must cost zero writes and zero generated keys.
    return { status: "rejected", reason: "unsupportedQuantity", quantity: purchase.quantity };
  }

  const outcome = await issueEntitlementWithActivationKey(
    { entitlementRepository },
    {
      offerId: purchase.offerId,
      source: ETSY_SOURCE,
      // Etsy's own receipt/transaction id, verbatim. This is the value
      // the unique index keys on, so it is passed through untouched —
      // never trimmed, normalised or re-derived, which would let the
      // same order land twice under two different references.
      externalOrderId: purchase.externalPurchaseId,
    },
  );

  if (outcome.status === "invalidOffer") {
    return { status: "rejected", reason: "invalidOffer" };
  }

  if (outcome.status === "duplicateExternalOrder") {
    return { status: "alreadyProvisioned", entitlement: outcome.entitlement };
  }

  return {
    status: "provisioned",
    entitlement: outcome.entitlement,
    rawActivationKey: outcome.rawActivationKey,
  };
}
