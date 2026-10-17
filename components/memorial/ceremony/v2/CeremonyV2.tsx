"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { CeremonyContent } from "@/types/ceremony";
import { translate } from "@/lib/i18n/translate";
import { formatCeremonyDate } from "@/lib/memorial/format-ceremony-datetime";
import { CEREMONY_V2_TOKENS, type CeremonyV2MobileTokens } from "@/config/ceremony-v2-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { avisNameSerif, ebGaramond, ebGaramondItalic, laBelleAurore } from "@/components/builder/fonts";
import { ceremonyMapUrl, formatCeremonyClock } from "./format";
import { CalendarIcon, DeckleFilter, GatheringIcon, InfoIcon, LineHeart, OliveSprig, PinIcon } from "./CeremonyV2Ornaments";
import styles from "./CeremonyV2.module.css";

/**
 * Cérémonie Intemporel V2 — pilotes C1 Mobile Light (validé PO) et C2
 * Mobile Dark, GO QG. Un seul composant pour toutes les variantes : leurs
 * différences sont des réglages (`config/ceremony-v2-tokens.ts` : décor,
 * coupe, rameaux) et des blocs CSS de fin de fichier (`[data-variant]`).
 * Non branché sur le registre de production : page pilote seulement
 * (`/pilote/ceremonie-v2`).
 *
 * Données : `content.ceremony` tel quel (types/ceremony.ts), y compris le
 * déroulement `programme` (B1). Chaque cartouche n'existe que si l'un de
 * ses champs est renseigné — aucun emplacement fantôme :
 *   - « Date et heure » : `date` et/ou `time` ;
 *   - « Lieu de la cérémonie » : `venueName` et/ou `address` (le lien
 *     « Voir sur la carte » seulement avec une adresse) ;
 *   - « Le déroulement » : au moins un moment (sinon le cartouche et son
 *     médaillon disparaissent) ;
 *   - « Informations pratiques » : `access` et/ou `note`.
 * Les textes de la famille sont rendus tels quels, jamais traduits ni
 * tronqués ; les textes HERITAGE (surtitre, titre, introduction,
 * intitulés, lien, phrase du pied) sont traduits FR/EN/ES.
 *
 * Moteur de Traditions V2 : le Master entier à son ratio, le bas
 * authentique ancré en bas de section, et, quand le contenu dépasse la
 * hauteur du Master, une surface de papier CSS ouverte à la ligne de
 * coupe, de la hauteur exacte de l'excédent (mesurée par un
 * ResizeObserver — la seule mesure JavaScript, purement décorative).
 *
 * ## Les deux cartouches du haut sur petit écran (décision PO, C1)
 *
 * Le Master les place côte à côte. `topLayout="auto"` (règle validée par
 * la PO) les empile quand le conteneur fait moins de 430 px et les laisse
 * côte à côte à partir de 430 px (module CSS). `"pair"` et `"stack"`
 * forcent l'une ou l'autre composition (planches de comparaison du
 * pilote).
 */

export type CeremonyV2TopLayout = "auto" | "pair" | "stack";

export interface CeremonyV2Props {
  ceremony: CeremonyContent;
  language: Language;
  skinVariant: SkinVariant;
  /** `"page"` → titre `<h1>`, cartouches `<h2>` ; `"section"` → `<h2>`, `<h3>`. */
  headingLevel?: "page" | "section";
  topLayout?: CeremonyV2TopLayout;
}

const COARSE_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='3' stitchTiles='stitch' seed='11'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0' intercept='.22'/></feComponentTransfer></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

function mobileVars(T: CeremonyV2MobileTokens): CSSProperties {
  return {
    "--m-src": `url(${T.masterSrc})`,
    "--paper-images": [...T.paperGrains.map((g) => `url(${g.src})`), COARSE_NOISE, `url(${T.paperTone})`].join(", "),
    "--paper-sizes": [
      ...T.paperGrains.map((g) => `calc(var(--px) * ${g.tileWidth}) auto`),
      "calc(var(--px) * 900) auto",
      "100% 100%",
    ].join(", "),
    "--paper-repeat": [...T.paperGrains.map(() => "repeat"), "repeat", "no-repeat"].join(", "),
    "--paper-blend": [...T.paperGrains.map((g) => g.blend), T.noiseBlend, "normal"].join(", "),
    "--grain-images": T.paperGrains.map((g) => `url(${g.src})`).join(", "),
    "--grain-sizes": T.paperGrains.map((g) => `calc(var(--px) * ${g.tileWidth}) auto`).join(", "),
    "--edges-src": `url(${T.edgeStrip.src})`,
    "--edges-h": T.edgeStrip.heightCanvas,
    "--canvas-w": T.canvas.width,
    "--canvas-h": T.canvas.height,
    "--cut": T.cutY,
    "--fade": T.fadePx,
    "--text-top": T.textTopCanvas,
    "--foot": T.footCanvas,
    "--cards-left": T.cardsLeftCanvas,
    "--cards-right": T.cardsRightCanvas,
    "--axis": T.axisCanvas,
  } as CSSProperties;
}

