import { getHeritageActor } from "@/lib/auth/heritage-session";
import { requireHeritageAdmin } from "@/lib/auth/heritage-actor";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseAdminSupportRepository } from "@/lib/adapters/supabase/admin-support-repository";
import { SupabaseAdminEntitlementRepository } from "@/lib/adapters/supabase/admin-entitlement-repository";
import type { AdminRevokeEntitlementOutcome } from "@/lib/adapters/admin-entitlement-repository";
import {
  searchAdminSupport,
  type AdminSupportQuery,
  type AdminSupportSearchResult,
} from "./support-search";
import {
  invalidateEntitlementActivationKeyAsAdmin,
  replaceEntitlementActivationKeyAsAdmin,
  revokeEntitlementAsAdmin,
  type AdminInvalidateActivationKeyResult,
  type AdminReplaceActivationKeyResult,
} from "./admin-mutations";

/**
 * SERVER ONLY. Mission 015A — the Admin gate, and the only way into the
 * support reads. Mission 015B adds the only way into the three audited
 * mutations, through the same gate.
 *
 * Every entry point here resolves the session itself, exactly like
 * Mission 014's request boundary and for the same reason: after the
 * Mission 014 review, no boundary in this codebase accepts an actor,
 * an identity, an owner id or a role from its caller. TypeScript is
 * structurally typed, so a parameter of type `HeritageActor` would be
 * satisfiable by any object of that shape — a comment promising
 * otherwise is not an enforcement mechanism.
 *
 * The Admin decision itself is `requireHeritageAdmin` (Mission 014),
 * reused verbatim: `app_metadata.heritage_role === "admin"`, read from a
 * token Supabase validated, never from `user_metadata`, never from a
 * body, query parameter or header. Nothing about Admin recognition is
 * re-implemented here.
 *
 * Being an Admin opens the SUPPORT READS and the three Mission 015B
 * mutations, and nothing else. It does not make anyone an owner:
 * `authorizeMemorialAccess` still ignores `isHeritageAdmin`, and nothing
 * in this file touches it.
 *
 * A mutation entry point additionally carries the admin's own
 * `identity.id` down to the RPC that writes the audit row — see
 * `requireAdminIdentityForRequest` below. That id never travels any
 * further than this file and the repository it constructs: it reaches
 * neither a Server Action's return value nor the browser.
 */

export type AdminGateResult =
  | { status: "granted" }
  /** Denied. One value for every reason — no session, a session that is
   * not staff, an owner with a hundred memorials — because the Admin
   * area must not tell an anonymous prober whether their account exists
   * or what it is. Redirecting is the caller's decision, not this
   * function's. */
  | { status: "denied" };

/**
 * Is the current request made by HERITAGE staff?
 *
 * Takes no parameters. There is nothing to inject.
 */
export async function requireAdminForRequest(): Promise<AdminGateResult> {
  const actor = await getHeritageActor();

  return requireHeritageAdmin(actor).status === "granted"
    ? { status: "granted" }
    : { status: "denied" };
}

export type AdminSupportSearchOutcome =
  | { status: "denied" }
  | { status: "completed"; result: AdminSupportSearchResult };

/**
 * Runs one support lookup, for an Admin.
 *
 * The gate is INSIDE this function rather than merely in front of it.
 * A page could forget to check; a caller of this could not. The
 * repository is constructed only after the gate passes, so a refused
 * request never even builds a service-role client.
 *
 * `query` is fully caller-supplied — it comes from a form. That is fine:
 * it names WHAT to look up, never WHO is asking. The two are kept
 * strictly separate, which is the whole shape of Mission 014 applied
 * here.
 */
export async function runAdminSupportSearch(
  query: AdminSupportQuery,
): Promise<AdminSupportSearchOutcome> {
  const gate = await requireAdminForRequest();
  if (gate.status !== "granted") return { status: "denied" };

  const adminSupportRepository = new SupabaseAdminSupportRepository(
    createServiceRoleSupabaseClient(),
  );

  return {
    status: "completed",
    result: await searchAdminSupport({ adminSupportRepository }, query),
  };
}

/**
 * Mission 015B — the Admin gate for a MUTATION, which additionally needs
 * to know WHO. `requireAdminForRequest()` above deliberately throws that
 * away; a mutation must attribute its audit row to somebody, so this
 * resolves the same gate and keeps the one field a write needs.
 *
 * `adminAuthUserId` here is `identity.id` — the Supabase Auth user id
 * Mission 014's `requireHeritageAdmin` already vouches for, resolved
 * from a session Supabase itself validated. It never comes from, and is
 * never influenced by, anything a browser sent — see
 * lib/auth/heritage-actor.ts.
 */
async function requireAdminIdentityForRequest(): Promise<
  { status: "granted"; adminAuthUserId: string } | { status: "denied" }
> {
  const actor = await getHeritageActor();
  const gate = requireHeritageAdmin(actor);

  return gate.status === "granted"
    ? { status: "granted", adminAuthUserId: gate.identity.id }
    : { status: "denied" };
}

function adminEntitlementRepository() {
  return new SupabaseAdminEntitlementRepository(createServiceRoleSupabaseClient());
}

export type AdminActivationKeyReplaceOutcome =
  | { status: "denied" }
  | { status: "completed"; result: AdminReplaceActivationKeyResult };

export type AdminActivationKeyInvalidateOutcome =
  | { status: "denied" }
  | { status: "completed"; result: AdminInvalidateActivationKeyResult };

export type AdminEntitlementRevokeOutcome =
  | { status: "denied" }
  | { status: "completed"; result: AdminRevokeEntitlementOutcome };

/**
 * Issues a brand new activation key for an `available` entitlement, as
 * an Admin. The gate is INSIDE, exactly like `runAdminSupportSearch`
 * above: a refused caller never reaches a service-role client, and
 * `entitlementId` is the only thing this takes from its caller — never
 * an admin identity, a role, or anything else the browser could forge.
 */
export async function runAdminActivationKeyReplace(
  entitlementId: string,
): Promise<AdminActivationKeyReplaceOutcome> {
  const gate = await requireAdminIdentityForRequest();
  if (gate.status !== "granted") return { status: "denied" };

  return {
    status: "completed",
    result: await replaceEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: adminEntitlementRepository() },
      { entitlementId, adminAuthUserId: gate.adminAuthUserId },
    ),
  };
}

/** Clears the activation key of an `available` entitlement, as an
 * Admin. Same gate, same shape as the replace above. */
export async function runAdminActivationKeyInvalidate(
  entitlementId: string,
): Promise<AdminActivationKeyInvalidateOutcome> {
  const gate = await requireAdminIdentityForRequest();
  if (gate.status !== "granted") return { status: "denied" };

  return {
    status: "completed",
    result: await invalidateEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: adminEntitlementRepository() },
      { entitlementId, adminAuthUserId: gate.adminAuthUserId },
    ),
  };
}

/** Revokes an `available` entitlement, as an Admin. Same gate, same
 * shape as the two above. */
export async function runAdminEntitlementRevoke(
  entitlementId: string,
): Promise<AdminEntitlementRevokeOutcome> {
  const gate = await requireAdminIdentityForRequest();
  if (gate.status !== "granted") return { status: "denied" };

  return {
    status: "completed",
    result: await revokeEntitlementAsAdmin(
      { adminEntitlementRepository: adminEntitlementRepository() },
      { entitlementId, adminAuthUserId: gate.adminAuthUserId },
    ),
  };
}
