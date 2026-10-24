"use client";

import { useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { translate } from "@/lib/i18n/translate";
import { commitPageE, heroStepProgress, readHeroForEditing } from "@/lib/builder/guided-flow/hero-step";
import { HeroIntemporel } from "@/components/memorial/hero/HeroIntemporel";
import { BuilderScreen } from "./BuilderScreen";
import { BuilderScreenNav } from "./journey/BuilderScreenNav";
import { inter, playfairDisplay } from "./fonts";
import { ProgressBar } from "./ProgressBar";
import { PrimaryButton } from "./PrimaryButton";
import styles from "./HeroRevealStep.module.css";
import {
  useDraftRevisionCoordinator,
  useRevisionedDraftPersist,
  type ConfigurationSaveResponse,
  type DraftSaveTransport,
} from "@/lib/builder/draft-revision";

interface HeroRevealStepProps {
  language: Language;
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
   * family's local ambiance selector below, never re-read while this
   * screen is mounted. */
  initialSkinVariant: SkinVariant;
  /** A bound Server Action — same seam every Guided Flow screen uses. */
  persist: DraftSaveTransport;
  /** A bound Server Action (app/builder/[memorialId]/hero-reveal-actions.ts)
   * — the ONLY write onto `memorials.skin_variant` this screen ever
   * makes, and only at the Continue click (never on every selector change —
   * see this component's own docstring, "Preview vs. confirmation"). */
  saveSkinVariant: (skinVariant: string) => Promise<ConfigurationSaveResponse | void>;
}

/**
 * Mission 035 — PAGE E: T08, the Hero's first real reveal.
 *
 * "Ce n'est ni un formulaire, ni une card, ni une miniature. C'est la
 * première récompense émotionnelle du parcours." (mission brief section
 * 15). Everything below the slim Builder bar is the REAL `HeroIntemporel`
 * renderer — the same one a future Live Preview and the published
 * memorial page will use, never a miniature or a mock built specially
 * for this screen (mission brief section 3).
 *
 * ## QG Hero Runtime Fidelity mini-mission — `BuilderScreen` dropped for
 * the real Hero (post-Mission-035 correction)
 *
 * This screen originally wrapped `HeroIntemporel` in `BuilderScreen`,
 * whose own `.frame` caps at 600px desktop / 335px mobile
 * (BuilderScreen.module.css) — the right width for T01-T07's narrow
 * forms, but never meant to also bound the Hero's own immersive
 * composition. A forensic audit (QG, pre-Mission-040) traced the
 * "carte/timbre centrée" effect visible on `/builder/demo` straight to
 * this: `HeroIntemporel` itself carries no `max-width` of its own
 * (HeroIntemporel.module.css) and would gladly render at its master's
 * native size (1536×1024 desktop, 941×1672 mobile) — `.frame` was the
 * only thing shrinking it.
 *
 * `DeathNoticePreviewStep.tsx` (A03) had already hit, and fixed, the
 * exact same defect in Mission 039B — its own docstring documents the
 * PO's "card inside a card" rejection of wrapping `DeathNoticeIntemporel`
 * in `BuilderScreen`. This screen now follows that SAME principle, one
 * level down: a plain `<main>` with its own slim `.builderBar` (progress
 * + title) and `.builderControls` (CTA) — each independently
 * capped at a modest reading width (28rem, A03's own convention for a
 * Builder-only strip) — bracketing the Hero, which sits in `.stage` at
 * its own `max-width: 1536px` (the desktop master's own native width,
 * chosen from the Hero masters themselves per this mini-mission's brief
 * — never A03's 841px/1672px, which belong to a differently-sized
 * Studio pack). Below that cap the Hero renders at a genuinely
 * generous, near-viewport width on both desktop and mobile (no more
 * 335px mobile ceiling); above it, the desktop master is capped at its
 * own native resolution rather than upscaled.
 *
 * `BuilderScreen` is kept for exactly one case below — no real Hero to
 * show at all (`read.status !== "ready"`) — the same "keep the chrome
 * only where there is no real Memorial to render" split A03 already
 * uses for its own corrupted/unavailable states.
 *

 * ## Correction Light / Dark — the choice above the Hero, and the way back
 *
 * Production showed the family could not find the ambiance: a small
 * underlined link UNDER the Hero (itself close to full-viewport, taller
 * than the screen on mobile), and no « Mon parcours » on this screen. The
 * choice is now a labelled two-option selector (« Ambiance de votre
 * hommage » — Claire / Sombre) in the Builder strip ABOVE the Hero, and
 * the strip carries `BuilderScreenNav` like every other screen: « Mon
 * parcours » and, when T08 is reopened for revision, the way back to
 * where the family stopped. Builder chrome only — the Hero, its Masters
 * and its composition are untouched; the semantics below are unchanged.
 *
 * ## Preview vs. confirmation (mission brief section 16-17)
 *
 * `previewVariant` is local React state ONLY — it starts at
 * `initialSkinVariant` and changing it never calls `saveSkinVariant` or
 * `persist`; it is gone the moment this component unmounts (a refresh,
 * a navigation away). The family can switch between « Claire » and
 * « Sombre » freely, as many times as they like, and the Hero follows at
 * once, with nothing durable happening at all. Only the explicit "Continuer
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
  content,
  photo,
  initialSkinVariant,
  persist,
  saveSkinVariant,
}: HeroRevealStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const draftRevision = useDraftRevisionCoordinator();
  const stepDone = useStepDone();

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

  const progress = heroStepProgress(content, read.hero);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(false);
    setIsSubmitting(true);

    try {
      // Step 1 — durable FIRST. A rejection here leaves T08 incomplete;
      // nothing below ever runs.
      const result = await saveSkinVariant(previewVariant);
      if (result?.status === "conflict") {
        draftRevision?.reportConflict(content, { content, skinVariant: previewVariant });
        setSubmitError(true);
        setIsSubmitting(false);
        return;
      }
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
      await saveDraft(committed.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    stepDone();
  }

  return (
    <main className={styles.page}>
      <div className={styles.builderBar}>
        <ProgressBar value={progress} />
        <h1 className={styles.title}>{translate(language, "hero.revealTitle")}</h1>
        <div className={`${styles.builderTools} ${playfairDisplay.variable} ${inter.variable}`}>
          <BuilderScreenNav />
          <fieldset className={styles.ambiance} disabled={isSubmitting}>
            <legend className={styles.ambianceLegend}>{translate(language, "hero.ambianceLabel")}</legend>
            <div className={styles.ambianceOptions}>
              {(["light", "dark"] as const).map((variant) => (
                <label key={variant} className={styles.ambianceOption}>
                  <input
                    type="radio"
                    name="hero-ambiance"
                    value={variant}
                    className={styles.ambianceInput}
                    checked={previewVariant === variant}
                    onChange={() => setPreviewVariant(variant)}
                  />
                  <span className={styles.ambianceText}>
                    {translate(language, variant === "light" ? "hero.ambianceLight" : "hero.ambianceDark")}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className={styles.stage} data-hero-skin-variant={previewVariant}>
        <HeroIntemporel
          hero={read.hero}
          photo={photo}
          skinVariant={previewVariant}
          language={language}
        />
      </div>

      <form className={styles.builderControls} onSubmit={handleSubmit}>
        <div className={styles.ctaWrap}>
          <PrimaryButton
            type="submit"
            disabled={isSubmitting}
            pending={isSubmitting}
            pendingLabel={translate(language, "autosave.saving")}
          >
            {translate(language, "hero.revealConfirm")}
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
