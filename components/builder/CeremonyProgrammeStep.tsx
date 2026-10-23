"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useStepDone } from "./journey/journey-context";
import { hasIncompleteNativeInput, usePendingInput } from "./journey/pending-input";
import type { Language } from "@/config/languages";
import type { CeremonyMoment } from "@/types/ceremony";
import type { MemorialContent } from "@/types/memorial";
import { translate, translateWith } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  addCeremonyProgrammeMoment,
  ceremonyStepProgress,
  commitA14,
  moveCeremonyProgrammeMoment,
  readCeremonyProgrammeForEditing,
  removeCeremonyProgrammeMoment,
  repairCeremonyProgramme,
  skipA14,
  updateCeremonyProgrammeMoment,
} from "@/lib/builder/guided-flow/ceremony-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import { openNativeTimePicker } from "./open-native-time-picker";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyProgrammeStep.module.css";

interface CeremonyProgrammeStepProps {
  language: Language;
  /** The memorial's current draft content. */
  content: MemorialContent;
  persist: DraftSaveTransport;
}

/** A moment being written or edited — lives only in this component's
 * local state, NEVER in `content`/autosave, until the family confirms
 * it (same doctrine as TraditionsStep's composer). */
interface MomentDraft {
  time: string;
  label: string;
  detail: string;
}

const EMPTY_DRAFT: MomentDraft = { time: "", label: "", detail: "" };

function draftFromMoment(moment: CeremonyMoment): MomentDraft {
  return { time: moment.time ?? "", label: moment.label, detail: moment.detail ?? "" };
}

function draftHoldsText(draft: MomentDraft): boolean {
  return draft.time !== "" || draft.label.trim() !== "" || draft.detail.trim() !== "";
}

function draftDiffersFrom(draft: MomentDraft, moment: CeremonyMoment): boolean {
  return (
    draft.time !== (moment.time ?? "") ||
    draft.label.trim() !== moment.label ||
    draft.detail.trim() !== (moment.detail ?? "")
  );
}

function draftInput(draft: MomentDraft) {
  return {
    time: draft.time === "" ? null : draft.time,
    label: draft.label,
    detail: draft.detail.trim() === "" ? null : draft.detail,
  };
}

/**
 * Cérémonie V2 (B2) — A14 « Le déroulement de la cérémonie ». Facultative
 * and passable: each moment has an optional time, a required title and
 * an optional precision; the family adds, edits, removes and reorders
 * them, then continues (at least one moment) or skips.
 *
 * Built but NOT routed yet: no Builder gate renders it before GO C5 (see
 * lib/builder/guided-flow/ceremony-step.ts, « A14 »).
 *
 * ## Nothing unconfirmed is ever saved — nor lost silently
 *
 * The moment being written (or edited) stays local until « Ajouter ce
 * moment » / « Enregistrer »; the examples are placeholders only. Once
 * confirmed, every change goes through `content` and the existing
 * autosave. While a draft holds unconfirmed text, « Mon parcours » asks
 * before leaving (`usePendingInput`), and Continue/Skip stay disabled
 * with a visible hint — the family confirms or cancels first.
 *
 * ## Reordering without drag and drop
 *
 * « Monter » / « Descendre » are plain buttons (keyboard, touch, screen
 * readers), each named after its moment. After a move, focus follows the
 * moved moment and a polite live region announces its new position.
 */
