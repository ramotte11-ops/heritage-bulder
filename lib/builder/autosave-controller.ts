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
 *
 * ## Mission 034 QG micro-audit — `flush()`
 *
 * A caller sometimes needs a STRONGER guarantee than "eventually
 * persisted": HeroCropStep's Continue click needs to be certain that
 * whatever this controller already knows about (a debounced pan/zoom
 * edit, still pending or already mid-flight) is DURABLY saved before it
 * issues its own, separate, order-sensitive write (committing T07's
 * `StepRecord`) — otherwise a stale debounced save, still in flight or
 * about to fire, could land AFTER that write and silently revert it
 * (whole-content, last-write-wins persistence has no other guard against
 * that). `flush()` is that guarantee: it cancels any pending debounce
 * timer (so nothing NEW can fire once it returns), forces an
 * already-queued (`"pending"`) save to start immediately rather than
 * wait out its window, and returns a promise that resolves only once
 * this controller is fully idle again (`"saved"`) — or rejects if the
 * final attempt failed, so a caller can refuse to build on unconfirmed
 * content rather than race ahead of it anyway. It reuses `attemptSave()`
 * and the same generation/`retryRequested` machinery every other path
 * already relies on — no second save mechanism, no new concurrency
 * rule.
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
  /** Mission 034 QG micro-audit — drains this controller to durable
   * quiescence: cancels any pending debounce timer, forces an
   * already-queued save to start now instead of waiting out its window,
   * and awaits whatever save (that one, or one already in flight) is
   * currently the controller's responsibility. Resolves once status is
   * `"saved"`; rejects with the failure once status is `"error"` with
   * nothing left in flight (a caller should treat that as "not durably
   * saved", never proceed past it as if it were). A no-op resolving
   * immediately when there is nothing to drain (`"idle"`/already
   * `"saved"`). See this file's own docstring, "Mission 034 QG
   * micro-audit". */
  flush(): Promise<void>;
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

  function flush(): Promise<void> {
    if (destroyed) return Promise.resolve();

    // Nothing new can fire once this returns — the only save left able
    // to run afterward is the one this call itself drives to completion
    // below (or the one already in flight, which it only ever waits on).
    clearDebounceTimer();

    if (state.status === "error") {
      // The same "error -> pending" transition retry() applies — so the
      // block below starts it right away, exactly once, rather than
      // giving up on a failure that happened before this call.
      setState(markContentChanged(state));
    }

    if (state.status === "pending") {
      // attemptSave()'s own guard already does the right thing whether
      // or not a save happens to be in flight right now (sets
      // retryRequested and returns if so) — no second branch needed.
      attemptSave();
    }

    if (state.status === "idle" || state.status === "saved") {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const unsubscribe = subscribe(() => {
        if (state.status === "saved") {
          unsubscribe();
          resolve();
        } else if (state.status === "error" && inFlightGeneration === null) {
          unsubscribe();
          reject(new Error(state.lastError ?? "autosave failed"));
        }
        // "pending"/"saving" — still draining, keep waiting.
      });
    });
  }

  return { notifyContentChanged, getState, subscribe, destroy, setPersist, retry, flush };
}
