"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitPageB,
  heroStepProgress,
  readHeroForEditing,
  writeShortPhrase,
} from "@/lib/builder/guided-flow/hero-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./HeroPhraseStep.module.css";

interface HeroPhraseStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — PAGE A (T03/T04) is already
   * guaranteed done by the time this renders (see
   * app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** A bound Server Action — same seam as HeroIdentityStep's `persist`. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 032 — PAGE B: T05, a short, entirely optional personal line
 * (`shortPhrase`, Mission 031's canonical model — untouched by this
 * mission). A separate page from PAGE A on purpose (mission brief
 * section 6): identity is a fact, this is an intention, and the two
 * deserve their own moment rather than being crammed onto one screen.
 *
 * ## Wording depends on context, never the model
 *
 * The title/subtitle read from `hero.phraseTitle{Announcement,
 * Remembrance}` / `hero.phraseSubtitle{Announcement,Remembrance}` —
 * `editorialContext` only ever selects WHICH translation key to read,
 * never changes what gets written (`shortPhrase`, always — mission
 * brief section 7). No `AnnouncementHero`/`RemembranceHero` type exists
 * anywhere in this codebase.
 *
 * ## Never blocks, never fakes a phrase
 *
 * The CTA is enabled unconditionally (besides the in-flight submit
 * itself) — there is no required field on this page at all. On submit,
 * `commitPageB` records T05 as `"completed"` or `"skipped"` from
 * whatever is actually in the stored Hero at that moment; this
 * component never writes a placeholder string to fake completion
 * (mission brief section 9).
 */
export function HeroPhraseStep({
  language,
  editorialContext,
  content: initialContent,
  persist,
}: HeroPhraseStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useAutosave({ content, persist });

  const read = readHeroForEditing(content);

  function handleChange(value: string) {
    const result = writeShortPhrase(content, value);
    if (result.ok) setContent(result.content);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const committed = commitPageB(content);
    if (!committed.ok) {
      setSubmitError(true);
      return;
    }

    setIsSubmitting(true);
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

  const titleKey: TranslationKey =
    editorialContext === "announcement" ? "hero.phraseTitleAnnouncement" : "hero.phraseTitleRemembrance";
  const subtitleKey: TranslationKey =
    editorialContext === "announcement"
      ? "hero.phraseSubtitleAnnouncement"
      : "hero.phraseSubtitleRemembrance";

  const progress = heroStepProgress(editorialContext, content, read.hero);

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, titleKey)}</h1>
        <p className={styles.subtitle}>{translate(language, subtitleKey)}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          defaultValue={read.hero.shortPhrase ?? ""}
          disabled={isSubmitting}
          aria-label={translate(language, titleKey)}
          onChange={(event) => handleChange(event.target.value)}
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
