import { describe, expect, it } from "vitest";
import { OFFER_IDS } from "@/config/offers";
import { ETSY_LISTING_MAPPINGS, validateEtsyListingMappings } from "./listing-mapping";

/**
 * Mission 016 — the mapping's own validation, exercised directly against
 * fixtures. None of the listing IDs below are real Etsy listing IDs: the
 * shop has none yet, and this file must never be mistaken for a source of
 * real ones.
 */

describe("ETSY_LISTING_MAPPINGS (the real configuration)", () => {
  it("is empty — no Etsy shop exists yet, and that is a legitimate state", () => {
    expect(ETSY_LISTING_MAPPINGS).toEqual([]);
  });

  it("passes its own validation (already proven at module load, asserted again explicitly)", () => {
    expect(validateEtsyListingMappings(ETSY_LISTING_MAPPINGS)).toEqual([]);
  });
});

describe("validateEtsyListingMappings", () => {
  it("accepts an empty mapping — starting the project before Etsy listings exist must never be blocked", () => {
    expect(validateEtsyListingMappings([])).toEqual([]);
  });

  it("accepts one fixture entry per real HERITAGE offer", () => {
    const fixtures = OFFER_IDS.map((offerId, index) => ({
      listingId: `TEST-FIXTURE-LISTING-${index}`,
      offerId,
    }));

    expect(validateEtsyListingMappings(fixtures)).toEqual([]);
  });

  it("rejects a blank listing ID", () => {
    expect(validateEtsyListingMappings([{ listingId: "", offerId: "occidental" }])).toEqual([
      { reason: "emptyListingId", index: 0 },
    ]);
  });

  it("rejects a whitespace-only listing ID", () => {
    expect(validateEtsyListingMappings([{ listingId: "   ", offerId: "occidental" }])).toEqual([
      { reason: "emptyListingId", index: 0 },
    ]);
  });

  it("rejects two entries sharing the same listing ID, even pointing at different offers", () => {
    const errors = validateEtsyListingMappings([
      { listingId: "TEST-FIXTURE-DUPLICATE", offerId: "occidental" },
      { listingId: "TEST-FIXTURE-DUPLICATE", offerId: "arabe" },
    ]);

    expect(errors).toEqual([{ reason: "duplicateListingId", listingId: "TEST-FIXTURE-DUPLICATE" }]);
  });

  it("rejects a mapping pointing at an offer id that does not exist", () => {
    const errors = validateEtsyListingMappings([
      { listingId: "TEST-FIXTURE-UNKNOWN-OFFER", offerId: "not-a-real-offer" },
    ]);

    expect(errors).toEqual([
      { reason: "unknownOfferId", listingId: "TEST-FIXTURE-UNKNOWN-OFFER", offerId: "not-a-real-offer" },
    ]);
  });

  it("reports every error found, not just the first", () => {
    const errors = validateEtsyListingMappings([
      { listingId: "TEST-FIXTURE-DUPLICATE", offerId: "occidental" },
      { listingId: "TEST-FIXTURE-DUPLICATE", offerId: "occidental" },
      { listingId: "TEST-FIXTURE-BAD-OFFER", offerId: "not-a-real-offer" },
      { listingId: "", offerId: "occidental" },
    ]);

    expect(errors).toEqual([
      { reason: "duplicateListingId", listingId: "TEST-FIXTURE-DUPLICATE" },
      { reason: "unknownOfferId", listingId: "TEST-FIXTURE-BAD-OFFER", offerId: "not-a-real-offer" },
      { reason: "emptyListingId", index: 3 },
    ]);
  });
});
