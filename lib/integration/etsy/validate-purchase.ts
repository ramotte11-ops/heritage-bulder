import type { OfferId } from "@/config/offers";
import { ETSY_LISTING_MAPPINGS, type EtsyListingMapping } from "./listing-mapping";
import { resolveEtsyListingToOffer } from "./resolve-listing";

/**
 * Mission 017 — receiving and validating an Etsy purchase, stopping
 * short of creating or activating anything. This module answers exactly
 * one question: "is this purchase information valid and understandable
 * enough for HERITAGE, and which OfferId does it correspond to?" Turning
 * a `ValidatedEtsyPurchase` into an `Entitlement` is Mission 018, not
 * this one — nothing here writes, issues a key, or touches
 * `lib/entitlement/`.
 *
 * `input` is deliberately typed `unknown`, not `EtsyPurchaseInput`: this
 * is the boundary where untrusted external data first enters HERITAGE —
 * whatever shape a future webhook handler hands it, TypeScript's
 * compile-time types offer no protection once that data has crossed a
 * network boundary. `EtsyPurchaseInput` documents the shape this
 * function accepts; validation itself is fully structural at runtime, so
 * a malformed payload is refused explicitly instead of producing
 * `undefined`s that slip through as if they were valid strings/numbers.
 *
 * No real Etsy API/webhook format is assumed — we do not have one yet.
 * This is a transport-agnostic contract a future adapter will populate
 * from whatever Etsy actually sends.
 */

/** The shape a purchase notification is expected to carry, once a caller
 * has already extracted it from whatever transport delivered it. Etsy's
 * own vocabulary stops here: nothing past this file's `validateEtsyPurchase`
 * ever sees a raw Etsy payload again. */
export interface EtsyPurchaseInput {
  /** Etsy's own transaction/receipt identifier, taken verbatim — never
   * parsed, never derived. The stable value Mission 018 will key
   * idempotent Entitlement issuance on: the same externalPurchaseId
   * validated twice must produce the same ValidatedEtsyPurchase, so a
   * later duplicate delivery can be recognised and refused rather than
   * issuing a second right. */
  readonly externalPurchaseId: string;
  /** Etsy's own listing identifier — resolved to an `OfferId` through
   * Mission 016's `resolveEtsyListingToOffer`, never interpreted here. */
  readonly listingId: string;
  /** Units of this listing on this purchase. Required because Mission
   * 018 needs to know how many rights a purchase grants — not merely
   * carried along "in case". */
  readonly quantity: number;
  /** Etsy's own payment/order state for this purchase, taken verbatim.
   * Only a purchase already marked paid is accepted — see
   * `ACCEPTABLE_PAYMENT_STATE` below. */
  readonly paymentState: string;
}

/** The one payment state this build treats as good enough to validate a
 * purchase. Every other value — "pending", "cancelled", "refunded", a
 * typo, anything not yet known — is refused explicitly. This is not the
 * full vocabulary Etsy's real API may use; it is deliberately narrow
 * until a real, documented Etsy payment-state contract is wired in. */
const ACCEPTABLE_PAYMENT_STATE = "paid";

/**
 * What survives validation. Deliberately minimal: no buyer email, no
 * address, no phone, no payment details, no free-text title or SKU — see
 * this module's own tests for the explicit proof that extra fields on
 * the input never reach here. `listingId` is kept only for traceability
 * inside the Etsy integration layer (support, logs); nothing in
 * `lib/entitlement/`, `lib/builder/` or `lib/memorial/` needs, or may
 * import, it.
 */
export interface ValidatedEtsyPurchase {
  readonly externalPurchaseId: string;
  readonly listingId: string;
  readonly offerId: OfferId;
  readonly quantity: number;
}

export type EtsyPurchaseRejectionReason =
  /** Not a plain object, or a required field has the wrong JavaScript
   * type entirely — the payload is not even structurally what this
   * contract expects. */
  | { reason: "malformedInput" }
  | { reason: "missingExternalPurchaseId" }
  | { reason: "missingListingId" }
  | { reason: "invalidQuantity" }
  | { reason: "unacceptablePaymentState"; paymentState: string }
  /** The listing is well-formed but Mission 016's mapping does not know
   * it — never a fallback offer, never a guess. */
  | { reason: "unknownListing"; listingId: string };

export type ValidateEtsyPurchaseResult =
  | { status: "validated"; purchase: ValidatedEtsyPurchase }
  | ({ status: "rejected" } & EtsyPurchaseRejectionReason);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates a raw purchase notification and, on success, resolves its
 * listing to an `OfferId` via Mission 016's mapping — reused, never
 * duplicated: this function calls `resolveEtsyListingToOffer`, it does
 * not re-implement listing resolution.
 *
 * Exact structural validation, no exceptions for ordinary refusals: every
 * rejection is a typed `{ status: "rejected", reason }`, never a thrown
 * error — a malformed or unrecognised purchase is an expected outcome of
 * receiving external input, not a programming bug.
 */
export function validateEtsyPurchase(
  input: unknown,
  mappings: readonly EtsyListingMapping[] = ETSY_LISTING_MAPPINGS,
): ValidateEtsyPurchaseResult {
  if (!isPlainObject(input)) {
    return { status: "rejected", reason: "malformedInput" };
  }

  const { externalPurchaseId, listingId, quantity, paymentState } = input;

  if (
    typeof externalPurchaseId !== "string" ||
    typeof listingId !== "string" ||
    typeof quantity !== "number" ||
    typeof paymentState !== "string"
  ) {
    return { status: "rejected", reason: "malformedInput" };
  }

  if (externalPurchaseId.trim().length === 0) {
    return { status: "rejected", reason: "missingExternalPurchaseId" };
  }

  if (listingId.trim().length === 0) {
    return { status: "rejected", reason: "missingListingId" };
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { status: "rejected", reason: "invalidQuantity" };
  }

  if (paymentState !== ACCEPTABLE_PAYMENT_STATE) {
    return { status: "rejected", reason: "unacceptablePaymentState", paymentState };
  }

  const resolution = resolveEtsyListingToOffer(listingId, mappings);
  if (resolution.status === "unknownListing") {
    return { status: "rejected", reason: "unknownListing", listingId };
  }

  return {
    status: "validated",
    purchase: {
      externalPurchaseId,
      listingId,
      offerId: resolution.offerId,
      quantity,
    },
  };
}
