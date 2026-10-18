"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { translate, translateWith } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitPersonSheet,
  personSheetProgress,
  readPersonSheetForEditing,
  skipPersonSheet,
  writeLegacyFieldText,
  writeLovedThingsFieldText,
  writePersonWordsFieldText,
} from "@/lib/builder/guided-flow/person-sheet-step";
import {
  LIFE_STORY_MAX_CHARACTERS,
  acceptLifeStoryEdit,
  countLifeStoryCharacters,
  lifeStoryLimitStatus,
} from "@/lib/builder/guided-flow/life-story-limit";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./PersonSheetStep.module.css";

interface PersonSheetStepProps {
  language: Language;
  /** The memorial's current draft content — A09 is already guaranteed
   * resolved by the time this renders. */
  content: MemorialContent;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 044 — the single "Quelques mots sur la personne" sheet: A10
 * ("Comment aimeriez-vous présenter la personne qu'elle était ?"), A11
 * ("Qu'est-ce qu'elle aimait particulièrement ?") and A12 ("Qu'est-ce
 * qu'elle laisse derrière elle ?") as ONE screen, three open, entirely
 * facultative invitations — replacing `PersonWordsStep` (Mission 043's
 * own A10-only screen). No sub-fields, no biography form (mission brief
 * doctrine: "la famille raconte ; HERITAGE met en forme" — no génération
 * automatique, no inference from Hero/culture/skin/Ceremony/Traditions).
 *
 * "Continuer" stays disabled while all three fields are empty (mission
 * brief section 4's "ou aucune" is exactly what "Passer cette étape"
 * covers instead — the same A08/A10 "must have something to confirm, or
 * use Skip" convention, generalized from one field to three); it becomes
 * available the moment ANY one of the three holds text, and commits each
 * matière independently (`commitPersonSheet`: text present ->
 * `"completed"`, empty -> `"skipped"`, per matière). "Passer cette
 * étape" is always available and resolves the whole sheet as `"skipped"`
 * for all three without discarding any already-typed draft.
 */
interface LifeStoryFieldProps {
  id: string;
  language: Language;
  label: string;
  helper: string;
  /** Le texte enregistré, affiché EN ENTIER, même au-delà de la limite. */
  initialValue: string;
  disabled: boolean;
  onAcceptedChange: (value: string) => void;
}

/**
 * Un chapitre du Récit (A10/A11/A12), avec son compteur de 240 caractères
 * (règle : lib/builder/guided-flow/life-story-limit.ts). Une frappe ou un
 * collage qui ferait dépasser la limite est refusé en entier — jamais
 * tronqué ; un texte déjà plus long reste entier, se raccourcit ou se
 * corrige librement, mais ne s'allonge pas.
 */
function LifeStoryField({ id, language, label, helper, initialValue, disabled, onAcceptedChange }: LifeStoryFieldProps) {
  const [value, setValue] = useState(initialValue);
  const [refused, setRefused] = useState(false);
  const status = lifeStoryLimitStatus(value);
  const max = LIFE_STORY_MAX_CHARACTERS;

  function handleChange(next: string) {
    if (!acceptLifeStoryEdit(value, next)) {
      setRefused(true);
      return;
    }
    setRefused(false);
    setValue(next);
    onAcceptedChange(next);
  }

  const notice =
    status === "over"
      ? translateWith(language, "personSheet.overLimit", { max })
      : refused
        ? translateWith(language, "personSheet.limitRefused", { max })
        : status === "reached"
          ? translateWith(language, "personSheet.limitReached", { max })
          : null;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <p id={`${id}-helper`} className={styles.helper}>
        {helper}
      </p>
      <textarea
        id={id}
        className={styles.textarea}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-helper ${id}-count`}
        onChange={(event) => handleChange(event.target.value)}
      />
      <p id={`${id}-count`} className={styles.counter} data-limit-status={status} aria-live="polite">
        {translateWith(language, "personSheet.counter", { count: countLifeStoryCharacters(value), max })}
      </p>
      {notice !== null && (
        <p className={styles.limitNotice} data-limit-status={status}>
          {notice}
        </p>
      )}
    </div>
  );
}

export function PersonSheetStep({ language, content: initialContent, persist }: PersonSheetStepProps) {
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist });

  const read = readPersonSheetForEditing(content);
  const controlsDisabled = pendingAction !== null;

  function handlePersonWordsChange(value: string) {
    const result = writePersonWordsFieldText(content, value);
    if (result.ok) setContent(result.content);
  }

  function handleLovedThingsChange(value: string) {
    const result = writeLovedThingsFieldText(content, value);
    if (result.ok) setContent(result.content);
  }

  function handleLegacyChange(value: string) {
    const result = writeLegacyFieldText(content, value);
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

    const committed = commitPersonSheet(content);
    if (!committed.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      await persist(committed.content);
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

    const skipped = skipPersonSheet(content);
    if (!skipped.ok) {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      await persist(skipped.content);
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

  const progress = personSheetProgress(content);
  const nothingEntered = read.personWords.text === null && read.lovedThings.text === null && read.legacy.text === null;

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "personSheet.title")}</h1>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        <LifeStoryField
          id="person-sheet-a10"
          language={language}
          label={translate(language, "personSheet.a10Question")}
          helper={translate(language, "personSheet.a10Helper")}
          initialValue={read.personWords.text ?? ""}
          disabled={controlsDisabled}
          onAcceptedChange={handlePersonWordsChange}
        />

        <LifeStoryField
          id="person-sheet-a11"
          language={language}
          label={translate(language, "personSheet.a11Question")}
          helper={translate(language, "personSheet.a11Helper")}
          initialValue={read.lovedThings.text ?? ""}
          disabled={controlsDisabled}
          onAcceptedChange={handleLovedThingsChange}
        />

        <LifeStoryField
          id="person-sheet-a12"
          language={language}
          label={translate(language, "personSheet.a12Question")}
          helper={translate(language, "personSheet.a12Helper")}
          initialValue={read.legacy.text ?? ""}
          disabled={controlsDisabled}
          onAcceptedChange={handleLegacyChange}
        />

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled || nothingEntered}
              pending={pendingAction === "continue"}
              pendingLabel={translate(language, "common.pleaseWait")}
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
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "personSheet.skip")}
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
