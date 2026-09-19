"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import {
  A04_ANSWERS,
  type A04Answer,
} from "@/lib/builder/guided-flow/human-steps";
import {
  ceremonyStepProgress,
  commitA04,
  readCeremonyForEditing,
  readCeremonyMomentAnswer,
} from "@/lib/builder/guided-flow/ceremony-step";
import { BuilderScreen } from "./BuilderScreen";
import { ChoiceCard } from "./ChoiceCard";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./CeremonyMomentStep.module.css";

interface CeremonyMomentStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A03 is already guaranteed
   * done by the time this renders (see app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** A bound Server Action — the same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

const ANSWER_LABEL_KEY: Record<A04Answer, "ceremony.momentYes" | "ceremony.momentUndecided" | "ceremony.momentNo"> = {
  yes: "ceremony.momentYes",
  undecided: "ceremony.momentUndecided",
  no: "ceremony.momentNo",
};

/**
 * Mission 040 — A04: "Un moment est-il prévu ?", obligatoire et
 * non-passable, the one question that decides whether A05-A08 open at
 * all (mission brief: "si Oui : ouvrir A05-A08 ; la section reste
 * facultative ; aucun écran ne doit culpabiliser la famille").
 *
 * A real, explicit three-way choice — never deduced from a death date,
 * an offer, a skin, or a culture — mirrors T02's own `ContextStep`
 * doctrine exactly, just with three compact cards instead of two roomy
 * ones (the three answers are single words/short phrases, not a
 * title+description pair).
 *
 * No `useAutosave` here: A04 has no field of its own to autosave, only
 * a single choice that is either fully committed (`commitA04`) or not
 * yet made — the same "no intermediate autosave" shape T02's own
 * `ContextStep` already uses for the identical reason.
 */
export function CeremonyMomentStep({ language, editorialContext, content, persist }: CeremonyMomentStepProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<A04Answer | null>(() => readCeremonyMomentAnswer(content));
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const read = readCeremonyForEditing(content);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready" || selected === null) return;

    setSubmitError(false);
    setIsSubmitting(true);

    const committed = commitA04(content, selected);
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
        <h1 className={styles.title}>{translate(language, "ceremony.momentTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "ceremony.momentSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.srOnly}>{translate(language, "ceremony.momentTitle")}</legend>

          <div className={styles.options}>
            {A04_ANSWERS.map((answer) => (
              <ChoiceCard
                key={answer}
                id={`ceremony-moment-${answer}`}
                name="ceremonyMoment"
                value={answer}
                checked={selected === answer}
                disabled={isSubmitting}
                onChange={(value) => setSelected(value as A04Answer)}
              >
                {translate(language, ANSWER_LABEL_KEY[answer])}
              </ChoiceCard>
            ))}
          </div>
        </fieldset>

        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit" disabled={selected === null || isSubmitting}>
            {translate(language, "common.continue")}
          </PrimaryButton>
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
