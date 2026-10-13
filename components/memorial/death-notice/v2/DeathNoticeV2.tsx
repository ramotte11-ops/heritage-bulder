"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { HeroContent } from "@/types/hero";
import type { DeathNoticeContent } from "@/types/death-notice";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { formatHeroDateRange } from "@/lib/memorial/format-hero-date";
import { DEATH_NOTICE_V2_TOKENS, type DeathNoticeV2MobileTokens } from "@/config/death-notice-v2-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { avisNameSerif, ebGaramond, ebGaramondItalic } from "@/components/builder/fonts";
import { Branch, Heart, Medallion } from "./DeathNoticeV2Ornaments";
import styles from "./DeathNoticeV2.module.css";

/**
 * Avis de décès V2 — pilote Mobile Light (phases 1 et 2, GO QG). Non branché
 * sur le registre de production : `DeathNoticeIntemporel` (V1) reste le
 * renderer de la section `deathNotice`.
 *
 * Même contrat de props que la V1, même source de données : nom et dates
 * du Hero (`formatHeroDateRange`), annonce et cinq précisions de l'Avis,
 * titre et étiquettes par i18n. Les textes de la famille sont rendus tels
 * quels — aucun guillemet ajouté (décision PO) ; une précision absente
 * disparaît sans laisser de place.
 *
 * Moteur du Récit de vie V2 (`RecitDeVieV2`) : le Master entier à son
 * ratio, le bas authentique ancré en bas de section, et, quand le contenu
 * dépasse la hauteur du Master, une surface de papier CSS ouverte à la
 * ligne de coupe, de la hauteur exacte de l'excédent (mesurée par un
 * ResizeObserver — la seule mesure JavaScript, purement décorative). Toute
 * géométrie est en px de canevas rapportés à la largeur réelle du
 * conteneur (cqw) ; les textes ont un plancher en px CSS lisibles.
 *
 * Ornements (phase 2) : médaillons, rameau, cœur et filets reconstruits
 * d'après la maquette (DeathNoticeV2Ornaments.tsx), tous `aria-hidden`.
 * Chaque médaillon appartient à son bloc de précision ; chaque séparateur
 * de rangée n'existe qu'entre deux rangées réellement rendues.
 */

export interface DeathNoticeV2Props {
  hero: HeroContent;
  deathNotice: DeathNoticeContent;
  language: Language;
  skinVariant: SkinVariant;
  /** Comme la V1 : `"page"` → titre `<h1>`, nom `<h2>` ; `"section"` →
   * titre `<h2>`, nom `<h3>`. */
  headingLevel?: "page" | "section";
}

const PRECISION_BLOCKS: readonly {
  field: DeathNoticePrecisionField;
  labelKey: TranslationKey;
  italic: boolean;
}[] = [
  { field: "generalLocation", labelKey: "deathNotice.blockLocation", italic: false },
  { field: "familyMessage", labelKey: "deathNotice.blockFamilyMessage", italic: true },
  { field: "thought", labelKey: "deathNotice.blockThought", italic: true },
  { field: "quote", labelKey: "deathNotice.blockQuote", italic: true },
  { field: "other", labelKey: "deathNotice.blockOther", italic: false },
];

const COARSE_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='3' stitchTiles='stitch' seed='11'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0' intercept='.22'/></feComponentTransfer></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

function mobileVars(T: DeathNoticeV2MobileTokens): CSSProperties {
  return {
    "--m-src": `url(${T.masterSrc})`,
    "--paper-images": [...T.paperGrains.map((g) => `url(${g.src})`), COARSE_NOISE, `url(${T.paperTone})`].join(", "),
    "--paper-sizes": [...T.paperGrains.map((g) => `calc(var(--px) * ${g.tileWidth}) auto`), "calc(var(--px) * 900) auto", "100% 100%"].join(", "),
    "--paper-repeat": [...T.paperGrains.map(() => "repeat"), "repeat", "no-repeat"].join(", "),
    "--paper-blend": [...T.paperGrains.map((g) => g.blend), T.noiseBlend, "normal"].join(", "),
    "--canvas-w": T.canvas.width,
    "--canvas-h": T.canvas.height,
    "--cut": T.cutY,
    "--fade": T.fadePx,
    "--text-top": T.textTopCanvas,
    "--foot": T.footCanvas,
    "--foot-pair": T.footPairCanvas,
    "--pair-right": T.pairRightCanvas,
    "--foot-single-column": T.footSingleColumnCanvas,
    "--band-left": T.singleColumnBandLeftCanvas,
    "--band-right": T.singleColumnBandRightCanvas,
    "--text-left": T.textLeftCanvas,
    "--text-right": T.textRightCanvas,
    "--ink": T.ink,
    "--ink-soft": T.inkSoft,
    "--label": T.label,
    "--accent": T.accent,
    "--rule": T.rule,
  } as CSSProperties;
}

