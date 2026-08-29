/**
 * The person who manages a memorial. Mirrors the `owners` table
 * (supabase/migrations/20260829152000_owners.sql).
 */
export interface Owner {
  id: string;
  /**
   * External reference to Supabase Auth's user id (auth.users.id). Null
   * until the owner has completed the (not yet built) magic-link flow.
   * Never treated as this record's identity elsewhere — every other
   * table links to `Owner.id`, not to this field. See
   * supabase/README.md.
   */
  authUserId: string | null;
  email: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
