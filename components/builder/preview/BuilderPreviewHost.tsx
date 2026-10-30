"use client";

import {
  createContext,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { translate } from "@/lib/i18n/translate";
import { createPreviewFlushRegistry, PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";
import { MemorialAssembly } from "@/components/memorial/assembly/MemorialAssembly";
import { OfferingsPreviewProvider } from "@/components/memorial/symbolic-offerings/v1/offerings-preview";
import type { JourneySnapshot } from "@/lib/builder/guided-flow/journey";
import { RouteJourneyProvider } from "@/components/builder/journey/journey-context";
import { ChangeAmbianceLink } from "@/components/builder/journey/JourneyEntry";
import type { SectionVisibilityEntry } from "@/lib/memorial/visibility-entries";
import type { MemorialContent } from "@/types/memorial";
import { PreviewLoading } from "./PreviewLoading";
import { DraftRevisionProvider } from "@/lib/builder/draft-revision";
import type { DraftSaveResponse } from "@/lib/builder/draft-revision";
import { DraftConflictNotice } from "@/components/builder/DraftConflictNotice";
import styles from "./BuilderPreviewHost.module.css";

/**
 * Étape 3 — the real Preview, hosted once around every Builder screen
 * (`app/builder/[memorialId]/page.tsx`), never inside a Guided Flow step.
 *
 * Preview = the real Memorial being created, full screen, built by the
 * one assembler (`assembleMemorial` + the Owner/draft media resolver,
 * server-side in `preview-actions.ts`) and drawn by `MemorialAssembly`.
 * No demo data, no second rendering system, no split (Mission 026's
 * `BuilderPreviewLayout` is abandoned and left untouched).
 *
 * ## The Builder stays mounted
 *
 * The current screen is always rendered inside the same wrapper, locked
 * or not, open or not — only its `hidden` attribute changes. It is
 * never unmounted by the Preview, so its local state, its autosave and
 * the values in its fields are exactly as the family left them. The
 * Preview itself triggers no navigation and no `router.refresh()`: its
 * server action only reads, so the route is never re-rendered. The one
 * exception is explicit and not the host's own: « Changer l'ambiance »
 * (correction Light / Dark), which opens T08 for revision through the
 * journey (`ChangeAmbianceLink`, same guard and drained autosave as
 * « Revoir ») — the Preview then closes on the screen the route brings.
 * The host stays mounted across those `?etape=` navigations (same page,
 * new search params), so « the screen the route brings » is read from
 * the screen's identity — its component, its key and the screen under
 * revision — never from the component alone. T08 opened from the
 * Preview leads back to it: the route arrives with `openOnArrival` and
 * the Preview opens again, with the new ambiance (recette Builder V1).
 *
 * ## Opening — in this order, nothing skipped
 *
 * 1. drain the current step's autosave (`flushAll`); on failure, stay in
 *    the Builder — the step's own `AutosaveIndicator` already shows the
 *    error and its "Réessayer";
 * 2. `loadPreview()` re-reads the SAVED draft server-side and assembles
 *    it (the client never sends content);
 * 3. `ready` → open full screen; anything else → stay in the Builder
 *    and show `preview.unavailable` (never a false or empty Memorial).
 *
 * Every opening repeats all three steps — no cached assembly, so every
 * opening resolves a fresh signed URL for the Hero photo.
 *
 * ## Accessibility
 *
 * Real buttons; `aria-busy` while loading; focus moves to "Revenir à la
 * création" on opening and back to "Voir l'aperçu" on return; Escape
 * closes; the hidden Builder leaves the accessibility tree. The window
 * scroll position of the Builder is restored on return.
 */

export type MemorialPreviewResult =
  | { status: "ready"; assembled: AssembledMemorial }
  | { status: "unavailable" }
  | { status: "locked" };

export interface BuilderPreviewHostProps {
  /** Decided server-side by the page: T08 done (`isPreviewUnlocked`),
   * a Hero renderer exists for the memorial's skin, and the current
   * screen is not a Reveal. `false` → no control, no Preview, nothing
   * reserved. */
  available: boolean;
  /** `null` only before T01 — `available` is then always `false`. */
  language: Language | null;
  /** The bound `loadMemorialPreviewAction` for the authorized memorial. */
  loadPreview: () => Promise<MemorialPreviewResult>;
  /** Revision read with the draft rendered by this route. Required by the
   * real Builder; omitted only by isolated host tests. */
  draftRevision?: number;
  draftContent?: MemorialContent;
  /** B03 — « Mon parcours » for this screen, computed server-side from
   * the content it renders (`resolveJourney`), and the route's own path
   * built from the authorized memorial id. `null`/absent → no journey
   * (T01, the Welcome): the entry renders nothing and steps keep their
   * plain `router.refresh()`. `skinVariant` is the persisted ambiance
   * « Mon parcours » shows on T08's row. */
  journey?: {
    snapshot: JourneySnapshot;
    builderPath: string;
    skinVariant?: SkinVariant | null;
    /** « Gérer les rubriques visibles » (rows + bound save action). */
    visibility?: {
      sections: SectionVisibilityEntry[];
      save: (sectionId: string, visible: boolean, expectedRevision: number) => Promise<DraftSaveResponse>;
    } | null;
    /** The revised screen was opened from the Preview: it leads back to it. */
    returnToPreview?: boolean;
  } | null;
  /** Recette Builder V1 — the route was reached from T08 opened from the
   * Preview (`?apercu=1`, validated by the page): the Preview opens again
   * on arrival, through the same three steps as « Voir l'aperçu ». */
  openOnArrival?: boolean;
  /** QG 003 — called once each time an open Preview closes (« Revenir à
   * la création », Escape, or another screen arriving). The guest Builder
   * revokes the opening's local `blob:` URLs here. */
  onClosed?: () => void;
  /** QG 005-B — « Mon parcours » for a host whose navigation is not
   * route-driven (the guest Builder): its own `JourneyContext` provider,
   * rendered exactly where the route's `RouteJourneyProvider` is — inside
   * this host's flush registry, so the journey drains the step's autosave
   * before moving. Ignored when `journey` is set. */
  localJourney?: (content: ReactNode) => ReactNode;
  /** The current Builder screen. */
  children: ReactNode;
}

export interface PreviewEntryState {
  language: Language;
  busy: boolean;
  unavailable: boolean;
  open: () => void;
  /** Callback ref for the "Voir l'aperçu" button (focus on return). */
  registerButton: (button: HTMLButtonElement | null) => void;
}

/** Read by `PreviewEntry` (rendered inside `BuilderScreen`). `null`
 * whenever the Preview is not available — the control then renders
 * nothing. */
export const PreviewEntryContext = createContext<PreviewEntryState | null>(null);

type Phase = "closed" | "loading" | "open";

export function BuilderPreviewHost({
  available,
  language,
  loadPreview,
  draftRevision,
  draftContent,
  journey = null,
  openOnArrival = false,
  onClosed,
  localJourney,
  children,
}: BuilderPreviewHostProps) {
  const [registry] = useState(createPreviewFlushRegistry);
  const [phase, setPhase] = useState<Phase>("closed");
  const [assembled, setAssembled] = useState<AssembledMemorial | null>(null);
  // The screen (component type) on which the last attempt came back
  // unavailable: the host survives `router.refresh()`, so the alert must
  // not follow the family onto the next Guided Flow screen.
  const [unavailableOn, setUnavailableOn] = useState<{ screen: unknown } | null>(null);
  const screen = isValidElement(children) ? children.type : null;
  const unavailable = unavailableOn !== null && unavailableOn.screen === screen;
  // What « another screen » means for this host, which outlives `?etape=` navigations.
  const screenKey = isValidElement(children) ? children.key : null;
  const revising = journey?.snapshot.revising ?? null;

  const entryButtonRef = useRef<HTMLButtonElement | null>(null);
  const setEntryButton = useCallback((button: HTMLButtonElement | null) => {
    entryButtonRef.current = button;
  }, []);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const builderScrollY = useRef(0);
  const previousPhase = useRef<Phase>("closed");
  const busy = useRef(false);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  const open = useCallback(async () => {
    if (busy.current || !available) return;
    busy.current = true;
    setPhase("loading");
    setUnavailableOn(null);

    try {
      // 1. Drain the autosave first — never read a draft that may be stale.
      try {
        await registry.flushAll();
      } catch {
        setPhase("closed");
        return;
      }

      // 2. Only then read + assemble the saved draft, server-side.
      let result: MemorialPreviewResult;
      try {
        result = await loadPreview();
      } catch {
        result = { status: "unavailable" };
      }

      if (result.status !== "ready" || result.assembled.status !== "assembled") {
        setUnavailableOn({ screen });
        setPhase("closed");
        return;
      }

      builderScrollY.current = window.scrollY;
      setAssembled(result.assembled);
      setPhase("open");
    } finally {
      busy.current = false;
    }
  }, [available, loadPreview, registry, screen]);

  const close = useCallback(() => {
    setAssembled(null);
    setPhase("closed");
  }, []);

  // Focus and scroll follow the open/closed transitions only.
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === "open" && previous !== "open") {
      window.scrollTo(0, 0);
      backButtonRef.current?.focus();
    } else if (phase === "closed" && previous === "open") {
      window.scrollTo(0, builderScrollY.current);
      entryButtonRef.current?.focus();
      onClosedRef.current?.();
    }
  }, [phase]);

  // « Changer l'ambiance » (in the Preview's bar) navigates to T08 opened
  // for revision: once the route brings that other screen, the Preview
  // closes on it, at the top of the page — never left covering it, and
  // never closed early on the screen the family is leaving.
  const shownScreen = useRef({ screen, screenKey, revising });
  useEffect(() => {
    const shown = shownScreen.current;
    if (shown.screen === screen && shown.screenKey === screenKey && shown.revising === revising) return;
    shownScreen.current = { screen, screenKey, revising };
    builderScrollY.current = 0;
    setAssembled(null);
    setPhase("closed");
  }, [screen, screenKey, revising]);

  // Back from T08 opened from the Preview: the Preview opens again, once per arrival.
  const reopened = useRef(false);
  useEffect(() => {
    if (!openOnArrival) {
      reopened.current = false;
      return;
    }
    if (reopened.current || !available || language === null) return;
    reopened.current = true;
    void open();
  }, [openOnArrival, available, language, open]);

  useEffect(() => {
    if (phase !== "open") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [phase, close]);

  const entry = useMemo<PreviewEntryState | null>(
    () =>
      available && language !== null
        ? {
            language,
            busy: phase === "loading",
            unavailable,
            open: () => void open(),
            registerButton: setEntryButton,
          }
        : null,
    [available, language, phase, unavailable, open, setEntryButton],
  );

  const isOpen = phase === "open" && assembled !== null && language !== null;

  const content = (
    <>
      {/* Always this same wrapper — the Builder is hidden, never unmounted. */}
      <div hidden={isOpen} data-builder-screen="">
        <DraftConflictNotice language={language} />
        {children}
      </div>
      {phase === "loading" && language !== null && <PreviewLoading language={language} />}
      {isOpen && (
        <main className={styles.preview} data-memorial-preview="">
          <div className={styles.bar}>
            <button ref={backButtonRef} type="button" className={styles.back} onClick={close}>
              {translate(language, "preview.backToCreation")}
            </button>
            <ChangeAmbianceLink className={styles.back} />
          </div>
          {/* M3 — the one place Offrandes symboliques exist: free tries,
              simulated server response, nothing recorded. */}
          <OfferingsPreviewProvider>
            <MemorialAssembly assembled={assembled} />
          </OfferingsPreviewProvider>
        </main>
      )}
    </>
  );

  const hosted = (
    <PreviewFlushRegistryContext.Provider value={registry}>
      <PreviewEntryContext.Provider value={entry}>
        {journey !== null && language !== null ? (
          <RouteJourneyProvider
            language={language}
            snapshot={journey.snapshot}
            skinVariant={journey.skinVariant ?? null}
            visibility={journey.visibility ?? null}
            builderPath={journey.builderPath}
            returnToPreview={journey.returnToPreview ?? false}
          >
            {content}
          </RouteJourneyProvider>
        ) : localJourney !== undefined ? (
          localJourney(content)
        ) : (
          content
        )}
      </PreviewEntryContext.Provider>
    </PreviewFlushRegistryContext.Provider>
  );

  return draftRevision === undefined || draftContent === undefined ? (
    hosted
  ) : (
    <DraftRevisionProvider initialRevision={draftRevision} initialContent={draftContent}>
      {hosted}
    </DraftRevisionProvider>
  );
}
