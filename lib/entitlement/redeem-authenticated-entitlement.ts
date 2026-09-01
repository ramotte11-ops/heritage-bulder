import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import { OFFERS, type OfferId } from "@/config/offers";
import type { Skin } from "@/config/skins";
import { getAllowedSkins, getMemorialTypeForOffer, isSkinAllowedForOffer } from "./offer-skin";
import { resolveOwnerForIdentity, type AuthenticatedIdentity } from "./resolve-owner";

/**
 * Mission 011B — the application core of redemption:
 *
 *   authenticated identity -> HERITAGE owner (resolve-owner.ts)
 *                          -> the entitlement being claimed
 *                          -> product rules (Mission 006 config)
 *                          -> redeem_entitlement() (Mission 011A)
 *                          -> a typed result carrying memorialId
 *
 * ## Where `entitlementId` comes from — an important boundary
 *
 * This is a SERVER-INTERNAL service. It takes an `entitlementId` that a
 * trusted server layer has already resolved and authorized, and it is
 * deliberately NOT safe to expose directly to a browser: knowing a raw
 * UUID must never be sufficient to obtain a memorial. No route, Server
 * Action or form calls this function — building the authorized
 * key/proof -> entitlement resolution is a separate, later mission, and
 * this signature is what that mission will hand its result to.
 *
 * The two identities in play are treated very differently on purpose:
 * `identity` is the real session, established server-side and never
 * trusted from a payload; `entitlementId` is an opaque reference from
 * the trusted caller. There is no `ownerId` parameter at all — the owner
 * is always derived from the session (see resolve-owner.ts).
 *
 * ## Why `planEntitlementActivation()` is not the gate here
 *
 * Mission 006's `planEntitlementActivation()` combines two checks: "is
 * this entitlement available" and "is this skin allowed". Since Mission
 * 011A, the first of those belongs to the database: `redeem_entitlement`
 * decides it under a row lock, atomically, and answers an
 * already-redeemed retry by the same owner with the existing memorial
 * rather than an error. Re-deciding status here would duplicate the rule
 * in a second place, reintroduce the check-then-act race 011A exists to
 * close, and break idempotence. So this file reuses Mission 006's actual
 * primitives — `getMemorialTypeForOffer`, `getAllowedSkins`,
 * `isSkinAllowedForOffer` — and leaves status entirely to the RPC.
 */

export interface RedeemAuthenticatedEntitlementDeps {
  ownerRepository: OwnerRepository;
  entitlementRepository: EntitlementRepository;
}

export interface RedeemAuthenticatedEntitlementInput {
  /** The real, server-established session. Never a client-supplied id. */
  identity: AuthenticatedIdentity;
  /** Already resolved and authorized by a trusted server layer — see
   * this file's docstring. */
  entitlementId: string;
  /** Only meaningful for an offer granting more than one skin. V1's five
   * offers each grant exactly one, so callers legitimately omit it. */
  selectedSkin?: Skin;
}

export type RedeemAuthenticatedEntitlementResult =
  | { status: "redeemed"; memorialId: string }
  | { status: "alreadyRedeemed"; memorialId: string }
  | { status: "invalidAuthenticatedIdentity"; reason: string }
  | { status: "ownerLinkConflict" }
  | { status: "ownerIdentityConflict" }
  | { status: "entitlementNotFound" }
  | { status: "entitlementNotAvailable" }
  | { status: "entitlementOwnedByAnotherOwner" }
  /** The offer this entitlement records is not one this build knows, or
   * grants no skin at all. A configuration problem, never the family's
   * fault — and never a reason to guess a memorial type or skin. */
  | { status: "invalidOffer" }
  /** More than one skin is allowed and the caller supplied none. The
   * caller must ask; this function never picks. */
  | { status: "skinSelectionRequired"; allowedSkins: readonly Skin[] }
  | { status: "invalidSkin" }
  /** A redeemed entitlement with no memorial behind it (Mission 011A's
   * anomaly), or anything else that means the data is inconsistent. */
  | { status: "integrityError" };

function isKnownOffer(offerId: string): offerId is OfferId {
  return Object.hasOwn(OFFERS, offerId);
}

/**
 * Picks the skin this memorial will be created with, or explains why it
 * cannot. Never silently takes `allowedSkins[0]` from a multi-skin offer
 * — that would turn a product decision nobody made into a persisted one.
 */
function resolveSkin(
  offerId: OfferId,
  selectedSkin: Skin | undefined,
):
  | { status: "ok"; skinId: Skin }
  | { status: "invalidSkin" }
  | { status: "invalidOffer" }
  | { status: "skinSelectionRequired"; allowedSkins: readonly Skin[] } {
  const allowedSkins = getAllowedSkins(offerId);

  if (selectedSkin !== undefined) {
    return isSkinAllowedForOffer(offerId, selectedSkin)
      ? { status: "ok", skinId: selectedSkin }
      : { status: "invalidSkin" };
  }

  if (allowedSkins.length === 1) {
    // Unambiguous: one allowed skin means there is nothing to choose.
    return { status: "ok", skinId: allowedSkins[0] };
  }

  if (allowedSkins.length === 0) {
    return { status: "invalidOffer" };
  }

  return { status: "skinSelectionRequired", allowedSkins };
}

export async function redeemAuthenticatedEntitlement(
  deps: RedeemAuthenticatedEntitlementDeps,
  { identity, entitlementId, selectedSkin }: RedeemAuthenticatedEntitlementInput,
): Promise<RedeemAuthenticatedEntitlementResult> {
  const ownerResult = await resolveOwnerForIdentity(deps.ownerRepository, identity);
  if (ownerResult.status !== "resolved") {
    return ownerResult;
  }
  const owner = ownerResult.owner;

  const entitlement = await deps.entitlementRepository.findById(entitlementId);
  if (!entitlement) {
    return { status: "entitlementNotFound" };
  }

  // The column has a CHECK, but this build is the one that has to know
  // what the offer MEANS. An offer id it doesn't recognise (an older
  // deployment against a newer database) must stop here rather than
  // produce a memorial with a guessed type.
  if (!isKnownOffer(entitlement.offerId)) {
    return { status: "invalidOffer" };
  }

  const skin = resolveSkin(entitlement.offerId, selectedSkin);
  if (skin.status !== "ok") {
    // Every one of these returns before the RPC: nothing is consumed and
    // no memorial is created while a product question is unanswered.
    return skin;
  }

  const outcome = await deps.entitlementRepository.redeem({
    entitlementId,
    // Server-resolved, from the session. The only owner id in play.
    ownerId: owner.id,
    memorialType: getMemorialTypeForOffer(entitlement.offerId),
    skinId: skin.skinId,
  });

  switch (outcome.status) {
    case "redeemed":
      return { status: "redeemed", memorialId: outcome.memorialId };
    case "alreadyRedeemed":
      return { status: "alreadyRedeemed", memorialId: outcome.memorialId };
    case "notFound":
      // Deleted between the read above and the call.
      return { status: "entitlementNotFound" };
    case "notAvailable":
      return { status: "entitlementNotAvailable" };
    case "ownedByAnotherOwner":
      return { status: "entitlementOwnedByAnotherOwner" };
    case "integrityAnomaly":
      return { status: "integrityError" };
  }
}
