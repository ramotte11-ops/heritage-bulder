import type {
  AdminEntitlementRepository,
  AdminRevokeEntitlementOutcome,
} from "@/lib/adapters/admin-entitlement-repository";
import { generateActivationKey } from "@/lib/entitlement/activation-key";

/**
 * Mission 015B — the three Admin mutations, as pure functions.
 *
 * Same shape as ./support-search.ts and for the same reason: no
 * Supabase import, no session, no authorization here — a repository and
 * a caller-resolved `adminAuthUserId` go in, a result comes out. The
 * Admin gate and the session resolution that produces `adminAuthUserId`
 * live upstream, in ./admin-session.ts, so no code path can reach a
 * mutation without passing through it. See that file's own docstring.
 *
 * ## Where the raw key lives, and for how long
 *
 * `generateActivationKey()` (Mission 013, node:crypto) runs HERE, in
 * TypeScript — never in SQL, per this mission's crypto boundary. The
 * raw key exists in this process for exactly as long as
 * `replaceEntitlementActivationKeyAsAdmin` is on the stack: generated at
 * the top, handed to the RPC as a hash only, and returned to the caller
 * in the SAME return value ONLY when the repository confirms the swap
 * actually committed. On any refusal it is discarded right here and
 * never returned, logged, or retried with — a caller must never be
 * handed a key that was not actually persisted, and nothing above this
 * function ever sees the key that was not.
 */

export interface AdminMutationDeps {
  adminEntitlementRepository: AdminEntitlementRepository;
}

export type AdminReplaceActivationKeyResult =
  | { status: "replaced"; rawActivationKey: string }
  | { status: "notFound" }
  | { status: "notAvailable" };

export type AdminInvalidateActivationKeyResult =
  | { status: "invalidated" }
  | { status: "notFound" }
  | { status: "notAvailable" };

/**
 * Issues a brand new activation key for an `available` entitlement and
 * discards whatever key it may have had before — regardless of whether
 * support still knows that old key. That is the point: a lost response
 * (the one time the previous raw key was ever shown) must never make
 * the right un-rotatable. See admin_mutate_activation_key() in
 * supabase/migrations/20260904100000_admin_audit_and_mutations.sql.
 */
export async function replaceEntitlementActivationKeyAsAdmin(
  { adminEntitlementRepository }: AdminMutationDeps,
  { entitlementId, adminAuthUserId }: { entitlementId: string; adminAuthUserId: string },
): Promise<AdminReplaceActivationKeyResult> {
  const { rawKey, hash } = generateActivationKey();

  const outcome = await adminEntitlementRepository.mutateActivationKey({
    entitlementId,
    nextActivationKeyHash: hash,
    adminAuthUserId,
  });

  if (outcome.status === "replaced") {
    return { status: "replaced", rawActivationKey: rawKey };
  }
  if (outcome.status === "notFound") return { status: "notFound" };
  if (outcome.status === "notAvailable") return { status: "notAvailable" };

  // "invalidated" is not reachable here: this call always sends a
  // non-null hash, so the RPC can only ever answer replaced, notFound
  // or notAvailable. Guarded rather than assumed, so a contract drift
  // in the adapter fails loudly instead of silently discarding a
  // persisted key.
  throw new Error(`unexpected mutateActivationKey outcome for a replace: ${outcome.status}`);
}

/**
 * Clears the activation key of an `available` entitlement, leaving the
 * right itself untouched. Afterwards no key opens it until support
 * issues a replacement.
 */
export async function invalidateEntitlementActivationKeyAsAdmin(
  { adminEntitlementRepository }: AdminMutationDeps,
  { entitlementId, adminAuthUserId }: { entitlementId: string; adminAuthUserId: string },
): Promise<AdminInvalidateActivationKeyResult> {
  const outcome = await adminEntitlementRepository.mutateActivationKey({
    entitlementId,
    nextActivationKeyHash: null,
    adminAuthUserId,
  });

  if (outcome.status === "invalidated") return { status: "invalidated" };
  if (outcome.status === "notFound") return { status: "notFound" };
  if (outcome.status === "notAvailable") return { status: "notAvailable" };

  // "replaced" is not reachable here: this call always sends a null
  // hash.
  throw new Error(`unexpected mutateActivationKey outcome for an invalidate: ${outcome.status}`);
}

/**
 * Revokes an `available` entitlement. A thin pass-through — no crypto,
 * no shaping — kept as its own function for the same reason the two
 * above are: it is the one thing ./admin-session.ts calls, so it is the
 * one thing a test can call with a fake repository and no database.
 */
export function revokeEntitlementAsAdmin(
  { adminEntitlementRepository }: AdminMutationDeps,
  { entitlementId, adminAuthUserId }: { entitlementId: string; adminAuthUserId: string },
): Promise<AdminRevokeEntitlementOutcome> {
  return adminEntitlementRepository.revokeEntitlement({ entitlementId, adminAuthUserId });
}
