"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import { usePendingInput } from "./journey/pending-input";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import {
  CONTRIBUTION_FEATURES,
  NO_CONTRIBUTION_FEATURES,
  type ContributionsFeatures,
} from "@/lib/memorial/contributions/contributions-settings";
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
  /**
   * M8-E3 (O9) — Builder authentifié : après l'enregistrement du brouillon,
   * applique AUSSITÔT les choix comme catégories EN VIGUEUR (hommage déjà
   * publié : effet immédiat, sans republication ; sinon, alignement du
   * brouillon seulement). `expectedRevision` = révision rendue par
   * l'enregistrement : une modification concurrente (autre onglet) est
   * refusée au lieu d'être écrasée. Absent (Builder invité) : rien.
   */
  applyCategoriesNow?: (features: ContributionsFeatures, expectedRevision: number | null) => Promise<{ status: string }>;
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
export function ContributionsStep({ language, content, skinVariant, persist, progress, applyCategoriesNow }: ContributionsStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const read = readContributionsForEditing(content);
  const stored = read.status === "ready" ? read.features : NO_CONTRIBUTION_FEATURES;
  const [features, setFeatures] = useState<ContributionsFeatures>(() => stored);
  const [pending, setPending] = useState<"continue" | "skip" | null>(null);
  const [submitError, setSubmitError] = useState(false);
  // Chef 03 / O04 — choices changed on screen are saved only by
  // « Continuer ». While they differ from the stored ones, leaving the
  // screen (« Mon parcours », closing the tab) asks first, and « Passer »
  // offers to save them instead of dropping them silently.
  const unsaved = CONTRIBUTION_FEATURES.some((feature) => features[feature] !== stored[feature]);
  const [confirmSkip, setConfirmSkip] = useState(false);
  usePendingInput(unsaved && pending === null);

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
      const saved = await saveDraft(result.content);
      if (applyCategoriesNow) {
        const applied = readContributionsForEditing(result.content);
        if (applied.status !== "ready") throw new Error("unreadable choices");
        const outcome = await applyCategoriesNow(applied.features, saved.revision ?? null);
        if (outcome.status !== "ok") throw new Error(`categories not applied: ${outcome.status}`);
      }
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
    <BuilderScreen progress={progress ?? contributionsStepProgress(content)} allowSticky>
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
          <button
            type="button"
            className={styles.skipLink}
            disabled={busy}
            aria-busy={pending === "skip" || undefined}
            onClick={() => {
              if (unsaved) setConfirmSkip(true);
              else void resolveStep(skipA15, "skip");
            }}
          >
            <PendingActionLabel pending={pending === "skip"} pendingLabel={translate(language, "common.pleaseWait")}>
              {translate(language, "contributionsStep.skip")}
            </PendingActionLabel>
          </button>
        </div>

        {confirmSkip && unsaved && (
          <div role="alert" className={styles.unsaved}>
            <p className={styles.unsavedText}>{translate(language, "contributionsStep.unsavedChoices")}</p>
            <div className={styles.unsavedActions}>
              <button
                type="button"
                className={styles.skipLink}
                disabled={busy}
                onClick={() => void resolveStep((c) => commitA15(c, features), "continue")}
              >
                {translate(language, "contributionsStep.unsavedSave")}
              </button>
              <button
                type="button"
                className={styles.skipLink}
                disabled={busy}
                onClick={() => void resolveStep(skipA15, "skip")}
              >
                {translate(language, "contributionsStep.unsavedSkip")}
              </button>
            </div>
          </div>
        )}

        {submitError && (
          <p role="alert" className={styles.error}>
            {translate(language, "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
