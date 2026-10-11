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
  deferred: "?",
  hidden: "–",
};

/**
 * Every navigation out of the current screen goes through here: if the
 * screen holds input the autosave cannot save yet (./pending-input.tsx),
 * the family is asked first — stay and finish it, or leave without it —
 * never a silent loss. Otherwise the screen's autosave is drained and
 * the navigation runs (`JourneyNavigation.openScreen` / `resume`).
 */
function useGuardedNavigation(journey: JourneyNavigation, onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState<null | (() => Promise<boolean>)>(null);

  async function execute(action: () => Promise<boolean>) {
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    if (ok) onDone?.();
    else setFailed(true);
  }

  return {
    busy,
    failed,
    waiting: waiting !== null,
    run(action: () => Promise<boolean>) {
      if (busy) return;
      if (journey.hasPendingInput()) {
        setWaiting(() => action);
        return;
      }
      void execute(action);
    },
    leave() {
      const action = waiting;
      setWaiting(null);
      if (action !== null) void execute(action);
    },
    stay() {
      setWaiting(null);
    },
  };
}

function PendingConfirm({
  journey,
  onStay,
  onLeave,
}: {
  journey: JourneyNavigation;
  onStay: () => void;
  onLeave: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => stayRef.current?.focus(), []);
  return (
    <div role="alert" className={styles.pending}>
      <p className={styles.pendingText}>{translate(journey.language, "journey.pending")}</p>
      <div className={styles.pendingActions}>
        <button ref={stayRef} type="button" className={styles.actionButton} onClick={onStay}>
          {translate(journey.language, "journey.pendingStay")}
        </button>
        <button type="button" className={styles.linkButton} onClick={onLeave}>
          {translate(journey.language, "journey.pendingLeave")}
        </button>
      </div>
    </div>
  );
}

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
  if (journey === null || journey.snapshot.revising === null) return null;
  return <RevisingNotice journey={journey} />;
}

function RevisingNotice({ journey }: { journey: JourneyNavigation }) {
  const guard = useGuardedNavigation(journey);
  return (
    <div className={styles.revising}>
      <p className={styles.revisingText}>{translate(journey.language, "journey.revising")}</p>
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => guard.run(journey.resume)}
        disabled={guard.busy}
      >
        {translate(journey.language, "journey.resume")}
      </button>
      {guard.waiting && <PendingConfirm journey={journey} onStay={guard.stay} onLeave={guard.leave} />}
      {guard.failed && (
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
  const guard = useGuardedNavigation(journey, onClose);
  const { busy, failed } = guard;

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

  const actions: RowActions = {
    review: (id) => guard.run(() => journey.openScreen(id)),
    resume: () => guard.run(journey.resume),
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
        {guard.waiting && (
          <PendingConfirm
            journey={journey}
            onStay={() => {
              // Back to the screen, to finish the answer.
              guard.stay();
              onClose();
            }}
            onLeave={guard.leave}
          />
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
      {section.status === "hidden" || section.status === "deferred" ? (
        <p className={styles.hiddenNote}>
          {translate(language, section.status === "deferred" ? "journey.deferredNote" : "journey.hiddenNote")}
        </p>
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
                  <span className={styles.screenLabel}>
                    {label}
                    <ScreenDetail screen={screen} journey={journey} />
                  </span>
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

/** T08's row, once T08 is done: the ambiance actually saved
 * (`memorials.skin_variant`), so the family sees which one they chose. */
function ScreenDetail({ screen, journey }: { screen: JourneyScreenState; journey: JourneyNavigation }) {
  if (screen.id !== "reveal" || screen.status !== "done" || journey.skinVariant === null) return null;
  return (
    <span className={styles.screenDetail} data-ambiance={journey.skinVariant}>
      {translate(journey.language, journey.skinVariant === "dark" ? "journey.ambiance.dark" : "journey.ambiance.light")}
    </span>
  );
}

/**
 * « Changer l'ambiance » — the Preview's discreet way back to T08, opened
 * for revision exactly like « Revoir » in « Mon parcours » (same guard
 * against unsaved input, same drained autosave, same `?etape=`).
 * Renders nothing outside a journey, or while T08 is not reopenable.
 */
export function ChangeAmbianceLink({ className }: { className?: string }) {
  const journey = useJourney();
  if (journey === null) return null;
  const reveal = journey.snapshot.sections.flatMap((section) => section.screens).find((screen) => screen.id === "reveal");
  if (reveal === undefined || !reveal.accessible || reveal.status === "current" || journey.snapshot.revising === "reveal") {
    return null;
  }
  return <ChangeAmbianceAction journey={journey} className={className} />;
}

function ChangeAmbianceAction({ journey, className }: { journey: JourneyNavigation; className?: string }) {
  const guard = useGuardedNavigation(journey);
  return (
    <div className={styles.revising}>
      <button
        type="button"
        className={className ?? styles.linkButton}
        onClick={() => guard.run(() => journey.openScreen("reveal"))}
        disabled={guard.busy}
      >
        {translate(journey.language, "preview.changeAmbiance")}
      </button>
      {guard.waiting && <PendingConfirm journey={journey} onStay={guard.stay} onLeave={guard.leave} />}
      {guard.failed && (
        <p role="alert" className={styles.error}>
          {translate(journey.language, "journey.saveFailed")}
        </p>
      )}
    </div>
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
