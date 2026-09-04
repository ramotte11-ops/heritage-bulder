import { ETSY_LISTING_MAPPINGS, type EtsyListingMapping } from "./listing-mapping";
import {
  provisionEtsyPurchase,
  type ProvisionEtsyPurchaseDeps,
  type ProvisionEtsyPurchaseResult,
} from "./provision-purchase";
import { validateEtsyPurchase, type EtsyPurchaseRejectionReason } from "./validate-purchase";

/**
 * Mission 019 — the one commercial boundary of the Etsy channel: an
 * untrusted purchase notification goes in, a typed commercial outcome
 * comes out, and every anomalous case has a name.
 *
 * This module is composition and nothing else. It adds no validation
 * rule, no mapping, no provisioning logic, no second vocabulary:
 *
 *   unknown input
 *       -> validateEtsyPurchase()   Mission 017 (which reuses Mission 016)
 *       -> provisionEtsyPurchase()  Mission 018
 *       -> ReceiveEtsyPurchaseResult
 *
 * Its whole reason to exist is that, before it, no single function could
 * answer the commercial question "what happened to this order?". A caller
 * had to run two steps and stitch two result types together — and the
 * stitching is exactly where a boundary starts guessing: defaulting an
 * unmapped listing to an offer, retrying a malformed payload "just in
 * case", treating a contradiction as a duplicate. None of that is
 * possible here: a rejected validation is returned verbatim and
 * provisioning is never reached.
 *
 * What this module refuses to do is as important as what it does. It
 * never repairs a payload, never picks a default offer, never widens the
 * supported quantity, never re-issues a key for an order that already has
 * a right, and never rewrites an existing right's offer. An incoherent
 * case produces an explicit refusal and zero additional mutation.
 */

/**
 * Every outcome of the Etsy commercial path, expressed with the types the
 * missions before it already defined — deliberately not a new enum
 * mirroring them:
 *
 * - `provisioned`        first provisioning; carries the raw activation
 *                        key, the only moment it exists (Mission 018);
 * - `alreadyProvisioned` this order already had its right, for the same
 *                        offer — a retry, not an error, and never a key;
 * - `rejected`           refused, with the reason that refused it. Two
 *                        families, both pre-existing and both final:
 *
 *   before provisioning (`EtsyPurchaseRejectionReason`, Mission 017):
 *     malformedInput, missingExternalPurchaseId, missingListingId,
 *     invalidQuantity, unacceptablePaymentState, unknownListing —
 *     none of which ever reach the repository;
 *
 *   at provisioning (`EtsyProvisioningRejectionReason`, Mission 018):
 *     unsupportedQuantity, offerMismatch, invalidOffer — none of which
 *     write a row or mint a key.
 *
 * A technical failure is absent from this union on purpose: an
 * infrastructure error is not a commercial outcome. It propagates as a
 * rejected promise, exactly as Mission 018 leaves it, and is never
 * flattened into `unknownListing`, `alreadyProvisioned`, or any other
 * refusal that would tell a caller "this order is settled" when nothing
 * is settled at all.
 */
export type ReceiveEtsyPurchaseResult =
  | ProvisionEtsyPurchaseResult
  | ({ status: "rejected" } & EtsyPurchaseRejectionReason);

export type ReceiveEtsyPurchaseDeps = ProvisionEtsyPurchaseDeps;

/**
 * Receives one Etsy purchase notification and returns what became of it.
 *
 * `input` stays `unknown` all the way to `validateEtsyPurchase`: this is
 * still the outer edge, and nothing here inspects, coerces or pre-parses
 * the payload before that function does — a second reading of the same
 * bytes is how two components end up disagreeing about what arrived.
 *
 * `mappings` defaults to the real configuration and exists as a parameter
 * only so tests can exercise this function against fixtures, matching
 * Missions 016/017 exactly.
 */
export async function receiveEtsyPurchase(
  deps: ReceiveEtsyPurchaseDeps,
  input: unknown,
  mappings: readonly EtsyListingMapping[] = ETSY_LISTING_MAPPINGS,
): Promise<ReceiveEtsyPurchaseResult> {
  const validation = validateEtsyPurchase(input, mappings);

  if (validation.status === "rejected") {
    // Returned as-is, not re-wrapped: Mission 017's reason IS the answer,
    // and re-mapping it here would be the second terminology this module
    // exists to avoid. Provisioning is not reached, so a refused purchase
    // costs zero repository calls and zero generated keys — the property
    // that makes "refused before provisioning" true by construction
    // rather than by convention.
    return validation;
  }

  // No try/catch. A repository or infrastructure failure must stay a
  // failure: swallowing it into a typed refusal here would turn "we do
  // not know whether this order was provisioned" into "this order was
  // refused", and a caller would stop retrying an order that may well
  // have no right at all.
  return provisionEtsyPurchase(deps, validation.purchase);
}
