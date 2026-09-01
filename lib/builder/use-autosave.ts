"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createAutosaveController } from "./autosave-controller";
import type { AutosaveState } from "./autosave-state";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 009B — the thin React binding for autosave-controller.ts.
 * Deliberately close to zero logic: every actual concurrency/debounce
 * decision lives in the controller (fully tested without React — see
 * autosave-controller.test.ts). This file has no test of its own,
 * consistent with this codebase's existing convention of never
 * DOM-rendering a component/hook in tests (no `components/builder/*`
 * file has one either, and Vitest here runs in the "node" environment
 * — see vitest.config.mts) — its only real content is
 * `useSyncExternalStore`, whose correctness is React's own.
 *
 * `persist` may be a fresh closure on every render (as it typically
 * will be, e.g. a Server Action bound to a specific memorialId).
 * Deliberately never handed to the controller via a React ref read
 * later — this project's lint rules forbid touching a ref (even
 * indirectly, through a closure) during render, so the controller's
 * `setPersist` is instead called from a plain `useEffect`, which runs
 * strictly after render.
 *
 * Not wired into BuilderShell or any other component in this mission
 * (see this mission's report for why: the visible Builder has no
 * legitimate `memorialId` yet). A future caller uses this exactly like
 * any other hook:
 *
 * ```tsx
 * const { state, notifyContentChanged } = useAutosave({
 *   persist: (content) => draftRepository.saveDraftContent(memorialId, content),
 * });
 * ```
 */
export interface UseAutosaveOptions {
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

export interface UseAutosaveResult {
  state: AutosaveState;
  notifyContentChanged: (content: MemorialContent) => void;
}

export function useAutosave({ persist }: UseAutosaveOptions): UseAutosaveResult {
  // useState's lazy initializer runs once, at mount, reading whichever
  // `persist` closure the first render passed — every render after
  // that keeps the controller's persist up to date via the effect
  // below instead, never by re-running this initializer.
  const [controller] = useState(() => createAutosaveController({ persist }));

  useEffect(() => {
    controller.setPersist(persist);
  });

  useEffect(() => {
    return () => controller.destroy();
  }, [controller]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  return { state, notifyContentChanged: controller.notifyContentChanged };
}
