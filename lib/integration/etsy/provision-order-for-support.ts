import type { AdminAuditRepository } from "@/lib/adapters/admin-audit-repository";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import { ETSY_LISTING_MAPPINGS, type EtsyListingMapping } from "./listing-mapping";
import { parseEtsyReceipt, toEtsyPurchaseInput } from "./receipt";
import { receiveEtsyPurchase } from "./receive-purchase";

/**
 * SERVER/ADMIN ONLY. Mission 019B — the guest-checkout recovery path.
 *
 * ## The problem it closes
 *
 * An Etsy guest checkout carries no `buyer_user_id`, so the nominal
 * OAuth claim can never match it — no mechanism will ever change that,
 * because the identity simply does not exist on the receipt. Mission
 * 019B's audit found that HERITAGE's doctrine of "guest -> HH1 support
 * recovery" was, at that point, an empty promise: in an OAuth-only
 * ingestion the entitlement is created AT claim time, a guest never
 * claims, so no right was ever created — and the Admin surface had no
 * way to create one. Support had nothing to rotate a key on.
 *
 * ## The rule that shapes this file
 *
 * Staff may NOT conjure a right by typing trusted-looking data. The only
 * input is an Etsy order reference, and HERITAGE then asks ETSY whether
 * that order exists, is ours, and is payable:
 *
 *   order reference
 *     -> getShopReceipt() against OUR OWN shop_id   (a receipt that is
 *        not ours simply 404s — the path is shop-scoped)
 *     -> parseEtsyReceipt()                          structural read
 *     -> buyer_user_id IS NULL                       genuinely a guest
 *     -> toEtsyPurchaseInput()                       1 line item, 1 unit
 *     -> receiveEtsyPurchase()                       Missions 016-019
 *     -> the right, and its one activation key
 *
 * Every eligibility rule — payment state, listing -> Offer, quantity —
 * is the SAME code the OAuth path runs. There is no second provisioning
 * logic and no staff override of any refusal: if Etsy says the order is
 * cancelled, this refuses, and no amount of Admin privilege changes
 * that.
 *
 * ## Why `buyer_user_id` must be null
 *
 * This surface exists for orders the nominal path structurally cannot
 * serve. An order that DOES carry a buyer id is claimable by its owner
 * through OAuth, and provisioning it here would let staff hand a key for
 * a purchase whose real buyer can prove ownership themselves. Refused as
 * `notGuestPurchase` — a redirection, not an error.
 */

export interface ProvisionOrderForSupportDeps {
  entitlementRepository: EntitlementRepository;
  auditRepository: AdminAuditRepository;
  /**
   * Fetches ONE receipt of our own shop by its id. Injected so this
   * module is testable without a network, and so the seller credential
   * never reaches it.
   *
   * Must resolve `null` when Etsy does not know the order for our shop,
   * and reject only on a genuine transport/authorisation failure — the
   * two are different answers and must not be confused.
   */
  fetchReceipt(receiptId: string): Promise<unknown | null>;
}

export type ProvisionOrderForSupportResult =
  /** The right now exists and this call created it. Carries the raw
   * activation key — the one and only moment it exists outside the
   * family's hands. */
  | { status: "provisioned"; entitlementId: string; rawActivationKey: string }
  /**
   * A right already existed for this order. Deliberately carries NO key:
   * the raw key is not stored and cannot be re-read, so this path cannot
   * legitimately produce it. Issuing a fresh one here would silently
   * invalidate a key the family may already hold, on nothing more than a
   * staff member looking the order up twice. Re-keying is Mission 015B's
   * explicit, audited replacement — a separate, deliberate action.
   */
  | { status: "alreadyProvisioned"; entitlementId: string }
  /** Etsy does not know this order for our shop. */
  | { status: "orderNotFound" }
  /** The order exists but has an authenticated buyer — it belongs on the
   * nominal OAuth path, not here. */
  | { status: "notGuestPurchase" }
  /** Etsy knows the order but it cannot be provisioned: not paid,
   * cancelled, refunded, an unknown listing, more than one unit, more
   * than one line item. */
  | { status: "notEligible"; reason: string }
  /** Etsy could not be reached. Nothing was written. */
  | { status: "etsyUnavailable" };

export async function provisionEtsyOrderForSupport(
  deps: ProvisionOrderForSupportDeps,
  {
    receiptId,
    adminAuthUserId,
  }: {
    /** Exactly as staff typed it, already trimmed by the caller. */
    receiptId: string;
    /** From the validated admin session. Never from a browser. */
    adminAuthUserId: string;
  },
  mappings: readonly EtsyListingMapping[] = ETSY_LISTING_MAPPINGS,
): Promise<ProvisionOrderForSupportResult> {
  let raw: unknown | null;
  try {
    raw = await deps.fetchReceipt(receiptId);
  } catch {
    // Swallowed rather than surfaced: an Etsy error can carry response
    // detail, and none of Etsy's vocabulary reaches an Admin screen
    // either. Nothing was written.
    return { status: "etsyUnavailable" };
  }

  if (raw === null) return { status: "orderNotFound" };

  const parsed = parseEtsyReceipt(raw);
  if (parsed.status !== "parsed") {
    // Etsy answered with something we cannot read as a receipt. Refusing
    // is the only safe reading — a partially understood order must never
    // become a right.
    return { status: "notEligible", reason: "unreadableReceipt" };
  }

  if (parsed.receipt.buyerUserId !== null) {
    return { status: "notGuestPurchase" };
  }

  const converted = toEtsyPurchaseInput(parsed.receipt);
  if (converted.status !== "usable") {
    return { status: "notEligible", reason: converted.reason };
  }

  const received = await receiveEtsyPurchase(
    { entitlementRepository: deps.entitlementRepository },
    converted.purchase,
    mappings,
  );

  if (received.status === "rejected") {
    return { status: "notEligible", reason: received.reason };
  }

  const isFirstProvisioning = received.status === "provisioned";

  // Structural facts only. No raw key, no hash, no buyer identity, no
  // email — see lib/adapters/admin-audit-repository.ts and Mission
  // 015B's own column comment. `external_order_id` is the order
  // reference staff already typed and the ledger's whole subject here,
  // so it is the one identifier recorded.
  await deps.auditRepository.record({
    adminAuthUserId,
    action: isFirstProvisioning
      ? "etsy_order.provisioned"
      : "etsy_order.provision_reattempted",
    targetType: "entitlement",
    targetId: received.entitlement.id,
    context: {
      external_order_id: converted.purchase.externalPurchaseId,
      guest_checkout: true,
      first_provisioning: isFirstProvisioning,
    },
  });

  if (isFirstProvisioning) {
    return {
      status: "provisioned",
      entitlementId: received.entitlement.id,
      // Returned exactly once, to authorised staff, and never persisted
      // or logged anywhere along the way.
      rawActivationKey: received.rawActivationKey,
    };
  }

  return { status: "alreadyProvisioned", entitlementId: received.entitlement.id };
}
