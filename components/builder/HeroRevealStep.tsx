"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { translate } from "@/lib/i18n/translate";
import { commitPageE, heroStepProgress, readHeroForEditing } from "@/lib/builder/guided-flow/hero-step";
import { HeroIntemporel } from "@/components/memorial/hero/HeroIntemporel";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./HeroRevealStep.module.css";

interface HeroRevealStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — PAGE A through PAGE D are
   * already guaranteed done by the time this renders (see
   * lib/builder/guided-flow/hero-step.ts's `needsPageE` and
   * app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** The Hero's current photo, already resolved server-side — the exact
   * `Media` this screen re-verifies against at Continue time (the same
   * discipline `HeroCropStep`/`commitPageD` already apply), plus a
   * short-lived signed URL to actually display it. */
  photo: { media: Media; readUrl: string };
  /** `memorials.skin_variant` as currently persisted (Mission 029B: set
   * once, unconditionally, at redemption — `"light"` today for every
   * real memorial). This is only ever the STARTING point for the
   * family's local preview toggle below, never re-read while this
   * screen is mounted. */
  initialSkinVariant: SkinVariant;
  /** A bound Server Action — same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
  /** A bound Server Action (app/builder/[memorialId]/hero-reveal-actions.ts)
   * — the ONLY write onto `memorials.skin_variant` this screen ever
   * makes, and only at the Continue click (never on every toggle press —
   * see this component's own docstring, "Preview vs. confirmation"). */
  saveSkinVariant: (skinVariant: string) => Promise<void>;
}

/**
 * Mission 035 — PAGE E: T08, the Hero's first real reveal.
 *
 * "Ce n'est ni un formulaire, ni une card, ni une miniature. C'est la
 * première récompense émotionnelle du parcours." (mission brief section
 * 15). This screen still uses `BuilderScreen` for the surrounding
 * Builder chrome (logo, progress bar — always light, mission brief
 * section 15: "le chrome du Builder autour reste clair"), but everything
 * inside is the REAL `HeroIntemporel` renderer — the same one a future
 * Live Preview and the published memorial page will use, never a
 * miniature or a mock built specially for this screen (mission brief
 * section 3).
 *
 * ## Preview vs. confirmation (mission brief section 16-17)
 *
 * `previewVariant` is local React state ONLY — it starts at
 * `initialSkinVariant` and toggling it never calls `saveSkinVariant` or
 * `persist`; it is gone the moment this component unmounts (a refresh,
 * a navigation away). The family can flip between "Voir en version
 * sombre"/"Voir en version claire" freely, as many times as they like,
 * with nothing durable happening at all. Only the explicit "Continuer
 * avec cette ambiance" click writes anything.
 *
 * ## The durable ordering (mission brief section 17 — QG-locked)
 *
 * `handleSubmit` performs the three writes in the exact required order,
 * each one gating the next:
 *
 *   1. `saveSkinVariant(previewVariant)` — persists `memorials.skin_variant`.
 *      If this rejects, nothing else runs: T08 stays incomplete, and the
 *      family sees the same generic error every other Guided Flow step
 *      uses on a failed save.
 *   2. `commitPageE(content, photo.media)` — the pure, I/O-free content
 *      write, re-verifying (exactly like `commitPageD`) that the photo
 *      is STILL a real, ready, hero-purpose media before marking T08
 *      completed at all.
 *   3. `persist(committed.content)` — the actual durable write of that
 *      `StepRecord`. If THIS rejects — `skin_variant` already durable,
 *      but T08's own record failed to save — T08 is still incomplete:
 *      the family stays on this exact screen, and clicking Continue
 *      again simply retries step 1 (idempotent: re-writing the same
 *      `skin_variant` is a no-op) and then step 2-3 again — a safe,
 *      idempotent resume with no special-cased recovery path needed.
 *
 * Never uses `useAutosave`: unlike PAGE D's crop, there is no
 * continuously-edited field here that needs debouncing — only one
 * discrete, all-or-nothing action.
 */
export function HeroRevealStep({
  language,
  editorialContext,
  content,
  photo,
  initialSkinVariant,
  persist,
  saveSkinVariant,
}: HeroRevealStepProps) {
  const router = useRouter();

  const [previewVariant, setPreviewVariant] = useState<SkinVariant>(initialSkinVariant);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const read = readHeroForEditing(content);

  if (read.status !== "ready" || read.hero.photo === null) {
    return (
      <BuilderScreen progress={0}>
        <p role="alert" className={styles.error}>
          {translate(language, "hero.dataUnavailable")}
        </p>
      </BuilderScreen>
    );
  }

  const progress = heroStepProgress(editorialContext, content, read.hero);

  function togglePreview() {
    setPreviewVariant((current) => (current === "light" ? "dark" : "light"));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(false);
    setIsSubmitting(true);

    try {
      // Step 1 — durable FIRST. A rejection here leaves T08 incomplete;
      // nothing below ever runs.
      await saveSkinVariant(previewVariant);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    // Step 2 — the pure content half, only attempted once step 1 has
    // actually succeeded.
    const committed = commitPageE(content, photo.media);
    if (!committed.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 3 — T08's own StepRecord becomes durable only here.
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
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "hero.revealTitle")}</h1>
      </div>

      <div className={styles.stage}>
        <HeroIntemporel
          hero={read.hero}
          photo={photo}
          skinVariant={previewVariant}
          language={language}
        />
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <button
          type="button"
          className={styles.toggle}
          disabled={isSubmitting}
          onClick={togglePreview}
        >
          {translate(
            language,
            previewVariant === "light" ? "hero.revealToggleToDark" : "hero.revealToggleToLight",
          )}
        </button>

        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {translate(language, "hero.revealConfirm")}
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
