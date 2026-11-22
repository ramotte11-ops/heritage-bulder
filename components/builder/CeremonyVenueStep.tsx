"use client";

import { useRef, useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { StepNotValidatedError, useCombinedStepSave, type TextThenStepTransport } from "@/lib/builder/use-combined-step-save";
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
  // Mission 04-K — « partial »: the text is confirmed saved, the step is
  // not (its own message); « total »: nothing confirmed (generic error).
  const [submitError, setSubmitError] = useState<null | "total" | "partial">(null);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);
  const lastIntent = useRef<"continue" | "skip">("continue");

  const { flush, persistVia, getStatus, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });
  const combinedSave = useCombinedStepSave({ getStatus, flush, persistVia }, saveDraft, persistCombined);

  const read = readCeremonyForEditing(content);
  const controlsDisabled = pendingAction !== null;

  function handleChange(value: string) {
    const result = writeCeremonyVenueName(content, value);
    if (result.ok) setContent(result.content);
  }

  /** Continue or skip: the step's final write, then the next screen. */
  async function finishStep(intent: "continue" | "skip") {
    if (read.status !== "ready") return;
    lastIntent.current = intent;
    setPendingAction(intent);
    setSubmitError(null);

    const committed = intent === "continue" ? commitA06(content) : skipA06(content);
    if (!committed.ok) {
      setSubmitError("total");
      setPendingAction(null);
      return;
    }

    // Missions 04-J / 04-K (EXPERIMENT) — the text then the step; the
    // historical flush-then-write order whenever the combined path does
    // not apply.
    try {
      await combinedSave.save(content, committed.content);
    } catch (error) {
      setSubmitError(error instanceof StepNotValidatedError ? "partial" : "total");
      setPendingAction(null);
      return;
    }

    stepDone();
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await finishStep("continue");
  }

  async function handleSkip() {
    if (controlsDisabled) return;
    await finishStep("skip");
  }

  // Mission 04-K — after an unconfirmed final write, « Réessayer » takes
  // up that same Continue or skip (settled first, never replayed); the
  // historical autosave retry otherwise.
  function handleRetry() {
    if (combinedSave.hasUnconfirmed()) void finishStep(lastIntent.current);
    else retryAutosave();
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
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={handleRetry} />}
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

        {submitError !== null && (
          <p role="alert" className={styles.error}>
            {translate(language, submitError === "partial" ? "autosave.stepPartial" : "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
