import { describe, expect, it } from "vitest";
import { parseEtsyReceipt, toEtsyPurchaseInput, type ParsedEtsyReceipt } from "./receipt";
import { validateEtsyPurchase } from "./validate-purchase";

/**
 * Mission 019B — the one place a real Etsy `ShopReceipt` is understood.
 *
 * Two things are asserted throughout: that a receipt HERITAGE cannot map
 * onto "1 purchase = 1 right = 1 memorial" is refused rather than
 * resolved by picking something, and that the fields Etsy sends but we
 * have no business holding never make it across.
 */

function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    receipt_id: 3216549870,
    buyer_user_id: 12345678,
    status: "paid",
    is_paid: true,
    transactions: [{ listing_id: 1122334455, quantity: 1 }],
    ...overrides,
  };
}

function parsed(overrides: Record<string, unknown> = {}): ParsedEtsyReceipt {
  const result = parseEtsyReceipt(receipt(overrides));
  if (result.status !== "parsed") throw new Error("fixture does not parse");
  return result.receipt;
}

describe("parseEtsyReceipt", () => {
  it("reads the fields Mission 019B needs, as strings for every id", () => {
    expect(parsed()).toEqual({
      receiptId: "3216549870",
      buyerUserId: "12345678",
      status: "paid",
      isPaid: true,
      transactions: [{ listingId: "1122334455", quantity: 1 }],
    });
  });

  it("reads a guest checkout as no buyer at all", () => {
    expect(parsed({ buyer_user_id: null }).buyerUserId).toBeNull();
  });

  it("treats an unparseable buyer id as no buyer, never as a member who could match", () => {
    for (const value of ["guest", -1, 12.5, {}]) {
      expect(parsed({ buyer_user_id: value }).buyerUserId).toBeNull();
    }
  });

  it("carries none of the personal data Etsy sends alongside", () => {
    const withPersonalData = receipt({
      buyer_email: "famille@example.test",
      name: "Une Famille",
      first_line: "12 rue des Lilas",
      city: "Lyon",
      zip: "69000",
      message_from_buyer: "en souvenir de maman",
      gift_message: "je pense à toi",
      payment_method: "cc",
    });

    const result = parseEtsyReceipt(withPersonalData);
    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;

    // Not merely hidden — absent. Nothing downstream can reach a field
    // that was never carried across the boundary.
    const serialised = JSON.stringify(result.receipt);
    for (const leak of [
      "famille@example.test",
      "Une Famille",
      "rue des Lilas",
      "Lyon",
      "69000",
      "souvenir",
      "je pense",
      "payment_method",
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it.each([
    ["not an object", "receipt"],
    ["null", null],
    ["an array", []],
    ["no receipt id", { status: "paid", transactions: [] }],
    ["a non-numeric receipt id", receipt({ receipt_id: "abc" })],
    ["no status", receipt({ status: undefined })],
    ["a blank status", receipt({ status: "   " })],
    ["transactions that are not an array", receipt({ transactions: {} })],
    ["a transaction without a listing", receipt({ transactions: [{ quantity: 1 }] })],
    ["a transaction with a zero quantity", receipt({ transactions: [{ listing_id: 1, quantity: 0 }] })],
    [
      "a transaction with a fractional quantity",
      receipt({ transactions: [{ listing_id: 1, quantity: 1.5 }] }),
    ],
  ])("refuses %s outright", (_label, input) => {
    expect(parseEtsyReceipt(input)).toEqual({ status: "unreadable" });
  });

  it("reads a missing is_paid as false rather than rejecting the receipt", () => {
    expect(parsed({ is_paid: undefined }).isPaid).toBe(false);
  });
});

describe("toEtsyPurchaseInput", () => {
  it("hands Missions 016-019 the vocabulary they already speak", () => {
    expect(toEtsyPurchaseInput(parsed())).toEqual({
      status: "usable",
      purchase: {
        externalPurchaseId: "3216549870",
        listingId: "1122334455",
        quantity: 1,
        paymentState: "paid",
      },
    });
  });

  it("passes Etsy's status through untouched — this file never judges it", () => {
    // Deciding which states are acceptable belongs to
    // validate-purchase.ts alone. A second list here is exactly the
    // divergence the boundary exists to prevent.
    for (const status of ["paid", "completed", "canceled", "fully refunded"]) {
      const result = toEtsyPurchaseInput(parsed({ status }));
      if (result.status === "usable") expect(result.purchase.paymentState).toBe(status);
    }
  });

  it("refuses a receipt with no line item", () => {
    expect(toEtsyPurchaseInput(parsed({ transactions: [] }))).toEqual({
      status: "rejected",
      reason: "noTransaction",
    });
  });

  it("refuses a multi-transaction receipt rather than picking one", () => {
    const multi = parsed({
      transactions: [
        { listing_id: 1122334455, quantity: 1 },
        { listing_id: 9988776655, quantity: 1 },
      ],
    });

    expect(toEtsyPurchaseInput(multi)).toEqual({
      status: "rejected",
      reason: "multipleTransactions",
      count: 2,
    });
  });

  it("refuses quantity > 1 — the QG's locked V1 doctrine, unchanged", () => {
    const two = parsed({ transactions: [{ listing_id: 1122334455, quantity: 2 }] });

    expect(toEtsyPurchaseInput(two)).toEqual({
      status: "rejected",
      reason: "unsupportedQuantity",
      quantity: 2,
    });
  });

  it("refuses a receipt Etsy does not report as paid, whatever its status says", () => {
    expect(toEtsyPurchaseInput(parsed({ is_paid: false }))).toEqual({
      status: "rejected",
      reason: "notPaid",
    });
  });
});

/**
 * The eligibility rule end to end, through the SAME function the claim
 * path uses as its predicate. These assertions are what actually pin the
 * QG's locked doctrine on cancellations and refunds.
 */
describe("receipt -> validateEtsyPurchase, on the real status vocabulary", () => {
  const MAPPINGS = [{ listingId: "1122334455", offerId: "intemporel" as const }];

  function validate(status: string) {
    const converted = toEtsyPurchaseInput(parsed({ status }));
    if (converted.status !== "usable") return { status: "rejected" as const };
    return validateEtsyPurchase(converted.purchase, MAPPINGS);
  }

  it.each(["paid", "completed"])("accepts a %s order", (status) => {
    expect(validate(status).status).toBe("validated");
  });

  it.each([
    "canceled",
    "fully refunded",
    "partially refunded",
    "open",
    "payment processing",
    "some future state nobody has seen",
  ])("refuses a %s order", (status) => {
    expect(validate(status).status).toBe("rejected");
  });

  it("refuses a listing the mapping does not know, with no fallback offer", () => {
    const converted = toEtsyPurchaseInput(parsed({ transactions: [{ listing_id: 42, quantity: 1 }] }));
    expect(converted.status).toBe("usable");
    if (converted.status !== "usable") return;

    expect(validateEtsyPurchase(converted.purchase, MAPPINGS)).toEqual({
      status: "rejected",
      reason: "unknownListing",
      listingId: "42",
    });
  });

  it("refuses every listing while the production mapping is still empty (fail-closed)", () => {
    const converted = toEtsyPurchaseInput(parsed());
    expect(converted.status).toBe("usable");
    if (converted.status !== "usable") return;

    // The real ETSY_LISTING_MAPPINGS is empty until the shop's listing
    // ids are configured. That is a supported state, and it must refuse
    // rather than guess.
    expect(validateEtsyPurchase(converted.purchase).status).toBe("rejected");
  });
});
