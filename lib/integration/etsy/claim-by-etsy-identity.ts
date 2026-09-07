import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Entitlement } from "@/types/entitlement";
import {
  completeRedemptionForResolvedRight,
  type RedeemAuthenticatedEntitlementResult,
} from "@/lib/entitlement/redeem-authenticated-entitlement";
import { resolveOwnerForIdentity, type AuthenticatedIdentity } from "@/lib/entitlement/resolve-owner";
import { ETSY_LISTING_MAPPINGS, type EtsyListingMapping } from "./listing-mapping";
import { parseEtsyReceipt, toEtsyPurchaseInput, type ParsedEtsyReceipt } from "./receipt";
import { receiveEtsyPurchase } from "./receive-purchase";
import { validateEtsyPurchase } from "./validate-purchase";
import { normalizeReceiptBuyerUserId } from "./oauth";
import type { EtsyPurchaseInput } from "./validate-purchase";

/**
 * Mission 019B — the couture itself:
 *
 *   an Etsy member id, proven by OAuth
 *     -> the receipts of OUR OWN shop that carry it as buyer_user_id
 *     -> the one eligible, unclaimed purchase among them
 *     -> receiveEtsyPurchase()                     (Missions 016-019)
 *     -> resolveOwnerForIdentity()                 (Mission 011B)
 *     -> completeRedemptionForResolvedRight()      (Mission 011B/013)
 *     -> a memorialId
 *
 * It composes. It owns no validation rule, no offer resolution, no key
 * generation, no persistence strategy and no redemption logic — every
 * one of those already exists and is called, never re-implemented.
 *
 * ## The proof of ownership, and why it is sound
 *
 * Both halves of the comparison come from Etsy, and neither comes from
 * the browser:
 *
 *   * `etsyUserId` is read from the numeric prefix of a token OUR server
 *     obtained from OUR own code exchange with Etsy over TLS
 *     (./oauth.ts). A browser cannot supply it — the caller of this
 *     function does not accept one from a request payload.
 *   * `buyer_user_id` is read from a receipt fetched with OUR OWN seller
 *     credential, scoped to OUR OWN `shop_id`.
 *
 * The comparison happens here, server-side, on normalised decimal
 * strings. `null` — guest checkout — can never match anything, by
 * construction: `normalizeReceiptBuyerUserId` returns `null` and `null`
 * is never compared equal to an id.
 *
 * The Etsy member id is used and discarded. It is never persisted, never
 * logged, never returned to the caller, and appears in no result below.
 *
 * ## Why several purchases are never resolved automatically
 *
 * "1 purchase = 1 entitlement = 1 memorial" means that when two
 * unclaimed purchases exist, there is no correct way to decide which one
 * this activation is for — and quietly consuming the older one would
 * spend a right the family may have meant for someone else. So more than
 * one is a controlled refusal that writes nothing at all, not a guess.
 */

/** One page of receipts per request. */
const RECEIPTS_PAGE_SIZE = 100;

/**
 * How many pages this will read before giving up.
 *
 * Etsy documents no filter by buyer on `getShopReceipts`, and Mission
 * 019B's brief forbids inventing an undocumented parameter, so the match
 * is a scan. The bound keeps one family's activation from turning into
 * an unbounded crawl of the whole shop history — at 100 per page this
 * covers the 1 000 most recent orders, comfortably beyond a pilot's
 * volume. Past that, a purchase is not "not found": it is
 * `noMatchingPurchase`, which routes to support recovery rather than
 * claiming anything.
 */
const MAX_RECEIPT_PAGES = 10;

export interface ClaimByEtsyIdentityDeps {
  ownerRepository: OwnerRepository;
  entitlementRepository: EntitlementRepository;
  /**
   * Reads one page of OUR OWN shop's receipts. Injected so this whole
   * function is testable without a network, and so the seller credential
   * never reaches this module: it is resolved by the wiring layer.
   */
  listReceiptsPage(input: { limit: number; offset: number }): Promise<unknown[]>;
}

