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
  commitA07,
  readCeremonyForEditing,
  skipA07,
  writeCeremonyAccess,
  writeCeremonyAddress,
} from "@/lib/builder/guided-flow/ceremony-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyAddressStep.module.css";

interface CeremonyAddressStepProps {
  language: Language;
  /** The memorial's current draft content — A06 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: DraftSaveTransport;
}

/**
 * Mission 040 — A07: the ceremony's own adresse and accès/indications
 * pratiques, grouped in one small screen (mission brief's own
 * découpage). Facultatif, passable.
 */
export function CeremonyAddressStep({ language, content: initialContent, persist }: CeremonyAddressStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });

  const read = readCeremonyForEditing(content);
  const controlsDisabled = pendingAction !== null;

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
      setPendingAction(null);
      return false;
    }
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setPendingAction("continue");
    if (!(await drainAutosave())) return;

    const committed = commitA07(content);
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

    const skipped = skipA07(content);
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
  const hasAnyValue = read.ceremony.address !== null || read.ceremony.access !== null;

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
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
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled || !hasAnyValue}
              pending={pendingAction === "continue"}
              pendingLabel={translate(language, "autosave.saving")}
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
              pendingLabel={translate(language, "autosave.saving")}
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
