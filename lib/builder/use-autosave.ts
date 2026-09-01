"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createAutosaveController } from "./autosave-controller";
import { hasUnsavedChanges, INITIAL_AUTOSAVE_STATE, type AutosaveState } from "./autosave-state";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 009B (runtime + real Builder wiring) / Mission 010 (loss
 * protection) — the thin React binding for autosave-controller.ts.
 * Deliberately close to zero logic: every actual concurrency/debounce/
 * retry decision lives in the controller (fully tested without React —
 * see autosave-controller.test.ts). This file has no test of its own,
 * consistent with this codebase's existing convention of never
 * DOM-rendering a component/hook in tests (no `components/builder/*`
 * file has one either, and Vitest here runs in the "node" environment
 * — see vitest.config.mts). The equivalent logical sequences (skip the
 * mount value, notify on each subsequent change, stay inert without a
 * `persist`, and — Mission 010 — the exact activation condition the
 * `beforeunload` guard below uses) are exercised directly against the
 * real controller and the real lib/builder/builder-state.ts in
 * autosave-integration.test.ts / autosave-controller.test.ts.
 *
 * `content` is meant to be `BuilderState.content`
 * (lib/builder/builder-state.ts) — the Builder's one existing source of
 * truth for its content. This hook only ever *observes* that value; it
 * never copies it into a second, parallel piece of state. Every
 * reference change to `content` after the initial mount triggers one
 * autosave cycle for the new value — nothing narrower (e.g. "only
 * SectionEditor's onChange") needs to individually remember to call
 * anything, so a future content-changing action (a photo crop, a
 * reorder, ...) is covered automatically as long as it goes through
 * `BuilderState.content`, which every Builder mutation already does.
 *
 * `persist` is optional on purpose: when absent (the Mission 003 demo
 * screens, which have no legitimate `memorialId` to persist against —
 * see this mission's report), no controller is even created, `content`
 * changes are observed and silently ignored, and — Mission 010 — no
 * `beforeunload` guard is ever armed either: `state` never leaves
 * `idle` in that mode, so `hasUnsavedChanges` is always `false`. A
 * future real Builder screen passes one once it has a real, authorized
 * `memorialId`:
 *
 * ```tsx
 * useAutosave({
 *   content: state.content,
 *   persist: (content) => draftRepository.saveDraftContent(memorialId, content),
 * });
 * ```
 *
 * `persist` may be a fresh closure on every render. Deliberately never
 * handed to the controller via a React ref read later — this project's
 * lint rules forbid touching a ref (even indirectly, through a
 * closure) during render, so the controller's `setPersist` is instead
 * called from a plain `useEffect`, which runs strictly after render.
 *
 * ## Mission 010 — loss protection
 *
 * A native `beforeunload` listener is registered only while
 * `hasUnsavedChanges(state)` is true (autosave-state.ts), and removed
 * the moment it stops being true — never left attached permanently.
 * `event.preventDefault()` + a truthy `event.returnValue` is the
 * standards-compliant minimum that makes a browser show its own
 * native confirmation dialog; no custom message is ever authored here
 * (modern browsers ignore one anyway, and forcing text that might not
 * even be shown would be misleading).
 *
 * A best-effort `online` listener calls `retry()` when the browser
 * regains connectivity — harmless when there is nothing to retry
 * (`retry()` itself is a no-op outside `error`, see
 * autosave-controller.ts), and not a claim that `navigator.onLine`
 * proves the server is reachable, only that it's worth trying again.
 * `retry` is also returned directly, for a future explicit "try again"
 * affordance — no UI for that is built in this mission.
 */
export interface UseAutosaveOptions {
  content: MemorialContent;
  persist?: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

export interface UseAutosaveResult {
  state: AutosaveState;
  /** Explicitly retries the last unsaved content. No-op unless the
   * current state is `error`, and a no-op entirely in persist-less
   * (demo) mode. */
  retry: () => void;
}

function noopSubscribe(): () => void {
  return () => {};
}

function getNoopState(): AutosaveState {
  return INITIAL_AUTOSAVE_STATE;
}

function noopRetry(): void {}

export function useAutosave({ content, persist }: UseAutosaveOptions): UseAutosaveResult {
  // Decided once, from the first render's persist — see this file's
  // docstring: real callers pass a stable "is autosave enabled at all"
  // answer for a given mount (either always a function, or always
  // undefined), never toggle between the two mid-session.
  const [controller] = useState(() => (persist ? createAutosaveController({ persist }) : null));

  useEffect(() => {
    if (controller && persist) controller.setPersist(persist);
  });

  useEffect(() => {
    return () => controller?.destroy();
  }, [controller]);

  const isFirstContentRender = useRef(true);
  useEffect(() => {
    if (isFirstContentRender.current) {
      // The mount value is what was just loaded (or the demo fixture)
      // — never something to immediately "autosave" back.
      isFirstContentRender.current = false;
      return;
    }
    controller?.notifyContentChanged(content);
  }, [content, controller]);

  const state = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getState : getNoopState,
  );

  // Armed only while there's a real risk — re-evaluated on every state
  // transition, so it's added/removed exactly when that risk
  // appears/disappears, never left attached once `saved`/`idle`.
  useEffect(() => {
    if (!hasUnsavedChanges(state)) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers show their own native text regardless of this value's
      // content; only its truthiness matters for triggering the prompt
      // at all (a long-standing cross-browser requirement — see MDN).
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state]);

  // Best-effort recovery: regaining connectivity is a reasonable moment
  // to retry a failed save without waiting for another edit. retry()'s
  // own guard makes this a no-op whenever there's nothing to retry.
  useEffect(() => {
    if (!controller) return;

    const handleOnline = () => controller.retry();

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [controller]);

  return { state, retry: controller ? controller.retry : noopRetry };
}
