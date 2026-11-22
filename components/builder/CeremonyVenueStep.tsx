"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { useCombinedStepSave, type TextThenStepTransport } from "@/lib/builder/use-combined-step-save";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  ceremonyStepProgress,
  commitA06,
  readCeremonyForEditing,
  skipA06,
  writeCeremonyVenueName,
} from "@/lib/builder/guided-flow/ceremony-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyVenueStep.module.css";

interface CeremonyVenueStepProps {
  language: Language;
  /** The memorial's current draft content — A05 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: DraftSaveTransport;
  /** Mission 04-J (EXPERIMENT, local only) — the combined « text then
   * step » transport. Given only by the authenticated route, and only
   * before publication; absent → the historical path, unchanged. */
  persistCombined?: TextThenStepTransport;
  /** Optional host progress override; authenticated callers keep the
   * canonical calculation while the guest host includes its local Hero. */
  progress?: number;
}

/**
 * Mission 040 — A06: the ceremony's venue name alone (mission brief's
 * own découpage) — never a full address (that is A07's own field).
 * Facultatif, passable.
 */
export function CeremonyVenueStep({ language, content: initialContent, persist, persistCombined, progress }: CeremonyVenueStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);

  const { flush, persistVia, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });
  const saveStep = useCombinedStepSave({ status: autosaveState.status, flush, persistVia }, saveDraft, persistCombined);

  const read = readCeremonyForEditing(content);
  const controlsDisabled = pendingAction !== null;

  function handleChange(value: string) {
    const result = writeCeremonyVenueName(content, value);
    if (result.ok) setContent(result.content);
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setPendingAction("continue");

    const committed = commitA06(content);
    if (!committed.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    // Mission 04-J (EXPERIMENT) — the text then the step; the historical
    // flush-then-write order whenever the combined path does not apply.
    try {
      await saveStep(content, committed.content);
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

    const skipped = skipA06(content);
    if (!skipped.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      await saveStep(content, skipped.content);
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

  const resolvedProgress = progress ?? ceremonyStepProgress(content);

  return (
    <BuilderScreen
      progress={resolvedProgress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "ceremony.venueTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "ceremony.venueSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.field}>
          <label htmlFor="ceremony-venue" className={styles.fieldLabel}>
            {translate(language, "ceremony.venueLabel")}
          </label>
          <input
            id="ceremony-venue"
            type="text"
            className={styles.input}
            defaultValue={read.ceremony.venueName ?? ""}
            disabled={controlsDisabled}
            onChange={(event) => handleChange(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled || read.ceremony.venueName === null}
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
