"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { Skin, SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { resolveSkinRuntime } from "@/lib/memorial/skin-runtime";
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

/** The only skin A03 has a real renderer for today (Mission 039B). A
 * future mission adding a Musulman/Juif/Hindou A03 renderer widens this
 * set — see `resolveA03Renderer` below, the one seam it would extend. */
const A03_BUILT_SKINS: readonly Skin[] = ["intemporel"];

interface DeathNoticePreviewStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A01 and A02 are already
   * guaranteed resolved by the time this renders (see
   * app/builder/[memorialId]/page.tsx's own `needsA03` gate). */
  content: MemorialContent;
  /** `memorials.skin` — the family's actual cultural skin, RE-VALIDATED
   * here (never trusted as a bare TS type crossing the DB boundary —
   * the same discipline `saveLanguageAction`/`saveEditorialContextAction`
   * already apply to `language`/`editorialContext`). Decides WHICH
   * renderer this screen shows, or whether it shows an honest
   * "unavailable" notice instead — see this component's own docstring,
   * "The skin guard". */
  skin: Skin;
  /** `memorials.skin_variant` — passed through to the real renderer's own
   * `SkinScope`/asset selection (Mission 039B correction: A03 now has a
   * real Dark pack too — see `DeathNoticeIntemporel`'s own docstring). */
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
 *
 * ## The skin guard (Mission 039B "correction finale")
 *
 * A QG micro-audit confirmed a real, reachable gap: nothing in the
 * Guided Flow route (`needsPageA`…`needsA03`) ever reads `memorial.skin`,
 * so a `musulman`/`juif`/`hindou` memorial (real, purchasable offers per
 * `config/offers.ts` — not hypothetical) reached A03 and silently
 * received the `intemporel` renderer. This component is the ONE place
 * that decision is now made, via `resolveSkinRuntime` — the existing
 * canonical mechanism (`lib/memorial/skin-runtime.ts`), never a second,
 * bespoke validity check:
 *
 *   - `skin` resolves to `"intemporel"` -> the real renderer below, exactly
 *     as before this correction.
 *   - `skin` resolves to any other real `Skin` (`musulman`/`juif`/`hindou`)
 *     OR fails to resolve at all (a corrupted/unrecognized value) -> a
 *     calm, honest "not yet available for this style" notice — NEVER the
 *     Intemporel renderer, NEVER an invented Musulman/Juif/Hindou design,
 *     NEVER any data touched or cleared. No edit links, no Continue: with
 *     nothing actually shown, there is nothing for the family to have
 *     genuinely verified, so `commitA03` is never reachable from this
 *     branch — the family stays here until a real renderer for their
 *     skin exists (a later mission's job, explicitly out of scope here).
 *
 * `A03_BUILT_SKINS` is the one seam a future mission widens when it adds
 * a real Musulman/Juif/Hindou A03 renderer — nothing else in this
 * component, `death-notice-step.ts`, or `page.tsx` needs to change.
 *
 * Deliberately NOT extended to the Hero (`HeroRevealStep`/`HeroIntemporel`
 * have the identical, pre-existing gap since Mission 035) — out of scope
 * for this mission; see the mission report.
 */
export function DeathNoticePreviewStep({
  language,
  editorialContext,
  content,
  skin,
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

  const skinResolution = resolveSkinRuntime(skin);
  const canRenderA03 = skinResolution.status === "resolved" && A03_BUILT_SKINS.includes(skinResolution.skin);

  if (!canRenderA03) {
    return (
      <BuilderScreen progress={progress}>
        <p role="alert" className={styles.unavailable}>
          {translate(language, "deathNotice.previewSkinUnavailable")}
        </p>
      </BuilderScreen>
    );
  }

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
