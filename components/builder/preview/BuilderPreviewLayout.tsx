"use client";

import { useId, useState, type ReactNode } from "react";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import styles from "./BuilderPreviewLayout.module.css";

/**
 * Mission 026 — Live Preview layout mechanic.
 *
 * The three desktop compositions the Studio plate validated, plus the
 * one pair of mobile states (mission brief sections 5-8), collapsed into
 * a single mode a caller can read or drive:
 *
 *  - "closed"  — unlocked, but the family hasn't opened it yet (Studio
 *    état 1). Builder keeps full width; a single discreet trigger is the
 *    only sign a Preview exists.
 *  - "split"   — Builder and the real Preview side by side (état 2).
 *  - "focus"   — the "respiration" mode (état 3): the Builder pane is
 *    hidden (never unmounted — see below) and the Preview takes the
 *    space back. This mechanic does not decide WHEN a caller reaches
 *    "focus" — see `onModeChange` below and the mission brief section 7
 *    ("Mission 026 fournit la capacité. Elle ne décide pas quand une
 *    section métier est terminée.").
 *
 * Mobile never shows two panes at once (mission brief section 8): the
 * exact same `mode` value collapses to one of two full-screen views —
 * "closed" shows the Builder pane, anything else shows the Preview pane
 * — purely through CSS (`BuilderPreviewLayout.module.css`), never a
 * second piece of state or a route change. Both panes stay mounted at
 * all times once unlocked; only `display` toggles. That is deliberate
 * (mission brief section 8: "ne pas transformer ce passage en nouvelle
 * route métier si cela détruit l'état local du formulaire") — the
 * `builder` node this component was handed is never remounted by a mode
 * change, so whatever local state it holds (a form draft, scroll
 * position, focus) survives every toggle for free, without this
 * component needing to know what that state even is.
 *
 * ## Deliberately ignorant
 *
 * No question id, no `EditorialContext`, no `Skin`, no `OfferId`, no
 * Etsy import, no step counter, no percentage, no device-simulator
 * control — `builder` and `preview` are opaque `ReactNode`s handed in by
 * a caller; this component never inspects, clones, or interprets either.
 * `locked` and `mode` are the caller's own resolved facts (see
 * `lib/builder/guided-flow/preview-lock.ts` for how `locked` is meant to
 * be derived from the real Guided Flow state) — this file does not know
 * what "T08" means and never will.
 */

export type PreviewMode = "closed" | "split" | "focus";

export interface BuilderPreviewLayoutProps {
  /**
   * Mission brief section 3's absolute gate: while `true`, this
   * component renders ONLY `builder` — no button, no Preview markup at
   * all, no reserved empty space. There is no way to reach "split" or
   * "focus" while `locked` is `true`; `mode`/`onModeChange` are simply
   * not consulted in that case.
   */
  locked: boolean;
  /** Resolves this component's own three control labels (mission brief
   * sections 5, 6, 8) through the existing i18n foundation — never a
   * hard-coded string, never a fourth ad hoc translation table. */
  language: Language;
  /** The current Builder content — always rendered, always mounted,
   * whatever `mode` is (see the module docstring). */
  builder: ReactNode;
  /**
   * The real memorial render, injected by the caller (mission brief
   * section 11 — this component never invents a Hero, a skin, or any
   * placeholder content of its own). Ignored entirely while `locked`.
   */
  preview: ReactNode;
  /**
   * Optional controlled mode. Omit for the common case — this component
   * then manages "closed"/"split" itself from the family's own clicks on
   * its two built-in triggers, starting "closed". A caller that wants
   * "focus" (mission brief section 7 — a future Guided Flow decides
   * WHEN, this component only decides HOW it looks) must pass `mode`
   * explicitly: this component's own triggers never request "focus"
   * themselves, only "closed" and "split".
   */
  mode?: PreviewMode;
  /** Called with the next mode whenever the family activates one of this
   * component's own triggers (open or close/back), and whenever `mode`
   * is controlled. Required to observe a controlled transition; safe to
   * omit in the uncontrolled case. */
  onModeChange?: (mode: PreviewMode) => void;
}

/**
 * "Voir l'aperçu" is the same label on desktop's closed state and on
 * mobile's creation view (mission brief sections 5 and 8) — one trigger,
 * one label, rendered once; only its on-screen position/styling differs
 * per breakpoint, driven entirely by CSS.
 */
export function BuilderPreviewLayout({
  locked,
  language,
  builder,
  preview,
  mode: controlledMode,
  onModeChange,
}: BuilderPreviewLayoutProps) {
  const [uncontrolledMode, setUncontrolledMode] = useState<PreviewMode>("closed");
  const mode = controlledMode ?? uncontrolledMode;
  const previewPaneId = useId();

  function requestMode(next: PreviewMode) {
    if (controlledMode === undefined) setUncontrolledMode(next);
    onModeChange?.(next);
  }

  // Mission brief section 4: before unlock, this is the ENTIRE render —
  // no wrapper, no button, no Preview DOM, nothing reserved.
  if (locked) return <>{builder}</>;

  const isOpen = mode !== "closed";

  return (
    <div className={styles.shell} data-mode={mode}>
      <div className={styles.builderPane}>
        {builder}
        {mode === "closed" && (
          <button
            type="button"
            className={styles.openTrigger}
            aria-expanded={isOpen}
            aria-controls={previewPaneId}
            onClick={() => requestMode("split")}
          >
            {translate(language, "preview.view")}
          </button>
        )}
      </div>

      <div id={previewPaneId} className={styles.previewPane}>
        <div className={styles.previewControls}>
          <button
            type="button"
            className={styles.closeTriggerDesktop}
            onClick={() => requestMode("closed")}
          >
            {translate(language, "preview.hide")}
          </button>
          <button
            type="button"
            className={styles.closeTriggerMobile}
            onClick={() => requestMode("closed")}
          >
            {translate(language, "preview.backToCreation")}
          </button>
        </div>
        <div className={styles.previewContent}>{preview}</div>
      </div>
    </div>
  );
}
