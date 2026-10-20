"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { translate } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/keys";
import {
  JOURNEY_SECTION_MEMORIAL_SECTION,
  type JourneyScreenId,
  type JourneyScreenState,
  type JourneySectionState,
} from "@/lib/builder/guided-flow/journey";
import type { SectionId } from "@/config/sections";
import type { SectionVisibilityEntry } from "@/lib/memorial/visibility-entries";
import { PendingActionLabel } from "../PendingActionLabel";
import { useJourney, type JourneyNavigation, type JourneyVisibility } from "./journey-context";
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
  const [busy, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState<null | { key: string; action: () => Promise<boolean> }>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function execute(action: () => Promise<boolean>) {
    const ok = await action();
    setPendingKey(null);
    if (ok) onDone?.();
    else {
      setFailed(true);
    }
  }

  function begin(key: string, action: () => Promise<boolean>) {
    setFailed(false);
    setPendingKey(key);
    startTransition(async () => execute(action));
  }

  return {
    busy,
    pendingKey,
    failed,
    waiting: waiting !== null,
    run(key: string, action: () => Promise<boolean>) {
      if (busy) return;
      if (journey.hasPendingInput()) {
        setWaiting({ key, action });
        return;
      }
      begin(key, action);
    },
    leave() {
      const queued = waiting;
      setWaiting(null);
      if (queued !== null) begin(queued.key, queued.action);
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
  const reviewingSection = journey?.snapshot.reviewingSection ?? null;
  const revising = journey?.snapshot.revising ?? null;
  const [open, setOpen] = useState(reviewingSection !== null && revising === null);
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
        onClick={() => guard.run("resume", journey.resume)}
        disabled={guard.busy}
        aria-busy={guard.pendingKey === "resume" || undefined}
      >
        <PendingActionLabel
          pending={guard.pendingKey === "resume"}
          pendingLabel={translate(journey.language, "common.pleaseWait")}
        >
          {translate(journey.language, "journey.resume")}
        </PendingActionLabel>
      </button>
      {guard.waiting && <PendingConfirm journey={journey} onStay={guard.stay} onLeave={guard.leave} />}
      {guard.failed && (
        <p role="alert" className={styles.error}>
          {translate(journey.language, "journey.saveFailed")}
        </p>
      )}
      {journey.backNavigationFailed && (
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
  // « Gérer les rubriques visibles » replaces the steps inside the SAME
  // dialog (no second overlay); « Retour à mon parcours » comes back.
  const [view, setView] = useState<"journey" | "visibility">("journey");
  const visibility = journey.visibility ?? null;

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
    review: (id) => guard.run(id, () => journey.openScreen(id)),
    resume: () =>
      guard.run(
        "resume",
        snapshot.reviewingSection === null ? journey.resume : journey.finishReview,
      ),
    busy,
    pendingKey: guard.pendingKey,
  };

  return (
    <div className={styles.overlay} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.panel} aria-busy={busy}>
        <div className={styles.panelHead}>
          <h2 id={titleId} className={styles.panelTitle}>
            {translate(language, view === "visibility" ? "visibility.title" : "journey.title")}
          </h2>
          <button ref={closeRef} type="button" className={styles.linkButton} onClick={onClose}>
            {translate(language, "journey.close")}
          </button>
        </div>

        {view === "visibility" && visibility !== null ? (
          <VisibilityManager
            language={language}
            visibility={visibility}
            onBack={() => setView("journey")}
          />
        ) : (
          <>
            <p className={styles.intro}>{translate(language, "journey.intro")}</p>

            {(snapshot.revising !== null || snapshot.reviewingSection !== null) && (
              <button
                type="button"
                className={styles.resumeButton}
                onClick={actions.resume}
                disabled={busy}
                aria-busy={actions.pendingKey === "resume" || undefined}
              >
                <PendingActionLabel
                  pending={actions.pendingKey === "resume"}
                  pendingLabel={translate(language, "common.pleaseWait")}
                >
                  {translate(
                    language,
                    snapshot.reviewingSection === null ? "journey.resume" : "journey.finishReview",
                  )}
                </PendingActionLabel>
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

            {visibility !== null && (
              <button type="button" className={styles.manageButton} onClick={() => setView("visibility")}>
                {translate(language, "journey.manageVisibility")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface RowActions {
  review: (id: JourneyScreenId) => void;
  resume: () => void;
  busy: boolean;
  pendingKey: string | null;
}

/**
 * One rubrique: a block, CLOSED by default (PO), whose header carries
 * its title and one status; opening it shows its steps with their
 * existing « Revoir » / « Continuer ici ». Generic over the catalog: a
 * rubrique added to `JOURNEY_SECTIONS` appears here with no change.
 * The steps stay mounted (`hidden`), never rebuilt on opening.
 */
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
  const active = journey.snapshot.reviewingSection === section.id;
  const [open, setOpen] = useState(active);
  const contentId = useId();
  const title = translate(language, `journey.section.${section.id}` as TranslationKey);
  const memorialSection = JOURNEY_SECTION_MEMORIAL_SECTION[section.id];
  const hiddenFromMemorial =
    journey.visibility?.sections.some((entry) => entry.sectionId === memorialSection && entry.hidden) ?? false;

  return (
    <li className={styles.section} data-status={section.status} data-section={section.id} data-open={open}>
      <h3 className={styles.sectionHeading}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.sectionName}>
            <span className={styles.sectionTitle}>{title}</span>
            {hiddenFromMemorial && (
              <span className={styles.hiddenTag}>{translate(language, "journey.hiddenFromMemorial")}</span>
            )}
          </span>
          <span className={styles.sectionMeta}>
            <span className={styles.sectionStatus}>
              {translate(language, `journey.sectionStatus.${section.status}` as TranslationKey)}
            </span>
            <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </button>
      </h3>
      <div id={contentId} hidden={!open}>
        {section.status === "hidden" || section.status === "deferred" ? (
          <p className={styles.hiddenNote}>
            {translate(language, section.status === "deferred" ? "journey.deferredNote" : "journey.hiddenNote")}
          </p>
        ) : (
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
        )}
      </div>
    </li>
  );
}

/**
 * « Gérer les rubriques visibles »: hide or show each section of the
 * memorial, never deleting anything. Rows come from the server
 * (`resolveVisibilityEntries`, the composition the Preview uses); each
 * change drains the screen's autosave, saves, and refreshes the route.
 */
function VisibilityManager({
  language,
  visibility,
  onBack,
}: {
  language: JourneyNavigation["language"];
  visibility: JourneyVisibility;
  onBack: () => void;
}) {
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState<SectionId | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEffect(() => backRef.current?.focus(), []);

  function toggle(entry: SectionVisibilityEntry) {
    if (busy !== null || isPending) return;
    setBusy(entry.sectionId);
    setFailed(false);
    startTransition(async () => {
      const ok = await visibility.setVisible(entry.sectionId, entry.hidden);
      setBusy(null);
      if (!ok) setFailed(true);
    });
  }

  const note = (entry: SectionVisibilityEntry): TranslationKey | null => {
    if (!entry.ready) return "visibility.pendingNote";
    if (!entry.hidden) return null;
    return entry.archivable ? "visibility.archivedNote" : "visibility.hiddenNote";
  };

  return (
    <div className={styles.visibility}>
      <button ref={backRef} type="button" className={styles.linkButton} onClick={onBack}>
        {translate(language, "visibility.back")}
      </button>
      <p className={styles.intro}>{translate(language, "visibility.intro")}</p>

      <ul className={styles.visibilityList} aria-busy={busy !== null || isPending}>
        <li className={styles.visibilityRow} data-visibility-section="hero">
          <span className={styles.visibilityLabel}>{translate(language, "visibility.hero")}</span>
          <span className={styles.status}>{translate(language, "visibility.alwaysVisible")}</span>
        </li>
        {visibility.sections.map((entry) => {
          const label = translate(language, `visibility.section.${entry.sectionId}` as TranslationKey);
          const noteKey = note(entry);
          const action = translate(language, entry.hidden ? "visibility.show" : "visibility.hide");
          return (
            <li
              key={entry.sectionId}
              className={styles.visibilityRow}
              data-visibility-section={entry.sectionId}
              data-hidden={entry.hidden}
            >
              <span className={styles.visibilityLabel}>
                {label}
                {noteKey !== null && <span className={styles.screenDetail}>{translate(language, noteKey)}</span>}
              </span>
              <span className={styles.statusAndAction}>
                <span className={styles.status}>
                  {translate(language, entry.hidden ? "visibility.hidden" : "visibility.visible")}
                </span>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => toggle(entry)}
                  disabled={busy !== null || isPending}
                  aria-busy={busy === entry.sectionId || undefined}
                  aria-label={`${action} — ${label}`}
                >
                  <PendingActionLabel
                    pending={busy === entry.sectionId}
                    pendingLabel={translate(language, "common.pleaseWait")}
                  >
                    {action}
                  </PendingActionLabel>
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {visibility.sections.length === 0 && <p className={styles.hiddenNote}>{translate(language, "visibility.empty")}</p>}
      {failed && (
        <p role="alert" className={styles.error}>
          {translate(language, "visibility.saveFailed")}
        </p>
      )}
    </div>
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
        onClick={() => guard.run("ambiance", () => journey.openScreen("reveal"))}
        disabled={guard.busy}
        aria-busy={guard.pendingKey === "ambiance" || undefined}
      >
        <PendingActionLabel
          pending={guard.pendingKey === "ambiance"}
          pendingLabel={translate(journey.language, "common.pleaseWait")}
        >
          {translate(journey.language, "preview.changeAmbiance")}
        </PendingActionLabel>
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
      <button
        type="button"
        className={styles.actionButton}
        onClick={actions.resume}
        disabled={actions.busy}
        aria-busy={actions.pendingKey === "resume" || undefined}
      >
        <PendingActionLabel
          pending={actions.pendingKey === "resume"}
          pendingLabel={translate(language, "common.pleaseWait")}
        >
          {translate(language, "journey.continueHere")}
        </PendingActionLabel>
      </button>
    );
  } else if (screen.accessible && screen.status !== "current" && !beingRevised) {
    action = (
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => actions.review(screen.id)}
        disabled={actions.busy}
        aria-busy={actions.pendingKey === screen.id || undefined}
        aria-label={`${translate(language, "journey.review")} — ${label}`}
      >
        <PendingActionLabel
          pending={actions.pendingKey === screen.id}
          pendingLabel={translate(language, "common.pleaseWait")}
        >
          {translate(language, "journey.review")}
        </PendingActionLabel>
      </button>
    );
  }

  // A finished step's ✓ says « Terminée » already: the word stays for
  // screen readers only, so the open block reads light (PO).
  const quiet = screen.status === "done" && !beingRevised;
  return (
    <span className={styles.statusAndAction}>
      <span className={quiet ? styles.srOnly : styles.status}>{status}</span>
      {action}
    </span>
  );
}
