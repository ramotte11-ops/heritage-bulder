import type { EtsyPurchaseInput } from "./validate-purchase";

/**
 * Mission 019B — the ONLY place HERITAGE knows the shape of a real Etsy
 * `ShopReceipt`.
 *
 * Missions 016-019 built the commercial path against a deliberately
 * transport-agnostic `EtsyPurchaseInput`, because no real Etsy payload
 * was available yet. This file is the adapter that finally populates it,
 * and it is the boundary in the strictest sense: past
 * `toEtsyPurchaseInput`, nothing in this codebase — not even the rest of
 * `lib/integration/etsy/` — sees an Etsy receipt again.
 *
 * Everything here is pure and structural. A receipt arrives as `unknown`
 * and is validated field by field at runtime, exactly like
 * ./validate-purchase.ts does for the purchase itself, and for the same
 * reason: this data crossed a network, so TypeScript's compile-time
 * types are worth nothing here.
 *
 * ## What this file does NOT decide
 *
 * It does not resolve a listing to an Offer, does not decide whether a
 * payment state is acceptable, does not issue anything. Those are
 * Missions 016/017/018, reused verbatim — `toEtsyPurchaseInput` hands
 * `validateEtsyPurchase` a value in the vocabulary it already speaks and
 * stops there.
 *
 * The one judgement this file DOES make is structural eligibility: a
 * receipt HERITAGE cannot map onto "1 purchase = 1 entitlement = 1
 * memorial" at all — no line items, several line items, or a line item
 * for more than one unit — is refused here, with a reason, before any
 * offer resolution is attempted. That is not a second validation of the
 * same rule; it is the arithmetic that decides which single line item
 * `EtsyPurchaseInput` is even about.
 */

/** The line items this file understands, narrowed to what we use. */
export interface ParsedEtsyTransaction {
  listingId: string;
  quantity: number;
}

/**
 * A `ShopReceipt`, narrowed to the fields Mission 019B actually needs.
 *
 * Deliberately absent, and never read even though Etsy sends them: the
 * buyer's email, name, address lines, city, state, zip, country, the
 * message from the buyer, the gift message, and every payment detail.
 * They are not in this type, so no later code can reach them by
 * accident — the same discipline `ValidatedEtsyPurchase` already applies
 * one layer down.
 */
export interface ParsedEtsyReceipt {
  /** Etsy's own receipt id, as a string — this becomes the entitlement's
   * `external_order_id`, so it is carried verbatim and never re-derived. */
  receiptId: string;
  /**
   * The authenticated Etsy member who placed the order, or `null` for a
   * guest checkout. `null` is a first-class, expected value: it is the
   * signal that the nominal OAuth claim can never work for this order
   * and that support recovery is the only route.
   */
  buyerUserId: string | null;
  /** Etsy's own status, verbatim. Interpreted by ./validate-purchase.ts,
   * never here. */
  status: string;
  isPaid: boolean;
  transactions: ParsedEtsyTransaction[];
}

export type ParseEtsyReceiptResult =
  | { status: "parsed"; receipt: ParsedEtsyReceipt }
  /** Not shaped like a receipt at all. Never repaired, never partially
   * accepted. */
  | { status: "unreadable" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Etsy sends ids as JSON numbers. They are carried as strings from here
 * on, because an id is an identifier and not an arithmetic quantity —
 * and because `external_order_id` is a text column whose uniqueness
 * constraint must never depend on how a number was formatted.
 */
function readId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value) && value.length > 0) {
    if (value.length > 1 && value.startsWith("0")) return null;
    return value;
  }
  return null;
}

function readTransactions(value: unknown): ParsedEtsyTransaction[] | null {
  if (!Array.isArray(value)) return null;

  const transactions: ParsedEtsyTransaction[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;

    const listingId = readId(entry.listing_id);
    const quantity = entry.quantity;

    if (listingId === null) return null;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      return null;
    }

    transactions.push({ listingId, quantity });
  }

  return transactions;
}

