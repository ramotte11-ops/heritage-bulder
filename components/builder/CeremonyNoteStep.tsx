"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  ceremonyStepProgress,
  commitA08,
  readCeremonyForEditing,
  skipA08,
  writeCeremonyNote,
} from "@/lib/builder/guided-flow/ceremony-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyNoteStep.module.css";

interface CeremonyNoteStepProps {
  language: Language;
  /** The memorial's current draft content — A07 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: DraftSaveTransport;
}

/**
 * Mission 040 — A08: one facultative practical note. Same two-outcome
 * shape as A05-A07 (QG review — A08 is only ever "note pratique
 * facultative", never a second, broader branch-validation screen):
 * "Continuer" stays disabled while `note` is empty, "Passer cette
 * étape" lets the family move on without one, and once a note is
 * entered "Continuer" becomes available and commits A08 as completed.
 */
export function CeremonyNoteStep({ language, content: initialContent, persist }: CeremonyNoteStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });

  const read = readCeremonyForEditing(content);
  const controlsDisabled = pendingAction !== null;

  function handleChange(value: string) {
    const result = writeCeremonyNote(content, value);
    if (result.ok) setContent(result.content);
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

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setPendingAction("continue");
    if (!(await drainAutosave())) return;

    const committed = commitA08(content);
    if (!committed.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      await saveDraft(committed.content);
    } catch {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    stepDone();
  }

  async function handleSkip() {
    if (read.status !== "ready" || controlsDisabled) return;

    setPendingAction("skip");
    if (!(await drainAutosave())) return;

    const skipped = skipA08(content);
    if (!skipped.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      await saveDraft(skipped.content);
    } catch {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    stepDone();
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

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "ceremony.noteTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "ceremony.noteSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.field}>
          <label htmlFor="ceremony-note" className={styles.fieldLabel}>
            {translate(language, "ceremony.noteLabel")}
          </label>
          <textarea
            id="ceremony-note"
            className={styles.textarea}
            defaultValue={read.ceremony.note ?? ""}
            disabled={controlsDisabled}
            onChange={(event) => handleChange(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled || read.ceremony.note === null}
              pending={pendingAction === "continue"}
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            aria-busy={pendingAction === "skip" || undefined}
            onClick={() => void handleSkip()}
          >
            <PendingActionLabel
              pending={pendingAction === "skip"}
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "ceremony.skip")}
            </PendingActionLabel>
          </button>
        </div>

        {submitError && (
          <p role="alert" className={styles.error}>
            {translate(language, "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
