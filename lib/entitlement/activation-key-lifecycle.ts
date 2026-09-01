import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import { generateActivationKey, hashActivationKey, parseActivationKey } from "./activation-key";

/**
 * Mission 013 — replacing and invalidating an activation key.
 *
 * Both are support primitives, server-only. Neither has, or should have,
 * a route or a UI: the support/Admin surface that would call them is
 * Mission 015, and so is any persistent audit of rotations.
 *
 * The distinction that matters and must never blur: invalidating a KEY
 * is not revoking a RIGHT. A right whose key is invalidated is still
 * `available` and still belongs to its buyer — it simply has no
 * outstanding secret. Setting `entitlements.status = 'revoked'` is a
 * commercial decision and is not implemented here.
 */

export type ActivationKeyLifecycleResult =
  | { status: "replaced"; rawActivationKey: string }
  | { status: "invalidated" }
  /** The compare-and-swap matched nothing: the right is not `available`
   * (already redeemed or revoked), or its key is no longer the one the
   * caller believed it was — somebody replaced or invalidated it first.
   * Never an overwrite, never a silent success. */
  | { status: "rejected" }
  /** The key the caller offered as "the current one" is not even a
   * well-formed HERITAGE key. Nothing is read or written. */
  | { status: "invalidCurrentKey" };

export interface ActivationKeyLifecycleDeps {
  entitlementRepository: EntitlementRepository;
}

/**
 * Hashes the key the caller claims is current, so the compare-and-swap
 * can be expressed against it. `null` means "the right currently has no
 * key", which is a legitimate expectation to hold.
 */
function resolveExpectedHash(
  currentRawKey: string | null,
): { ok: true; hash: string | null } | { ok: false } {
  if (currentRawKey === null) return { ok: true, hash: null };

  const parsed = parseActivationKey(currentRawKey);
  if (!parsed.ok) return { ok: false };

  return { ok: true, hash: hashActivationKey(parsed.key) };
}

/**
 * Replaces the activation key of a right that is still `available`.
 *
 * The old key stops working the instant this commits: its hash is gone
 * from the row, so it resolves to nothing, and any activation already in
 * flight with it is refused under the row lock by
 * `redeem_entitlement_with_activation_key` (Mission 013's migration).
 */
export async function replaceActivationKey(
  { entitlementRepository }: ActivationKeyLifecycleDeps,
  { entitlementId, currentRawKey }: { entitlementId: string; currentRawKey: string | null },
): Promise<ActivationKeyLifecycleResult> {
  const expected = resolveExpectedHash(currentRawKey);
  if (!expected.ok) return { status: "invalidCurrentKey" };

  const { rawKey, hash } = generateActivationKey();

  const outcome = await entitlementRepository.swapActivationKey({
    entitlementId,
    expectedActivationKeyHash: expected.hash,
    nextActivationKeyHash: hash,
  });

  // The new raw key is returned only on a confirmed swap. On a rejected
  // one it is discarded here and never leaves this function — a caller
  // must never be handed a key that was not actually persisted.
  return outcome.status === "updated"
    ? { status: "replaced", rawActivationKey: rawKey }
    : { status: "rejected" };
}

/**
 * Invalidates the activation key of a right that is still `available`,
 * leaving the right itself untouched. Afterwards no key opens it until
 * support issues a replacement.
 */
export async function invalidateActivationKey(
  { entitlementRepository }: ActivationKeyLifecycleDeps,
  { entitlementId, currentRawKey }: { entitlementId: string; currentRawKey: string },
): Promise<ActivationKeyLifecycleResult> {
  const expected = resolveExpectedHash(currentRawKey);
  if (!expected.ok) return { status: "invalidCurrentKey" };

  const outcome = await entitlementRepository.swapActivationKey({
    entitlementId,
    expectedActivationKeyHash: expected.hash,
    nextActivationKeyHash: null,
  });

  return outcome.status === "updated" ? { status: "invalidated" } : { status: "rejected" };
}
