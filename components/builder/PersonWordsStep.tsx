"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitA10,
  personWordsStepProgress,
  readPersonWordsForEditing,
  skipA10,
  writePersonWordsText,
} from "@/lib/builder/guided-flow/person-words-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./PersonWordsStep.module.css";

interface PersonWordsStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A09 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 043 — A10: "Quelques mots sur la personne". Entirely
 * facultative, entirely passable — one free-text field, one intention,
 * no biography form (mission brief doctrine: pas de champs profession/
 * qualités/famille/caractère, pas de génération automatique, pas
 * d'inférence depuis Hero/culture/skin/cérémonie/traditions). Same
 * two-outcome shape as A08's "note pratique facultative"
 * (`CeremonyNoteStep`): "Continuer" stays disabled while `text` is
 * empty, "Passer cette étape" lets the family move on without one, and
 * once text is entered "Continuer" becomes available and commits A10 as
 * completed.
 */
export function PersonWordsStep({ language, editorialContext, content: initialContent, persist }: PersonWordsStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readPersonWordsForEditing(content);
  const controlsDisabled = isSubmitting;

  function handleChange(value: string) {
    const result = writePersonWordsText(content, value);
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

    const committed = commitA10(content);
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

    const skipped = skipA10(content);
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

  const progress = personWordsStepProgress(editorialContext, content);

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "personWords.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "personWords.subtitle")}</p>
        <p className={styles.helper}>{translate(language, "personWords.helper")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.field}>
          <label htmlFor="person-words-text" className={styles.fieldLabel}>
            {translate(language, "personWords.textLabel")}
          </label>
          <textarea
            id="person-words-text"
            className={styles.textarea}
            defaultValue={read.personWords.text ?? ""}
            disabled={controlsDisabled}
            onChange={(event) => handleChange(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={controlsDisabled || read.personWords.text === null}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            onClick={() => void handleSkip()}
          >
            {translate(language, "personWords.skip")}
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
