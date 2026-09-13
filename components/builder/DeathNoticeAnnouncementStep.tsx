"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitA01,
  deathNoticeStepProgress,
  readDeathNoticeForEditing,
  writeAnnouncementText,
} from "@/lib/builder/guided-flow/death-notice-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./DeathNoticeAnnouncementStep.module.css";

interface DeathNoticeAnnouncementStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — T08 is already guaranteed
   * done by the time this renders (see app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** A bound Server Action — the same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 039 — A01: the announcement's own short text, the ONE
 * obligatoire, non-passable step of the Death Notice branch (mission
 * brief section 2).
 *
 * ## One field, one intention (mission brief section 2)
 *
 * A calm screen, no Hero preview, a single textarea — never a name,
 * dates, a photo, a cause of death, or ceremony details, all of which
 * have their own, later sources (mission brief section 2's own closed
 * list). No minimum length is imposed beyond "not blank" (mission brief
 * section 4): a short announcement is a perfectly valid one.
 *
 * ## The neutral amorce is a placeholder, never a value (mission brief
 * section 3)
 *
 * `deathNotice.announcementPlaceholder` is rendered as the textarea's
 * native `placeholder` attribute only — visually a hint, structurally
 * NEVER part of `announcementText` unless the family actually types
 * something. No `defaultValue` is ever seeded from it, so nothing here
 * can ever silently persist invented family text.
 *
 * ## T01's own CTA reuses the required-field pattern (mirrors
 * HeroIdentityStep)
 *
 * Continue stays enabled at all times (disabling it while the family is
 * mid-keystroke would read as broken); a submit attempt with no real
 * text simply shows one calm, local error and stays on this exact
 * screen, `attemptedSubmit`-gated so it never appears before a first
 * real attempt.
 *
 * ## Durability (Mission 034 doctrine, reused per this mission's own
 * section 11)
 *
 * `flush()` drains the autosave controller to durable quiescence FIRST
 * — cancelling any pending debounce, awaiting whatever is already in
 * flight — before `commitA01`'s own write goes out, exactly the same
 * discipline `HeroCropStep.tsx` already applies for T07. Without it, a
 * still-pending autosave of an OLDER, pre-commit snapshot could land
 * AFTER this screen's own persisted write and silently revert A01 back
 * to incomplete. If the drain itself fails, A01 is never considered
 * completed either — the family stays on this exact screen with a
 * human error, never advanced on unconfirmed content.
 */
export function DeathNoticeAnnouncementStep({
  language,
  editorialContext,
  content: initialContent,
  persist,
}: DeathNoticeAnnouncementStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readDeathNoticeForEditing(content);

  function handleChange(value: string) {
    const result = writeAnnouncementText(content, value);
    if (result.ok) setContent(result.content);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    if (read.deathNotice.announcementText === null) {
      setAttemptedSubmit(true);
      return;
    }

    // Disabled FIRST — before flush() ever awaits anything — so no new
    // keystroke can arm a further debounce while this drains (mirrors
    // HeroCropStep.tsx's own ordering for the identical reason).
    setIsSubmitting(true);
    try {
      await flush();
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    const committed = commitA01(content);
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

  const progress = deathNoticeStepProgress(editorialContext, content);
  const showRequiredError = attemptedSubmit && read.deathNotice.announcementText === null;

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "deathNotice.announcementTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "deathNotice.announcementSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          defaultValue={read.deathNotice.announcementText ?? ""}
          placeholder={translate(language, "deathNotice.announcementPlaceholder")}
          disabled={isSubmitting}
          aria-label={translate(language, "deathNotice.announcementTitle")}
          onChange={(event) => handleChange(event.target.value)}
        />
        {showRequiredError && (
          <p role="alert" className={styles.fieldError}>
            {translate(language, "deathNotice.announcementRequired")}
          </p>
        )}

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
