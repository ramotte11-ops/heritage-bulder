"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { TraditionsContent } from "@/types/traditions";
import { translate } from "@/lib/i18n/translate";
import { TRADITIONS_V2_TOKENS, type TraditionsV2MobileTokens } from "@/config/traditions-v2-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { avisNameSerif, ebGaramond, laBelleAurore, playfairDisplay } from "@/components/builder/fonts";
import { DeckleFilter, HandHeart, LineHeart, LineSprig, OliveSprig } from "./TraditionsV2Ornaments";
import styles from "./TraditionsV2.module.css";

/**
 * Traditions & repères V2 — pilotes Mobile Light (P1) et Mobile Dark (P2),
 * GO QG. Un seul composant pour les deux variantes : leurs différences de
 * composition (filets du surtitre, ornement du pied, mention manuscrite du
 * coin) sont des réglages (`config/traditions-v2-tokens.ts`), leurs
 * couleurs et matières des variables du module CSS. Non branché sur le
 * registre de production : page pilote seulement.
 *
 * Données : les repères de la famille (`content.traditions.entries`),
 * rendus tels quels — titre facultatif, texte libre, un feuillet par
 * repère, dans l'ordre saisi. Aucun repère n'est imposé : les quatre
 * exemples du Master ne sont qu'une référence visuelle.
 *
 * Textes HERITAGE (décision PO) : surtitre, titre, introduction, phrase
 * manuscrite finale et, sur le Dark, mention « Des gestes qui ont du
 * sens » sont des textes système traduits (FR/EN/ES), jamais des données
 * de la famille.
 *
 * Moteur du Récit de vie V2 : le Master entier à son ratio, le bas
 * authentique ancré en bas de section, et, quand le contenu dépasse la
 * hauteur du Master, une surface de papier CSS ouverte à la ligne de
 * coupe, de la hauteur exacte de l'excédent (mesurée par un
 * ResizeObserver — la seule mesure JavaScript, purement décorative).
 */

export interface TraditionsV2Props {
  traditions: TraditionsContent;
  language: Language;
  skinVariant: SkinVariant;
  /** `"page"` → titre `<h1>`, repères `<h2>` ; `"section"` → `<h2>`, `<h3>`. */
  headingLevel?: "page" | "section";
}

const COARSE_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='3' stitchTiles='stitch' seed='11'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0' intercept='.22'/></feComponentTransfer></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

function mobileVars(T: TraditionsV2MobileTokens): CSSProperties {
  return {
    "--m-src": `url(${T.masterSrc})`,
    "--paper-images": [...T.paperGrains.map((g) => `url(${g.src})`), COARSE_NOISE, `url(${T.paperTone})`].join(", "),
    "--paper-sizes": [...T.paperGrains.map((g) => `calc(var(--px) * ${g.tileWidth}) auto`), "calc(var(--px) * 900) auto", "100% 100%"].join(", "),
    "--paper-repeat": [...T.paperGrains.map(() => "repeat"), "repeat", "no-repeat"].join(", "),
    "--paper-blend": [...T.paperGrains.map((g) => g.blend), T.noiseBlend, "normal"].join(", "),
    "--edges-src": `url(${T.edgeStrip.src})`,
    "--edges-h": T.edgeStrip.heightCanvas,
    "--canvas-w": T.canvas.width,
    "--canvas-h": T.canvas.height,
    "--cut": T.cutY,
    "--fade": T.fadePx,
    "--text-top": T.textTopCanvas,
    "--foot": T.footCanvas,
    "--text-left": T.textLeftCanvas,
    "--text-right": T.textRightCanvas,
    "--axis": T.axisCanvas,
    "--ink": T.ink,
    "--ink-soft": T.inkSoft,
    "--label": T.label,
    "--rule": T.rule,
    ...(T.cornerNote !== null && {
      "--corner-left": T.cornerNote.leftCanvas,
      "--corner-top": T.cornerNote.topCanvas,
      "--corner-width": T.cornerNote.widthCanvas,
      "--corner-rotate": `${T.cornerNote.rotateDeg}deg`,
    }),
  } as CSSProperties;
}

