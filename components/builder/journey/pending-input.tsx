"use client";

import { createContext, useContext, useEffect, useRef } from "react";

/**
 * B03 — « saisies incomplètes »: what the autosave cannot save.
 *
 * The autosave (lib/builder/use-autosave.ts) already protects every
 * change that reaches the draft — including its `beforeunload` guard.
 * What it never sees is input that is still local to a screen because it
 * is not valid or not finished yet: a date or time typed halfway (the
 * browser reports an empty value), a year that failed validation, a
 * tradition being written but not added yet, a photo still uploading.
 * Leaving the screen would drop it silently.
 *
 * Screens report such input here (`usePendingInput`), and native date/
 * time fields left incomplete are detected generically
 * (`hasIncompleteNativeInput`). « Mon parcours » then asks before
 * leaving, and closing the tab triggers the browser's own warning —
 * nothing is ever saved half-way, and nothing is lost without the
 * family knowing.
 */

export interface PendingInputRegistry {
  /** Adds a live check; returns its unregister function. */
  register(check: () => boolean): () => void;
  /** True if any registered screen part reports unsaved input now. */
  hasPending(): boolean;
}

export function createPendingInputRegistry(): PendingInputRegistry {
  const checks = new Set<() => boolean>();
  return {
    register(check) {
      checks.add(check);
      return () => {
        checks.delete(check);
      };
    },
    hasPending() {
      for (const check of checks) if (check()) return true;
      return false;
    },
  };
}

export const PendingInputRegistryContext = createContext<PendingInputRegistry | null>(null);

/** Reports, for as long as the caller is mounted, whether it holds input
 * the autosave cannot save yet. No-op outside a journey provider. */
export function usePendingInput(pending: boolean): void {
  const registry = useContext(PendingInputRegistryContext);
  const latest = useRef(pending);
  useEffect(() => {
    latest.current = pending;
  }, [pending]);
  useEffect(() => {
    if (registry === null) return;
    return registry.register(() => latest.current);
  }, [registry]);
}

/** A native date/time field the family started typing but left
 * incomplete: its value reads empty, `validity.badInput` says otherwise. */
export function hasIncompleteNativeInput(root: ParentNode = document): boolean {
  for (const input of Array.from(root.querySelectorAll("input"))) {
    if (input.validity?.badInput) return true;
  }
  return false;
}
