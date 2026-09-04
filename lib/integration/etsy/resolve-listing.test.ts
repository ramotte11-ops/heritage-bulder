import { describe, expect, it } from "vitest";
import { OFFER_IDS } from "@/config/offers";
import type { EtsyListingMapping } from "./listing-mapping";
import { resolveEtsyListingToOffer } from "./resolve-listing";

/**
 * Mission 016 — resolution behaviour. All listing IDs here are fixtures:
 * the Etsy shop has no real listings yet, so none of these are, or will
 * ever be mistaken for, a real Etsy listing ID.
 */

const FIXTURE_MAPPINGS: readonly EtsyListingMapping[] = [
  { listingId: "TEST-FIXTURE-OCCIDENTAL", offerId: "occidental" },
  { listingId: "TEST-FIXTURE-ARABE", offerId: "arabe" },
];

describe("resolveEtsyListingToOffer", () => {
  it("resolves a known listing to exactly the right OfferId", () => {
    expect(resolveEtsyListingToOffer("TEST-FIXTURE-OCCIDENTAL", FIXTURE_MAPPINGS)).toEqual({
      status: "resolved",
      offerId: "occidental",
    });
  });

  it("refuses an unknown listing explicitly — never a default offer", () => {
    expect(resolveEtsyListingToOffer("TEST-FIXTURE-NEVER-CONFIGURED", FIXTURE_MAPPINGS)).toEqual({
      status: "unknownListing",
    });
  });

  it("refuses an empty mapping — a legitimate pre-launch state, not a crash", () => {
    expect(resolveEtsyListingToOffer("TEST-FIXTURE-OCCIDENTAL", [])).toEqual({
      status: "unknownListing",
    });
  });

  it("never falls back to a case-insensitive or partial match", () => {
    expect(resolveEtsyListingToOffer("test-fixture-occidental", FIXTURE_MAPPINGS)).toEqual({
      status: "unknownListing",
    });
    expect(resolveEtsyListingToOffer("TEST-FIXTURE-OCCIDENTAL-EXTRA", FIXTURE_MAPPINGS)).toEqual({
      status: "unknownListing",
    });
    expect(resolveEtsyListingToOffer("FIXTURE-OCCIDENTAL", FIXTURE_MAPPINGS)).toEqual({
      status: "unknownListing",
    });
  });

  it("every one of the five real HERITAGE offers can be targeted through this mechanism", () => {
    const fixtures: EtsyListingMapping[] = OFFER_IDS.map((offerId, index) => ({
      listingId: `TEST-FIXTURE-ALL-OFFERS-${index}`,
      offerId,
    }));

    for (const fixture of fixtures) {
      expect(resolveEtsyListingToOffer(fixture.listingId, fixtures)).toEqual({
        status: "resolved",
        offerId: fixture.offerId,
      });
    }
  });

  it("defaults to the real (currently empty) configuration when no mapping is passed", () => {
    expect(resolveEtsyListingToOffer("TEST-FIXTURE-OCCIDENTAL")).toEqual({ status: "unknownListing" });
  });
});
