"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { JourneyScreenId, JourneySnapshot } from "@/lib/builder/guided-flow/journey";
import { PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";

/**
 * B03 — « Mon parcours »: what the entry (`JourneyEntry`, rendered by
 * `BuilderScreen`) and every Guided Flow step read.
 *
 * Outside a provider (T01, the Welcome, the unit tests of a single
 * step) the context is `null`: the entry renders nothing and
 * `useStepDone` falls back to the historical `router.refresh()`.
 */
export interface JourneyNavigation {
  language: Language;
  snapshot: JourneySnapshot;
  /** Saves the current screen's pending autosave, then opens `id` for
   * revision. Resolves `false` (and navigates nowhere) if that save
   * fails — the screen's own AutosaveIndicator already shows why. */
  openScreen: (id: JourneyScreenId) => Promise<boolean>;
  /** Saves, then goes back to where the family stopped. */
  resume: () => Promise<boolean>;
  /** Called by a step once its own Continue (or skip) is saved. */
  finishStep: () => void;
}

export const JourneyContext = createContext<JourneyNavigation | null>(null);

export function useJourney(): JourneyNavigation | null {
  return useContext(JourneyContext);
}

/**
 * What a Guided Flow step calls once its commit is saved, instead of a
 * bare `router.refresh()`: on the normal route it IS `router.refresh()`
 * (the route's gates move on); on a screen opened for revision it goes
 * back to the route without `?etape=`, whose gates recompute every
 * conditional step and resume where the family stopped.
 */
export function useStepDone(): () => void {
  const router = useRouter();
  const journey = useContext(JourneyContext);
  return useCallback(() => {
    if (journey !== null) journey.finishStep();
    else router.refresh();
  }, [journey, router]);
}

/**
 * The real route's provider (`BuilderPreviewHost` mounts it when the
 * page hands it a journey). `builderPath` is built server-side from the
 * AUTHORIZED memorial id, and screen ids come from the fixed catalog —
 * no free-form URL is ever pushed.
 */
export function RouteJourneyProvider({
  language,
  snapshot,
  builderPath,
  children,
}: {
  language: Language;
  snapshot: JourneySnapshot;
  builderPath: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const registry = useContext(PreviewFlushRegistryContext);

  const value = useMemo<JourneyNavigation>(() => {
    async function drained(): Promise<boolean> {
      if (registry === null) return true;
      try {
        await registry.flushAll();
        return true;
      } catch {
        return false;
      }
    }
    return {
      language,
      snapshot,
      async openScreen(id) {
        if (!(await drained())) return false;
        router.push(`${builderPath}?etape=${id}`);
        return true;
      },
      async resume() {
        if (!(await drained())) return false;
        router.push(builderPath);
        return true;
      },
      finishStep() {
        if (snapshot.revising !== null) router.replace(builderPath);
        else router.refresh();
      },
    };
  }, [language, snapshot, builderPath, router, registry]);

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}
