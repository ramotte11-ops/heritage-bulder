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
import type { AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { translate } from "@/lib/i18n/translate";
import { createPreviewFlushRegistry, PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";
import { MemorialAssembly } from "@/components/memorial/assembly/MemorialAssembly";
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
 * server action only reads, so the route is never re-rendered.
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

export function BuilderPreviewHost({ available, language, loadPreview, children }: BuilderPreviewHostProps) {
  const [registry] = useState(createPreviewFlushRegistry);
  const [phase, setPhase] = useState<Phase>("closed");
  const [assembled, setAssembled] = useState<AssembledMemorial | null>(null);
  // The screen (component type) on which the last attempt came back
  // unavailable: the host survives `router.refresh()`, so the alert must
  // not follow the family onto the next Guided Flow screen.
  const [unavailableOn, setUnavailableOn] = useState<{ screen: unknown } | null>(null);
  const screen = isValidElement(children) ? children.type : null;
  const unavailable = unavailableOn !== null && unavailableOn.screen === screen;

  const entryButtonRef = useRef<HTMLButtonElement | null>(null);
  const setEntryButton = useCallback((button: HTMLButtonElement | null) => {
    entryButtonRef.current = button;
  }, []);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const builderScrollY = useRef(0);
  const previousPhase = useRef<Phase>("closed");
  const busy = useRef(false);

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
    }
  }, [phase]);

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

  return (
    <PreviewFlushRegistryContext.Provider value={registry}>
      <PreviewEntryContext.Provider value={entry}>
        {/* Always this same wrapper — the Builder is hidden, never unmounted. */}
        <div hidden={isOpen} data-builder-screen="">
          {children}
        </div>
        {isOpen && (
          <main className={styles.preview} data-memorial-preview="">
            <div className={styles.bar}>
              <button ref={backButtonRef} type="button" className={styles.back} onClick={close}>
                {translate(language, "preview.backToCreation")}
              </button>
            </div>
            <MemorialAssembly assembled={assembled} />
          </main>
        )}
      </PreviewEntryContext.Provider>
    </PreviewFlushRegistryContext.Provider>
  );
}
