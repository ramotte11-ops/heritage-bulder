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
 * `memorialId` is expected to come from the browser (a URL segment, a
 * form field) — that is exactly what this function is for. The actor is
 * not: it is resolved here, from the session, on every call.
 *
 * Pass an already-resolved `actor` when the caller has one (a page that
 * already rendered something for this actor), so one request does not
 * resolve the same session twice. It is still a server-resolved actor
 * either way — the parameter accepts `HeritageActor`, a value only
 * `resolveHeritageActor` produces, never an id.
 */
export async function authorizeMemorialForRequest(
  memorialId: string,
  actor?: HeritageActor,
): Promise<MemorialAccessResult> {
  const resolvedActor = actor ?? (await getHeritageActor());

  const memorialOwnershipRepository = new SupabaseMemorialOwnershipRepository(
    createServiceRoleSupabaseClient(),
  );

  return authorizeMemorialAccess({ memorialOwnershipRepository }, resolvedActor, memorialId);
}
