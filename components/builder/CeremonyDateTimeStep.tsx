"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  ceremonyStepProgress,
  commitA05,
  readCeremonyForEditing,
  skipA05,
  writeCeremonyDate,
  writeCeremonyTime,
} from "@/lib/builder/guided-flow/ceremony-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyDateTimeStep.module.css";

interface CeremonyDateTimeStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A04 (answered "yes") is
   * already guaranteed done by the time this renders. */
  content: MemorialContent;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 040 — A05: the ceremony's own date and heure, grouped in one
 * small screen (mission brief's own découpage — "regrouper uniquement
 * les informations naturellement liées"). Facultatif, passable: HERITAGE
 * never forces a date the family does not yet have.
 *
 * Both fields are shown directly, never behind a discreet "+Ajouter"
 * action — unlike A02's five loosely-related precisions, date and heure
 * are the one tightly-coupled pair this screen exists for, so hiding
 * either would only add a click for something the family came here to
 * fill in.
 *
 * "Continuer" (`commitA05`) is only enabled once at least one of the two
 * fields genuinely holds a value; "Passer cette étape" (`skipA05`) stays
 * available regardless, and never touches `content.ceremony` itself —
 * mirrors `DeathNoticePrecisionsStep`'s own two-outcomes discipline.
 */
export function CeremonyDateTimeStep({ language, editorialContext, content: initialContent, persist }: CeremonyDateTimeStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist });

  const read = readCeremonyForEditing(content);
  const controlsDisabled = isSubmitting;

  function handleDateChange(value: string) {
    const result = writeCeremonyDate(content, value === "" ? null : value);
    if (result.ok) setContent(result.content);
  }

  function handleTimeChange(value: string) {
    const result = writeCeremonyTime(content, value === "" ? null : value);
    if (result.ok) setContent(result.content);
  }

  async function drainAutosave(): Promise<boolean> {
    try {
      await flush();
      return true;
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return false;
    }
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setIsSubmitting(true);
    if (!(await drainAutosave())) return;

    const committed = commitA05(content);
    if (!committed.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(committed.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  async function handleSkip() {
    if (read.status !== "ready" || controlsDisabled) return;

    setIsSubmitting(true);
    if (!(await drainAutosave())) return;

    const skipped = skipA05(content);
    if (!skipped.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(skipped.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
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

  const progress = ceremonyStepProgress(editorialContext, content);
  const hasAnyValue = read.ceremony.date !== null || read.ceremony.time !== null;

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "ceremony.dateTimeTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "ceremony.dateTimeSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.fieldsList}>
          <div className={styles.field}>
            <label htmlFor="ceremony-date" className={styles.fieldLabel}>
              {translate(language, "ceremony.dateLabel")}
            </label>
            <input
              id="ceremony-date"
              type="date"
              className={styles.input}
              defaultValue={read.ceremony.date ?? ""}
              disabled={controlsDisabled}
              onChange={(event) => handleDateChange(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="ceremony-time" className={styles.fieldLabel}>
              {translate(language, "ceremony.timeLabel")}
            </label>
            <input
              id="ceremony-time"
              type="time"
              className={styles.input}
              defaultValue={read.ceremony.time ?? ""}
              disabled={controlsDisabled}
              onChange={(event) => handleTimeChange(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={controlsDisabled || !hasAnyValue}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            onClick={() => void handleSkip()}
          >
            {translate(language, "ceremony.skip")}
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
