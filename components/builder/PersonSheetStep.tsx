"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitPersonSheet,
  personSheetProgress,
  readPersonSheetForEditing,
  skipPersonSheet,
  writeLegacyFieldText,
  writeLovedThingsFieldText,
  writePersonWordsFieldText,
} from "@/lib/builder/guided-flow/person-sheet-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./PersonSheetStep.module.css";

interface PersonSheetStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A09 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 044 — the single "Quelques mots sur la personne" sheet: A10
 * ("Comment aimeriez-vous présenter la personne qu'elle était ?"), A11
 * ("Qu'est-ce qu'elle aimait particulièrement ?") and A12 ("Qu'est-ce
 * qu'elle laisse derrière elle ?") as ONE screen, three open, entirely
 * facultative invitations — replacing `PersonWordsStep` (Mission 043's
 * own A10-only screen). No sub-fields, no biography form (mission brief
 * doctrine: "la famille raconte ; HERITAGE met en forme" — no génération
 * automatique, no inference from Hero/culture/skin/Ceremony/Traditions).
 *
 * "Continuer" stays disabled while all three fields are empty (mission
 * brief section 4's "ou aucune" is exactly what "Passer cette étape"
 * covers instead — the same A08/A10 "must have something to confirm, or
 * use Skip" convention, generalized from one field to three); it becomes
 * available the moment ANY one of the three holds text, and commits each
 * matière independently (`commitPersonSheet`: text present ->
 * `"completed"`, empty -> `"skipped"`, per matière). "Passer cette
 * étape" is always available and resolves the whole sheet as `"skipped"`
 * for all three without discarding any already-typed draft.
 */
export function PersonSheetStep({ language, editorialContext, content: initialContent, persist }: PersonSheetStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readPersonSheetForEditing(content);
  const controlsDisabled = isSubmitting;

  function handlePersonWordsChange(value: string) {
    const result = writePersonWordsFieldText(content, value);
    if (result.ok) setContent(result.content);
  }

  function handleLovedThingsChange(value: string) {
    const result = writeLovedThingsFieldText(content, value);
    if (result.ok) setContent(result.content);
  }

  function handleLegacyChange(value: string) {
    const result = writeLegacyFieldText(content, value);
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

    const committed = commitPersonSheet(content);
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

    const skipped = skipPersonSheet(content);
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

  const progress = personSheetProgress(editorialContext, content);
  const nothingEntered = read.personWords.text === null && read.lovedThings.text === null && read.legacy.text === null;

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "personSheet.title")}</h1>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.field}>
          <label htmlFor="person-sheet-a10" className={styles.fieldLabel}>
            {translate(language, "personSheet.a10Question")}
          </label>
          <p className={styles.helper}>{translate(language, "personSheet.a10Helper")}</p>
          <textarea
            id="person-sheet-a10"
            className={styles.textarea}
            defaultValue={read.personWords.text ?? ""}
            disabled={controlsDisabled}
            onChange={(event) => handlePersonWordsChange(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="person-sheet-a11" className={styles.fieldLabel}>
            {translate(language, "personSheet.a11Question")}
          </label>
          <p className={styles.helper}>{translate(language, "personSheet.a11Helper")}</p>
          <textarea
            id="person-sheet-a11"
            className={styles.textarea}
            defaultValue={read.lovedThings.text ?? ""}
            disabled={controlsDisabled}
            onChange={(event) => handleLovedThingsChange(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="person-sheet-a12" className={styles.fieldLabel}>
            {translate(language, "personSheet.a12Question")}
          </label>
          <p className={styles.helper}>{translate(language, "personSheet.a12Helper")}</p>
          <textarea
            id="person-sheet-a12"
            className={styles.textarea}
            defaultValue={read.legacy.text ?? ""}
            disabled={controlsDisabled}
            onChange={(event) => handleLegacyChange(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={controlsDisabled || nothingEntered}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            onClick={() => void handleSkip()}
          >
            {translate(language, "personSheet.skip")}
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