/**
 * Reads one raw `ShopReceipt` from the Etsy API.
 *
 * `buyer_user_id` is read through `readId`, which returns `null` for
 * Etsy's own `null` — the guest case — and equally for anything that is
 * not a clean non-negative integer. Both collapse to "no buyer identity
 * on this receipt", which is the only safe reading: a value we cannot
 * parse must never be treated as a member who could match somebody.
 */
export function parseEtsyReceipt(input: unknown): ParseEtsyReceiptResult {
  if (!isPlainObject(input)) return { status: "unreadable" };

  const receiptId = readId(input.receipt_id);
  if (receiptId === null) return { status: "unreadable" };

  const status = input.status;
  if (typeof status !== "string" || status.trim().length === 0) {
    return { status: "unreadable" };
  }

  // Absent is treated as false rather than as a reason to reject the
  // whole receipt: `status` is the authority on payment, and `is_paid`
  // is the corroborating second opinion below.
  const isPaid = input.is_paid === true;

  const transactions = readTransactions(input.transactions);
  if (transactions === null) return { status: "unreadable" };

  return {
    status: "parsed",
    receipt: {
      receiptId,
      buyerUserId: readId(input.buyer_user_id),
      status,
      isPaid,
      transactions,
    },
  };
}

export type EtsyReceiptStructureRejection =
  /** No line item at all — nothing was bought that we could grant. */
  | { reason: "noTransaction" }
  /**
   * Several line items on one receipt. HERITAGE's V1 rule is one
   * purchase -> one right -> one memorial, and a receipt carrying two
   * different listings has no single answer to "which offer is this?".
   * Refused rather than resolved by picking one.
   */
  | { reason: "multipleTransactions"; count: number }
  /** One line item, but for more than one unit. Refused here for the
   * same reason Mission 018 refuses it downstream: several rights would
   * need several order references this receipt does not have. */
  | { reason: "unsupportedQuantity"; quantity: number }
  /** Etsy does not consider this receipt paid, whatever its status
   * string says. */
  | { reason: "notPaid" };

export type EtsyReceiptToPurchaseResult =
  | { status: "usable"; purchase: EtsyPurchaseInput }
  | ({ status: "rejected" } & EtsyReceiptStructureRejection);

/**
 * Turns a parsed receipt into the channel-agnostic input Missions
 * 016-019 already know how to validate and provision.
 *
 * `paymentState` is Etsy's own `status` string, passed through
 * untouched: deciding which states are acceptable belongs to
 * ./validate-purchase.ts, which is the single place that rule lives.
 * Duplicating it here — "reject canceled" — would be a second
 * vocabulary that could one day disagree with the first.
 *
 * The `is_paid` check is not that duplication. It is a separate,
 * narrower fact Etsy reports independently, and requiring both to agree
 * costs nothing while closing the gap where a receipt reads `paid` in
 * one field and unpaid in another.
 */
export function toEtsyPurchaseInput(receipt: ParsedEtsyReceipt): EtsyReceiptToPurchaseResult {
  if (receipt.transactions.length === 0) {
    return { status: "rejected", reason: "noTransaction" };
  }
  if (receipt.transactions.length > 1) {
    return {
      status: "rejected",
      reason: "multipleTransactions",
      count: receipt.transactions.length,
    };
  }

  const [transaction] = receipt.transactions;
  if (transaction.quantity !== 1) {
    return { status: "rejected", reason: "unsupportedQuantity", quantity: transaction.quantity };
  }

  if (!receipt.isPaid) {
    return { status: "rejected", reason: "notPaid" };
  }

  return {
    status: "usable",
    purchase: {
      externalPurchaseId: receipt.receiptId,
      listingId: transaction.listingId,
      quantity: transaction.quantity,
      paymentState: receipt.status,
    },
  };
}
