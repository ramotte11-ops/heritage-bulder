"use client";

import type { CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { readPersonWords } from "@/lib/memorial/person-words";
import { readLovedThings } from "@/lib/memorial/loved-things";
import { readLegacy } from "@/lib/memorial/legacy";
import { translate } from "@/lib/i18n/translate";
import { SkinScope } from "@/components/memorial/SkinScope";
import { STORY_INTEMPOREL_ASSET_SRC, STORY_INTEMPOREL_INK, STORY_INTEMPOREL_MATTERS } from "@/config/story-intemporel-tokens";
import { ebGaramond } from "@/components/builder/fonts";
import styles from "./StoryIntemporel.module.css";

/**
 * "Récit de vie" — the real Memorial Stage renderer composing A10
 * (`content.personWords.text`), A11 (`content.lovedThings.text`) and A12
 * (`content.legacy.text`) into one editorial piece, Intemporel skin,
 * Studio pack `RECIT_DE_VIE_STUDIO_RUNTIME_V1_1` (QG-declared GREEN/
 * CANONIQUE). Mirrors `CeremonyIntemporel.tsx`'s own doctrine (renders
 * the real Memorial Stage, not a Builder card; reads the whole
 * `MemorialContent` fail-safe rather than a pre-validated shape; carries
 * no width/background/padding of its own beyond `max-width`, so it
 * renders identically wherever it is mounted) but NOT its geometry
 * technique — see `config/story-intemporel-tokens.ts`'s own docstring
 * for exactly why this package's `FRAME_TOP + FLOW_BODY + FRAME_BOTTOM`
 * architecture needs no fixed-canvas percentage-box positioning at all:
 * two non-repeating decorative image layers pinned to the section's own
 * four corners (`position: absolute`, `top:0`/`bottom:0`), a single
 * seamless CSS tile as the ONLY repeating raster, and everything else —
 * title, icons, labels, the family's own text — in ordinary responsive
 * document flow, so the section's total height is simply however tall
 * that flow content is (`height: auto`, never a JS shrink-to-fit).
 *
 * ## Fail-safe on corrupted content — never crashes
 *
 * `readPersonWords`/`readLovedThings`/`readLegacy` each collapse their
 * own corrupted content key to `{ text: null }` rather than throwing
 * (same fail-safe discipline `readCeremony` already gives
 * `CeremonyIntemporel`). A future composing page decides WHETHER to
 * mount this component at all (`lib/memorial/story-section.ts`'s
 * `isStorySectionActive`, itself reusing the generic
 * `explicitContentSectionIds` signal through `section-selection.ts` —
 * never duplicated here); this component's own job, once mounted, is to
 * never crash on whatever the three matières actually contain.
 *
 * ## Zero matières present -> renders nothing at all
 *
 * Mirrors `spec/absence-rules.json`'s own final rule verbatim: "If all
 * three are absent, the entire Récit de vie section does not render" —
 * never an empty shell, never a lone title with nothing under it. A
 * caller does not need to check this itself (though
 * `isStorySectionActive` above already would tell it the same thing);
 * this component is safe to mount unconditionally and simply renders
 * `null` when there is nothing to show.
 *
 * ## Per-matière absence — the label/icon/text/rail segment vanish
 * together, never a reserved gap
 *
 * `STORY_INTEMPOREL_MATTERS` (A10 -> A11 -> A12, the package's own
 * canonical `order`) is filtered down to the matières that actually have
 * text BEFORE anything renders — an absent matière contributes nothing
 * to the DOM at all, so "seulement A11", "A10+A12", etc. all fall out of
 * the same one map over the already-filtered list, no per-combination
 * branch. The connecting rail is drawn unconditionally inside every
 * present matière's own icon column and hidden by CSS `:last-child` —
 * the last PRESENT one, whichever A-number it actually is, since an
 * absent matière was never given a DOM node to be `:last-child` of
 * (`spec/absence-rules.json`: "The last present matter has no outgoing
 * rail segment").
 *
 * ## Family text — verbatim, `white-space: pre-wrap`, never re-split
 *
 * The family's own paragraph breaks (if any) are whatever whitespace
 * they typed — this component never parses, re-flows, or invents
 * paragraph boundaries; `white-space: pre-wrap` (module stylesheet) is
 * the one CSS rule that preserves them exactly. No summary, no
 * reformulation, no generated transition, no deduced title (mission
 * doctrine: "la famille raconte ; HERITAGE met en forme").
 *
 * ## Assumptions flagged to QG (no spec value existed for either)
 *
 *  - **Typography**: the package names no font. Reuses `ebGaramond`
 *    (`components/builder/fonts.ts`), the Intemporel skin's own already-
 *    integrated serif for the closest sibling section (Ceremony).
 *  - **Ink colors**: the package ships no color-token file. Sampled by
 *    pixel histogram from the package's own
 *    `qa/desktop/desktop-{light,dark}-3-matieres.png` proofs — see
 *    `config/story-intemporel-tokens.ts`.
 *  - **Decorative corner placement**: `spec/geometry.json` gives exact
 *    pixel geometry for the CONTENT column only, not for where the
 *    botanical/seal/sprig/note decor sits — those are positioned here by
 *    visual proportion match against the package's own QA renders, meant
 *    to be checked against the QG Runtime Demo, not read off a spec
 *    number that does not exist.
 */
export interface StoryIntemporelProps {
  content: MemorialContent;
  language: Language;
  skinVariant: SkinVariant;
}

export function StoryIntemporel({ content, language, skinVariant }: StoryIntemporelProps) {
  const texts: Record<(typeof STORY_INTEMPOREL_MATTERS)[number]["id"], string | null> = {
    A10: readPersonWords(content).text,
    A11: readLovedThings(content).text,
    A12: readLegacy(content).text,
  };

  const present = STORY_INTEMPOREL_MATTERS.filter((matter) => texts[matter.id] !== null);
  if (present.length === 0) return null;

  const assets = STORY_INTEMPOREL_ASSET_SRC[skinVariant];
  const ink = STORY_INTEMPOREL_INK[skinVariant];
  const inkVars = {
    "--story-ink-primary": ink.textPrimary,
    "--story-ink-secondary": ink.textSecondary,
    backgroundImage: `url(${assets.bodyTile})`,
  } as CSSProperties;

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.wrap} ${ebGaramond.variable}`} style={inkVars} data-testid="story-intemporel">
        {/* Decor layer — FRAME TOP / FRAME BOTTOM, non-repeating, pinned
            to the section's own corners so it always tracks the real
            content height (`growth.bottom_anchor`: "after last present
            matter"). Both breakpoint variants render; CSS switches which
            is visible (same "one DOM, CSS-selected" convention every
            other Intemporel renderer already uses). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.botanicalDesktopLeft} alt="" aria-hidden="true" className={`${styles.decorTopLeft} ${styles.desktopOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.botanicalMobileTop} alt="" aria-hidden="true" className={`${styles.decorTopMobile} ${styles.mobileOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.botanicalDesktopRight} alt="" aria-hidden="true" className={`${styles.decorBottomRight} ${styles.desktopOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.botanicalMobileBottom} alt="" aria-hidden="true" className={`${styles.decorBottomMobile} ${styles.mobileOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.seal} alt="" aria-hidden="true" className={`${styles.seal} ${styles.desktopOnly}`} />

        {/* Content layer — normal document flow, determines the
            section's own natural (unbounded) height. */}
        <div className={styles.content}>
          <div className={styles.headerRow}>
            <h2 className={`${styles.title} ${ebGaramond.className}`}>{translate(language, "story.title")}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assets.sprig} alt="" aria-hidden="true" className={styles.sprig} />
          </div>

          <div className={styles.matters}>
            {present.map((matter) => (
              <div className={styles.matter} key={matter.id}>
                <div className={styles.matterRow}>
                  <div className={styles.iconCol}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assets[matter.iconKey]} alt="" aria-hidden="true" className={styles.icon} />
                    <div className={styles.rail} aria-hidden="true" />
                  </div>
                  <div className={styles.textCol}>
                    <p className={`${styles.label} ${ebGaramond.className}`}>{translate(language, matter.labelKey)}</p>
                    <div className={`${styles.familyText} ${ebGaramond.className}`}>{texts[matter.id]}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.editorialNote}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assets.editorialNote} alt="" aria-hidden="true" className={styles.editorialNoteImg} />
            <p className={`${styles.editorialNoteText} ${ebGaramond.className}`}>
              {translate(language, "story.decorativeMemories")}
            </p>
          </div>
        </div>
      </div>
    </SkinScope>
  );
}