/**
 * La chaîne de `formatHeroDateRange`, telle quelle, mais chaque date reste
 * d'un seul tenant tant qu'elle tient sur la ligne : sur une ligne trop
 * étroite, la coupure se fait APRÈS le tiret (« 12 septembre 1938 – » /
 * « 3 mars 2026 »), jamais avant.
 */
function renderDateRange(text: string) {
  const separator = " – ";
  const at = text.indexOf(separator);
  if (at === -1) return <span className={styles.dateUnit}>{text}</span>;
  return (
    <>
      <span className={styles.dateUnit}>{`${text.slice(0, at)} –`}</span>{" "}
      <span className={styles.dateUnit}>{text.slice(at + separator.length)}</span>
    </>
  );
}

export function DeathNoticeV2({ skinVariant, ...props }: DeathNoticeV2Props) {
  const tokens = DEATH_NOTICE_V2_TOKENS[skinVariant];
  // Phase 1 : seule la variante Light existe. Aucune variante ne se rabat
  // sur une autre : sans réglages, rien n'est rendu.
  if (tokens === null) return null;
  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <DeathNoticeV2Layout {...props} tokens={tokens.mobile} />
    </SkinScope>
  );
}

function DeathNoticeV2Layout({
  hero,
  deathNotice,
  language,
  headingLevel = "page",
  tokens: T,
}: Omit<DeathNoticeV2Props, "skinVariant"> & { tokens: DeathNoticeV2MobileTokens }) {
  const TitleTag = headingLevel === "section" ? "h2" : "h1";
  const NameTag = headingLevel === "section" ? "h3" : "h2";

  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);
  const blocks = PRECISION_BLOCKS.filter((block) => deathNotice.precisions[block.field] !== null).map((block) => ({
    ...block,
    text: deathNotice.precisions[block.field] as string,
  }));
  const oddTotal = blocks.length % 2 === 1;

  const sectionRef = useRef<HTMLElement | null>(null);
  const [extension, setExtension] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;
    const measure = () => {
      const { width, height } = section.getBoundingClientRect();
      const masterHeight = (width * T.canvas.height) / T.canvas.width;
      setExtension(Math.max(0, Math.round((height - masterHeight) * 10) / 10));
    };
    measure();
    // Sans ResizeObserver (tests), une mesure unique suffit : le décor
    // n'est jamais nécessaire à la lecture.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, [T]);

  return (
    <div
      className={`${styles.wrap} ${avisNameSerif.variable} ${ebGaramond.variable} ${ebGaramondItalic.variable}`}
      style={mobileVars(T)}
    >
      <section
        ref={sectionRef}
        className={styles.section}
        data-testid="death-notice-v2"
        data-extended={extension > 0.5}
        style={{ "--ext": `${extension}px`, "--single-below": `${T.singleColumnBelowPx}px` } as CSSProperties}
      >
        <div className={styles.master} aria-hidden="true" />
        <div className={styles.bottom} aria-hidden="true" />
        {extension > 0.5 && <div className={styles.paper} aria-hidden="true" />}

        <div className={styles.content} data-last-row={blocks.length === 0 ? "none" : oddTotal ? "single" : "pair"}>
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <span className={styles.titleRule} aria-hidden="true" />
              <TitleTag className={styles.title}>{translate(language, "deathNotice.previewTitle")}</TitleTag>
              <span className={styles.titleRule} aria-hidden="true" />
            </div>

            <Branch />

            <NameTag className={styles.name}>{hero.displayName ?? ""}</NameTag>
            {dateRangeText !== null && <p className={styles.dates}>{renderDateRange(dateRangeText)}</p>}

            <div className={styles.heartRow} aria-hidden="true">
              <span className={styles.heartRule} />
              <Heart />
              <span className={styles.heartRule} />
            </div>

            {deathNotice.announcementText !== null && (
              <p className={styles.announcement}>{deathNotice.announcementText}</p>
            )}
          </header>

          {blocks.length > 0 && (
            <>
              <span className={styles.detailsRule} aria-hidden="true" />
              <div className={styles.details} data-count={blocks.length}>
                {blocks.map((block, index) => {
                  const isFull = oddTotal && index === blocks.length - 1;
                  const row = Math.floor(index / 2);
                  return (
                    <Fragment key={block.field}>
                      {/* Séparateur de rangée (deux colonnes) : seulement entre
                          deux rangées réellement rendues ; plus court avant le
                          bloc final centré, comme dans la maquette. */}
                      {index > 0 && index % 2 === 0 && (
                        <span
                          className={`${styles.rowRule} ${isFull ? styles.rowRuleShort : ""}`}
                          data-row-rule=""
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`${styles.block} ${isFull ? styles.blockFull : ""}`}
                        data-field={block.field}
                        data-col={isFull ? "full" : index % 2 === 0 ? "left" : "right"}
                        data-row={row}
                      >
                        <Medallion field={block.field} />
                        <div className={styles.blockText}>
                          <span className={styles.label}>{translate(language, block.labelKey)}</span>
                          <span className={styles.labelRule} aria-hidden="true" />
                          <p className={`${styles.body} ${block.italic ? styles.bodyItalic : ""}`}>{block.text}</p>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
