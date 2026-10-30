"use client";

import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { JourneyScreenId, JourneySnapshot } from "@/lib/builder/guided-flow/journey";
import { PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";
import { applyBeforeUnloadGuard } from "@/lib/builder/use-autosave";
import { useDraftRevisionCoordinator } from "@/lib/builder/draft-revision";
import { JourneyContext, type JourneyNavigation } from "@/components/builder/journey/journey-context";
import {
  createPendingInputRegistry,
  hasIncompleteNativeInput,
  PendingInputRegistryContext,
} from "@/components/builder/journey/pending-input";

/** The guest runtime's local moves — its stand-ins for the route's
 * `?etape=` / `?rubrique=` / `?apercu=1` navigations. */
export interface GuestJourneyMoves {
  openScreen: (id: JourneyScreenId, returnToPreview: boolean) => void;
  resume: () => void;
  finishReview: () => void;
  finishStep: () => void;
}

/**
 * QG 005-B — « Mon parcours » for the guest Builder.
 *
 * The same `JourneyNavigation` contract `RouteJourneyProvider` fulfils for
 * the authenticated route, and the local-state model of the QG demo
 * (`app/builder/demo/page.tsx`): a revision target held by the runtime in
 * place of the URL. Every move first drains the current step's autosave
 * and refuses to leave a screen with an open revision conflict — the
 * route's own `canLeaveCurrentScreen` rule — so no answer or photo is lost
 * between screens. Rendered by `BuilderPreviewHost` (`localJourney`),
 * inside its flush registry.
 *
 * « Gérer les rubriques visibles » is not offered here (`visibility`
 * absent): the guest draft has no local visibility save yet.
 */
export function GuestJourneyProvider({
  language,
  snapshot,
  skinVariant,
  returnToPreview,
  moves,
  children,
}: {
  language: Language;
  snapshot: JourneySnapshot;
  skinVariant: SkinVariant | null;
  returnToPreview: boolean;
  moves: GuestJourneyMoves;
  children: ReactNode;
}) {
  const registry = useContext(PreviewFlushRegistryContext);
  const draftRevision = useDraftRevisionCoordinator();
  const [pendingInputs] = useState(createPendingInputRegistry);

  const canLeaveCurrentScreen = useCallback(async (): Promise<boolean> => {
    if (draftRevision?.conflictContent != null) return false;
    if (registry !== null) {
      try {
        await registry.flushAll();
      } catch {
        return false;
      }
    }
    return draftRevision?.conflictContent == null;
  }, [draftRevision, registry]);

  // Closing or reloading the tab with unsaved, incomplete input: the
  // browser's own warning (same guard as the route's).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (pendingInputs.hasPending() || hasIncompleteNativeInput()) applyBeforeUnloadGuard(event);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingInputs]);

  const value = useMemo<JourneyNavigation>(() => ({
    language,
    snapshot,
    skinVariant,
    returnToPreview,
    backNavigationFailed: false,
    async openScreen(id, options = {}) {
      if (!(await canLeaveCurrentScreen())) return false;
      const navigate = () => moves.openScreen(id, options.returnToPreview === true);
      if (options.startTransition) options.startTransition(navigate);
      else navigate();
      return true;
    },
    async resume() {
      if (!(await canLeaveCurrentScreen())) return false;
      moves.resume();
      return true;
    },
    async finishReview() {
      if (!(await canLeaveCurrentScreen())) return false;
      moves.finishReview();
      return true;
    },
    finishStep: moves.finishStep,
    hasPendingInput: () => pendingInputs.hasPending() || hasIncompleteNativeInput(),
  }), [language, snapshot, skinVariant, returnToPreview, moves, pendingInputs, canLeaveCurrentScreen]);

  return (
    <PendingInputRegistryContext.Provider value={pendingInputs}>
      <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
    </PendingInputRegistryContext.Provider>
  );
}
