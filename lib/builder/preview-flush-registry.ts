"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Étape 3 — Preview réel: how the Builder's Preview host drains the
 * current step's autosave before reading the saved draft.
 *
 * Each Guided Flow step owns its own `useAutosave` instance (its
 * `content` state lives in the step), so the host cannot reach a step's
 * `flush` directly. Rather than touching every step, `useAutosave`
 * registers its own `flush` here whenever a `BuilderPreviewHost` is
 * above it (`useRegisterPreviewFlush`) — outside a host, nothing
 * happens at all. A screen with no autosave registers nothing, and
 * `flushAll` then resolves immediately: there is nothing to drain.
 */

export type PreviewFlush = () => Promise<void>;

export interface PreviewFlushRegistry {
  /** Adds a flush; returns its unregister function. */
  register(flush: PreviewFlush): () => void;
  /** Drains every registered autosave. Resolves once all of them are
   * saved; rejects as soon as any of them fails. */
  flushAll(): Promise<void>;
}

export function createPreviewFlushRegistry(): PreviewFlushRegistry {
  const flushes = new Set<PreviewFlush>();
  return {
    register(flush) {
      flushes.add(flush);
      return () => {
        flushes.delete(flush);
      };
    },
    async flushAll() {
      await Promise.all(Array.from(flushes, (flush) => flush()));
    },
  };
}

export const PreviewFlushRegistryContext = createContext<PreviewFlushRegistry | null>(null);

/** Registers `flush` with the nearest Preview host, for as long as the
 * caller is mounted. No-op without a host or without a flush. */
export function useRegisterPreviewFlush(flush: PreviewFlush | null): void {
  const registry = useContext(PreviewFlushRegistryContext);
  useEffect(() => {
    if (registry === null || flush === null) return;
    return registry.register(flush);
  }, [registry, flush]);
}
