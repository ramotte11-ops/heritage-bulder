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
import { ProgressBar } from "./ProgressBar";
import { PrimaryButton } from "./PrimaryButton";
import styles from "./DeathNoticePreviewStep.module.css";

/** The only skin A03 has a real renderer for today. A future mission
 * adding a Musulman/Juif/Hindou A03 renderer widens this set. */
const A03_BUILT_SKINS: readonly Skin[] = ["intemporel"];

interface DeathNoticePreviewStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — A01 and A02 are already
   * guaranteed resolved by the time this renders (see
   * app/builder/[memorialId]/page.tsx's own `needsA03` gate). */
  content: MemorialContent;
  /** `memorials.skin` — the family's actual cultural skin, RE-VALIDATED
   * here (never trusted as a bare TS type crossing the DB boundary).
   * Decides WHICH renderer this screen shows, or whether it shows an
   * honest "unavailable" notice instead — see this component's own
   * docstring, "The skin guard". */
  skin: Skin;
  /** `memorials.skin_variant` — passed through to the real renderer's own
   * `SkinScope`/asset selection. */
  skinVariant: SkinVariant;
  /** A bound Server Action — the same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Mission 039B — A03: the Death Notice preview, obligatoire et
 * non-passable (mission brief section 1).
 *
 * ## Correction pass — the Memorial is no longer a card inside the Builder
 *
 * The FIRST pass wrapped `DeathNoticeIntemporel` in `BuilderScreen`
 * (`<BuilderScreen progress={...}>{children}</BuilderScreen>`), which
 * imposes its own 600px-capped `.frame`, HERITAGE wordmark, "Stories
 * live forever" signature and Builder parchment background on WHATEVER
 * it wraps. The QG/PO test — "si on cache tous les contrôles Builder, ce
 * qui reste doit pouvoir être directement le vrai mini-site" — failed
 * outright: what remained was a small ivory card floating inside another
 * ivory Builder card, never the full-bleed Memorial Stage the four
 * canonical references show.
 *
 * This component now renders TWO clearly separate zones, neither
 * constraining the other's width:
 *
 *   1. `DeathNoticeIntemporel` itself — full-bleed, edge-to-edge up to
 *      its OWN `max-width: 941px`/`1672px` (`geometry.json`'s own
 *      `runtime_width_rule`), exactly as a visitor would see it on the
 *      published page or a future Live Preview. Nothing here (this
 *      component's own CSS) sets a width, background, or padding on it.
 *   2. A slim, visually distinct Builder strip above (progress) and
 *      below (the three Builder-only controls: "Modifier l'annonce",
 *      "Modifier les précisions", "Continuer") — capped at a modest
 *      reading width of its own (`DeathNoticePreviewStep.module.css`'s
 *      own `.builderBar`/`.builderControls`), which never reaches into
 *      or resizes the Memorial above/below it.
 *
 * `BuilderScreen` is still used for the two states where there is no
 * real Memorial to show at all (corrupted data, an unavailable skin) —
 * those are plain Builder notices, not the Memorial, so the "card inside
 * a card" complaint does not apply to them; every other Guided Flow
 * screen already shows its own corrupted/notice states the same way.
 *
 * ## No editable field of its own
 *
 * A03 is principally a read/verify screen, so there is no `useAutosave`
 * here: `content` is rendered exactly as handed in by the page, and the
 * only two things this screen ever writes are an explicit "Modifier…"
 * reopen or the explicit "Continuer" verification.
 *
 * ## Corruption
 *
 * A03 reads BOTH canonical models (Hero, Death Notice) — either one
 * being corrupted shows the same honest, non-inventing notice every
 * other Guided Flow screen already shows, never a silent repair.
 *
 * ## The skin guard (mission brief section 15)
 *
 * Nothing in the Guided Flow route (`needsPageA`…`needsA03`) reads
 * `memorial.skin`, so a `musulman`/`juif`/`hindou` memorial must never
 * silently receive the `intemporel` renderer. This component is the ONE
 * place that decision is made, via `resolveSkinRuntime` — the existing
 * canonical mechanism, never a second, bespoke validity check.
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
    <main className={styles.page}>
      <div className={styles.builderBar}>
        <ProgressBar value={progress} />
      </div>

      <DeathNoticeIntemporel
        hero={heroRead.hero}
        deathNotice={deathNoticeRead.deathNotice}
        editorialContext={editorialContext}
        language={language}
        skinVariant={skinVariant}
      />

      <form className={styles.builderControls} onSubmit={handleSubmit}>
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

        <div className={styles.ctaWrap}>
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
    </main>
  );
}
