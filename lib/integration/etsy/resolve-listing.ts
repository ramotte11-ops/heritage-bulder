import type { OfferId } from "@/config/offers";
import { ETSY_LISTING_MAPPINGS, type EtsyListingMapping } from "./listing-mapping";

/**
 * Mission 016 — turns an Etsy listing ID into a HERITAGE `OfferId`, or
 * says explicitly that it does not know one.
 *
 * Exact string match only, against the configured mapping
 * (`listing-mapping.ts`) — never a prefix, a case-insensitive compare, a
 * substring, or anything derived from an Etsy listing's title. A listing
 * ID this build does not recognise is refused, not guessed at: there is
 * no default offer and no "closest match".
 *
 * `mappings` defaults to the real configuration and exists as a parameter
 * only so tests can exercise this function against fixtures without
 * touching `ETSY_LISTING_MAPPINGS` itself.
 */
export type ResolveEtsyListingToOfferResult =
  | { status: "resolved"; offerId: OfferId }
  | { status: "unknownListing" };

export function resolveEtsyListingToOffer(
  listingId: string,
  mappings: readonly EtsyListingMapping[] = ETSY_LISTING_MAPPINGS,
): ResolveEtsyListingToOfferResult {
  const match = mappings.find((mapping) => mapping.listingId === listingId);
  return match ? { status: "resolved", offerId: match.offerId } : { status: "unknownListing" };
}
