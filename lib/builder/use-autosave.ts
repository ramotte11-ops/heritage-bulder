"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createAutosaveController } from "./autosave-controller";
import { INITIAL_AUTOSAVE_STATE, type AutosaveState } from "./autosave-state";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 009B (runtime) / Mission 009B revision (real Builder wiring)
 * — the thin React binding for autosave-controller.ts. Deliberately
 * close to zero logic: every actual concurrency/debounce decision
 * lives in the controller (fully tested without React — see
 * autosave-controller.test.ts). This file has no test of its own,
 * consistent with this codebase's existing convention of never
 * DOM-rendering a component/hook in tests (no `components/builder/*`
 * file has one either, and Vitest here runs in the "node" environment
 * — see vitest.config.mts). The equivalent logical sequence (skip the
 * mount value, notify on each subsequent change, stay inert without a
 * `persist`) is exercised directly against the real controller and the
 * real lib/builder/builder-state.ts in autosave-integration.test.ts.
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
 * see this mission's report), no controller is even created and
 * `content` changes are observed and silently ignored. A future real
 * Builder screen passes one once it has a real, authorized
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
 */
export interface UseAutosaveOptions {
  content: MemorialContent;
  persist?: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

export interface UseAutosaveResult {
  state: AutosaveState;
}

function noopSubscribe(): () => void {
  return () => {};
}

function getNoopState(): AutosaveState {
  return INITIAL_AUTOSAVE_STATE;
}

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

  return { state };
}
