import { OFFER_IDS, type OfferId } from "@/config/offers";

/**
 * Mission 016 — the only place HERITAGE knows an Etsy listing ID exists.
 *
 * Etsy is a sales channel, not a domain concept: `config/offers.ts`
 * already documents that an Offer is "never named or shaped after Etsy
 * specifically", and `EntitlementSource` (`config/entitlements.ts`) is
 * the only place a channel is represented at all — as an opaque label,
 * not a coupling. This module is the one place that turns Etsy's own
 * commercial identifier (a listing ID) into a HERITAGE `OfferId`. Nothing
 * under `lib/entitlement/`, `lib/builder/`, `lib/memorial/` or
 * `config/offers.ts` may import it — see `etsy-boundary.test.ts`.
 *
 * We do not yet have real Etsy listing IDs (the shop isn't live). Real
 * IDs belong here, one per line, the day each Etsy listing exists — this
 * array stays empty until then, and an empty array is a legitimate,
 * fully-supported state: `resolveEtsyListingToOffer` (`resolve-listing.ts`)
 * simply refuses every listing ID as unknown until it is filled in.
 *
 * Deliberately NOT the resolution logic itself (see `resolve-listing.ts`):
 * this file is pure data + the validation that keeps that data honest.
 */

export interface EtsyListingMapping {
  /** Etsy's own listing ID, taken verbatim from the shop — never parsed,
   * never derived from a title, never guessed. */
  readonly listingId: string;
  readonly offerId: OfferId;
}

/**
 * The real mapping. Empty until the Etsy shop's listings exist — filling
 * it in is the only change needed to go live with a given offer; nothing
 * else in this file, or in `resolve-listing.ts`, changes.
 *
 * Example of what a real entry will look like (kept commented out: no
 * invented listing ID is checked in as if it were real):
 *   { listingId: "1234567890", offerId: "occidental" },
 */
export const ETSY_LISTING_MAPPINGS: readonly EtsyListingMapping[] = [];

export type EtsyListingMappingValidationError =
  | { reason: "emptyListingId"; index: number }
  | { reason: "duplicateListingId"; listingId: string }
  | { reason: "unknownOfferId"; listingId: string; offerId: string };

/**
 * Pure validation, deliberately decoupled from `EtsyListingMapping`'s own
 * `offerId: OfferId` type: the type system already stops a typo in this
 * file's literal array, but this function is also what a test uses to
 * prove that a mapping pointing at a nonexistent offer is caught — which
 * requires accepting a wider `offerId: string` than the real config ever
 * will contain.
 */
export function validateEtsyListingMappings(
  mappings: readonly { listingId: string; offerId: string }[],
): EtsyListingMappingValidationError[] {
  const errors: EtsyListingMappingValidationError[] = [];
  const seenListingIds = new Set<string>();
  const knownOfferIds: readonly string[] = OFFER_IDS;

  mappings.forEach((mapping, index) => {
    if (mapping.listingId.trim().length === 0) {
      errors.push({ reason: "emptyListingId", index });
      return;
    }

    if (seenListingIds.has(mapping.listingId)) {
      errors.push({ reason: "duplicateListingId", listingId: mapping.listingId });
    }
    seenListingIds.add(mapping.listingId);

    if (!knownOfferIds.includes(mapping.offerId)) {
      errors.push({ reason: "unknownOfferId", listingId: mapping.listingId, offerId: mapping.offerId });
    }
  });

  return errors;
}

// Validated once, at module load: a misconfigured mapping (a duplicate
// listing ID, or one pointing at an offer that does not exist) must fail
// fast at startup, never resolve silently to the wrong offer — or to no
// offer at all — the first time a real order comes in. An empty array is
// always valid, so this never blocks starting the project before the
// Etsy shop exists.
const configurationErrors = validateEtsyListingMappings(ETSY_LISTING_MAPPINGS);
if (configurationErrors.length > 0) {
  throw new Error(
    `Invalid ETSY_LISTING_MAPPINGS configuration: ${JSON.stringify(configurationErrors)}`,
  );
}
