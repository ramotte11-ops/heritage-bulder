"use client";

import { useActionState, useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import type { A00Answer } from "@/lib/builder/guided-flow/human-steps";
import {
  announcementChoiceProgress,
  commitA00,
  readAnnouncementChoice,
} from "@/lib/builder/guided-flow/announcement-choice-step";
import { BuilderScreen } from "./BuilderScreen";
import { ChoiceCard } from "./ChoiceCard";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./AnnouncementChoiceStep.module.css";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";

const OPTIONS: readonly { answer: A00Answer; title: TranslationKey; description: TranslationKey }[] = [
  { answer: "yes", title: "announcementChoice.yesTitle", description: "announcementChoice.yesDescription" },
  { answer: "no", title: "announcementChoice.noTitle", description: "announcementChoice.noDescription" },
  { answer: "later", title: "announcementChoice.laterTitle", description: "announcementChoice.laterDescription" },
];

type AnnouncementChoiceStepState = { status: "idle" } | { status: "error" };

const INITIAL_STATE: AnnouncementChoiceStepState = { status: "idle" };

interface AnnouncementChoiceStepProps {
  language: Language;
  content: MemorialContent;
  /** The bound `saveDraftAction`, exactly like every Guided Flow screen. */
  persist: DraftSaveTransport;
}

/**
 * A00 — the death-notice choice, between identity and the Hero (see
 * lib/builder/guided-flow/announcement-choice-step.ts for the rules).
 *
 * Same chrome and components as every Guided Flow question (BuilderScreen,
 * ChoiceCard as one native radio group, PrimaryButton): no new visual
 * language. Nothing is preselected the first time; a choice already
 * recorded is restored when the screen is shown again.
 */
export function AnnouncementChoiceStep({ language, content, persist }: AnnouncementChoiceStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const [selected, setSelected] = useState<A00Answer | null>(() => readAnnouncementChoice(content));
  const stepDone = useStepDone();

  async function submit(
    _previous: AnnouncementChoiceStepState,
    formData: FormData,
  ): Promise<AnnouncementChoiceStepState> {
    const committed = commitA00(content, String(formData.get("announcementChoice") ?? ""));
    if (!committed.ok) return { status: "error" };

    try {
      await saveDraft(committed.content);
    } catch {
      return { status: "error" };
    }

    stepDone();
    return { status: "idle" };
  }

  const [state, formAction, isPending] = useActionState(submit, INITIAL_STATE);

  return (
    <BuilderScreen progress={announcementChoiceProgress(content)}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "announcementChoice.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "announcementChoice.subtitle")}</p>
      </div>

      <form action={formAction} className={styles.form}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.srOnly}>{translate(language, "announcementChoice.title")}</legend>

          <div className={styles.options}>
            {OPTIONS.map((option) => (
              <ChoiceCard
                key={option.answer}
                id={`announcement-choice-${option.answer}`}
                name="announcementChoice"
                value={option.answer}
                size="roomy"
                checked={selected === option.answer}
                disabled={isPending}
                onChange={(value) => setSelected(value as A00Answer)}
              >
                <span className={styles.cardTitle}>{translate(language, option.title)}</span>
                <span className={styles.cardDescription}>{translate(language, option.description)}</span>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>

        <div className={styles.footer}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={selected === null || isPending}
              pending={isPending}
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>
          <p className={styles.hint}>{translate(language, "announcementChoice.changeLater")}</p>
        </div>

        {state.status === "error" && (
          <p role="alert" className={styles.error}>
            {translate(language, "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
