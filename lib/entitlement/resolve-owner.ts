import type { User } from "@supabase/supabase-js";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Owner } from "@/types/owner";
import { isValidEmail } from "@/lib/auth/validate-email";

/**
 * Mission 011B — turning an authenticated Supabase Auth user into the
 * HERITAGE owner that a redemption will be attributed to.
 *
 * This is the security-critical half of the mission. Mission 004
 * deliberately kept `auth.users` and `owners` apart ("authentification ≠
 * droit produit"), and that separation survives here: being signed in
 * still grants nothing. This function only answers "which HERITAGE owner
 * IS this person", and creates one the first time a right is genuinely
 * claimed.
 *
 * The rule that shapes everything below: **a matching email string is
 * never proof of identity.** An owner row may pre-exist (a future
 * direct-sale or admin flow could create one before the buyer ever signs
 * in) and taking it over just because an email matches would hand one
 * family's memorials to whoever can receive mail at a similar address.
 * So the only link this function ever *creates* is between an auth user
 * and a brand-new owner row; it never attaches an authenticated user to
 * an owner that already exists.
 *
 * `ownerId` is never an input. It is derived here, from the session, and
 * nowhere else.
 */

/**
 * Exactly the fields of Supabase's `User` this decision reads. Taken as
 * a `Pick` of the real type rather than a hand-written shape, so it
 * cannot drift from what Supabase actually returns.
 */
export type AuthenticatedIdentity = Pick<
  User,
  "id" | "email" | "email_confirmed_at" | "is_anonymous"
>;

export type ResolveOwnerResult =
  | { status: "resolved"; owner: Owner }
  /** The session carries no identity this codebase is willing to create
   * an owner from. No row is written. */
  | { status: "invalidAuthenticatedIdentity"; reason: string }
  /** Case C — an owner already exists at this email with no auth user
   * attached. Deliberately NOT linked automatically. A safe,
   * out-of-band mechanism (support/admin) can resolve it later; guessing
   * here is exactly the takeover this function exists to prevent. */
  | { status: "ownerLinkConflict" }
  /** Case D — this email already belongs to a DIFFERENT auth user.
   * Absolute refusal, and a genuinely different situation from C: there
   * is nothing to link, only somebody else's account. */
  | { status: "ownerIdentityConflict" };

/**
 * Is this session's identity one we are willing to mint an owner from?
 *
 * `email_confirmed_at` is the load-bearing check. Supabase sets it once
 * the address has actually been proven (which the magic-link flow this
 * app uses does by construction — app/auth/callback/route.ts exchanges a
 * code sent to that very address). Without it, `email` is an unverified
 * string, and `owners.email` is unique — so accepting one would let an
 * unverified address squat the identity a real buyer will later need.
 */
function checkIdentity(identity: AuthenticatedIdentity): string | null {
  if (identity.is_anonymous) {
    return "the session is anonymous";
  }
  if (!identity.id) {
    return "the session carries no auth user id";
  }

  const email = identity.email?.trim();
  if (!email) {
    return "the authenticated user has no email address";
  }
  if (!isValidEmail(email)) {
    return "the authenticated user's email address is malformed";
  }
  if (!identity.email_confirmed_at) {
    return "the authenticated user's email address is not confirmed";
  }

  return null;
}

/**
 * Emails are compared and stored lowercased, matching
 * `owners_email_key`'s `unique (lower(email))`. Doing it here as well
 * keeps what we write consistent with what the index enforces, so a
 * conflict is always a real conflict and never a casing artefact.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Explains an owner found by email, for an identity that is not yet
 * linked to any owner. Never returns `resolved` for a row this
 * identity does not already own.
 */
function classifyExistingEmailOwner(
  existing: Owner,
  identity: AuthenticatedIdentity,
): ResolveOwnerResult {
  if (existing.authUserId === identity.id) {
    // Only reachable if the row appeared between our two reads (a
    // concurrent first redemption by this same person). It is genuinely
    // ours, so it resolves.
    return { status: "resolved", owner: existing };
  }
  if (existing.authUserId === null) {
    return { status: "ownerLinkConflict" };
  }
  return { status: "ownerIdentityConflict" };
}

export async function resolveOwnerForIdentity(
  ownerRepository: OwnerRepository,
  identity: AuthenticatedIdentity,
): Promise<ResolveOwnerResult> {
  const identityProblem = checkIdentity(identity);
  if (identityProblem !== null) {
    return { status: "invalidAuthenticatedIdentity", reason: identityProblem };
  }

  // Case A — already linked. The only lookup that proves identity.
  const linked = await ownerRepository.findByAuthUserId(identity.id);
  if (linked) {
    return { status: "resolved", owner: linked };
  }

  const email = normalizeEmail(identity.email as string);

  // Cases C and D, checked before attempting to create, so the common
  // conflict is answered without relying on an error path.
  const byEmail = await ownerRepository.findByEmail(email);
  if (byEmail) {
    return classifyExistingEmailOwner(byEmail, identity);
  }

  // Case B — no owner for this identity and nothing in the way. The
  // insert itself is the concurrency control: `owners` already carries a
  // unique index on auth_user_id (where not null) and on lower(email),
  // so two simultaneous first redemptions cannot both succeed. The loser
  // is told `conflict` and re-reads below rather than guessing.
  const created = await ownerRepository.create({ authUserId: identity.id, email });
  if (created.status === "created") {
    return { status: "resolved", owner: created.owner };
  }

  // Lost the race, or something appeared between the reads above and the
  // insert. Re-read to find out which, and answer from the row that
  // actually exists — never by retrying the insert.
  const linkedAfterConflict = await ownerRepository.findByAuthUserId(identity.id);
  if (linkedAfterConflict) {
    return { status: "resolved", owner: linkedAfterConflict };
  }

  const byEmailAfterConflict = await ownerRepository.findByEmail(email);
  if (byEmailAfterConflict) {
    return classifyExistingEmailOwner(byEmailAfterConflict, identity);
  }

  // The database refused the row, yet nothing explains it. Refusing to
  // invent an owner is the only safe answer.
  return {
    status: "invalidAuthenticatedIdentity",
    reason: "the owner row was refused by the database for an unexplained reason",
  };
}
