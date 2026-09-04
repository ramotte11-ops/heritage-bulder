import { describe, expect, it } from "vitest";
import { OFFER_IDS } from "@/config/offers";
import type { EtsyListingMapping } from "./listing-mapping";
import { validateEtsyPurchase } from "./validate-purchase";

/**
 * Mission 017 — receiving and validating an Etsy purchase, stopping
 * short of creating anything. All listing IDs and purchase IDs here are
 * fixtures: no real Etsy listing or order exists yet, and none of these
 * values are, or will ever be, mistaken for real ones.
 */

const FIXTURE_MAPPINGS: readonly EtsyListingMapping[] = [
  { listingId: "TEST-FIXTURE-OCCIDENTAL", offerId: "occidental" },
  { listingId: "TEST-FIXTURE-ARABE", offerId: "arabe" },
];

function validPurchase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalPurchaseId: "TEST-FIXTURE-ORDER-1",
    listingId: "TEST-FIXTURE-OCCIDENTAL",
    quantity: 1,
    paymentState: "paid",
    ...overrides,
  };
}

describe("validateEtsyPurchase", () => {
  it("1. a structurally valid purchase with a known listing validates with the right OfferId", () => {
    const result = validateEtsyPurchase(validPurchase(), FIXTURE_MAPPINGS);

    expect(result).toEqual({
      status: "validated",
      purchase: {
        externalPurchaseId: "TEST-FIXTURE-ORDER-1",
        listingId: "TEST-FIXTURE-OCCIDENTAL",
        offerId: "occidental",
        quantity: 1,
      },
    });
  });

  it("2. an unknown listing is refused explicitly", () => {
    const result = validateEtsyPurchase(
      validPurchase({ listingId: "TEST-FIXTURE-NEVER-CONFIGURED" }),
      FIXTURE_MAPPINGS,
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "unknownListing",
      listingId: "TEST-FIXTURE-NEVER-CONFIGURED",
    });
  });

  it("3. a blank externalPurchaseId is refused", () => {
    expect(validateEtsyPurchase(validPurchase({ externalPurchaseId: "" }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "missingExternalPurchaseId",
    });
    expect(validateEtsyPurchase(validPurchase({ externalPurchaseId: "   " }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "missingExternalPurchaseId",
    });
  });

  it("4. a blank listingId is refused", () => {
    expect(validateEtsyPurchase(validPurchase({ listingId: "" }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "missingListingId",
    });
    expect(validateEtsyPurchase(validPurchase({ listingId: "   " }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "missingListingId",
    });
  });

  it("5. no approximate/fallback matching — case, prefix or suffix variants of a known listing are unknown", () => {
    expect(
      validateEtsyPurchase(validPurchase({ listingId: "test-fixture-occidental" }), FIXTURE_MAPPINGS),
    ).toEqual({ status: "rejected", reason: "unknownListing", listingId: "test-fixture-occidental" });

    expect(
      validateEtsyPurchase(validPurchase({ listingId: "TEST-FIXTURE-OCCIDENTAL-EXTRA" }), FIXTURE_MAPPINGS),
    ).toEqual({
      status: "rejected",
      reason: "unknownListing",
      listingId: "TEST-FIXTURE-OCCIDENTAL-EXTRA",
    });
  });

  it("6. really calls Mission 016's resolveEtsyListingToOffer — a mapping change alone changes the outcome", () => {
    const retargeted: readonly EtsyListingMapping[] = [
      { listingId: "TEST-FIXTURE-OCCIDENTAL", offerId: "juif" },
    ];

    const result = validateEtsyPurchase(validPurchase(), retargeted);

    expect(result).toEqual({
      status: "validated",
      purchase: {
        externalPurchaseId: "TEST-FIXTURE-ORDER-1",
        listingId: "TEST-FIXTURE-OCCIDENTAL",
        offerId: "juif",
        quantity: 1,
      },
    });
  });

  it("7. the same externalPurchaseId validated twice stays identical and stable — Mission 018's idempotence hook", () => {
    const first = validateEtsyPurchase(validPurchase(), FIXTURE_MAPPINGS);
    const second = validateEtsyPurchase(validPurchase(), FIXTURE_MAPPINGS);

    expect(first).toEqual(second);
    expect(first.status).toBe("validated");
    expect(second.status).toBe("validated");
    if (first.status === "validated" && second.status === "validated") {
      expect(first.purchase.externalPurchaseId).toBe(second.purchase.externalPurchaseId);
    }
  });

  it("8. unnecessary/personal data on the input never reaches ValidatedEtsyPurchase", () => {
    const result = validateEtsyPurchase(
      validPurchase({
        buyerEmail: "buyer@example.test",
        shippingAddress: "1 Fixture Street",
        buyerPhone: "+1-555-0100",
        cardLast4: "4242",
        listingTitle: "A fixture title mentioning a culture by name",
        sku: "SKU-FIXTURE-123",
      }),
      FIXTURE_MAPPINGS,
    );

    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;

    expect(Object.keys(result.purchase).sort()).toEqual([
      "externalPurchaseId",
      "listingId",
      "offerId",
      "quantity",
    ]);
    expect(JSON.stringify(result.purchase)).not.toContain("buyer@example.test");
    expect(JSON.stringify(result.purchase)).not.toContain("1 Fixture Street");
    expect(JSON.stringify(result.purchase)).not.toContain("555-0100");
    expect(JSON.stringify(result.purchase)).not.toContain("4242");
    expect(JSON.stringify(result.purchase)).not.toContain("SKU-FIXTURE-123");
  });

  it("9. every one of the five real HERITAGE offers is reachable through fixtures", () => {
    const fixtures: EtsyListingMapping[] = OFFER_IDS.map((offerId, index) => ({
      listingId: `TEST-FIXTURE-ALL-OFFERS-${index}`,
      offerId,
    }));

    for (const fixture of fixtures) {
      const result = validateEtsyPurchase(
        validPurchase({ externalPurchaseId: `TEST-FIXTURE-ORDER-${fixture.listingId}`, listingId: fixture.listingId }),
        fixtures,
      );

      expect(result).toEqual({
        status: "validated",
        purchase: {
          externalPurchaseId: `TEST-FIXTURE-ORDER-${fixture.listingId}`,
          listingId: fixture.listingId,
          offerId: fixture.offerId,
          quantity: 1,
        },
      });
    }
  });

  it("rejects a non-object input as malformed, never throws", () => {
    for (const bad of [null, undefined, "a string", 42, [], ["array", "input"]]) {
      expect(validateEtsyPurchase(bad, FIXTURE_MAPPINGS)).toEqual({
        status: "rejected",
        reason: "malformedInput",
      });
    }
  });

  it("rejects wrong field types as malformed, never coerces them", () => {
    expect(validateEtsyPurchase(validPurchase({ quantity: "1" }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "malformedInput",
    });
    expect(validateEtsyPurchase(validPurchase({ externalPurchaseId: 123 }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "malformedInput",
    });
    expect(validateEtsyPurchase(validPurchase({ paymentState: null }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "malformedInput",
    });
  });

  it("rejects a missing required field as malformed", () => {
    const withoutQuantity = {
      externalPurchaseId: "TEST-FIXTURE-ORDER-1",
      listingId: "TEST-FIXTURE-OCCIDENTAL",
      paymentState: "paid",
    };
    expect(validateEtsyPurchase(withoutQuantity, FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "malformedInput",
    });
  });

  it("rejects a zero, negative, or non-integer quantity", () => {
    expect(validateEtsyPurchase(validPurchase({ quantity: 0 }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "invalidQuantity",
    });
    expect(validateEtsyPurchase(validPurchase({ quantity: -1 }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "invalidQuantity",
    });
    expect(validateEtsyPurchase(validPurchase({ quantity: 1.5 }), FIXTURE_MAPPINGS)).toEqual({
      status: "rejected",
      reason: "invalidQuantity",
    });
  });

  it("rejects a purchase state that is not the one acceptable state, without guessing", () => {
    for (const paymentState of ["pending", "cancelled", "refunded", "PAID", "paid "]) {
      expect(validateEtsyPurchase(validPurchase({ paymentState }), FIXTURE_MAPPINGS)).toEqual({
        status: "rejected",
        reason: "unacceptablePaymentState",
        paymentState,
      });
    }
  });

  it("never derives an offer from a listing title, SKU, or free text — only listingId is consulted", () => {
    const result = validateEtsyPurchase(
      validPurchase({
        listingId: "TEST-FIXTURE-NEVER-CONFIGURED",
        listingTitle: "Occidental / Intemporel Memorial",
        sku: "occidental-v1",
      }),
      FIXTURE_MAPPINGS,
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "unknownListing",
      listingId: "TEST-FIXTURE-NEVER-CONFIGURED",
    });
  });

  it("defaults to the real (currently empty) Mission 016 configuration when no mapping is passed", () => {
    expect(validateEtsyPurchase(validPurchase())).toEqual({
      status: "rejected",
      reason: "unknownListing",
      listingId: "TEST-FIXTURE-OCCIDENTAL",
    });
  });
});
