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
  commitA07,
  readCeremonyForEditing,
  skipA07,
  writeCeremonyAccess,
  writeCeremonyAddress,
} from "@/lib/builder/guided-flow/ceremony-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyAddressStep.module.css";

interface CeremonyAddressStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A06 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 040 — A07: the ceremony's own adresse and accès/indications
 * pratiques, grouped in one small screen (mission brief's own
 * découpage). Facultatif, passable.
 */
export function CeremonyAddressStep({ language, editorialContext, content: initialContent, persist }: CeremonyAddressStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readCeremonyForEditing(content);
  const controlsDisabled = isSubmitting;

  function handleAddressChange(value: string) {
    const result = writeCeremonyAddress(content, value);
    if (result.ok) setContent(result.content);
  }

  function handleAccessChange(value: string) {
    const result = writeCeremonyAccess(content, value);
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

    const committed = commitA07(content);
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

    const skipped = skipA07(content);
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
  const hasAnyValue = read.ceremony.address !== null || read.ceremony.access !== null;

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "ceremony.addressTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "ceremony.addressSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.fieldsList}>
          <div className={styles.field}>
            <label htmlFor="ceremony-address" className={styles.fieldLabel}>
              {translate(language, "ceremony.addressLabel")}
            </label>
            <textarea
              id="ceremony-address"
              className={styles.textarea}
              defaultValue={read.ceremony.address ?? ""}
              disabled={controlsDisabled}
              onChange={(event) => handleAddressChange(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="ceremony-access" className={styles.fieldLabel}>
              {translate(language, "ceremony.accessLabel")}
            </label>
            <textarea
              id="ceremony-access"
              className={styles.textarea}
              defaultValue={read.ceremony.access ?? ""}
              disabled={controlsDisabled}
              onChange={(event) => handleAccessChange(event.target.value)}
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
