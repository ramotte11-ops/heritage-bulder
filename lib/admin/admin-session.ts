import { getHeritageActor } from "@/lib/auth/heritage-session";
import { requireHeritageAdmin } from "@/lib/auth/heritage-actor";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseAdminSupportRepository } from "@/lib/adapters/supabase/admin-support-repository";
import {
  searchAdminSupport,
  type AdminSupportQuery,
  type AdminSupportSearchResult,
} from "./support-search";

/**
 * SERVER ONLY. Mission 015A — the Admin gate, and the only way into the
 * support reads.
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
 * Being an Admin opens the SUPPORT READS and nothing else. It does not
 * make anyone an owner: `authorizeMemorialAccess` still ignores
 * `isHeritageAdmin`, and nothing in this file touches it.
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
