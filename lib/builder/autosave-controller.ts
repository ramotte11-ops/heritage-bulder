import {
  AUTOSAVE_DEBOUNCE_MS,
  INITIAL_AUTOSAVE_STATE,
  markContentChanged,
  saveFailed,
  saveSucceeded,
  startSaving,
  type AutosaveState,
} from "./autosave-state";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 009B — the runtime that was missing between Mission 007's
 * pure `autosave-state.ts` machine and an actual persisted save. This
 * file is the only thing that schedules real timers and calls the
 * injected persistence function; it never re-implements the state
 * machine itself (every status transition is delegated to
 * markContentChanged/startSaving/saveSucceeded/saveFailed, imported
 * as-is from Mission 007).
 *
 * No I/O of its own, no Supabase import, no React import — `persist`
 * is an injected plain function, so this is fully testable with fake
 * timers and a fake persist callback (see autosave-controller.test.ts).
 * A caller wires the real boundary in by passing
 * `(content) => draftRepository.saveDraftContent(memorialId, content)`
 * — this file never sees `memorialId`, `DraftRepository`, or any
 * Supabase client itself, and never will: that's exactly the injection
 * boundary Mission 009B's brief asks for.
 *
 * ## Concurrency: generations, not timestamps
 *
 * Every call to `notifyContentChanged` bumps an internal `generation`
 * counter. When a save actually starts, the generation it's saving is
 * captured (`inFlightGeneration`). When that save's promise resolves,
 * the completion handler only applies `saveSucceeded`/`saveFailed` to
 * the state machine if the generation it saved is still the current
 * one — otherwise content changed while the save was in flight, and
 * applying the old outcome would risk marking a newer, not-yet-saved
 * version as `saved`. This generation check is deliberately explicit
 * here, in the controller — even though `saveSucceeded`/`saveFailed`
 * already guard on `state.status === "saving"` internally (Mission
 * 007), and `markContentChanged` (called synchronously whenever new
 * content arrives) would already have flipped the status away from
 * "saving" by the time a stale completion runs, making that guard
 * redundant in practice. Two independent safety nets for the one
 * outcome this mission explicitly calls out as mandatory
 * ("éviter qu'une ancienne sauvegarde terminée ne marque comme saved
 * une version plus récente encore non persistée") is a deliberate
 * choice, not an oversight — this is the one guarantee this whole
 * runtime exists to protect.
 *
 * `retryRequested` is the separate, narrower question of *scheduling*:
 * did a debounce elapse (a genuinely due save) while unable to run
 * because a previous save was still in flight? If so, retry
 * immediately once that save finishes — the family already waited out
 * their own debounce window, there's no reason to make them wait a
 * second one stacked on top. A content change that arrives but whose
 * own debounce has *not* yet elapsed is left alone: its own timer,
 * already (re)scheduled by `notifyContentChanged`, will fire on its
 * own normal schedule.
 *
 * ## Mission 010 — recovering from `error` without retyping
 *
 * `retry()` re-enters `attemptSave()` directly (the same function a
 * debounce timer calls), so recovering from a failed save reuses every
 * guarantee above rather than adding a second recovery path: it can
 * never apply a stale outcome to a newer edit, exactly like a normal
 * save. `hasUnsavedChanges()` (autosave-state.ts) is the companion
 * piece — the pure, reusable answer to "is there currently something
 * this controller hasn't guaranteed persisted", which
 * lib/builder/use-autosave.ts uses to scope a `beforeunload` guard to
 * exactly the moments a real risk exists.
 */
export interface AutosaveControllerOptions {
  /** Persists one full content snapshot. Resolves with the new
   * `updatedAt` on success, rejects on any failure — exactly
   * `DraftRepository.saveDraftContent`'s shape, minus the
   * `memorialId` the caller has already bound. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
  /** Overrides AUTOSAVE_DEBOUNCE_MS — for tests only; real callers
   * should never need this. */
  debounceMs?: number;
}

export interface AutosaveController {
  /** Call on every Builder content change. Never throws, never
   * returns a promise — scheduling and persistence happen entirely in
   * the background; observe outcomes via `subscribe`/`getState`. */
  notifyContentChanged(content: MemorialContent): void;
  /** The current autosave status. Matches `useSyncExternalStore`'s
   * `getSnapshot` shape, so a thin hook can bind directly to it (see
   * use-autosave.ts). */
  getState(): AutosaveState;
  /** Registers a listener called after every state transition.
   * Returns an unsubscribe function. Matches
   * `useSyncExternalStore`'s `subscribe` shape. */
  subscribe(listener: () => void): () => void;
  /** Cancels any pending debounce timer and stops reacting to
   * whatever in-flight save may still resolve later (its completion
   * is silently ignored — no further state transition, no retry). Call
   * this on unmount. Idempotent. Does not flush a final save: this
   * mission builds the save mechanism itself, not "don't lose work on
   * the way out" — that is Mission 010's job. */
  destroy(): void;
  /** Replaces the persist callback for any future save (an in-flight
   * one keeps using whichever callback it already started with). Exists
   * so use-autosave.ts can keep the controller's persist function in
   * sync with the latest one a re-rendered component passed in, from
   * inside an effect — never by handing this controller a React ref to
   * read from later, which the project's lint rules for refs disallow
   * touching (even indirectly) during render. */
  setPersist(persist: AutosaveControllerOptions["persist"]): void;
  /** Mission 010 — explicitly retries the last known content after a
   * failed save. No-op unless the current status is `error`: calling it
   * while idle/pending/saving/saved does nothing, since there is either
   * nothing to retry or a cycle already in flight/queued that already
   * covers it. Always retries `latestContent` as of the call — the most
   * recent version `notifyContentChanged` received, never a stale one:
   * if a real edit happened since the failure, status is already
   * `pending`, not `error`, and this correctly no-ops in favour of that
   * edit's own normal debounce cycle instead of racing it. Re-enters
   * `attemptSave()`, the exact function a debounce timer calls — no
   * second, parallel save path, and every existing generation/in-flight
   * guard applies identically regardless of what triggered it. */
  retry(): void;
}

export function createAutosaveController(
  options: AutosaveControllerOptions,
): AutosaveController {
  let persist = options.persist;
  const { debounceMs = AUTOSAVE_DEBOUNCE_MS } = options;

  let state: AutosaveState = INITIAL_AUTOSAVE_STATE;
  let latestContent: MemorialContent | null = null;
  let generation = 0;
  let inFlightGeneration: number | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryRequested = false;
  let destroyed = false;

  const listeners = new Set<() => void>();

  function setState(next: AutosaveState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function clearDebounceTimer(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function attemptSave(): void {
    if (destroyed) return;

    if (inFlightGeneration !== null) {
      // A save is already running. Remember that this one is now due,
      // so it fires the moment the in-flight save clears — see the
      // completion handler below.
      retryRequested = true;
      return;
    }

    if (state.status !== "pending") {
      // Nothing queued (e.g. a stray timer fire after an unrelated
      // state change) — nothing to do.
      return;
    }

    const generationToSave = generation;
    // Non-null: reaching "pending" only ever happens via
    // notifyContentChanged, which always sets latestContent first.
    const contentToSave = latestContent as MemorialContent;

    inFlightGeneration = generationToSave;
    retryRequested = false;
    setState(startSaving(state));

    persist(contentToSave).then(
      (result) => {
        inFlightGeneration = null;
        if (!destroyed && generationToSave === generation) {
          setState(saveSucceeded(state, result.updatedAt));
        }
        if (!destroyed && retryRequested) {
          retryRequested = false;
          attemptSave();
        }
      },
      (error: unknown) => {
        inFlightGeneration = null;
        if (!destroyed && generationToSave === generation) {
          setState(saveFailed(state, error instanceof Error ? error.message : String(error)));
        }
        if (!destroyed && retryRequested) {
          retryRequested = false;
          attemptSave();
        }
      },
    );
  }

  function notifyContentChanged(content: MemorialContent): void {
    if (destroyed) return;

    latestContent = content;
    generation += 1;
    setState(markContentChanged(state));

    clearDebounceTimer();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      attemptSave();
    }, debounceMs);
  }

  function retry(): void {
    if (destroyed) return;
    if (state.status !== "error") return;

    // Bypasses the debounce wait on purpose — this is an explicit "try
    // again now" request (a future retry button, or use-autosave.ts's
    // online-triggered retry), not a fresh edit that should sit out its
    // own debounce window.
    clearDebounceTimer();
    setState(markContentChanged(state)); // error -> pending, clears lastError
    attemptSave();
  }

  function getState(): AutosaveState {
    return state;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy(): void {
    destroyed = true;
    clearDebounceTimer();
    // An in-flight persist() call cannot be cancelled (no abort
    // signal in this port) — its .then/.catch above checks `destroyed`
    // first and does nothing further, so no state transition and no
    // retry happen after this point, even once that promise settles.
  }

  function setPersist(next: AutosaveControllerOptions["persist"]): void {
    persist = next;
  }

  return { notifyContentChanged, getState, subscribe, destroy, setPersist, retry };
}
