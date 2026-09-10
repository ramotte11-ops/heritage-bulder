"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { HeroDate } from "@/types/hero";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  heroStepProgress,
  readHeroForEditing,
  writeBirth,
  writeDeath,
  writeDisplayName,
} from "@/lib/builder/guided-flow/hero-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import { HeroDateField } from "./HeroDateField";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./HeroIdentityStep.module.css";

interface HeroIdentityStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — T02 is already guaranteed
   * done by the time this renders (see app/builder/[memorialId]/page.tsx),
   * so this is always a real, authorized draft. */
  content: MemorialContent;
  /** A bound Server Action — `saveDraftAction.bind(null, memorialId)` —
   * the exact same seam BuilderShell's autosave already uses (Mission
   * 021B). Never a closure over a repository or a live Supabase client. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

type DateErrorKind = "date" | "chronology" | null;

function dateErrorText(language: Language, kind: DateErrorKind): string | null {
  if (kind === null) return null;
  return translate(language, kind === "chronology" ? "hero.chronologyImpossible" : "hero.dateInvalid");
}

/**
 * Mission 032 — PAGE A: T03 (nom affiché, obligatoire) and T04 (dates,
 * facultatives) sharing one visible page, exactly as the mission brief
 * requires (section 2): one intention — identify the person — never
 * split into a firstName/lastName/surname wizard.
 *
 * ## Why the CTA is never disabled by content
 *
 * Unlike T01/T02 (a discrete choice, CTA disabled until one is made),
 * `displayName` is free text: disabling Continue while the family is
 * mid-keystroke would read as a broken button, not a calm form. Instead
 * the CTA stays enabled and, on an actual submit attempt with no name,
 * shows one calm, local, human error under the field (mission brief
 * section 19) — never a technical message, never blocking the click
 * itself. An unresolved date error DOES hold Continue: submitting would
 * otherwise silently discard whatever the family just typed but never
 * got committed to the stored Hero (see HeroDateField's own docstring).
 *
 * ## Corruption
 *
 * `readHeroForEditing` distinguishes a corrupted stored Hero from an
 * absent/valid one. A corrupted one renders no form at all — only a
 * calm notice — so nothing here can ever construct a fresh, mostly-
 * empty Hero and silently persist it over real (if malformed) existing
 * data (mission brief section 10).
 */
export function HeroIdentityStep({
  language,
  editorialContext,
  content: initialContent,
  persist,
}: HeroIdentityStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [birthError, setBirthError] = useState<DateErrorKind>(null);
  const [deathError, setDeathError] = useState<DateErrorKind>(null);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Observes `content` exactly like BuilderShell does for the older
  // section-toggle model — every field write below produces a NEW
  // `content` value (never a mutation), which is what drives the
  // debounced autosave while the family types.
  useAutosave({ content, persist });

  const read = readHeroForEditing(content);

  function handleDisplayNameChange(value: string) {
    const result = writeDisplayName(content, value);
    if (result.ok) setContent(result.content);
  }

  function handleBirthChange(date: HeroDate | null) {
    const result = writeBirth(content, date);
    if (result.ok) {
      setContent(result.content);
      setBirthError(null);
    } else {
      setBirthError(result.reason === "chronology" ? "chronology" : "date");
    }
  }

  function handleDeathChange(date: HeroDate | null) {
    const result = writeDeath(content, date);
    if (result.ok) {
      setContent(result.content);
      setDeathError(null);
    } else {
      setDeathError(result.reason === "chronology" ? "chronology" : "date");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;
    if (birthError || deathError) return; // an unresolved date issue stays on screen, never silently dropped.

    if (read.hero.displayName === null) {
      setAttemptedSubmit(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await persist(content);
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

  const progress = heroStepProgress(editorialContext, content, read.hero);
  const showDisplayNameError = attemptedSubmit && read.hero.displayName === null;

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "hero.identityTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "hero.identitySubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="hero-display-name" className={styles.label}>
            {translate(language, "hero.displayNameLabel")}
          </label>
          <input
            id="hero-display-name"
            type="text"
            autoComplete="off"
            className={styles.input}
            defaultValue={read.hero.displayName ?? ""}
            disabled={isSubmitting}
            onChange={(event) => handleDisplayNameChange(event.target.value)}
          />
          {showDisplayNameError && (
            <p role="alert" className={styles.fieldError}>
              {translate(language, "hero.displayNameRequired")}
            </p>
          )}
        </div>

        <HeroDateField
          language={language}
          idPrefix="hero-birth"
          label={translate(language, "hero.birthLabel")}
          value={read.hero.birth}
          onChange={handleBirthChange}
          error={dateErrorText(language, birthError)}
          disabled={isSubmitting}
        />

        <HeroDateField
          language={language}
          idPrefix="hero-death"
          label={translate(language, "hero.deathLabel")}
          value={read.hero.death}
          onChange={handleDeathChange}
          error={dateErrorText(language, deathError)}
          disabled={isSubmitting}
        />

        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit" disabled={isSubmitting}>
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
