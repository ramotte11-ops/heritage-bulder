import { getAuthenticatedUser } from "@/lib/supabase/session";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseOwnerRepository } from "@/lib/adapters/supabase/owner-repository";
import { SupabaseMemorialOwnershipRepository } from "@/lib/adapters/supabase/memorial-ownership-repository";
import {
  resolveHeritageActor,
  VISITOR,
  type HeritageActor,
  type HeritageIdentity,
} from "./heritage-actor";
import { authorizeMemorialAccess, type MemorialAccessResult } from "./memorial-access";

/**
 * SERVER ONLY. Mission 014 — the two composed entry points a Server
 * Component, Server Action or Route Handler calls.
 *
 * Everything decision-shaped lives in ./heritage-actor.ts and
 * ./memorial-access.ts, which take their dependencies as parameters and
 * are fully testable with plain objects. This file is the wiring: real
 * session, real Supabase, no logic of its own worth testing separately.
 *
 * The service-role client is used for the two reads these decisions
 * need — `owners` by `auth_user_id`, and `memorials.owner_id` by id.
 * Both are privileges Mission 013C already granted, so nothing here
 * requires a migration or a change to the privilege model. Never import
 * this file from a Client Component: lib/entitlement/server-only-boundary.test.ts
 * enforces that, and the service-role key must never travel.
 */

/**
 * Who is making this request?
 *
 * Resolution order matters. The session is established FIRST, from the
 * cookie, by `getAuthenticatedUser()` — which calls
 * `supabase.auth.getUser()` and therefore validates the token against
 * the Auth server rather than trusting whatever the cookie claims. Only
 * then is an Owner looked up, by `auth_user_id` alone. No request body,
 * query parameter or header participates at any point.
 *
 * No session, or a session Supabase will not vouch for, yields
 * `VISITOR`. Nothing is created for anyone, ever: signing in does not
 * make you an Owner (Mission 004's rule, still true), and neither does
 * loading a page.
 */
export async function getHeritageActor(): Promise<HeritageActor> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return VISITOR;
  }

  // Narrowed to the three fields the decision is allowed to read — in
  // particular this drops `user_metadata`, which is user-writable and
  // must never influence authorization (see ./heritage-admin.ts).
  const identity: HeritageIdentity = {
    id: user.id,
    email: user.email,
    app_metadata: user.app_metadata,
  };

  const ownerRepository = new SupabaseOwnerRepository(createServiceRoleSupabaseClient());

  return resolveHeritageActor(ownerRepository, identity);
}

/**
 * May the current request touch this memorial?
 *
 * `memorialId` is the ONLY parameter, and that is a security decision.
 *
 * An earlier version of this function took an optional `actor`, so a
 * caller that had already resolved one could avoid resolving it twice.
 * The docstring claimed the parameter was safe because `HeritageActor`
 * is "a value only `resolveHeritageActor` produces". **That was wrong.**
 * TypeScript is structurally typed: any object of the right shape IS a
 * `HeritageActor` as far as the compiler is concerned, so nothing stopped
 * a future caller from assembling `{ audience: "owner", owner: { id:
 * someIdFromTheRequest }, ... }` and handing it in — precisely the
 * "trust an owner id that came from the browser" bypass this mission
 * exists to prevent. A comment is not an enforcement mechanism.
 *
 * So the parameter is gone. At this boundary the actor is not something
 * a caller may supply, influence, or cache past: it is resolved here,
 * from the validated session, on every single call. Passing an extra
 * argument from untyped JavaScript changes nothing — it is ignored, and
 * a test proves a forged actor cannot reach the decision.
 *
 * The cost is one extra session resolution for a caller that already had
 * an actor. That is the right trade: an authorization boundary whose
 * correctness depends on every future caller behaving is not a boundary.
 *
 * Code that legitimately holds an actor and wants the pure decision can
 * still call `authorizeMemorialAccess` directly (./memorial-access.ts) —
 * that function keeps its `actor` parameter so it stays testable with
 * plain objects. The difference is exactly the point: that one is a pure
 * function, this one is the request boundary.
 */
export async function authorizeMemorialForRequest(
  memorialId: string,
): Promise<MemorialAccessResult> {
  const actor = await getHeritageActor();

  const memorialOwnershipRepository = new SupabaseMemorialOwnershipRepository(
    createServiceRoleSupabaseClient(),
  );

  return authorizeMemorialAccess({ memorialOwnershipRepository }, actor, memorialId);
}
