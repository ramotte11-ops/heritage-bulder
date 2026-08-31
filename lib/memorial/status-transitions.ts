import type { MemorialStatus } from "@/types/memorial";

/**
 * Mission 005 — the memorial lifecycle's state machine.
 *
 * Pure, framework-free, no I/O: this module reads and returns plain
 * values only, never touches Supabase, never calls a clock. It is the
 * single source of truth for which `MemorialStatus` transitions are
 * legal — nothing else in this codebase decides that independently.
 * Nothing calls it yet: it exists as the clean boundary a future
 * publish/save Server Action (Mission 006+) is meant to call, per the
 * Mission 005 brief.
 *
 * The 9 transitions below are exactly the ones validated in the Mission
 * 005 brief — no more, no fewer (see status-transitions.test.ts's
 * exhaustive matrix, which asserts this table against all 25 possible
 * (from, to) pairs, self-transitions included).
 *
 * `archived` is a deliberate terminal state for this mission: a
 * restored memorial's correct re-entry point (`draft`, `editing`, or
 * something else) depends on whether it was ever published before
 * being archived — a rule Mission 005 explicitly defers. No
 * restore/un-archive transition exists here; building one is future
 * work, not a gap in this one.
 *
 * "Non activé" (an Entitlement not yet redeemed, so no Memorial row
 * exists yet) and "deleted" (a destructive action, never a
 * `MemorialStatus` value) are both out of this module's scope by
 * design — see Mission 005's roadmap-audit discussion.
 */
export const MEMORIAL_STATUS_TRANSITIONS: Readonly<
  Record<MemorialStatus, readonly MemorialStatus[]>
> = {
  draft: ["ready", "archived"],
  ready: ["draft", "published", "archived"],
  published: ["editing", "archived"],
  editing: ["published", "archived"],
  archived: [],
};

/** Is `from -> to` one of the 9 transitions Mission 005 validated? */
export function canTransitionMemorialStatus(
  from: MemorialStatus,
  to: MemorialStatus,
): boolean {
  return MEMORIAL_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * The minimal slice of a Memorial this module needs to decide a
 * transition — never the whole `Memorial` type, so a caller doesn't
 * need a real one on hand (a future Server Action can pass exactly
 * these two fields straight from a DB row).
 */
export interface MemorialTransitionInput {
  status: MemorialStatus;
  /** `memorials.first_published_at` — null until ever published. Set
   * once, never overwritten (see supabase/migrations/20260829154000_memorials.sql).
   * This module never reads or writes the database itself; the caller
   * is responsible for passing the real value. */
  firstPublishedAt: string | null;
}

export type MemorialTransitionResult =
  | { ok: true; status: MemorialStatus; isFirstPublication: boolean }
  | { ok: false; reason: string };

/**
 * Attempts one transition. Never throws — an illegal transition comes
 * back as `{ ok: false, reason }` so a caller (a future Server Action)
 * can turn it into a form error without a try/catch.
 *
 * `isFirstPublication` is how Mission 005's rule 3 is implemented
 * without a `republished` status: it is `true` only when this
 * transition's target is `published` AND `firstPublishedAt` was still
 * null going in (i.e. a `ready -> published` first publication). An
 * `editing -> published` republication has `firstPublishedAt` already
 * set, so it comes back `false` — the caller then knows to update
 * `memorial_published_snapshots.published_at` without touching
 * `memorials.first_published_at`. For any transition not targeting
 * `published`, this is always `false`.
 */
export function transitionMemorial(
  current: MemorialTransitionInput,
  to: MemorialStatus,
): MemorialTransitionResult {
  if (!canTransitionMemorialStatus(current.status, to)) {
    return {
      ok: false,
      reason: `La transition de « ${current.status} » vers « ${to} » n'est pas autorisée.`,
    };
  }

  return {
    ok: true,
    status: to,
    isFirstPublication: to === "published" && current.firstPublishedAt === null,
  };
}