export interface ClaimByEtsyIdentityInput {
  /** The real, server-established HERITAGE session. Never client-supplied. */
  identity: AuthenticatedIdentity;
  /** Parsed from the Etsy token prefix. Never client-supplied. */
  etsyUserId: string;
}

export type ClaimByEtsyIdentityResult =
  | { status: "claimed"; memorialId: string }
  /** Already claimed by this same person — a double callback, a back
   * button, a retried request. The same memorial, never a second one. */
  | { status: "alreadyClaimed"; memorialId: string }
  /** No receipt of our shop carries this Etsy member id. The guest
   * checkout case lands here too, and correctly so: a guest receipt
   * carries no buyer id at all. Routes to HH1 support recovery. */
  | { status: "noMatchingPurchase" }
  /** Receipts matched, but none is claimable: cancelled, refunded, an
   * unknown listing, more than one unit, already revoked. Deliberately
   * one answer for all of them. */
  | { status: "purchaseNotEligible" }
  /** More than one unclaimed eligible purchase. Nothing was written. */
  | { status: "multiplePurchases" }
  /** Etsy could not be reached or refused us. Nothing was written. */
  | { status: "etsyUnavailable" }
  /** Every other refusal — an identity this codebase will not mint an
   * owner from, a right owned by somebody else, a configuration
   * mismatch. Collapsed exactly as Mission 019C collapses the
   * activation-key refusals, and for the same reason. */
  | { status: "failed" };

interface MatchedPurchase {
  receipt: ParsedEtsyReceipt;
  purchase: EtsyPurchaseInput;
  /** The right already recorded for this order, when there is one. */
  existing: Entitlement | null;
}

/**
 * Reads our shop's receipts page by page and keeps only those that are
 * this Etsy member's AND that survive Missions 016/017's validation.
 *
 * `validateEtsyPurchase` is called here purely as a PREDICATE: it is a
 * pure function that writes nothing, so eligibility can be decided
 * before anything is provisioned. That ordering is what lets the
 * "several purchases" case cost zero writes.
 */
async function findEligiblePurchases(
  deps: ClaimByEtsyIdentityDeps,
  etsyUserId: string,
  mappings: readonly EtsyListingMapping[],
): Promise<MatchedPurchase[]> {
  const matched: MatchedPurchase[] = [];

  for (let page = 0; page < MAX_RECEIPT_PAGES; page += 1) {
    const rows = await deps.listReceiptsPage({
      limit: RECEIPTS_PAGE_SIZE,
      offset: page * RECEIPTS_PAGE_SIZE,
    });

    for (const row of rows) {
      const parsed = parseEtsyReceipt(row);
      if (parsed.status !== "parsed") continue;

      // The ownership test. A guest receipt yields `null` here and can
      // therefore never equal `etsyUserId`.
      if (normalizeReceiptBuyerUserId(parsed.receipt.buyerUserId) !== etsyUserId) continue;

      const converted = toEtsyPurchaseInput(parsed.receipt);
      if (converted.status !== "usable") continue;

      // Missions 016/017, reused as the eligibility rule: payment state,
      // listing -> Offer, quantity. No second vocabulary here.
      if (validateEtsyPurchase(converted.purchase, mappings).status !== "validated") continue;

      const existing = await deps.entitlementRepository.findByExternalOrder(
        "etsy",
        converted.purchase.externalPurchaseId,
      );

      matched.push({ receipt: parsed.receipt, purchase: converted.purchase, existing });
    }

    // A short page is the last page.
    if (rows.length < RECEIPTS_PAGE_SIZE) break;
  }

  return matched;
}

