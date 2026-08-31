import type { MemorialContent, MemorialVersion } from "@/types/memorial";

/**
 * Mission 007/008 — the one piece `DataRepository<Memorial>` explicitly
 * declined to cover (see lib/adapters/supabase/memorial-repository.ts's
 * `update()`): reading and writing a memorial's draft content on its
 * own, without composing the full `Memorial` (which also touches
 * `memorials` and `memorial_published_snapshots` — three tables for
 * something that only needs one). Kept as its own narrow port rather
 * than folded into `DataRepository<Memorial>` — `memorial_drafts` is
 * its own table with its own RLS policies, not a field of `memorials`,
 * so a dedicated contract mirrors the schema instead of hiding that
 * shape behind a generic `update`.
 *
 * Deliberately knows only `memorialId` + `content` — never
 * `MemorialType`, `Skin`, or `OfferId`. The same implementation serves
 * `person` today, `pet` tomorrow, and any future offer. No assumption
 * anywhere that one owner has only one memorial — every method is
 * scoped by `memorialId` alone.
 *
 * `MemorialVersion` (types/memorial.ts) is reused as-is for the read
 * return shape — it is already exactly `{ content, updatedAt }`, the
 * same shape `Memorial.draft` already has. No second, competing content
 * model is introduced here.
 */
export interface DraftRepository {
  /**
   * Reads the memorial's current draft content. Returns `null` when the
   * draft is unreachable — either because `memorialId` doesn't
   * correspond to any real memorial, or because it belongs to a
   * different owner. These two cases are deliberately indistinguishable
   * to the caller: a conforming implementation must never leak whether
   * a `memorialId` it doesn't have access to actually exists. This is a
   * normal, expected outcome (a caller checks for `null` and reacts,
   * e.g. redirecting), unlike a genuine Supabase/network error, which
   * must still be rejected, not folded into `null`.
   */
  getDraftContent(memorialId: string): Promise<MemorialVersion | null>;

  /**
   * Overwrites the memorial's current draft content. Whole-content,
   * last-write-wins — the caller is responsible for merging its change
   * into the full content object first (exactly what
   * lib/builder/builder-state.ts's `updateSectionContent` already
   * produces). No optimistic concurrency control exists yet — a known,
   * accepted V1 limitation (see Mission 007/008's reports), not an
   * oversight: nothing in this codebase yet has two editors on the same
   * memorial at once.
   *
   * Resolves with the row's new `updatedAt` on success. Never silently
   * no-ops: if `memorialId` doesn't belong to the caller (or doesn't
   * exist), the underlying RLS policy makes the update affect zero
   * rows, which a conforming implementation must surface as a rejected
   * promise, not a false success. Unlike `getDraftContent`, zero rows
   * here IS treated as an error, deliberately: a caller that attempted
   * to change something and had nothing happen must be told, whereas a
   * caller that merely asked to read something that isn't there just
   * gets `null`.
   */
  saveDraftContent(memorialId: string, content: MemorialContent): Promise<{ updatedAt: string }>;
}
