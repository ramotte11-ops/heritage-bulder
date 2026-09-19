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
  commitA08,
  readCeremonyForEditing,
  skipA08,
  writeCeremonyNote,
} from "@/lib/builder/guided-flow/ceremony-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyNoteStep.module.css";

interface CeremonyNoteStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A07 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 040 — A08: one facultative practical note, and the ceremony
 * branch's own "validation" moment (mission brief). Unlike A05-A07,
 * `note` is never required for "Continuer" to succeed — this screen's
 * real purpose is to let the family close out the ceremony information
 * they have chosen to share, not to collect one more mandatory field.
 * "Passer cette étape" stays available alongside it, for a family that
 * wants to move on without confirming even that.
 */
export function CeremonyNoteStep({ language, editorialContext, content: initialContent, persist }: CeremonyNoteStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readCeremonyForEditing(content);
  const controlsDisabled = isSubmitting;

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
      setIsSubmitting(false);
      return false;
    }
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setIsSubmitting(true);
    if (!(await drainAutosave())) return;

    const committed = commitA08(content);
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

    const skipped = skipA08(content);
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

  return (
    <BuilderScreen progress={progress}>
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
            <PrimaryButton type="submit" disabled={controlsDisabled}>
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
