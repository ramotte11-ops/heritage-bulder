import type { Owner } from "@/types/owner";

/**
 * Mission 011B — the narrow contract redemption needs over the `owners`
 * table. Deliberately not a `DataRepository<Owner>`: redemption never
 * updates or deletes an owner, and it needs two *lookups* the generic
 * port has no room for (by Supabase Auth user, and by email), so a
 * dedicated contract mirrors what actually happens instead of hiding it
 * behind a generic `findById`.
 *
 * Every method here is about resolving an owner from an identity the
 * server already authenticated. Nothing in this contract accepts an
 * `ownerId` from a caller — an owner is something the server *resolves*,
 * never something a request gets to name.
 */
export interface OwnerRepository {
  /** The HERITAGE owner linked to this Supabase Auth user, or null. This
   * is the only lookup that establishes identity: `owners.auth_user_id`
   * is set exclusively by a successful redemption. */
  findByAuthUserId(authUserId: string): Promise<Owner | null>;

  /**
   * The owner registered at this email, or null. Case-insensitive, to
   * match `owners_email_key`'s `unique (lower(email))`.
   *
   * This lookup exists ONLY to explain a rejected insert — never to
   * authorize anything. Matching an email is not proof of identity, so a
   * caller must never link or reuse an owner on the strength of this
   * result alone (see resolve-owner.ts, cases C and D).
   */
  findByEmail(email: string): Promise<Owner | null>;

  /**
   * Creates an owner for an authenticated identity.
   *
   * Returns `{ status: "conflict" }` rather than throwing when the
   * database refuses the row because one of `owners`' unique indexes
   * already covers it (`auth_user_id`, or `lower(email)`). That refusal
   * is the concurrency guarantee, not an error: two simultaneous first
   * redemptions by the same person cannot both create an owner, and the
   * loser is told so in a way it can act on. The caller re-reads to find
   * out which case it actually was — see resolve-owner.ts.
   *
   * A genuine failure (network, permissions, anything else) still
   * rejects: it must never be mistaken for a lost race.
   */
  create(input: {
    authUserId: string;
    email: string;
  }): Promise<{ status: "created"; owner: Owner } | { status: "conflict" }>;
}
