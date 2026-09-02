import type { User } from "@supabase/supabase-js";

/**
 * Mission 014 — the HERITAGE Admin primitive, and nothing more.
 *
 * This file answers exactly one question: "is the person behind this
 * authenticated session HERITAGE staff?" It grants nothing, opens no
 * route, and reads no business table. Mission 015 builds whatever an
 * Admin can actually DO; this is the fact it will build on.
 *
 * ## Where the fact lives, and why
 *
 * In Supabase Auth's `app_metadata`, under `heritage_role`.
 *
 * `app_metadata` is the only place in this stack that satisfies all four
 * of Mission 014's constraints at once:
 *
 *   * **Not writable by the user.** `supabase.auth.updateUser()` can
 *     write `user_metadata` and nothing else. Writing `app_metadata`
 *     requires the Admin API (service-role key) or the Supabase
 *     dashboard — both server/staff-side, neither reachable from a
 *     browser session. A user cannot promote themselves.
 *   * **Verified, not asserted.** It is read from
 *     `supabase.auth.getUser()`, which validates the token against the
 *     Auth server rather than trusting the cookie's contents. It is
 *     never read from a request body, a header, a query parameter or a
 *     form field.
 *   * **No hardcoded email.** Nothing in this repository names a person.
 *     Who is an Admin is data held in the identity provider, changed
 *     out of band, and revocable without a deployment.
 *   * **No migration, no secret.** HERITAGE's own tables are untouched,
 *     so the Mission 013C privilege model is untouched too, and nothing
 *     here ever reaches a client bundle: the flag travels only as far as
 *     the server code that asks for it.
 *
 * ## Why `user_metadata` is explicitly rejected
 *
 * `user_metadata` looks identical in the `User` object and is the exact
 * trap this file exists to avoid: it IS user-writable, so treating a
 * `heritage_role` found there as authoritative would let any signed-in
 * visitor make themselves an Admin with one client-side call. The check
 * below reads `app_metadata` and only `app_metadata`, and a test asserts
 * that a user carrying `user_metadata.heritage_role = "admin"` is not an
 * Admin.
 *
 * ## Deliberately not a permission system
 *
 * One boolean. No permission list, no scopes, no team/agency/B2B roles,
 * no levels. Mission 014's brief asks for the smallest reliable
 * primitive, and a granular model invented before a single Admin screen
 * exists would be guesswork frozen into code.
 */

/** The `app_metadata` key HERITAGE stores the staff role under. */
export const HERITAGE_ROLE_METADATA_KEY = "heritage_role";

/** The one value that means "HERITAGE staff". */
export const HERITAGE_ADMIN_ROLE = "admin";

/**
 * Exactly the part of Supabase's `User` this decision reads — taken as a
 * `Pick` of the real type so it cannot drift from what Supabase returns,
 * and narrow enough that a caller physically cannot hand this function a
 * shape it might mistake for an identity.
 *
 * `user_metadata` is NOT in this type. That is the point: it is not
 * merely unused, it is unreachable from here.
 */
export type HeritageAdminIdentity = Pick<User, "app_metadata">;

/**
 * Is this authenticated identity HERITAGE staff?
 *
 * Strict by construction: the value must be the exact string `"admin"`.
 * Not truthy, not `"Admin"`, not `true`, not `["admin"]`, not
 * `"admin,support"`. An almost-right value is a misconfiguration, and a
 * misconfiguration must fail closed rather than promote somebody.
 *
 * Never throws: a missing, null or malformed `app_metadata` is simply
 * "not an Admin". There is no error path that could be mistaken for a
 * grant.
 */
export function isHeritageAdmin(identity: HeritageAdminIdentity | null | undefined): boolean {
  const metadata: unknown = identity?.app_metadata;

  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return false;
  }

  // `Object.hasOwn`, not a bare property read: a plain `metadata[KEY]`
  // walks the prototype chain, so an object merely INHERITING a
  // `heritage_role` would pass. An Admin flag must be a property Supabase
  // actually stored on this user's own metadata, never one that arrived
  // through a prototype.
  if (!Object.hasOwn(metadata, HERITAGE_ROLE_METADATA_KEY)) {
    return false;
  }

  // `app_metadata` is typed as an index signature, so TypeScript would
  // happily let `metadata[KEY]` through as `any`. Reading it via a
  // `Record<string, unknown>` view keeps the value genuinely unknown
  // until the comparison below narrows it.
  const role = (metadata as Record<string, unknown>)[HERITAGE_ROLE_METADATA_KEY];

  return role === HERITAGE_ADMIN_ROLE;
}
