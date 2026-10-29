"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import {
  journeySectionForScreen,
  type JourneyScreenId,
  type JourneySection,
  type JourneySnapshot,
} from "@/lib/builder/guided-flow/journey";
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
import { translate } from "@/lib/i18n/translate";

/**
 * B03 — « Mon parcours »: what the entry (`JourneyEntry`, rendered by
 * `BuilderScreen`) and every Guided Flow step read.
 *
 * Outside a route journey the context is `null`: the entry renders
 * nothing. `useStepDone` may still use the narrow local completion
 * provider; without either provider it falls back to the historical
 * `router.refresh()`.
 */
export interface JourneyNavigation {
  language: Language;
  snapshot: JourneySnapshot;
  /** `memorials.skin_variant` as persisted — shown on T08's row once
   * T08 is done (« Ambiance : Claire / Sombre »). `null` when unknown. */
  skinVariant: SkinVariant | null;
  /** Saves the current screen's pending autosave, then opens `id` for
   * revision. Resolves `false` (and navigates nowhere) if that save
   * fails — the screen's own AutosaveIndicator already shows why.
   * `options.returnToPreview`: opened from the Preview (« Changer
   * l'ambiance ») — the revised screen then leads back to the Preview.
   * `options.startTransition`: the caller's transition, so that its
   * pending state lasts until the route has brought the screen. */
  openScreen: (id: JourneyScreenId, options?: OpenScreenOptions) => Promise<boolean>;
  /** Saves, then goes back to where the family stopped (back to the
   * Preview when the screen was opened from it). */
  resume: () => Promise<boolean>;
  /** This screen was opened from the Preview: « Continuer » and the way
   * back lead to the Preview again (`?apercu=1`). Absent → `false`. */
  returnToPreview?: boolean;
  /** Explicitly leaves rubrique revision and resumes the normal route. */
  finishReview: () => Promise<boolean>;
  /** Called by a step once its own Continue (or skip) is saved. */
  finishStep: () => void;
  /** The current screen holds input the autosave cannot save yet
   * (./pending-input.tsx) — « Mon parcours » asks before leaving. */
  hasPendingInput: () => boolean;
  /** A browser Back navigation stayed on the form because its autosave
   * or conflict guard could not safely release it. */
  backNavigationFailed: boolean;
  /** « Gérer les rubriques visibles ». `null` → the entry is absent (a
   * host that does not provide it: the QG demo, unit tests). */
  visibility?: JourneyVisibility | null;
}

export interface OpenScreenOptions {
  returnToPreview?: boolean;
  startTransition?: (navigate: () => void) => void;
}

/** The query flag that reopens the Preview when the route arrives (validated by the page). */
export const RETURN_TO_PREVIEW_QUERY = "apercu=1";

export interface JourneyVisibility {
  /** Computed server-side from the composition (`resolveVisibilityEntries`). */
  sections: SectionVisibilityEntry[];
  /** Drains the current screen's autosave, saves the choice, refreshes
   * the route (the screen stays mounted, its fields untouched). Resolves
   * `false` — nothing changed — if either save fails. */
  setVisible: (sectionId: SectionId, visible: boolean) => Promise<boolean>;
}

export const JourneyContext = createContext<JourneyNavigation | null>(null);

/**
 * Small common seam for a Builder host whose progression is not driven by
 * an App Router refresh. The authenticated route does not provide it and
 * therefore keeps its historical Journey/router behaviour unchanged.
 */
const BuilderStepCompletionContext = createContext<(() => void) | null>(null);

export function BuilderStepCompletionProvider({
  finishStep,
  children,
}: {
  finishStep: () => void;
  children: ReactNode;
}) {
  return (
    <BuilderStepCompletionContext.Provider value={finishStep}>
      {children}
    </BuilderStepCompletionContext.Provider>
  );
}

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
  const localCompletion = useContext(BuilderStepCompletionContext);
  return useCallback(() => {
    if (localCompletion !== null) localCompletion();
    else if (journey !== null) journey.finishStep();
    else router.refresh();
  }, [journey, localCompletion, router]);
}

