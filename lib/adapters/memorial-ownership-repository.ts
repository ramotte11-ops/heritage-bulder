/**
 * Mission 014 — the narrowest possible contract for one question:
 * "which Owner does this memorial belong to?"
 *
 * Deliberately not a method on `DataRepository<StoredMemorial>`.
 * `findById` composes a whole memorial across three tables and returns
 * its content; an authorization check must read the least it can, so
 * that a bug in this path can never hand a caller draft content it has
 * not yet earned the right to see. One column, one row, no content.
 *
 * It takes `memorialId` alone and returns an owner id — it never
 * receives an owner id to compare against. The comparison happens in
 * lib/auth/memorial-access.ts, against the owner the SERVER resolved
 * from the session, so no implementation of this port is ever in a
 * position to answer "yes, that's the right owner".
 */
export interface MemorialOwnershipRepository {
  /**
   * The `owner_id` of this memorial, or `null` when no memorial with
   * this id exists.
   *
   * `null` means "no such row" and nothing else. It must never be used
   * to signal a failure: a genuine repository error (network, Supabase,
   * permissions) must reject, because an authorization check that reads
   * a failure as "not found" would be answering a question it did not
   * actually get an answer to. The caller turns both a `null` and a
   * mismatch into the same opaque refusal — that indistinguishability is
   * the caller's job, not this port's.
   */
  findOwnerIdForMemorial(memorialId: string): Promise<string | null>;
}
