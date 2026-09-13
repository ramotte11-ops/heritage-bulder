"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { readHeroForEditing } from "@/lib/builder/guided-flow/hero-step";
import {
  commitA03,
  deathNoticeStepProgress,
  readDeathNoticeForEditing,
  reopenA01,
  reopenA02,
} from "@/lib/builder/guided-flow/death-notice-step";
import { DeathNoticeIntemporel } from "@/components/memorial/death-notice/DeathNoticeIntemporel";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./DeathNoticePreviewStep.module.css";

interface DeathNoticePreviewStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A01 and A02 are already
   * guaranteed resolved by the time this renders (see
   * app/builder/[memorialId]/page.tsx's own `needsA03` gate). */
  content: MemorialContent;
  /** `memorials.skin_variant` — passed through to the real renderer's own
   * `SkinScope` for a consistent DOM scope, even though the A03 Studio
   * pack does not itself fork on it (see `DeathNoticeIntemporel`'s own
   * docstring). */
  skinVariant: SkinVariant;
  /** A bound Server Action — the same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 039B — A03: the Death Notice preview, obligatoire and
 * non-passable (AGENTS.md section 1).
 *
 * Unlike A01/A02, A03 has no editable field of its own — it is
 * principally a read/verify screen (AGENTS.md section 18), so there is
 * no `useAutosave` here: `content` is rendered exactly as handed in by
 * the page, and the only two things this screen ever writes are an
 * explicit "Modifier…" reopen or the explicit "Continuer" verification.
 *
 * ## The real editorial renderer, not a mockup (AGENTS.md section 13)
 *
 * `DeathNoticeIntemporel` is the SAME renderer a future Live Preview and
 * the published memorial page will use — this screen only supplies the
 * Builder chrome around it (`BuilderScreen`) and the three Builder-only
 * controls the mission brief keeps explicitly OUTSIDE the Avis itself:
 * "Modifier l'annonce", "Modifier les précisions", "Continuer".
 *
 * ## Corruption (AGENTS.md section 18)
 *
 * A03 reads BOTH canonical models (Hero, Death Notice) — either one
 * being corrupted shows the same honest, non-inventing notice every
 * other Guided Flow screen already shows, never a silent repair.
 */
export function DeathNoticePreviewStep({
  language,
  editorialContext,
  content,
  skinVariant,
  persist,
}: DeathNoticePreviewStepProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const heroRead = readHeroForEditing(content);
  const deathNoticeRead = readDeathNoticeForEditing(content);

  if (heroRead.status !== "ready" || deathNoticeRead.status !== "ready") {
    return (
      <BuilderScreen progress={0}>
        <p role="alert" className={styles.error}>
          {translate(language, "hero.dataUnavailable")}
        </p>
      </BuilderScreen>
    );
  }

  const progress = deathNoticeStepProgress(editorialContext, content);

  async function handleEditAnnouncement() {
    if (isSubmitting) return;
    setSubmitError(false);
    setIsSubmitting(true);

    const reopened = reopenA01(content);
    if (!reopened.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(reopened.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  async function handleEditPrecisions() {
    if (isSubmitting) return;
    setSubmitError(false);
    setIsSubmitting(true);

    const reopened = reopenA02(content);
    if (!reopened.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(reopened.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(false);
    setIsSubmitting(true);

    const committed = commitA03(content);
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

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.stage}>
        <DeathNoticeIntemporel
          hero={heroRead.hero}
          deathNotice={deathNoticeRead.deathNotice}
          editorialContext={editorialContext}
          language={language}
          skinVariant={skinVariant}
        />
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.editLinks}>
          <button
            type="button"
            className={styles.editLink}
            disabled={isSubmitting}
            onClick={() => void handleEditAnnouncement()}
          >
            {translate(language, "deathNotice.editAnnouncement")}
          </button>
          <button
            type="button"
            className={styles.editLink}
            disabled={isSubmitting}
            onClick={() => void handleEditPrecisions()}
          >
            {translate(language, "deathNotice.editPrecisions")}
          </button>
        </div>

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
