"use client";

import type { CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { readPersonWords } from "@/lib/memorial/person-words";
import { readLovedThings } from "@/lib/memorial/loved-things";
import { readLegacy } from "@/lib/memorial/legacy";
import { presentLifeStoryMatterIds } from "@/lib/memorial/life-story-section";
import { translate } from "@/lib/i18n/translate";
import { SkinScope } from "@/components/memorial/SkinScope";
import { ebGaramond, ebGaramondItalic } from "@/components/builder/fonts";
import {
  RECIT_DE_VIE_INTEMPOREL_SCENE_SRC,
  RECIT_DE_VIE_INTEMPOREL_ICON_SRC,
  RECIT_DE_VIE_INTEMPOREL_INK,
  RECIT_DE_VIE_LABEL_KEY,
  type LifeStoryMatterId,
} from "@/config/recit-de-vie-intemporel-tokens";
import styles from "./RecitDeVieIntemporel.module.css";

/**
 * Récit de vie ("Life Story") Intemporel — the real Memorial renderer for
 * A10 ("Quelques mots sur la personne"), A11 ("Ce qu'elle aimait") and
 * A12 ("Ce qu'elle laisse derrière elle"), Studio pack
 * `RECIT_DE_VIE_STUDIO_RUNTIME_V1_3_1` (QG GREEN pour intégration
 * runtime — see `config/recit-de-vie-intemporel-tokens.ts`'s own
 * docstring for the full architecture reasoning this component
 * implements).
 *
 * ## ART Studio locked + runtime data — never a mixed layer
 *
 * The three Studio assets (`scene-top`/`body-field`/`scene-bottom`) carry
 * no baked text, label, icon, or rail (V1.3.1's own correction over
 * V1.2/earlier drafts) — every one of those is rendered here, in HTML/
 * CSS, over the Studio pixels. No decorative element (paper, botanicals,
 * seal, sprig) is ever reconstructed in code; no runtime text is ever
 * baked into an asset.
 *
 * ## Presence — the seven valid states, never an eighth
 *
 * `presentLifeStoryMatterIds` (lib/memorial/life-story-section.ts) is the
 * ONE place that decides which of A10/A11/A12 are present, always in
 * canonical order. This component renders `null` outright when that list
 * is empty (contract: "If all matters absent, do not render the
 * section") — a future Memorial assembly page still decides WHETHER to
 * mount this component at all via `isLifeStorySectionActive`, but this
 * component's own job is to never render empty chrome either way.
 *
 * A matter that is absent removes its label, its icon, and its text
 * together — never a phantom slot. The rail between two matters exists
 * only between two matters that are BOTH present (rendered as a
 * `:not(:last-child)::before` CSS timeline segment — see the module
 * stylesheet's own docstring for why this needs no JS measurement at
 * all); the last present matter never has an outgoing rail.
 *
 * ## Family text — verbatim, never touched
 *
 * `text` comes straight from `readPersonWords`/`readLovedThings`/
 * `readLegacy` — the same fail-safe reads every other renderer in this
 * codebase uses (never throws on corrupted content). Rendered exactly as
 * stored, one `<p>` per literal newline the family typed, never
 * summarized, translated, or reformulated (V1.3.1 doctrine: "La famille
 * raconte ; HERITAGE met en forme.").
 *
 * ## Typography — EB Garamond, V1.3.1 lock
 *
 * Title and structural labels: `EB_Garamond` Regular 400 +
 * `font-variant-caps: small-caps` (the OpenType `smcp` feature this same
 * family already exposes — see `components/builder/fonts.ts`'s own
 * `ebGaramond` docstring for why a separate "EB Garamond SC" resource is
 * neither obtainable nor required). Family text: the same `EB_Garamond`
 * Regular 400, no caps variant. Microcopy ("Des souvenirs qui restent.")
 * is the one role that needs a genuinely different font FILE — the
 * italic cut — loaded via this file's own `ebGaramondItalic` export
 * (`components/builder/fonts.ts`), never a synthetic CSS oblique slant
 * applied to the upright face.
 */
export interface RecitDeVieIntemporelProps {
  content: MemorialContent;
  language: Language;
  skinVariant: SkinVariant;
}

const MATTER_TEXT_READERS: Record<LifeStoryMatterId, (content: MemorialContent) => string | null> = {
  A10: (content) => readPersonWords(content).text,
  A11: (content) => readLovedThings(content).text,
  A12: (content) => readLegacy(content).text,
};

/** `execution-contract.json`'s mobile `minimum_gap_after_last_matter_px_
 * by_count_at_430` has one value per present-matter count — a plain
 * class-per-count map (rather than a dynamic `styles[...]` template
 * lookup) keeps every class name statically greppable in the module
 * stylesheet. */
const CLOSURE_GAP_MOBILE_CLASS: Record<1 | 2 | 3, string> = {
  1: styles.closureGapMobile1,
  2: styles.closureGapMobile2,
  3: styles.closureGapMobile3,
};

export function RecitDeVieIntemporel({ content, language, skinVariant }: RecitDeVieIntemporelProps) {
  const presentIds = presentLifeStoryMatterIds(content);
  if (presentIds.length === 0) return null;

  const count = presentIds.length as 1 | 2 | 3;
  const scenes = RECIT_DE_VIE_INTEMPOREL_SCENE_SRC[skinVariant];
  const icons = RECIT_DE_VIE_INTEMPOREL_ICON_SRC[skinVariant];
  const ink = RECIT_DE_VIE_INTEMPOREL_INK[skinVariant];

  const vars = {
    "--recit-background": ink.background,
    "--recit-title": ink.title,
    "--recit-label": ink.label,
    "--recit-family-text": ink.familyText,
    "--recit-rail": ink.rail,
    "--recit-microcopy": ink.microcopy,
    "--recit-body-bg-desktop": `url(${scenes.desktopBodyField})`,
    "--recit-body-bg-mobile": `url(${scenes.mobileBodyField})`,
  } as CSSProperties;

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div
        className={`${styles.wrap} ${ebGaramond.variable} ${ebGaramondItalic.variable}`}
        style={vars}
        data-testid="recit-de-vie-intemporel"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scenes.desktopSceneTop} alt="" aria-hidden="true" className={`${styles.sceneTop} ${styles.desktopOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scenes.mobileSceneTop} alt="" aria-hidden="true" className={`${styles.sceneTop} ${styles.mobileOnly}`} />

        <h2 className={`${styles.title} ${ebGaramond.className}`}>{translate(language, "recit.title")}</h2>

        <div className={styles.body}>
          <ol className={styles.matterList}>
            {presentIds.map((id) => {
              const text = MATTER_TEXT_READERS[id](content) ?? "";
              const lines = text.split(/\n+/).filter((line) => line.trim() !== "");
              return (
                <li key={id} className={styles.matter} data-matter={id}>
                  <div className={styles.railColumn}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={icons[id]} alt="" aria-hidden="true" className={styles.icon} />
                  </div>
                  <div className={styles.textColumn}>
                    <p className={`${styles.label} ${ebGaramond.className}`}>
                      {translate(language, RECIT_DE_VIE_LABEL_KEY[id])}
                    </p>
                    <div className={`${styles.familyText} ${ebGaramond.className}`}>
                      {lines.map((line, index) => (
                        <p key={index} className={styles.familyTextLine}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className={`${styles.closureWrap} ${CLOSURE_GAP_MOBILE_CLASS[count]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scenes.desktopSceneBottom} alt="" aria-hidden="true" className={`${styles.sceneBottom} ${styles.desktopOnly}`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scenes.mobileSceneBottom} alt="" aria-hidden="true" className={`${styles.sceneBottom} ${styles.mobileOnly}`} />
          <p className={`${styles.microcopy} ${ebGaramondItalic.className}`}>
            {translate(language, "recit.decorativeMemories")}
          </p>
        </div>
      </div>
    </SkinScope>
  );
}