export function CeremonyProgrammeStep({ language, content: initialContent, persist }: CeremonyProgrammeStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [composer, setComposer] = useState<MomentDraft | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: MomentDraft } | null>(null);
  const [timeIncomplete, setTimeIncomplete] = useState(false);
  const [nativeBlocked, setNativeBlocked] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const actionRefs = useRef(new Map<string, HTMLButtonElement>());
  // Set by an event handler, consumed after the next commit: which
  // control receives focus once the list has re-rendered.
  const focusRequest = useRef<string | null>(null);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });

  const read = readCeremonyProgrammeForEditing(content);
  const moments = read.status === "ready" ? read.moments : [];
  const editedMoment = editing === null ? undefined : moments.find((moment) => moment.id === editing.id);
  const pending =
    (composer !== null && draftHoldsText(composer)) ||
    (editing !== null && (editedMoment === undefined || draftDiffersFrom(editing.draft, editedMoment)));
  usePendingInput(pending);

  useEffect(() => {
    const key = focusRequest.current;
    if (key === null) return;
    focusRequest.current = null;
    const target = key === "add" ? addButtonRef.current : actionRefs.current.get(key);
    target?.focus();
  });

  const draftOpen = composer !== null || editing !== null;
  const intact = read.status === "ready" && read.intact;
  const controlsDisabled = pendingAction !== null;
  const listActionsDisabled = controlsDisabled || draftOpen || !intact;

  function registerAction(key: string) {
    return (element: HTMLButtonElement | null) => {
      if (element) actionRefs.current.set(key, element);
      else actionRefs.current.delete(key);
    };
  }

  function timeLeftIncomplete(): boolean {
    return timeInputRef.current?.validity.badInput === true;
  }

  function closeDrafts() {
    setComposer(null);
    setEditing(null);
    setTimeIncomplete(false);
    setNativeBlocked(false);
  }

  function confirmComposer() {
    if (composer === null || controlsDisabled || composer.label.trim() === "") return;
    if (timeLeftIncomplete()) {
      setTimeIncomplete(true);
      return;
    }
    const result = addCeremonyProgrammeMoment(content, { id: crypto.randomUUID(), ...draftInput(composer) });
    if (!result.ok) {
      if (result.reason === "time") setTimeIncomplete(true);
      return;
    }
    setContent(result.content);
    closeDrafts();
    focusRequest.current = "add";
  }

  function confirmEdit() {
    if (editing === null || controlsDisabled || editing.draft.label.trim() === "") return;
    if (timeLeftIncomplete()) {
      setTimeIncomplete(true);
      return;
    }
    const result = updateCeremonyProgrammeMoment(content, editing.id, draftInput(editing.draft));
    if (!result.ok) {
      if (result.reason === "time") setTimeIncomplete(true);
      return;
    }
    setContent(result.content);
    focusRequest.current = `${editing.id}:edit`;
    closeDrafts();
  }

  function cancelDraft() {
    const editedId = editing?.id;
    closeDrafts();
    focusRequest.current = editedId === undefined ? "add" : `${editedId}:edit`;
  }

  function handleRemove(moment: CeremonyMoment) {
    if (listActionsDisabled) return;
    const result = removeCeremonyProgrammeMoment(content, moment.id);
    if (!result.ok) return;
    setContent(result.content);
    setAnnouncement(translateWith(language, "ceremony.programmeRemoved", { label: moment.label }));
    focusRequest.current = "add";
  }

  function handleMove(moment: CeremonyMoment, direction: "up" | "down") {
    if (listActionsDisabled) return;
    const index = moments.findIndex((candidate) => candidate.id === moment.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= moments.length) return;
    const result = moveCeremonyProgrammeMoment(content, moment.id, direction);
    if (!result.ok) return;
    setContent(result.content);
    setAnnouncement(
      translateWith(language, "ceremony.programmeMoved", {
        label: moment.label,
        position: target + 1,
        count: moments.length,
      }),
    );
    // A button that just became disabled cannot keep the focus: at either
    // end, focus moves to the moment's other direction.
    const atEnd = direction === "up" ? target === 0 : target === moments.length - 1;
    const focusDirection = atEnd ? (direction === "up" ? "down" : "up") : direction;
    focusRequest.current = `${moment.id}:${focusDirection}`;
  }

  function handleRepair() {
    if (controlsDisabled) return;
    const result = repairCeremonyProgramme(content);
    if (result.ok) setContent(result.content);
  }

  /** Continue/Skip never leave with unconfirmed input — including a
   * native time field typed halfway, which reads empty. */
  function blockedByUnconfirmedInput(): boolean {
    if (pending) return true;
    if (formRef.current !== null && hasIncompleteNativeInput(formRef.current)) {
      setNativeBlocked(true);
      return true;
    }
    return false;
  }

  async function drainAutosave(): Promise<boolean> {
    try {
      await flush();
      return true;
    } catch {
      setSubmitError(true);
      setPendingAction(null);
      return false;
    }
  }

  async function leave(write: typeof commitA14, action: "continue" | "skip") {
    setPendingAction(action);
    if (!(await drainAutosave())) return;

    const written = write(content);
    if (!written.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      await saveDraft(written.content);
    } catch {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    stepDone();
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready" || controlsDisabled || blockedByUnconfirmedInput()) return;
    await leave(commitA14, "continue");
  }

  async function handleSkip() {
    if (read.status !== "ready" || controlsDisabled || blockedByUnconfirmedInput()) return;
    await leave(skipA14, "skip");
  }

  if (read.status !== "ready") {
    return (
      <BuilderScreen progress={0}>
        <p role="alert" className={styles.error}>
          {translate(language, "hero.dataUnavailable")}
        </p>
      </BuilderScreen>
    );
  }

  const progress = ceremonyStepProgress(content);
  const showPendingHint = pending || nativeBlocked;

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "ceremony.programmeTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "ceremony.programmeSubtitle")}</p>
      </div>

      <form ref={formRef} className={styles.form} onSubmit={handleContinue} noValidate>
        {!read.intact && (
          <div className={styles.notice}>
            <p>{translate(language, "ceremony.programmeDamaged")}</p>
            <button type="button" className={styles.secondaryAction} disabled={controlsDisabled} onClick={handleRepair}>
              {translate(language, "ceremony.programmeRepairAction")}
            </button>
          </div>
        )}

        {moments.length > 0 && (
          <ol className={styles.momentList} aria-label={translate(language, "ceremony.programmeListLabel")}>
            {moments.map((moment, index) =>
              editing?.id === moment.id ? (
                <li key={moment.id} className={styles.momentCard}>
                  <MomentFields
                    idPrefix={`ceremony-programme-edit-${moment.id}`}
                    language={language}
                    draft={editing.draft}
                    disabled={controlsDisabled}
                    timeIncomplete={timeIncomplete}
                    timeInputRef={timeInputRef}
                    onChange={(draft) => {
                      setEditing({ id: moment.id, draft });
                      setTimeIncomplete(false);
                      setNativeBlocked(false);
                    }}
                    onEnter={confirmEdit}
                  />
                  <div className={styles.draftActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={controlsDisabled || editing.draft.label.trim() === ""}
                      onClick={confirmEdit}
                    >
                      {translate(language, "common.save")}
                    </button>
                    <button type="button" className={styles.secondaryAction} disabled={controlsDisabled} onClick={cancelDraft}>
                      {translate(language, "common.cancel")}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={moment.id} className={styles.momentCard}>
                  <div className={styles.momentText}>
                    {moment.time !== null && <p className={styles.momentTime}>{moment.time}</p>}
                    <p className={styles.momentLabel}>{moment.label}</p>
                    {moment.detail !== null && <p className={styles.momentDetail}>{moment.detail}</p>}
                  </div>
                  <div className={styles.momentActions}>
                    <div className={styles.actionGroup}>
                      <button
                        ref={registerAction(`${moment.id}:up`)}
                        type="button"
                        className={styles.moveAction}
                        disabled={listActionsDisabled || index === 0}
                        aria-label={translateWith(language, "ceremony.programmeMoveUpNamed", { label: moment.label })}
                        onClick={() => handleMove(moment, "up")}
                      >
                        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
                          <path d="M10 15V5M5 10l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{translate(language, "ceremony.programmeMoveUp")}</span>
                      </button>
                      <button
                        ref={registerAction(`${moment.id}:down`)}
                        type="button"
                        className={styles.moveAction}
                        disabled={listActionsDisabled || index === moments.length - 1}
                        aria-label={translateWith(language, "ceremony.programmeMoveDownNamed", { label: moment.label })}
                        onClick={() => handleMove(moment, "down")}
                      >
                        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
                          <path d="M10 5v10M5 10l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{translate(language, "ceremony.programmeMoveDown")}</span>
                      </button>
                    </div>
                    <div className={styles.actionGroup}>
                      <button
                        ref={registerAction(`${moment.id}:edit`)}
                        type="button"
                        className={styles.secondaryAction}
                        disabled={listActionsDisabled}
                        aria-label={translateWith(language, "ceremony.programmeEditNamed", { label: moment.label })}
                        onClick={() => setEditing({ id: moment.id, draft: draftFromMoment(moment) })}
                      >
                        {translate(language, "ceremony.programmeEditAction")}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={listActionsDisabled}
                        aria-label={translateWith(language, "ceremony.programmeRemoveNamed", { label: moment.label })}
                        onClick={() => handleRemove(moment)}
                      >
                        {translate(language, "ceremony.programmeRemoveAction")}
                      </button>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ol>
        )}

        {composer !== null ? (
          <div className={styles.composer}>
            <MomentFields
              idPrefix="ceremony-programme-new"
              language={language}
              draft={composer}
              disabled={controlsDisabled}
              timeIncomplete={timeIncomplete}
              timeInputRef={timeInputRef}
              onChange={(draft) => {
                setComposer(draft);
                setTimeIncomplete(false);
                setNativeBlocked(false);
              }}
              onEnter={confirmComposer}
            />
            <div className={styles.draftActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={controlsDisabled || composer.label.trim() === ""}
                onClick={confirmComposer}
              >
                {translate(language, "ceremony.programmeConfirmAdd")}
              </button>
              <button type="button" className={styles.secondaryAction} disabled={controlsDisabled} onClick={cancelDraft}>
                {translate(language, "common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={addButtonRef}
            type="button"
            className={styles.addAction}
            disabled={listActionsDisabled}
            onClick={() => setComposer(EMPTY_DRAFT)}
          >
            {translate(language, "ceremony.programmeAddAction")}
          </button>
        )}

        <div className={styles.actions}>
          {showPendingHint && <p className={styles.hint}>{translate(language, "ceremony.programmePendingHint")}</p>}

          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled || pending || !intact || moments.length === 0}
              pending={pendingAction === "continue"}
              pendingLabel={translate(language, "autosave.saving")}
            >
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled || pending}
            aria-busy={pendingAction === "skip" || undefined}
            onClick={() => void handleSkip()}
          >
            <PendingActionLabel
              pending={pendingAction === "skip"}
              pendingLabel={translate(language, "autosave.saving")}
            >
              {translate(language, "ceremony.skip")}
            </PendingActionLabel>
          </button>
        </div>

        <p className={styles.srOnly} aria-live="polite">
          {announcement}
        </p>

        {submitError && (
          <p role="alert" className={styles.error}>
            {translate(language, "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}

interface MomentFieldsProps {
  idPrefix: string;
  language: Language;
  draft: MomentDraft;
  disabled: boolean;
  timeIncomplete: boolean;
  timeInputRef: RefObject<HTMLInputElement | null>;
  onChange: (draft: MomentDraft) => void;
  /** Enter in a text field confirms the moment — never the whole step. */
  onEnter: () => void;
}

function MomentFields({
  idPrefix,
  language,
  draft,
  disabled,
  timeIncomplete,
  timeInputRef,
  onChange,
  onEnter,
}: MomentFieldsProps) {
  const timeErrorId = `${idPrefix}-time-error`;

  function confirmOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter();
  }

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-time`} className={styles.fieldLabel}>
          {translate(language, "ceremony.programmeTimeLabel")}
        </label>
        <input
          ref={timeInputRef}
          id={`${idPrefix}-time`}
          type="time"
          className={styles.timeInput}
          value={draft.time}
          disabled={disabled}
          aria-invalid={timeIncomplete || undefined}
          aria-describedby={timeIncomplete ? timeErrorId : undefined}
          onClick={(event) => openNativeTimePicker(event.currentTarget)}
          onChange={(event) => onChange({ ...draft, time: event.target.value })}
        />
        {timeIncomplete && (
          <p id={timeErrorId} role="alert" className={styles.error}>
            {translate(language, "ceremony.programmeTimeIncomplete")}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-label`} className={styles.fieldLabel}>
          {translate(language, "ceremony.programmeLabelLabel")}
        </label>
        <input
          id={`${idPrefix}-label`}
          type="text"
          className={styles.textInput}
          value={draft.label}
          placeholder={translate(language, "ceremony.programmeLabelPlaceholder")}
          aria-required="true"
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
          onKeyDown={confirmOnEnter}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-detail`} className={styles.fieldLabel}>
          {translate(language, "ceremony.programmeDetailLabel")}
        </label>
        <input
          id={`${idPrefix}-detail`}
          type="text"
          className={styles.textInput}
          value={draft.detail}
          placeholder={translate(language, "ceremony.programmeDetailPlaceholder")}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, detail: event.target.value })}
          onKeyDown={confirmOnEnter}
        />
      </div>
    </>
  );
}