export function TraditionsV2({ skinVariant, ...props }: TraditionsV2Props) {
  const tokens = TRADITIONS_V2_TOKENS[skinVariant];
  // Une variante sans réglages ne se rabat jamais sur une autre.
  if (tokens === null) return null;
  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <TraditionsV2Layout {...props} variant={skinVariant} tokens={tokens.mobile} />
    </SkinScope>
  );
}

function TraditionsV2Layout({
  traditions,
  language,
  headingLevel = "page",
  variant,
  tokens: T,
}: Omit<TraditionsV2Props, "skinVariant"> & { variant: SkinVariant; tokens: TraditionsV2MobileTokens }) {
  const TitleTag = headingLevel === "section" ? "h2" : "h1";
  const EntryTitleTag = headingLevel === "section" ? "h3" : "h2";
  const deckleId = `traditions-deckle-${useId().replace(/:/g, "")}`;

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
      className={`${styles.wrap} ${ebGaramond.variable} ${avisNameSerif.variable} ${playfairDisplay.variable} ${laBelleAurore.variable}`}
      style={mobileVars(T)}
      data-variant={variant}
      lang={language}
    >
      <section
        ref={sectionRef}
        className={styles.section}
        data-testid="traditions-v2"
        data-extended={extension > 0.5}
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
            {T.surtitleRules === "flanked" ? (
              <div className={styles.surtitleRow}>
                <span className={styles.surtitleSideRule} aria-hidden="true" />
                <p className={styles.surtitle}>{translate(language, "traditions.v2.surtitle")}</p>
                <span className={styles.surtitleSideRule} aria-hidden="true" />
              </div>
            ) : (
              <>
                <p className={styles.surtitle}>{translate(language, "traditions.v2.surtitle")}</p>
                <span className={styles.surtitleRule} aria-hidden="true" />
              </>
            )}
            <TitleTag className={styles.title}>{translate(language, "traditions.v2.title")}</TitleTag>
            <OliveSprig className={styles.sprig} tone={T.sprigTone} />
            <p className={styles.intro}>{translate(language, "traditions.v2.intro")}</p>
          </header>

          {/* Mention manuscrite du coin haut droit (Dark) : placée hors du
              flux, lue après l'en-tête. */}
          {T.cornerNote !== null && (
            <div className={styles.cornerNote}>
              <p className={styles.cornerText}>{translate(language, "traditions.v2.cornerNote")}</p>
              <HandHeart className={styles.cornerHeart} />
            </div>
          )}

          {traditions.entries.length > 0 && (
            <ul className={styles.entries} data-count={traditions.entries.length}>
              {traditions.entries.map((entry) => (
                <li key={entry.id} className={styles.entry} data-entry={entry.id} data-titled={entry.title !== null}>
                  <span className={styles.entryPaper} aria-hidden="true" />
                  <span className={styles.medallion} aria-hidden="true" data-ornament="medaillon">
                    <LineSprig className={styles.medallionIcon} />
                  </span>
                  <span className={styles.entryDivider} aria-hidden="true" />
                  <div className={styles.entryText}>
                    {entry.title !== null && (
                      <>
                        <EntryTitleTag className={styles.entryTitle}>{entry.title}</EntryTitleTag>
                        <span className={styles.entryRule} aria-hidden="true" />
                      </>
                    )}
                    <p className={styles.entryBody}>{entry.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <footer className={styles.footer}>
            <div className={styles.footerOrnament} aria-hidden="true">
              <span className={styles.footerRule} />
              {T.footerOrnament === "heart" ? (
                <LineHeart className={styles.footerHeart} />
              ) : (
                <OliveSprig className={styles.footerSprig} tone={T.sprigTone} />
              )}
              <span className={styles.footerRule} />
            </div>
            <p className={styles.closing}>{translate(language, "traditions.v2.closing")}</p>
          </footer>
        </div>
      </section>
    </div>
  );
}
