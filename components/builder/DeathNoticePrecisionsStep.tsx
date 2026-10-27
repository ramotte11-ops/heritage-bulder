"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import type { TranslationKey } from "@/lib/i18n/keys";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  commitA02,
  deathNoticeStepProgress,
  readDeathNoticeForEditing,
  skipA02,
  writePrecision,
} from "@/lib/builder/guided-flow/death-notice-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./DeathNoticePrecisionsStep.module.css";

interface DeathNoticePrecisionsStepProps {
  language: Language;
  /** The memorial's current draft content — A01 is already guaranteed
   * done by the time this renders (see app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** A bound Server Action — the same seam every Guided Flow screen uses. */
  persist: DraftSaveTransport;
  /** Optional local-runtime progress. Authenticated callers keep the
   * canonical content-derived calculation by omitting it. */
  progress?: number;
}

/** The five precisions, in the order the mission brief's own UX map
 * lists them (section 5) — this array's order IS the discreet-actions
 * order and the opened-fields order. */
const PRECISION_FIELDS: readonly {
  field: DeathNoticePrecisionField;
  addLabelKey: TranslationKey;
  fieldLabelKey: TranslationKey;
}[] = [
  { field: "generalLocation", addLabelKey: "deathNotice.precisionsAddLocation", fieldLabelKey: "deathNotice.precisionsFieldLocation" },
  { field: "familyMessage", addLabelKey: "deathNotice.precisionsAddFamilyMessage", fieldLabelKey: "deathNotice.precisionsFieldFamilyMessage" },
  { field: "thought", addLabelKey: "deathNotice.precisionsAddThought", fieldLabelKey: "deathNotice.precisionsFieldThought" },
  { field: "quote", addLabelKey: "deathNotice.precisionsAddQuote", fieldLabelKey: "deathNotice.precisionsFieldQuote" },
  { field: "other", addLabelKey: "deathNotice.precisionsAddOther", fieldLabelKey: "deathNotice.precisionsFieldOther" },
];

/**
 * Mission 039 — A02: the Death Notice's own facultative, entirely
 * passable precisions (mission brief section 5).
 *
 * ## Discreet actions, never five large fields at once (mission brief
 * section 5)
 *
 * Each precision starts as a small "Ajouter…" action; clicking one
 * reveals only ITS OWN small field, never the other four. A field
 * already holding data (resumed from a previous visit) is shown open
 * from the start — `isFieldVisible` below reads BOTH "was this button
 * ever clicked this session" and "does this field already hold a real
 * value", so reprise never hides real, already-typed family content
 * behind a button the family would have to click again to see it.
 *
 * ## Two distinct outcomes, two distinct controls (mission brief
 * sections 8-9)
 *
 * "Continuer" (`commitA02`) is only ever enabled once at least one
 * precision genuinely holds a value — committing "completed" with
 * nothing entered is not a real outcome this screen offers, that is
 * exactly what "Passer cette étape" (`skipA02`) is for instead.
 * "Passer cette étape" stays available regardless of what has been
 * typed, and never touches `precisions` itself (section 8: "ne rien
 * inventer ; ne rien ajouter") — only A02's own `StepRecord` changes.
 *
 * ## Durability (Mission 034 doctrine, reused per this mission's own
 * section 11)
 *
 * Both `handleContinue` and `handleSkip` call `flush()` — draining the
 * autosave controller to durable quiescence — BEFORE their own
 * `commitA02`/`skipA02` write, exactly the same discipline
 * `DeathNoticeAnnouncementStep.tsx` and `HeroCropStep.tsx` already
 * apply: a stale, still-pending autosave of an earlier precisions
 * snapshot must never be able to land after this screen's own commit
 * and silently revert it.
 */
export function DeathNoticePrecisionsStep({
  language,
  content: initialContent,
  persist,
  progress: progressOverride,
}: DeathNoticePrecisionsStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [openedFields, setOpenedFields] = useState<ReadonlySet<DeathNoticePrecisionField>>(() => new Set());
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });

  const read = readDeathNoticeForEditing(content);
  const controlsDisabled = pendingAction !== null;

  function openField(field: DeathNoticePrecisionField) {
    if (controlsDisabled) return;
    setOpenedFields((prev) => new Set(prev).add(field));
  }

  function handleFieldChange(field: DeathNoticePrecisionField, value: string) {
    const result = writePrecision(content, field, value);
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

    const committed = commitA02(content);
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

    const skipped = skipA02(content);
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

  const progress = progressOverride ?? deathNoticeStepProgress(content);
  const hasAnyPrecision = PRECISION_FIELDS.some(({ field }) => read.deathNotice.precisions[field] !== null);

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "deathNotice.precisionsTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "deathNotice.precisionsSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <div className={styles.fieldsList}>
          {PRECISION_FIELDS.map(({ field, addLabelKey, fieldLabelKey }) => {
            const isOpen = openedFields.has(field) || read.deathNotice.precisions[field] !== null;
            const fieldId = `death-notice-precision-${field}`;

            if (!isOpen) {
              return (
                <button
                  key={field}
                  type="button"
                  className={styles.addAction}
                  disabled={controlsDisabled}
                  onClick={() => openField(field)}
                >
                  + {translate(language, addLabelKey)}
                </button>
              );
            }

            return (
              <div key={field} className={styles.openField}>
                <label htmlFor={fieldId} className={styles.fieldLabel}>
                  {translate(language, fieldLabelKey)}
                </label>
                <textarea
                  id={fieldId}
                  className={styles.textarea}
                  defaultValue={read.deathNotice.precisions[field] ?? ""}
                  disabled={controlsDisabled}
                  onChange={(event) => handleFieldChange(field, event.target.value)}
                />
              </div>
            );
          })}
        </div>

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled || !hasAnyPrecision}
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
              {translate(language, "deathNotice.precisionsSkip")}
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
