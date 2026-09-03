import type { User } from "@supabase/supabase-js";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Owner } from "@/types/owner";
import { isHeritageAdmin } from "./heritage-admin";

/**
 * Mission 014 — the application boundary between a visitor, an
 * authenticated owner, and HERITAGE staff.
 *
 * This is NOT the PostgreSQL role model. `PUBLIC`, `anon`,
 * `authenticated` and `service_role` were settled in Missions 013B/013C
 * and are not touched here. This file is about who the *person* is and
 * what the *application* will let them reach.
 *
 * ## The separation this file exists to preserve
 *
 *   authentication ≠ Owner ≠ Entitlement ≠ ownership of a Memorial ≠ publication
 *
 * Each `≠` is a real gap somebody could accidentally close:
 *
 *   * a valid Supabase Auth session proves an email was reached. It does
 *     not prove a HERITAGE Owner exists — and this file never creates
 *     one to make the gap go away (see `OwnerLookup` below);
 *   * an Owner is a person, not a purchase. Having an Owner row grants
 *     no entitlement and no memorial;
 *   * owning ONE memorial says nothing about another. Ownership is
 *     decided per memorial, by `authorizeMemorialAccess` in
 *     ./memorial-access.ts, never by "this actor is an owner";
 *   * publication is a memorial's own state and is out of Mission 014's
 *     scope entirely.
 *
 * ## Why Admin is a separate axis, not a third audience value
 *
 * The obvious modelling — `role: "visitor" | "owner" | "admin"` — is
 * wrong, and dangerously so: a single ordered enum invites the reading
 * "admin is the biggest one, so an admin can do what an owner can do",
 * which is exactly the ownership bypass this mission must prevent. A
 * HERITAGE Admin is staff, not a super-owner: being staff must never, on
 * its own, open a family's memorial.
 *
 * So `audience` (what the product shows this person about THEIR OWN
 * things) and `isHeritageAdmin` (whether this person is staff) are two
 * independent facts on the same actor. `authorizeMemorialAccess`
 * deliberately ignores the second one, and a test proves it.
 */

/**
 * Exactly what this module reads from a Supabase Auth session. A `Pick`
 * of the real `User` so it cannot drift, and narrow enough that no
 * caller can pass a hand-made object that happens to look like a
 * session.
 *
 * `user_metadata` is absent on purpose — it is user-writable, and
 * nothing about authorization may ever depend on it (see
 * ./heritage-admin.ts).
 */
export type HeritageIdentity = Pick<User, "id" | "email" | "app_metadata">;

/**
 * The only owner lookup this module is allowed to perform.
 *
 * `Pick<..., "findByAuthUserId">` is a security decision, not a
 * convenience:
 *
 *   * `create` is unreachable, so merely LOADING A PAGE can never mint
 *     an Owner row. Owner creation belongs to redemption alone
 *     (lib/entitlement/resolve-owner.ts, Mission 011B), where a right is
 *     actually being claimed;
 *   * `findByEmail` is unreachable, so an actor can never be resolved
 *     from a matching email. A matching address is not proof of
 *     identity — the exact takeover Mission 011B refused — and
 *     `auth_user_id` is the only link that ever proves one.
 */
export type OwnerLookup = Pick<OwnerRepository, "findByAuthUserId">;

export type HeritageActor =
  /**
   * No valid session. Zero owner capability, zero commercial capability,
   * and never staff: `isHeritageAdmin` is a fact about a verified
   * identity, and there is no identity here to verify.
   */
  | { audience: "visitor"; identity: null; owner: null; isHeritageAdmin: false }
  /**
   * A valid session with no HERITAGE Owner behind it. A completely
   * ordinary state — somebody signed in before ever claiming a right —
   * and never an error: nothing is created, nothing throws, and the
   * actor simply has no owner capability yet.
   *
   * Such a person may still be staff, which is why `isHeritageAdmin` is
   * a real value here rather than `false`: HERITAGE staff have no reason
   * to own a memorial.
   */
  | { audience: "authenticated"; identity: HeritageIdentity; owner: null; isHeritageAdmin: boolean }
  /** A valid session linked to a HERITAGE Owner. Still says nothing
   * about any particular memorial. */
  | {
      audience: "owner";
      identity: HeritageIdentity;
      owner: Owner;
      isHeritageAdmin: boolean;
    };

/** The one actor a request with no session may ever produce. */
export const VISITOR: HeritageActor = {
  audience: "visitor",
  identity: null,
  owner: null,
  isHeritageAdmin: false,
};

/**
 * Resolves the actor for an already-authenticated identity — or for the
 * absence of one.
 *
 * `identity` must come from the server's own session resolution
 * (`getAuthenticatedUser()`, which validates the token against the Auth
 * server). There is deliberately no `ownerId`, `authUserId` or `email`
 * parameter: nothing a browser can put in a payload participates in
 * deciding who this actor is.
 *
 * A repository failure is allowed to reject. It must NOT be folded into
 * `visitor` — a lookup that failed is not a proof of absence, and
 * silently downgrading it would turn an outage into a wrong answer about
 * identity. Callers decide how to surface it; nothing here guesses.
 */
export async function resolveHeritageActor(
  ownerLookup: OwnerLookup,
  identity: HeritageIdentity | null,
): Promise<HeritageActor> {
  if (identity === null || !identity.id) {
    return VISITOR;
  }

  // Read once, and only from the identity — never from the email, never
  // creating anything. See `OwnerLookup` above.
  const owner = await ownerLookup.findByAuthUserId(identity.id);

  const admin = isHeritageAdmin(identity);

  if (!owner) {
    return { audience: "authenticated", identity, owner: null, isHeritageAdmin: admin };
  }

  return { audience: "owner", identity, owner, isHeritageAdmin: admin };
}

export type RequireOwnerResult =
  | { status: "granted"; owner: Owner }
  /** No session at all. */
  | { status: "deniedNoSession" }
  /** Valid session, but no HERITAGE Owner behind it. Distinct from
   * `deniedNoSession` on purpose: this one is not a login problem, and a
   * caller may legitimately react differently (an explanation rather
   * than a redirect to /login). It stays a refusal either way. */
  | { status: "deniedNoOwner" };

/**
 * The owner gate. Being staff is not a way through it — `isHeritageAdmin`
 * is not consulted here at all.
 */
export function requireOwner(actor: HeritageActor): RequireOwnerResult {
  switch (actor.audience) {
    case "visitor":
      return { status: "deniedNoSession" };
    case "authenticated":
      return { status: "deniedNoOwner" };
    case "owner":
      return { status: "granted", owner: actor.owner };
  }
}

export type RequireHeritageAdminResult =
  | { status: "granted"; identity: HeritageIdentity }
  | { status: "denied" };

/**
 * The staff gate — the primitive Mission 015 will build on.
 *
 * Owning memorials is not a way through it: a family with a hundred
 * memorials is still not staff. The two gates are independent in both
 * directions, which is the whole reason they are two functions.
 *
 * A visitor is refused without any metadata being consulted: there is no
 * verified identity to read a role from.
 */
export function requireHeritageAdmin(actor: HeritageActor): RequireHeritageAdminResult {
  if (actor.audience === "visitor" || !actor.isHeritageAdmin) {
    return { status: "denied" };
  }

  return { status: "granted", identity: actor.identity };
}
