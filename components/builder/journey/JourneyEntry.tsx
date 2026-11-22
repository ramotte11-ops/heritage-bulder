"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { translate } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/keys";
import {
  JOURNEY_SECTION_MEMORIAL_SECTION,
  type JourneyScreenId,
  type JourneyScreenState,
  type JourneySection,
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
 * Mission 04-D — one move out of the screen at a time, whichever journey
 * control started it: each control has its own guard, and a navigation
 * now stays in flight until the destination is ready, so a second
 * control must not start another one meanwhile.
 */
let moveLockOwner: object | null = null;

function moveInFlight(): boolean {
  return moveLockOwner !== null;
}

function takeMoveLock(token: { current: object | null }): boolean {
  if (moveLockOwner !== null) return false;
  token.current = {};
  moveLockOwner = token.current;
  return true;
}

function releaseMoveLock(token: { current: object | null }): void {
  if (token.current !== null && moveLockOwner === token.current) moveLockOwner = null;
  token.current = null;
}

/** A guarded move: receives the transition its navigation must run in
 * (`NavigationOptions.startTransition`) and resolves `false` — nothing
 * navigated — when the screen could not be left safely. */
type GuardedAction = (startTransition: (navigate: () => void) => void) => Promise<boolean>;

/**
 * Every navigation out of the current screen goes through here: if the
 * screen holds input the autosave cannot save yet (./pending-input.tsx),
 * the family is asked first — stay and finish it, or leave without it —
 * never a silent loss. Otherwise the screen's autosave is drained and
 * the navigation runs (`JourneyNavigation.openScreen` / `resume`).
 *
 * Mission 04-D — the end of the autosave drain is NOT the end of the
 * wait. The navigation itself runs in this guard's own transition (the
 * mechanism « Changer l'ambiance » introduced), so the activated
 * control keeps « Un instant… » — and every control stays disabled —
 * until the route has brought the destination. `onDone` (closing the
 * panel) runs inside that same transition: it is committed together
 * with the new screen, never before it. A host whose moves are instant
 * and do not use the transition (the guest runtime's resume, the QG
 * demo) keeps its historical behaviour: `onDone` right after the move.
 */
function useGuardedNavigation(journey: JourneyNavigation, onDone?: () => void) {
  const [busy, startTransition] = useTransition();
  const [navigating, startNavigation] = useTransition();
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState<null | { key: string; action: GuardedAction }>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pending = busy || navigating;
  const lockToken = useRef<object | null>(null);

  // The shared lock is released once this guard's move is over (failed,
  // or the destination is there), or when the guard goes away with it.
  useEffect(() => {
    if (!pending) releaseMoveLock(lockToken);
  }, [pending]);
  useEffect(() => () => releaseMoveLock(lockToken), []);

  async function execute(action: GuardedAction) {
    let transitioned = false;
    const ok = await action((navigate) => {
      transitioned = true;
      startNavigation(() => {
        navigate();
        onDone?.();
      });
    });
    if (!ok) {
      // Nothing navigated: the controls are usable again at once.
      setPendingKey(null);
      setFailed(true);
      return;
    }
    if (!transitioned) onDone?.();
  }

  function begin(key: string, action: GuardedAction) {
    // Another journey control (the revision notice, the panel, the full
    // review entry, « Changer l'ambiance ») is already leaving the screen.
    if (!takeMoveLock(lockToken)) return;
    setFailed(false);
    setPendingKey(key);
    startTransition(async () => execute(action));
  }

  return {
    busy: pending,
    /** The activated control, shown busy for as long as the move is
     * genuinely in flight: drain, then the route's own transition. */
    activeKey: pending ? pendingKey : null,
    failed,
    waiting: waiting !== null,
    run(key: string, action: GuardedAction) {
      if (pending || moveInFlight()) return;
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
  const wasOpen = useRef(open);

  // Mission 04-D — the panel may close inside a navigation's transition
  // (committed with the new screen): focus comes back to the entry only
  // once the panel is really gone, never while it still says « Un instant… ».
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
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
  // Opened from the Preview (« Changer l'ambiance »): both ways lead back to it.
  const fromPreview = journey.returnToPreview === true;
  // Chef 03 / O05 — a step of the full review: said so, with the way out.
  const review = journey.snapshot.review;
  const text: TranslationKey = review ? "journey.fullReviewNotice" : fromPreview ? "journey.revisingFromPreview" : "journey.revising";
  const way: TranslationKey = review ? "journey.fullReviewFinish" : fromPreview ? "journey.backToPreview" : "journey.resume";
  return (
    <div className={styles.revising} data-full-review={review || undefined}>
      <p className={styles.revisingText}>{translate(journey.language, text)}</p>
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => guard.run("resume", (startTransition) => journey.resume({ startTransition }))}
        disabled={guard.busy}
        aria-busy={guard.activeKey === "resume" || undefined}
      >
        <PendingActionLabel
          pending={guard.activeKey === "resume"}
          pendingLabel={translate(journey.language, "common.pleaseWait")}
        >
          {translate(journey.language, way)}
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
  // Mission 04-D — while a move is in flight the panel stays, busy, until
  // the destination is ready: closing it then (Escape, backdrop,
  // « Fermer ») would show the old screen again with no sign of the wait.
  // The move itself closes it, with the new screen.
  const dismiss = busy ? undefined : onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (dismiss === undefined) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dismiss]);

  const actions: RowActions = {
    review: (id, section) =>
      guard.run(id, (startTransition) =>
        journey.openScreen(id, section === undefined ? { startTransition } : { section, startTransition }),
      ),
    resume: () =>
      guard.run("resume", (startTransition) =>
        (snapshot.reviewingSection === null ? journey.resume : journey.finishReview)({ startTransition }),
      ),
    busy,
    pendingKey: guard.activeKey,
  };

  return (
    <div className={styles.overlay} onClick={(event) => event.target === event.currentTarget && dismiss?.()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.panel} aria-busy={busy}>
        <div className={styles.panelHead}>
          <h2 id={titleId} className={styles.panelTitle}>
            {translate(language, view === "visibility" ? "visibility.title" : "journey.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.linkButton}
            onClick={dismiss}
            disabled={dismiss === undefined}
          >
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
  /** `section`: the rubrique to come back to when it is not the screen's own. */
  review: (id: JourneyScreenId, section?: JourneySection) => void;
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
  const noteKey = sectionNoteKey(section);
  const choice = changeChoiceTarget(section, journey);
  // The steps are listed whenever one of them applies; a rubrique that
  // does not apply at all (the death notice after « Non » / « Plus tard »)
  // shows only its note and the way back to its question.
  const listed = section.screens.some((screen) => screen.status !== "hidden" && screen.status !== "deferred");

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
        {noteKey !== null && <p className={styles.hiddenNote}>{translate(language, noteKey)}</p>}
        {choice !== null && (
          <ChangeChoiceButton choice={choice} sectionTitle={title} journey={journey} actions={actions} />
        )}
        {listed && (
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
 * Chef 03 / O04 — the note a rubrique carries when (part of) it does not
 * apply given the family's answers. `null` → no note.
 */
function sectionNoteKey(section: JourneySectionState): TranslationKey | null {
  if (section.id === "deathNotice") {
    if (section.status === "deferred") return "journey.deferredNote";
    if (section.status === "hidden") return "journey.deathNoticeHiddenNote";
    return null;
  }
  if (section.id === "ceremony") return section.status === "deferred" ? "journey.ceremonyDeferredNote" : null;
  return section.status === "hidden" ? "journey.hiddenNote" : null;
}

interface ChoiceTarget {
  id: JourneyScreenId;
  section: JourneySection;
}

/**
 * Chef 03 / O04 — « Modifier mon choix »: the question a rubrique depends
 * on, reopened as it was answered (its screen seeds itself from the
 * stored answer; opening writes nothing). Only when that question is
 * reopenable right now — reached and not locked after publication.
 * - the death notice, answered « Non » or « Plus tard »: A00, coming back
 *   to this rubrique afterwards (`REVISION_SECTION_ALIASES`);
 * - the ceremony, answered « Pas encore décidé »: A04.
 */
function changeChoiceTarget(section: JourneySectionState, journey: JourneyNavigation): ChoiceTarget | null {
  let target: ChoiceTarget | null = null;
  if (section.id === "deathNotice" && (section.status === "hidden" || section.status === "deferred")) {
    target = { id: "announcementChoice", section: "deathNotice" };
  } else if (section.id === "ceremony" && section.status === "deferred") {
    target = { id: "ceremonyMoment", section: "ceremony" };
  }
  if (target === null) return null;
  const id = target.id;
  const state = journey.snapshot.sections.flatMap((s) => s.screens).find((screen) => screen.id === id);
  if (state === undefined || !state.accessible || state.status === "current" || journey.snapshot.revising === id) return null;
  return target;
}

function ChangeChoiceButton({
  choice,
  sectionTitle,
  journey,
  actions,
}: {
  choice: ChoiceTarget;
  sectionTitle: string;
  journey: JourneyNavigation;
  actions: RowActions;
}) {
  const label = translate(journey.language, "journey.changeChoice");
  return (
    <button
      type="button"
      className={styles.actionButton}
      data-change-choice={choice.id}
      onClick={() => actions.review(choice.id, choice.section)}
      disabled={actions.busy}
      aria-busy={actions.pendingKey === choice.id || undefined}
      aria-label={`${label} — ${sectionTitle}`}
    >
      <PendingActionLabel
        pending={actions.pendingKey === choice.id}
        pendingLabel={translate(journey.language, "common.pleaseWait")}
      >
        {label}
      </PendingActionLabel>
    </button>
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

/**
 * Chef 03 / O05 — « Reprendre mon parcours depuis le début », on the
 * Guided Flow's resting screen: one discreet, explicit entry — the same
 * text-link treatment as the screen's other ways out. It opens the first
 * screen of the full review (after draining the autosave), never a new
 * draft and never a reset: every answer stays where it is.
 * Renders nothing outside a journey, when the host offers no review, or
 * while a screen is already being revised.
 */
export function FullReviewEntry() {
  const journey = useJourney();
  if (journey === null || journey.startReview === undefined || journey.snapshot.revising !== null) return null;
  return <FullReviewAction journey={journey} start={journey.startReview} />;
}

function FullReviewAction({
  journey,
  start,
}: {
  journey: JourneyNavigation;
  start: NonNullable<JourneyNavigation["startReview"]>;
}) {
  const guard = useGuardedNavigation(journey);
  return (
    <div className={styles.revising}>
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => guard.run("fullReview", (startTransition) => start({ startTransition }))}
        disabled={guard.busy}
        aria-busy={guard.activeKey === "fullReview" || undefined}
      >
        <PendingActionLabel
          pending={guard.activeKey === "fullReview"}
          pendingLabel={translate(journey.language, "common.pleaseWait")}
        >
          {translate(journey.language, "journey.fullReviewStart")}
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

/** T08's row, once T08 is done: the ambiance actually saved
 * (`memorials.skin_variant`), so the family sees which one they chose. */
function ScreenDetail({ screen, journey }: { screen: JourneyScreenState; journey: JourneyNavigation }) {
  // Chef 03 / O04 — after publication: said, never a « Revoir » that fails.
  if (screen.locked) {
    return (
      <span className={styles.screenDetail} data-locked="true">
        {translate(journey.language, "journey.lockedAfterPublication")}
      </span>
    );
  }
  // Chef 03 / O03 — repères not confirmed yet: say they are not in the
  // memorial, so « À compléter » is never a mystery.
  if (screen.pendingConfirmation) {
    return (
      <span className={styles.screenDetail} data-pending-confirmation="true">
        {translate(journey.language, "journey.traditionsUnconfirmed")}
      </span>
    );
  }
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
 * against unsaved input, same drained autosave, same `?etape=`), marked
 * as coming from the Preview so that T08 leads back to it. The click is
 * acknowledged until the route has brought T08: the navigation runs in
 * this control's own transition, so « Un instant… » (disabled) lasts as
 * long as the server works, never a button that looks inert.
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
  // The guard runs the navigation in its own transition (the mechanism
  // this control introduced, now shared by every guarded move).
  const guard = useGuardedNavigation(journey);
  const pending = guard.activeKey === "ambiance";
  return (
    <div className={styles.revising}>
      <button
        type="button"
        className={className ?? styles.linkButton}
        onClick={() =>
          guard.run("ambiance", (startTransition) =>
            journey.openScreen("reveal", { returnToPreview: true, startTransition }),
          )
        }
        disabled={guard.busy}
        aria-busy={pending || undefined}
      >
        <PendingActionLabel
          pending={pending}
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
