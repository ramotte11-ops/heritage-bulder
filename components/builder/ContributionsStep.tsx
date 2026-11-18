"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import {
  commitA15,
  contributionsStepProgress,
  readContributionsForEditing,
  skipA15,
  type ContributionsStepWriteResult,
} from "@/lib/builder/guided-flow/contributions-step";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";
import { ContributionsPreparation } from "./ContributionsPreparation";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import { PendingActionLabel } from "./PendingActionLabel";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./ContributionsStep.module.css";

interface ContributionsStepProps {
  language: Language;
  content: MemorialContent;
  /** L'ambiance choisie en T08 : la scène de l'aperçu la suit (Light / Dark). */
  skinVariant: SkinVariant;
  /** La même Server Action liée que tous les écrans du parcours (ou le brouillon local de l'invité). */
  persist: DraftSaveTransport;
  progress?: number;
}

/**
 * M7 — A15 « Contributions des proches » : la famille ouvre (ou non) les
 * condoléances, les récits et anecdotes, les photographies. Chaque choix
 * dévoile aussitôt, dans l'aperçu, les cartes d'exemple correspondantes à
 * leur place dans la composition artistique validée ; le retirer les fait
 * disparaître. Rien n'est enregistré avant « Continuer » ou « Passer cette
 * étape » (comme A04 : pas d'enregistrement intermédiaire), et seuls les
 * trois choix le sont — jamais un exemple.
 */
export function ContributionsStep({ language, content, skinVariant, persist, progress }: ContributionsStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const read = readContributionsForEditing(content);
  const [features, setFeatures] = useState<ContributionsFeatures>(() => (read.status === "ready" ? read.features : { condolences: false, stories: false, photos: false }));
  const [pending, setPending] = useState<"continue" | "skip" | null>(null);
  const [submitError, setSubmitError] = useState(false);

  async function resolveStep(write: (c: MemorialContent) => ContributionsStepWriteResult, action: "continue" | "skip") {
    setSubmitError(false);
    setPending(action);
    const result = write(content);
    if (!result.ok) {
      setSubmitError(true);
      setPending(null);
      return;
    }
    try {
      await saveDraft(result.content);
    } catch {
      setSubmitError(true);
      setPending(null);
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

  const busy = pending !== null;
  return (
    <BuilderScreen progress={progress ?? contributionsStepProgress(content)}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "contributionsStep.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "contributionsStep.subtitle")}</p>
      </div>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void resolveStep((c) => commitA15(c, features), "continue");
        }}
      >
        <ContributionsPreparation language={language} skinVariant={skinVariant} features={features} onChange={setFeatures} disabled={busy} />

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={busy} pending={pending === "continue"} pendingLabel={translate(language, "common.pleaseWait")}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>
          <button type="button" className={styles.skipLink} disabled={busy} aria-busy={pending === "skip" || undefined} onClick={() => void resolveStep(skipA15, "skip")}>
            <PendingActionLabel pending={pending === "skip"} pendingLabel={translate(language, "common.pleaseWait")}>
              {translate(language, "contributionsStep.skip")}
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
