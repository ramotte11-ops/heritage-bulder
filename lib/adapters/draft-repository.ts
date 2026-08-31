import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 007 — the one piece `DataRepository<Memorial>` explicitly
 * declined to cover (see lib/adapters/supabase/memorial-repository.ts's
 * `update()`): writing a memorial's draft content. Kept as its own
 * narrow port rather than folded into `DataRepository<Memorial>` —
 * `memorial_drafts` is its own table with its own RLS policy, not a
 * field of `memorials`, so a dedicated contract mirrors the schema
 * instead of hiding that shape behind a generic `update`.
 *
 * Deliberately knows only `memorialId` + `content` — never
 * `MemorialType`, `Skin`, or `OfferId`. The same implementation serves
 * `person` today, `pet` tomorrow, and any future offer.
 */
export interface DraftRepository {
  /**
   * Overwrites the memorial's current draft content. Whole-content,
   * last-write-wins — the caller is responsible for merging its change
   * into the full content object first (exactly what
   * lib/builder/builder-state.ts's `updateSectionContent` already
   * produces). No optimistic concurrency control exists yet — a known,
   * accepted V1 limitation (see this mission's report), not an
   * oversight: nothing in this codebase yet has two editors on the same
   * memorial at once.
   *
   * Resolves with the row's new `updatedAt` on success. Never silently
   * no-ops: if `memorialId` doesn't belong to the caller (or doesn't
   * exist), the underlying RLS policy makes the update affect zero
   * rows, which a conforming implementation must surface as a rejected
   * promise, not a false success.
   */
  saveDraftContent(memorialId: string, content: MemorialContent): Promise<{ updatedAt: string }>;
}
