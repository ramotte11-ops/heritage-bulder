import type { Entitlement } from "@/types/entitlement";
import type { MemorialSupportSummary, OwnerSupportSummary } from "@/types/admin-support";

/**
 * Mission 015A — the read-only contract behind HERITAGE staff support.
 *
 * ## Why a separate port rather than methods on the existing ones
 *
 * Mission 015's brief asked for "OwnerRepository.findById". The
 * capability is delivered here instead, and the placement is deliberate:
 *
 *   * `OwnerRepository`'s own docstring says it is "deliberately not a
 *     `DataRepository<Owner>`" because redemption needs two specific
 *     lookups and nothing else. Redemption never reads an owner by id.
 *     Adding one there would force every implementer — present and
 *     future — to carry a method the redemption path never calls;
 *   * support reads and redemption reads have different rules. Support
 *     reads must be narrow (see `MemorialSupportSummary`) and must never
 *     touch secret columns. Keeping them in one port makes that a
 *     property of the port rather than a convention;
 *   * this port is READ-ONLY by construction. There is no method here
 *     that writes anything, so no Admin surface built on it can mutate
 *     state by accident. Mission 015B's mutations will be their own
 *     contract, with their own audit obligation.
 *
 * ## What must never appear here
 *
 * No method returns `entitlements.activation_key_hash`, and no
 * implementation may even select that column. A hash is not a
 * catastrophic leak on its own — it is not the key — but a support tool
 * has no use for it, and the cheapest way to guarantee it never reaches
 * a screen is to never read it. Mission 015B, which decides whether a
 * key can still be replaced, will need to know whether one EXISTS; that
 * is a boolean it must derive without exposing the value.
 *
 * Likewise no draft or published content, no media, no messages.
 *
 * ## Why the owner reads return `OwnerSupportSummary`, not `Owner`
 *
 * `Owner.authUserId` is Supabase Auth's own user id. Support's only use
 * for it is the yes/no fact of whether the owner has ever signed in
 * (Mission 011B's "unlinked owner" case) — never the identifier itself.
 * The port returns that boolean already computed, so the real id cannot
 * travel any further than the adapter that reads it: there is nowhere
 * past this file for it to leak from.
 */
export interface AdminSupportRepository {
  /** The owner with this id, or null when there is none. */
  findOwnerById(ownerId: string): Promise<OwnerSupportSummary | null>;

  /**
   * The owner registered at this email, or null. Exact, case-insensitive
   * equality — never a pattern. `%` and `_` are legal in an email's
   * local part and would act as SQL wildcards under `like`/`ilike`,
   * which is how a support search would quietly return a stranger's
   * record (the Mission 011B defect, in a new place).
   */
  findOwnerByEmail(email: string): Promise<OwnerSupportSummary | null>;

  /** The entitlement with this id, or null. */
  findEntitlementById(entitlementId: string): Promise<Entitlement | null>;

  /**
   * Every right belonging to this owner, oldest first.
   *
   * A list, but not a dump: it is scoped to ONE owner the caller has
   * already resolved, and an owner holds a handful of rights (one per
   * purchase). `entitlements_owner_id_idx` exists for exactly this.
   * There is deliberately no "list all entitlements", no pagination, and
   * no filtering — those would be the beginnings of a CRM.
   */
  findEntitlementsByOwnerId(ownerId: string): Promise<Entitlement[]>;

  /** The memorial with this id, summarised for support, or null. */
  findMemorialSummaryById(memorialId: string): Promise<MemorialSupportSummary | null>;

  /**
   * The memorial created from this right, or null when the right has not
   * been redeemed.
   *
   * `memorials.entitlement_id` is the single source of truth for this
   * relationship (Mission 002 correction) and carries a UNIQUE
   * constraint, so this returns at most one row — the association is
   * read from the real relation, never inferred from timestamps, owners
   * or anything else.
   */
  findMemorialSummaryByEntitlementId(
    entitlementId: string,
  ): Promise<MemorialSupportSummary | null>;
}
