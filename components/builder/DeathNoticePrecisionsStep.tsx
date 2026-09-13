"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { TranslationKey } from "@/lib/i18n/keys";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitA02,
  deathNoticeStepProgress,
  readDeathNoticeForEditing,
  skipA02,
  writePrecision,
} from "@/lib/builder/guided-flow/death-notice-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./DeathNoticePrecisionsStep.module.css";

interface DeathNoticePrecisionsStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A01 is already guaranteed
   * done by the time this renders (see app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** A bound Server Action — the same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
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
  editorialContext,
  content: initialContent,
  persist,
}: DeathNoticePrecisionsStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [openedFields, setOpenedFields] = useState<ReadonlySet<DeathNoticePrecisionField>>(() => new Set());
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readDeathNoticeForEditing(content);
  const controlsDisabled = isSubmitting;

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
      setIsSubmitting(false);
      return false;
    }
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setIsSubmitting(true);
    if (!(await drainAutosave())) return;

    const committed = commitA02(content);
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

    const skipped = skipA02(content);
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

  const progress = deathNoticeStepProgress(editorialContext, content);
  const hasAnyPrecision = PRECISION_FIELDS.some(({ field }) => read.deathNotice.precisions[field] !== null);

  return (
    <BuilderScreen progress={progress}>
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
            <PrimaryButton type="submit" disabled={controlsDisabled || !hasAnyPrecision}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            onClick={() => void handleSkip()}
          >
            {translate(language, "deathNotice.precisionsSkip")}
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
