/**
 * Mission 007 — the Builder's autosave status, as a pure state machine.
 * No I/O, no React, no Supabase — this is the boundary a future
 * progressive "one question at a time" UI is meant to bind to, without
 * having to invent its own save-status tracking. Driven at runtime by
 * lib/builder/autosave-controller.ts (Mission 009B) and wired into
 * components/builder/BuilderShell.tsx; `hasUnsavedChanges` below
 * (Mission 010) is the loss-protection boundary built on top of it.
 *
 * Deliberately knows nothing about MemorialType, Skin, or Offer: it
 * tracks the status of ONE save operation, nothing about what's being
 * saved or for which culture/experience. The same machine serves
 * `person` today and `pet` tomorrow, and any future offer, without a
 * single conditional.
 */

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface AutosaveState {
  status: AutosaveStatus;
  /** ISO 8601, set only on a successful save. Survives into later
   * states (e.g. still readable while a next save is `pending`), so a
   * future UI can always show "last saved at ..." even mid-edit. */
  lastSavedAt: string | null;
  /** Cleared the moment a new save attempt starts — never shown stale
   * next to a state that has since recovered. */
  lastError: string | null;
}

export const INITIAL_AUTOSAVE_STATE: AutosaveState = {
  status: "idle",
  lastSavedAt: null,
  lastError: null,
};

/**
 * Debounce window a future UI-wiring mission should use before actually
 * calling the save boundary, counted from the last content change. A
 * named, easily-tunable constant rather than a value buried in scheduling
 * logic — this module does not itself schedule anything (no
 * setTimeout/debounce implementation here): that's real-time,
 * environment-dependent behaviour that belongs with whatever future code
 * actually wires this into the Builder, not in a pure, synchronously
 * testable module.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * The family changed something. From `saved`, `error`, or `idle`, this
 * queues a save (`pending`). From `saving`, it also moves to `pending`
 * — a future save request is already implied once the in-flight one
 * completes (see `startSaving`'s docstring), rather than losing the
 * fact that content changed again during a save. From `pending`
 * itself, this is a no-op: one queued save already covers it.
 */
export function markContentChanged(state: AutosaveState): AutosaveState {
  if (state.status === "pending") {
    return state;
  }

  return { ...state, status: "pending", lastError: null };
}

/**
 * The save boundary (lib/adapters/draft-repository.ts) is about to be
 * called. Only leaves `pending` — starting a save that was never queued
 * would let a caller invent a save the family's actual edits never
 * requested, so this is a no-op from every other status.
 */
export function startSaving(state: AutosaveState): AutosaveState {
  if (state.status !== "pending") {
    return state;
  }

  return { ...state, status: "saving" };
}

/** The save boundary succeeded. Only meaningful from `saving`; a no-op
 * otherwise (nothing was in flight to have succeeded). */
export function saveSucceeded(state: AutosaveState, savedAt: string): AutosaveState {
  if (state.status !== "saving") {
    return state;
  }

  return { status: "saved", lastSavedAt: savedAt, lastError: null };
}

/** The save boundary failed. Only meaningful from `saving`; a no-op
 * otherwise. `lastSavedAt` is deliberately preserved — a failed retry
 * must never make a previously successful save look like it never
 * happened (this is exactly the guarantee "an accidental refresh must
 * not lose already-saved work" depends on: the UI can keep showing the
 * last real save even while reporting the new error). */
export function saveFailed(state: AutosaveState, reason: string): AutosaveState {
  if (state.status !== "saving") {
    return state;
  }

  return { ...state, status: "error", lastError: reason };
}

/**
 * Mission 010 — the single, reusable answer to "does the family risk
 * losing something right now?", derived entirely from this state
 * machine rather than tracked as a second, parallel piece of "dirty"
 * state. `pending`/`saving`/`error` all mean the latest edit isn't yet
 * guaranteed persisted; `idle`/`saved` mean nothing is currently at
 * risk.
 *
 * `idle` covers two different real situations that both correctly mean
 * "no risk": nothing has changed since the last (or no) save, and —
 * just as importantly — autosave being entirely inert because no
 * `persist` function was ever configured (lib/builder/use-autosave.ts
 * never leaves `idle` in that case, since it never even creates a
 * controller). Mission 003's demo Builder must never show a loss
 * warning it can't back up with a real save promise — this function
 * can't accidentally do that, because there is nothing that ever moves
 * a persist-less session's state out of `idle`.
 *
 * This is the one boundary a future beforeunload guard (this mission)
 * or a future in-app Builder navigation guard (not built — see this
 * mission's report) both call, instead of each inventing their own
 * notion of "unsaved".
 */
export function hasUnsavedChanges(state: AutosaveState): boolean {
  return state.status === "pending" || state.status === "saving" || state.status === "error";
}
