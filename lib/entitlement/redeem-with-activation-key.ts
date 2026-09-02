import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Skin } from "@/config/skins";
import { hashActivationKey, parseActivationKey } from "./activation-key";
import {
  completeRedemptionForResolvedRight,
  type RedeemAuthenticatedEntitlementResult,
} from "./redeem-authenticated-entitlement";
import { resolveOwnerForIdentity, type AuthenticatedIdentity } from "./resolve-owner";

/**
 * Mission 013 — the bridge Mission 011B was waiting for:
 *
 *   raw activation key -> the right it opens
 *                      -> the authenticated session's Owner   (011B)
 *                      -> Offer -> memorialType / skin        (006 via 011B)
 *                      -> redemption, re-checking the key under the lock
 *
 * Still a server-internal primitive. There is no route, Server Action,
 * form or activation page, and this mission does not add one: presenting
 * a key must go through a surface that can rate-limit and that a later
 * mission owns.
 *
 * Nothing here re-implements owner resolution, offer rules or skin
 * validation — all of that is `completeRedemptionForResolvedRight`, the
 * exact code path the trusted-`entitlementId` flow uses. The only
 * difference is the final database operation, which re-verifies the key
 * under the entitlement's row lock.
 */

export interface RedeemActivationKeyDeps {
  ownerRepository: OwnerRepository;
  entitlementRepository: EntitlementRepository;
}

export interface RedeemActivationKeyInput {
  /** The real, server-established session. Never a client-supplied id. */
  identity: AuthenticatedIdentity;
  /** Exactly as the person typed or pasted it. */
  rawActivationKey: string;
  /** Only meaningful for an offer granting more than one skin. */
  selectedSkin?: Skin;
}

export type RedeemActivationKeyResult =
  | RedeemAuthenticatedEntitlementResult
  /** Not a well-formed HERITAGE key. No database query is made at all. */
  | { status: "invalidActivationKey" }
  /** Well-formed, but opens nothing: never issued, already replaced, or
   * invalidated. Deliberately one single opaque answer for all three —
   * a caller must not be able to tell them apart. */
  | { status: "activationKeyNotFound" };

export async function redeemActivationKey(
  deps: RedeemActivationKeyDeps,
  { identity, rawActivationKey, selectedSkin }: RedeemActivationKeyInput,
): Promise<RedeemActivationKeyResult> {
  // Pure checks first: a malformed key never reaches the database, so
  // garbage cannot be used to generate load or probe for behaviour.
  const parsed = parseActivationKey(rawActivationKey);
  if (!parsed.ok) {
    // The rejection reason stays internal on purpose — telling a caller
    // *why* their key is malformed would describe the format to someone
    // who does not already hold one.
    return { status: "invalidActivationKey" };
  }

  const activationKeyHash = hashActivationKey(parsed.key);

  const ownerResult = await resolveOwnerForIdentity(deps.ownerRepository, identity);
  if (ownerResult.status !== "resolved") {
    return ownerResult;
  }

  const entitlement = await deps.entitlementRepository.findByActivationKeyHash(activationKeyHash);
  if (!entitlement) {
    return { status: "activationKeyNotFound" };
  }

  return completeRedemptionForResolvedRight(
    ownerResult.owner.id,
    entitlement,
    selectedSkin,
    (input) =>
      deps.entitlementRepository.redeemWithActivationKey({
        ...input,
        // Re-checked under the row lock: if support replaced or
        // invalidated the key between the lookup above and this call,
        // the wrapper refuses rather than redeeming on a dead key.
        expectedActivationKeyHash: activationKeyHash,
      }),
  );
}
