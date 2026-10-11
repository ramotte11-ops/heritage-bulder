"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { translate } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/keys";
import type {
  JourneyScreenId,
  JourneyScreenState,
  JourneySectionState,
} from "@/lib/builder/guided-flow/journey";
import { useJourney, type JourneyNavigation } from "./journey-context";
import styles from "./JourneyEntry.module.css";

/**
 * B03 — « Mon parcours »: a discreet, always-present control in the
 * Builder chrome (`BuilderScreen`) and the panel it opens.
 *
 * Opening the panel is purely local UI: no navigation, no write, the
 * current screen stays mounted underneath with its fields and autosave
 * untouched. Only an explicit « Revoir » / « Reprendre » navigates, and
 * only after the screen's pending autosave is drained
 * (`JourneyNavigation.openScreen` / `resume`).
 *
 * Renders nothing outside a journey provider (T01, the Welcome).
 */

const STATUS_MARK: Record<JourneyScreenState["status"], string> = {
  done: "✓",
  current: "●",
  toComplete: "◐",
  upcoming: "○",
  hidden: "–",
};

export function JourneyEntry() {
  const journey = useJourney();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  if (journey === null) return null;
  const { language } = journey;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.entryButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg className={styles.entryIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 4h1.5M2 8h1.5M2 12h1.5M5.5 4H14M5.5 8H14M5.5 12H14" />
        </svg>
        {translate(language, "journey.open")}
      </button>
      {open && <JourneyPanel journey={journey} onClose={close} />}
    </>
  );
}

/** Shown under the Builder's navigation row while a screen is open for
 * revision: what « Continuer » will do, and the way back without
 * changing anything. */
export function JourneyRevisingNotice() {
  const journey = useJourney();
  const [failed, setFailed] = useState(false);
  if (journey === null || journey.snapshot.revising === null) return null;
  return (
    <div className={styles.revising}>
      <p className={styles.revisingText}>{translate(journey.language, "journey.revising")}</p>
      <button
        type="button"
        className={styles.linkButton}
        onClick={async () => setFailed(!(await journey.resume()))}
      >
        {translate(journey.language, "journey.resume")}
      </button>
      {failed && (
        <p role="alert" className={styles.error}>
          {translate(journey.language, "journey.saveFailed")}
        </p>
      )}
    </div>
  );
}

function JourneyPanel({ journey, onClose }: { journey: JourneyNavigation; onClose: () => void }) {
  const { language, snapshot } = journey;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function navigate(action: () => Promise<boolean>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    if (ok) onClose();
    else setFailed(true);
  }

  const actions: RowActions = {
    review: (id) => void navigate(() => journey.openScreen(id)),
    resume: () => void navigate(journey.resume),
    busy,
  };

  return (
    <div className={styles.overlay} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.panel} aria-busy={busy}>
        <div className={styles.panelHead}>
          <h2 id={titleId} className={styles.panelTitle}>
            {translate(language, "journey.title")}
          </h2>
          <button ref={closeRef} type="button" className={styles.linkButton} onClick={onClose}>
            {translate(language, "journey.close")}
          </button>
        </div>
        <p className={styles.intro}>{translate(language, "journey.intro")}</p>

        {snapshot.revising !== null && (
          <button type="button" className={styles.resumeButton} onClick={actions.resume} disabled={busy}>
            {translate(language, "journey.resume")}
          </button>
        )}
        {failed && (
          <p role="alert" className={styles.error}>
            {translate(language, "journey.saveFailed")}
          </p>
        )}

        <ol className={styles.sections}>
          {snapshot.sections.map((section) => (
            <SectionItem key={section.id} section={section} journey={journey} actions={actions} />
          ))}
        </ol>
      </div>
    </div>
  );
}

interface RowActions {
  review: (id: JourneyScreenId) => void;
  resume: () => void;
  busy: boolean;
}

function SectionItem({
  section,
  journey,
  actions,
}: {
  section: JourneySectionState;
  journey: JourneyNavigation;
  actions: RowActions;
}) {
  const { language } = journey;
  const title = translate(language, `journey.section.${section.id}` as TranslationKey);
  const single = section.screens.length === 1 ? section.screens[0] : null;

  return (
    <li className={styles.section} data-status={section.status}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {single === null ? (
          <span className={styles.sectionStatus}>
            {translate(language, `journey.sectionStatus.${section.status}` as TranslationKey)}
          </span>
        ) : (
          <ScreenStatusAndAction screen={single} label={title} journey={journey} actions={actions} />
        )}
      </div>
      {section.status === "hidden" ? (
        <p className={styles.hiddenNote}>{translate(language, "journey.hiddenNote")}</p>
      ) : (
        single === null && (
          <ul className={styles.screens}>
            {section.screens.map((screen) => {
              const label = translate(language, `journey.screen.${screen.id}` as TranslationKey);
              return (
                <li key={screen.id} className={styles.screen} data-status={screen.status} data-screen={screen.id}>
                  <span className={styles.mark} aria-hidden="true">
                    {STATUS_MARK[screen.status]}
                  </span>
                  <span className={styles.screenLabel}>{label}</span>
                  <ScreenStatusAndAction screen={screen} label={label} journey={journey} actions={actions} />
                </li>
              );
            })}
          </ul>
        )
      )}
    </li>
  );
}

function ScreenStatusAndAction({
  screen,
  label,
  journey,
  actions,
}: {
  screen: JourneyScreenState;
  label: string;
  journey: JourneyNavigation;
  actions: RowActions;
}) {
  const { language, snapshot } = journey;
  const beingRevised = snapshot.revising === screen.id;
  const status = translate(language, `journey.status.${beingRevised ? "current" : screen.status}` as TranslationKey);

  let action = null;
  if (screen.status === "current" && snapshot.revising !== null) {
    action = (
      <button type="button" className={styles.actionButton} onClick={actions.resume} disabled={actions.busy}>
        {translate(language, "journey.continueHere")}
      </button>
    );
  } else if (screen.accessible && screen.status !== "current" && !beingRevised) {
    action = (
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => actions.review(screen.id)}
        disabled={actions.busy}
        aria-label={`${translate(language, "journey.review")} — ${label}`}
      >
        {translate(language, "journey.review")}
      </button>
    );
  }

  return (
    <span className={styles.statusAndAction}>
      <span className={styles.status}>{status}</span>
      {action}
    </span>
  );
}