function sectionPath(builderPath: string, section: JourneySection): string {
  return `${builderPath}?rubrique=${section}`;
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
  returnToPreview = false,
  children,
}: {
  language: Language;
  snapshot: JourneySnapshot;
  skinVariant?: SkinVariant | null;
  /** The revised screen was opened from the Preview (validated server-side). */
  returnToPreview?: boolean;
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
  const [backNavigationFailed, setBackNavigationFailed] = useState(false);
  const backPhase = useRef<"restore" | "drain" | "waiting" | "waitingRestore" | "allow" | null>(null);
  const backDrainResult = useRef<boolean | null>(null);

  const drained = useCallback(async (): Promise<boolean> => {
    if (registry === null) return true;
    try {
      await registry.flushAll();
      return true;
    } catch {
      return false;
    }
  }, [registry]);

  const canLeaveCurrentScreen = useCallback(async (): Promise<boolean> => {
    if (draftRevision?.conflictContent != null) return false;
    if (!(await drained())) return false;
    return draftRevision?.conflictContent == null;
  }, [draftRevision, drained]);

  // Closing or reloading the tab with unsaved, incomplete input: the
  // browser's own warning (same guard as the autosave's).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (pendingInputs.hasPending() || hasIncompleteNativeInput()) applyBeforeUnloadGuard(event);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingInputs]);

  // App Router search-param transitions do not fire `beforeunload`.
  // On a revised form, bounce a browser Back navigation to the still-
  // mounted form, drain its autosave, then replay Back exactly once. An
  // incomplete native value is the one intentional exception: the
  // browser asks synchronously before allowing it to be abandoned.
  useEffect(() => {
    if (snapshot.revising === null) return;

    function finishBackNavigation(safe: boolean) {
      if (!safe) {
        backPhase.current = null;
        setBackNavigationFailed(true);
        return;
      }
      setBackNavigationFailed(false);
      backPhase.current = "allow";
      window.history.back();
    }

    function handlePopState() {
      if (backPhase.current === "allow") {
        backPhase.current = null;
        return;
      }
      if (backPhase.current === "restore") {
        backPhase.current = null;
        return;
      }
      if (backPhase.current === "waitingRestore") {
        backPhase.current = "waiting";
        const safe = backDrainResult.current;
        backDrainResult.current = null;
        if (safe !== null) finishBackNavigation(safe);
        return;
      }
      if (backPhase.current === "waiting") {
        // A second Back while the save is pending must not start another
        // flush or move farther back. Restore the protected form once.
        backPhase.current = "waitingRestore";
        window.history.forward();
        return;
      }
      if (backPhase.current === "drain") {
        backPhase.current = "waiting";
        void canLeaveCurrentScreen().then((safe) => {
          if (backPhase.current === "waitingRestore") {
            backDrainResult.current = safe;
            return;
          }
          if (backPhase.current === "waiting") finishBackNavigation(safe);
        });
        return;
      }

      if (pendingInputs.hasPending() || hasIncompleteNativeInput()) {
        const leave = window.confirm(
          `${translate(language, "journey.pending")}\n\n${translate(language, "journey.pendingLeave")}`,
        );
        backPhase.current = leave ? "drain" : "restore";
        window.history.forward();
        return;
      }

      backPhase.current = "drain";
      window.history.forward();
    }

    window.addEventListener("popstate", handlePopState, { capture: true });
    return () => {
      window.removeEventListener("popstate", handlePopState, { capture: true });
      backPhase.current = null;
      backDrainResult.current = null;
    };
  }, [snapshot.revising, language, pendingInputs, canLeaveCurrentScreen]);

  const value = useMemo<JourneyNavigation>(() => {
    return {
      language,
      snapshot,
      skinVariant,
      backNavigationFailed,
      returnToPreview,
      async openScreen(id, options = {}) {
        if (!(await canLeaveCurrentScreen())) return false;
        const section = journeySectionForScreen(id);
        const path = `${builderPath}?etape=${id}&rubrique=${section}${options.returnToPreview ? `&${RETURN_TO_PREVIEW_QUERY}` : ""}`;
        const navigate = () => {
          if (snapshot.reviewingSection === null) router.push(path);
          else router.replace(path);
        };
        if (options.startTransition) options.startTransition(navigate);
        else navigate();
        return true;
      },
      async resume() {
        if (!(await canLeaveCurrentScreen())) return false;
        if (returnToPreview) router.replace(`${builderPath}?${RETURN_TO_PREVIEW_QUERY}`);
        else if (snapshot.reviewingSection === null) router.push(builderPath);
        else router.replace(builderPath);
        return true;
      },
      async finishReview() {
        if (!(await canLeaveCurrentScreen())) return false;
        router.replace(builderPath);
        return true;
      },
      finishStep() {
        // Opened from the Preview: once saved, back to the Preview (the new choice in it).
        if (snapshot.revising !== null && returnToPreview) router.replace(`${builderPath}?${RETURN_TO_PREVIEW_QUERY}`);
        else if (snapshot.revising !== null) {
          router.replace(sectionPath(builderPath, snapshot.reviewingSection ?? journeySectionForScreen(snapshot.revising)));
        }
        else router.refresh();
      },
      hasPendingInput: () => pendingInputs.hasPending() || hasIncompleteNativeInput(),
      visibility:
        visibility === null
          ? null
          : {
              sections: visibility.sections,
              async setVisible(sectionId, visible) {
                if (!(await canLeaveCurrentScreen())) return false;
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
  }, [
    language,
    snapshot,
    skinVariant,
    visibility,
    builderPath,
    returnToPreview,
    router,
    pendingInputs,
    draftRevision,
    backNavigationFailed,
    canLeaveCurrentScreen,
  ]);

  return (
    <PendingInputRegistryContext.Provider value={pendingInputs}>
      <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
    </PendingInputRegistryContext.Provider>
  );
}