export function CeremonyV2({ skinVariant, ...props }: CeremonyV2Props) {
  const tokens = CEREMONY_V2_TOKENS[skinVariant];
  // Une variante sans réglages ne se rabat jamais sur une autre.
  if (tokens === null) return null;
  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <CeremonyV2Layout {...props} variant={skinVariant} tokens={tokens.mobile} />
    </SkinScope>
  );
}

function CeremonyV2Layout({
  ceremony,
  language,
  headingLevel = "page",
  topLayout = "auto",
  variant,
  tokens: T,
}: Omit<CeremonyV2Props, "skinVariant"> & { variant: SkinVariant; tokens: CeremonyV2MobileTokens }) {
  const TitleTag = headingLevel === "section" ? "h2" : "h1";
  const CardTitleTag = headingLevel === "section" ? "h3" : "h2";
  const deckleId = `ceremony-deckle-${useId().replace(/:/g, "")}`;

  const sectionRef = useRef<HTMLElement | null>(null);
  const [extension, setExtension] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;
    const measure = () => {
      const { width, height } = section.getBoundingClientRect();
      const style = getComputedStyle(section);
      const canvasW = parseFloat(style.getPropertyValue("--canvas-w")) || T.canvas.width;
      const canvasH = parseFloat(style.getPropertyValue("--canvas-h")) || T.canvas.height;
      const masterHeight = (width * canvasH) / canvasW;
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

  const programme = ceremony.programme ?? [];
  const hasDateTime = ceremony.date !== null || ceremony.time !== null;
  const hasPlace = ceremony.venueName !== null || ceremony.address !== null;
  const hasPractical = ceremony.access !== null || ceremony.note !== null;
  const topCount = Number(hasDateTime) + Number(hasPlace);
  const timedProgramme = programme.some((moment) => moment.time !== null);

  return (
    <div
      className={`${styles.wrap} ${ebGaramond.variable} ${ebGaramondItalic.variable} ${avisNameSerif.variable} ${laBelleAurore.variable}`}
      style={mobileVars(T)}
      data-variant={variant}
      lang={language}
    >
      <section
        ref={sectionRef}
        className={styles.section}
        data-testid="ceremony-v2"
        data-extended={extension > 0.5}
        data-top-layout={topLayout}
        style={{ "--ext": `${extension}px`, "--deckle": `url(#${deckleId})` } as CSSProperties}
      >
        <DeckleFilter id={deckleId} />
        <div className={styles.master} aria-hidden="true" />
        <div className={styles.bottom} aria-hidden="true" />
        {extension > 0.5 && (
          <>
            <div className={styles.paper} aria-hidden="true" />
            <div className={styles.edges} aria-hidden="true" />
          </>
        )}

        <div className={styles.content}>
          <header className={styles.header}>
            <div className={styles.surtitleRow}>
              <span className={styles.surtitleRule} aria-hidden="true" />
              <p className={styles.surtitle}>{translate(language, "ceremony.v2.surtitle")}</p>
              <span className={styles.surtitleRule} aria-hidden="true" />
            </div>
            <TitleTag className={styles.title}>{translate(language, "ceremony.sectionTitle")}</TitleTag>
            <OliveSprig className={styles.titleSprig} shape={T.sprigShapes.title} tone={T.sprigTone} />
            <p className={styles.intro}>{translate(language, "ceremony.v2.intro")}</p>
          </header>

          <div className={styles.cards}>
            {topCount > 0 && (
              <div className={styles.topRow} data-count={topCount}>
                {hasDateTime && (
                  <article className={`${styles.card} ${styles.topCard}`} data-card="dateTime">
                    <span className={styles.cardPaper} aria-hidden="true" />
                    <span className={styles.medallion} aria-hidden="true" data-ornament="medaillon">
                      <CalendarIcon className={styles.medallionIcon} />
                    </span>
                    <CardTitleTag className={styles.cardLabel}>{translate(language, "ceremony.zoneDateTime")}</CardTitleTag>
                    <span className={styles.cardRule} aria-hidden="true" />
                    {ceremony.date !== null && (
                      <p className={styles.date}>
                        <time dateTime={ceremony.date}>{formatCeremonyDate(ceremony.date, language)}</time>
                      </p>
                    )}
                    {ceremony.time !== null && (
                      <p className={styles.time}>
                        <time dateTime={ceremony.time}>{formatCeremonyClock(ceremony.time, language)}</time>
                      </p>
                    )}
                    <OliveSprig className={styles.dateSprig} shape={T.sprigShapes.date} tone={T.sprigTone} />
                  </article>
                )}
                {hasPlace && (
                  <article className={`${styles.card} ${styles.topCard}`} data-card="place">
                    <span className={styles.cardPaper} aria-hidden="true" />
                    <span className={styles.medallion} aria-hidden="true" data-ornament="medaillon">
                      <PinIcon className={styles.medallionIcon} />
                    </span>
                    <CardTitleTag className={styles.cardLabel}>{translate(language, "ceremony.zonePlace")}</CardTitleTag>
                    <span className={styles.cardRule} aria-hidden="true" />
                    <div className={styles.placeBody}>
                      {ceremony.venueName !== null && <p className={styles.venue}>{ceremony.venueName}</p>}
                      {ceremony.address !== null && (
                        <>
                          <p className={styles.address}>{ceremony.address}</p>
                          <a
                            className={styles.mapLink}
                            href={ceremonyMapUrl(ceremony.venueName, ceremony.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span className={styles.mapLinkText}>{translate(language, "ceremony.v2.mapLink")}</span>
                            <svg className={styles.mapLinkArrow} viewBox="0 0 24 14" aria-hidden="true" focusable="false">
                              <path d="M1 7 H22 M16 1.5 L22.5 7 L16 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </a>
                        </>
                      )}
                    </div>
                  </article>
                )}
              </div>
            )}

            {programme.length > 0 && (
              <article className={`${styles.card} ${styles.rowCard}`} data-card="programme">
                <span className={styles.cardPaper} aria-hidden="true" />
                <span className={styles.medallion} aria-hidden="true" data-ornament="medaillon">
                  <GatheringIcon className={styles.medallionIconWide} />
                </span>
                <div className={styles.rowBody}>
                  <CardTitleTag className={styles.cardLabel}>{translate(language, "ceremony.v2.programme")}</CardTitleTag>
                  <span className={styles.cardRule} aria-hidden="true" />
                  <ol className={styles.timeline} data-timed={timedProgramme} data-count={programme.length}>
                    {programme.map((moment) => (
                      <li key={moment.id} className={styles.moment} data-moment={moment.id}>
                        <span className={styles.momentDot} aria-hidden="true" />
                        {timedProgramme && (
                          <span className={styles.momentTime}>
                            {moment.time !== null && <time dateTime={moment.time}>{formatCeremonyClock(moment.time, language)}</time>}
                          </span>
                        )}
                        <span className={styles.momentText}>
                          <span className={styles.momentLabel}>{moment.label}</span>
                          {moment.detail !== null && <span className={styles.momentDetail}>{moment.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            )}

            {hasPractical && (
              <article className={`${styles.card} ${styles.rowCard}`} data-card="practical">
                <span className={styles.cardPaper} aria-hidden="true" />
                <span className={styles.medallion} aria-hidden="true" data-ornament="medaillon">
                  <InfoIcon className={styles.medallionIcon} />
                </span>
                <div className={styles.rowBody}>
                  <CardTitleTag className={styles.cardLabel}>{translate(language, "ceremony.zonePractical")}</CardTitleTag>
                  <span className={styles.cardRule} aria-hidden="true" />
                  {ceremony.access !== null && <p className={styles.practical}>{ceremony.access}</p>}
                  {ceremony.note !== null && <p className={styles.practical}>{ceremony.note}</p>}
                </div>
              </article>
            )}
          </div>

          <footer className={styles.footer}>
            <div className={styles.footerOrnament} aria-hidden="true">
              <span className={styles.footerRule} />
              <LineHeart className={styles.footerHeart} />
              <span className={styles.footerRule} />
            </div>
            <p className={styles.closing}>{translate(language, "ceremony.v2.closing")}</p>
            <OliveSprig className={styles.footerSprig} shape={T.sprigShapes.footer} tone={T.sprigTone} />
          </footer>
        </div>
      </section>
    </div>
  );
}