/** Provisions if needed, then redeems — both through existing primitives. */
async function claimOne(
  deps: ClaimByEtsyIdentityDeps,
  identity: AuthenticatedIdentity,
  candidate: MatchedPurchase,
  mappings: readonly EtsyListingMapping[],
): Promise<ClaimByEtsyIdentityResult> {
  // Idempotent by construction (Mission 018): a receipt already
  // provisioned comes back as `alreadyProvisioned` with the existing
  // right, and no second right or key is ever created.
  const received = await receiveEtsyPurchase(
    { entitlementRepository: deps.entitlementRepository },
    candidate.purchase,
    mappings,
  );

  if (received.status === "rejected") {
    // Structurally near-unreachable: this candidate already passed
    // validateEtsyPurchase above. Kept because the outcome is a value
    // and refusing it explicitly is cheaper than assuming.
    return { status: "purchaseNotEligible" };
  }

  // `received.rawActivationKey`, present on a first provisioning, is
  // deliberately NOT read. On the OAuth path the family never needs a
  // key — they are claiming with a proven identity — so the key is left
  // where it belongs: hashed in the row, replaceable by support later
  // through Mission 015B if it is ever needed.
  const entitlement = received.entitlement;

  const ownerResult = await resolveOwnerForIdentity(deps.ownerRepository, identity);
  if (ownerResult.status !== "resolved") return { status: "failed" };

  const outcome: RedeemAuthenticatedEntitlementResult = await completeRedemptionForResolvedRight(
    ownerResult.owner.id,
    entitlement,
    undefined,
    (input) => deps.entitlementRepository.redeem(input),
  );

  switch (outcome.status) {
    case "redeemed":
      return { status: "claimed", memorialId: outcome.memorialId };
    case "alreadyRedeemed":
      return { status: "alreadyClaimed", memorialId: outcome.memorialId };
    default:
      // entitlementOwnedByAnotherOwner, entitlementNotAvailable,
      // invalidOffer, skinSelectionRequired, integrityError, every
      // identity refusal — one answer, none of them distinguishable to
      // the caller.
      return { status: "failed" };
  }
}

export async function claimByEtsyIdentity(
  deps: ClaimByEtsyIdentityDeps,
  { identity, etsyUserId }: ClaimByEtsyIdentityInput,
  mappings: readonly EtsyListingMapping[] = ETSY_LISTING_MAPPINGS,
): Promise<ClaimByEtsyIdentityResult> {
  let eligible: MatchedPurchase[];
  try {
    eligible = await findEligiblePurchases(deps, etsyUserId, mappings);
  } catch {
    // Etsy is a third party. Its unavailability is not the family's
    // fault and must never look like "you have no purchase" — that
    // would send somebody to support over a transient outage. The error
    // itself is swallowed rather than surfaced: it may carry an Etsy
    // response detail, and nothing from Etsy's vocabulary reaches a
    // family.
    return { status: "etsyUnavailable" };
  }

  if (eligible.length === 0) return { status: "noMatchingPurchase" };

  // "Unclaimed" is exactly: no right recorded yet, or one still
  // `available`. A revoked right is not claimable and a redeemed one is
  // not unclaimed.
  const unclaimed = eligible.filter(
    (candidate) => candidate.existing === null || candidate.existing.status === "available",
  );

  if (unclaimed.length === 1) {
    return claimOne(deps, identity, unclaimed[0], mappings);
  }

  if (unclaimed.length > 1) {
    // No auto-claim, and nothing written: this function has performed
    // only reads to reach this point.
    return { status: "multiplePurchases" };
  }

  // Nothing unclaimed. If exactly one matching purchase was already
  // redeemed, running the redemption primitive on it is safe and
  // idempotent — it answers `alreadyRedeemed` with the existing memorial
  // for the same owner, and refuses for anybody else. That is what makes
  // a double callback land on the family's own memorial instead of a
  // support message.
  const redeemed = eligible.filter((candidate) => candidate.existing?.status === "redeemed");
  if (redeemed.length === 1) {
    return claimOne(deps, identity, redeemed[0], mappings);
  }
  if (redeemed.length > 1) return { status: "multiplePurchases" };

  return { status: "purchaseNotEligible" };
}
