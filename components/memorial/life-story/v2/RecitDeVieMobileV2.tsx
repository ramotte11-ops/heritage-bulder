"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate, translateWith } from "@/lib/i18n/translate";
import { readHero } from "@/lib/memorial/hero";
import { resolveLifeStoryContent } from "@/lib/memorial/life-story-content";
import { ebGaramond, playfairDisplay } from "@/components/builder/fonts";
import type { SkinVariant } from "@/config/skins";
import { resolveRecitV2MobileArtwork, type RecitV2Artwork, type RecitV2MobileArtworkTokens } from "@/config/recit-de-vie-v2-tokens";
import styles from "./RecitDeVieMobileV2.module.css";

/**
 * Récit de vie V2 — Mobile (architecture « A », PROTOTYPE LOCAL, non
 * branché sur le Mémorial). Un seul moteur de mise en page pour les deux
 * matières : la variante du mémorial choisit la matière par
 * `RECIT_V2_ARTWORK_FOR_VARIANT` (décision PO : LIGHT = bleu pétrole,
 * DARK = ivoire / champagne), et la matière n'apporte que ses réglages
 * (Master, coupe, papier, zones de texte, couleurs) ; aucune variante ne se
 * rabat sur l'autre matière. Voir config/recit-de-vie-v2-tokens.ts.
 *
 * La hauteur vient du texte : surtitre, titre, introduction, puis les
 * trois chapitres (numéro, titre définitif, filet, paragraphe à taille
 * uniforme). Le décor suit : tant que le texte tient dans le Master, on
 * voit le Master exact ; au-delà, le papier central s'ouvre à la ligne
 * de coupe, de la hauteur exacte de l'excédent (mesurée par un
 * ResizeObserver — la seule mesure JavaScript, purement décorative).
 */

const CHAPTER_TITLE_KEY: Record<"a10" | "a11" | "a12", TranslationKey> = {
  a10: "recit.v2.a10",
  a11: "recit.v2.a11",
  a12: "recit.v2.a12",
};

const COARSE_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='3' stitchTiles='stitch' seed='7'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0' intercept='.30'/></feComponentTransfer></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

function artworkVars(T: RecitV2MobileArtworkTokens): CSSProperties {
  return {
    "--m-src": `url(${T.masterSrc})`,
    "--paper-images": [...T.paperGrains.map((g) => `url(${g.src})`), COARSE_NOISE, T.paperProfile].join(", "),
    "--paper-sizes": [...T.paperGrains.map((g) => `calc(var(--px) * ${g.tileWidth}) auto`), "calc(var(--px) * 900) auto", "100% 100%"].join(", "),
    "--paper-repeat": [...T.paperGrains.map(() => "repeat"), "repeat", "no-repeat"].join(", "),
    "--paper-blend": [...T.paperGrains.map((g) => g.blend), T.noiseBlend, "normal"].join(", "),
    "--canvas-w": T.canvas.width,
    "--canvas-h": T.canvas.height,
    "--cut": T.cutY,
    "--fade": T.fadePx,
    "--text-top": T.textTop,
    "--foot": T.foot,
    "--text-left": T.textLeft,
    "--text-right": T.textRight,
    "--chapter-right": T.chapterRight,
    "--header-inset-left": T.headerInsetLeft,
    "--header-inset-right": T.headerInsetRight,
    "--number-column": T.numberColumn,
    "--number-inset": T.numberInset,
    "--number-size": `${T.numberSize}px`,
    "--rule-min-gap": `${T.ruleMinGap}px`,
    "--rule-guard": T.ruleMinGap > 0 ? 1 : 0,
    "--ink": T.ink,
    "--rule": T.rule,
    "--accent-rule": T.accentRule,
    "--number-gradient": T.numberGradient,
  } as CSSProperties;
}

export interface RecitDeVieMobileV2Props {
  content: MemorialContent;
  language: Language;
  skinVariant: SkinVariant;
}

export function RecitDeVieMobileV2({ skinVariant, ...props }: RecitDeVieMobileV2Props) {
  const { artwork, tokens } = resolveRecitV2MobileArtwork(skinVariant);
  return <RecitDeVieMobileV2Layout {...props} artwork={artwork} tokens={tokens} />;
}

function RecitDeVieMobileV2Layout({
  content,
  language,
  artwork,
  tokens: T,
}: Omit<RecitDeVieMobileV2Props, "skinVariant"> & { artwork: RecitV2Artwork; tokens: RecitV2MobileArtworkTokens }) {
  const matters = resolveLifeStoryContent(content, language);
  const name = readHero(content).displayName?.trim() ?? "";
  const intro = name !== "" ? translateWith(language, "recit.v2.intro", { name }) : translate(language, "recit.v2.introNoName");

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
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, [T]);

  return (
    <div className={`${styles.wrap} ${ebGaramond.variable} ${playfairDisplay.variable}`} style={artworkVars(T)}>
      <section
        ref={sectionRef}
        className={styles.section}
        data-testid="recit-v2-mobile"
        data-artwork={artwork}
        data-extended={extension > 0.5}
        style={{ "--ext": `${extension}px` } as CSSProperties}
      >
        <div className={styles.master} aria-hidden="true" />
        <div className={styles.bottom} aria-hidden="true" />
        {extension > 0.5 && <div className={styles.paper} aria-hidden="true" />}

        <div className={styles.content}>
          <header className={styles.header}>
            <p className={styles.surtitle}>{translate(language, "recit.v2.surtitle")}</p>
            <h2 className={styles.title}>{translate(language, "recit.v2.title")}</h2>
            <p className={styles.intro}>{intro}</p>
            <span className={styles.separator} aria-hidden="true" />
          </header>

          <div className={styles.chapters}>
            {matters.map((matter, index) => (
              <div key={matter.id} className={styles.chapterSlot}>
                {index > 0 && <hr className={styles.divider} />}
                <article className={styles.chapter} data-matter={matter.id} data-fallback={matter.isFallback}>
                  <p className={styles.number} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <div className={styles.text}>
                    <h3 className={styles.chapterTitle}>{translate(language, CHAPTER_TITLE_KEY[matter.id])}</h3>
                    <span className={styles.rule} aria-hidden="true" />
                    <p className={styles.body}>{matter.displayText}</p>
                  </div>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
