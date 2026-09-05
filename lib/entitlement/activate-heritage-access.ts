import type { ActivationRateLimiter } from "@/lib/adapters/activation-rate-limiter";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Skin } from "@/config/skins";
import { redeemActivationKey } from "./redeem-with-activation-key";
import type { AuthenticatedIdentity } from "./resolve-owner";

/**
 * Mission 019C — the application core behind `/activate`:
 *
 *   rate limit (this identity, this attempt)
 *     -> raw activation key -> the right it opens          (013)
 *                            -> the authenticated Owner     (011B)
 *                            -> redemption
 *
 * This is the one place Mission 019C's two rules meet: the rate-limit
 * check happens BEFORE the presented key is looked at in any way, and
 * every refusal downstream of it — a malformed key, an unknown one, a
 * right that cannot be claimed, an identity problem, a configuration
 * mismatch — collapses into the SAME generic `failed` outcome. Mission
 * 019C's brief is explicit that none of those may be distinguishable by
 * the caller, so this function is where that collapsing happens once,
 * rather than in every surface that might call it.
 *
 * Reuses lib/entitlement/redeem-with-activation-key.ts verbatim for
 * everything after the rate-limit gate — no key parsing, no hashing, no
 * lookup, no owner resolution, no redemption rule is re-implemented here.
 */

export interface ActivateHeritageAccessDeps {
  rateLimiter: ActivationRateLimiter;
  ownerRepository: OwnerRepository;
  entitlementRepository: EntitlementRepository;
}

export interface ActivateHeritageAccessInput {
  /** The real, server-established session. Never a client-supplied id. */
  identity: AuthenticatedIdentity;
  /** Exactly as the person typed or pasted it. */
  rawActivationKey: string;
  /** Only meaningful for an offer granting more than one skin. */
  selectedSkin?: Skin;
}

export type ActivateHeritageAccessResult =
  | { status: "redeemed"; memorialId: string }
  | { status: "alreadyRedeemed"; memorialId: string }
  /** The rate limit for this identity is exhausted. Established BEFORE
   * the key was looked at, so this is never reachable together with any
   * key-shaped refusal for the same attempt. */
  | { status: "rateLimited"; retryAfterSeconds: number }
  /** Every other refusal, deliberately flattened to one answer: a
   * malformed key, an unknown one, a right that is not available, an
   * identity this codebase will not mint an owner from, a configuration
   * mismatch. A caller must never be able to tell these apart — that is
   * exactly the enumeration Mission 019C's brief forbids. */
  | { status: "failed" };

export async function activateHeritageAccess(
  deps: ActivateHeritageAccessDeps,
  { identity, rawActivationKey, selectedSkin }: ActivateHeritageAccessInput,
): Promise<ActivateHeritageAccessResult> {
  // The gate. Nothing below this line runs for a caller who is already
  // out of budget — the key is never parsed, never hashed, never looked
  // up, so a blocked attempt costs this process nothing beyond the one
  // atomic counter update.
  const decision = await deps.rateLimiter.recordAttempt(identity.id);
  if (!decision.allowed) {
    return { status: "rateLimited", retryAfterSeconds: decision.retryAfterSeconds };
  }

  const result = await redeemActivationKey(
    { ownerRepository: deps.ownerRepository, entitlementRepository: deps.entitlementRepository },
    { identity, rawActivationKey, selectedSkin },
  );

  switch (result.status) {
    case "redeemed":
      return { status: "redeemed", memorialId: result.memorialId };
    case "alreadyRedeemed":
      return { status: "alreadyRedeemed", memorialId: result.memorialId };
    default:
      // invalidActivationKey | activationKeyNotFound | entitlementNotFound
      // | entitlementNotAvailable | entitlementOwnedByAnotherOwner
      // | invalidOffer | skinSelectionRequired | invalidSkin
      // | integrityError | activationKeySuperseded
      // | invalidAuthenticatedIdentity | ownerLinkConflict
      // | ownerIdentityConflict — every one of these is a "no" this
      // surface must not let a caller distinguish from any other.
      return { status: "failed" };
  }
}
