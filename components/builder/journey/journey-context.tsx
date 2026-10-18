"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { JourneyScreenId, JourneySnapshot } from "@/lib/builder/guided-flow/journey";
import type { SectionId } from "@/config/sections";
import type { SectionVisibilityEntry } from "@/lib/memorial/visibility-entries";
import { PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";
import { applyBeforeUnloadGuard } from "@/lib/builder/use-autosave";
import {
  createPendingInputRegistry,
  hasIncompleteNativeInput,
  PendingInputRegistryContext,
} from "./pending-input";
import { useDraftRevisionCoordinator, type DraftSaveResponse } from "@/lib/builder/draft-revision";

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
  /** `memorials.skin_variant` as persisted — shown on T08's row once
   * T08 is done (« Ambiance : Claire / Sombre »). `null` when unknown. */
  skinVariant: SkinVariant | null;
  /** Saves the current screen's pending autosave, then opens `id` for
   * revision. Resolves `false` (and navigates nowhere) if that save
   * fails — the screen's own AutosaveIndicator already shows why. */
  openScreen: (id: JourneyScreenId) => Promise<boolean>;
  /** Saves, then goes back to where the family stopped. */
  resume: () => Promise<boolean>;
  /** Called by a step once its own Continue (or skip) is saved. */
  finishStep: () => void;
  /** The current screen holds input the autosave cannot save yet
   * (./pending-input.tsx) — « Mon parcours » asks before leaving. */
  hasPendingInput: () => boolean;
  /** « Gérer les rubriques visibles ». `null` → the entry is absent (a
   * host that does not provide it: the QG demo, unit tests). */
  visibility?: JourneyVisibility | null;
}

export interface JourneyVisibility {
  /** Computed server-side from the composition (`resolveVisibilityEntries`). */
  sections: SectionVisibilityEntry[];
  /** Drains the current screen's autosave, saves the choice, refreshes
   * the route (the screen stays mounted, its fields untouched). Resolves
   * `false` — nothing changed — if either save fails. */
  setVisible: (sectionId: SectionId, visible: boolean) => Promise<boolean>;
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
  skinVariant = null,
  visibility = null,
  builderPath,
  children,
}: {
  language: Language;
  snapshot: JourneySnapshot;
  skinVariant?: SkinVariant | null;
  /** « Gérer les rubriques visibles »: the rows, and the bound
   * `saveSectionVisibilityAction` for the AUTHORIZED memorial. */
  visibility?: {
    sections: SectionVisibilityEntry[];
    save: (sectionId: string, visible: boolean, expectedRevision: number) => Promise<DraftSaveResponse>;
  } | null;
  builderPath: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const registry = useContext(PreviewFlushRegistryContext);
  const draftRevision = useDraftRevisionCoordinator();
  const [pendingInputs] = useState(createPendingInputRegistry);

  // Closing or reloading the tab with unsaved, incomplete input: the
  // browser's own warning (same guard as the autosave's).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (pendingInputs.hasPending() || hasIncompleteNativeInput()) applyBeforeUnloadGuard(event);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingInputs]);

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
      skinVariant,
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
      hasPendingInput: () => pendingInputs.hasPending() || hasIncompleteNativeInput(),
      visibility:
        visibility === null
          ? null
          : {
              sections: visibility.sections,
              async setVisible(sectionId, visible) {
                if (!(await drained())) return false;
                try {
                  if (draftRevision === null) {
                    await visibility.save(sectionId, visible, 0);
                  } else {
                    await draftRevision.commit(null, (expectedRevision) =>
                      visibility.save(sectionId, visible, expectedRevision),
                    );
                  }
                } catch {
                  return false;
                }
                router.refresh();
                return true;
              },
            },
    };
  }, [language, snapshot, skinVariant, visibility, builderPath, router, registry, pendingInputs, draftRevision]);

  return (
    <PendingInputRegistryContext.Provider value={pendingInputs}>
      <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
    </PendingInputRegistryContext.Provider>
  );
}
