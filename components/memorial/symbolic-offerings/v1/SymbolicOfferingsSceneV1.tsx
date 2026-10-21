import type { CSSProperties } from "react";
import type { SkinVariant } from "@/config/skins";
import {
  OFFERINGS_V1_INK,
  OFFERINGS_V1_TOKENS,
  type ImageBase,
  type OfferingKind,
  type OfferingsV1Box,
  type OfferingsV1Composition,
  type OfferingsV1Glow,
  type OfferingsV1Shadow,
  type OfferingsV1Text,
} from "@/config/symbolic-offerings-v1-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import styles from "./SymbolicOfferingsSceneV1.module.css";

/**
 * Offrandes symboliques V1 — scène de recueillement, état final après le
 * geste (pilote statique M1). Une seule offrande visible, le décor
 * périphérique du fond de recueillement, le logo et le titre de rubrique,
 * la confirmation validée et le bouton « Poursuivre la visite ».
 *
 * Hors périmètre M1, volontairement absents : l'état « cartes » (non validé
 * artistiquement), toute animation (M2), tout enregistrement, tout
 * branchement au registre des rubriques. Le bouton est rendu inerte.
 *
 * Mobile et Desktop : deux compositions (leurs fonds et leurs placements
 * diffèrent), une seule affichée selon la largeur RÉELLE du conteneur
 * (requête de conteneur à 1024 px, jamais le viewport) ; l'autre est en
 * `display: none` et ses images, en chargement différé, ne sont pas
 * téléchargées. Géométrie en px de canevas (`--px`), textes posés par leur
 * ligne de base avec un plancher de lecture.
 *
 * Textes : français validé par la PO (EN/ES en M3).
 */

export const OFFERINGS_V1_TEXT_FR = {
  heritage: "HERITAGE",
  subtitle: "HOMMAGE INTEMPOREL",
  title: "Un geste",
  script: "pour sa mémoire",
  continue: "Poursuivre la visite",
} as const;

export interface SymbolicOfferingsSceneV1Props {
  offering: OfferingKind;
  skinVariant: SkinVariant;
  /** `"page"` → titre `<h1>` ; `"section"` → `<h2>`. */
  headingLevel?: "page" | "section";
}

export function SymbolicOfferingsSceneV1({ offering, skinVariant, headingLevel = "section" }: SymbolicOfferingsSceneV1Props) {
  const tokens = OFFERINGS_V1_TOKENS[skinVariant];
  const ink = OFFERINGS_V1_INK[skinVariant];
  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div
        className={`${styles.wrap} ${offeringsMediumSerif.variable} ${ebGaramondItalic.variable} ${laBelleAurore.variable}`}
        data-variant={skinVariant}
        data-offering={offering}
        lang="fr"
        style={
          {
            "--ink-title": ink.title,
            "--ink-lockup": ink.lockup,
            "--ink-body": ink.body,
            "--ink-script": ink.script,
            "--button-line": ink.buttonLine,
            "--button-label": ink.buttonLabel,
          } as CSSProperties
        }
      >
        <Composition layout="mobile" composition={tokens.mobile} offering={offering} headingLevel={headingLevel} />
        <Composition layout="desktop" composition={tokens.desktop} offering={offering} headingLevel={headingLevel} />
      </div>
    </SkinScope>
  );
}

function boxVars(box: OfferingsV1Box): CSSProperties {
  return { "--l": box.left, "--t": box.top, "--w": box.width, "--h": box.height } as CSSProperties;
}

function textVars(prefix: string, text: OfferingsV1Text): Record<string, number> {
  return {
    [`--${prefix}-size`]: text.size,
    [`--${prefix}-base`]: text.baseline,
    ...(text.trackingEm !== undefined && { [`--${prefix}-track`]: text.trackingEm }),
  };
}

/** Ombre en px de canevas. Pour `drop-shadow()`, la troisième longueur est
 * l'écart-type σ du flou (Filter Effects), pas un rayon comme `box-shadow`. */
function dropShadow(s: OfferingsV1Shadow): CSSProperties {
  return { filter: `drop-shadow(calc(var(--px) * ${s.dx}) calc(var(--px) * ${s.dy}) calc(var(--px) * ${s.sigma}) ${s.color})` };
}

/** Lueur radiale, décroissance (1 − d)^1,6 jusqu'au bord de l'ellipse. */
function glowStyle(g: OfferingsV1Glow): CSSProperties {
  const stops = Array.from({ length: 11 }, (_, i) => {
    const d = i / 10;
    const alpha = g.peak * Math.pow(1 - d, 1.6);
    return `rgb(${g.rgb.join(" ")} / ${alpha.toFixed(4)}) ${(d * 100).toFixed(0)}%`;
  });
  return {
    ...boxVars({ left: g.cx - g.rx, top: g.cy - g.ry, width: 2 * g.rx, height: 2 * g.ry }),
    backgroundImage: `radial-gradient(closest-side, ${stops.join(", ")})`,
  };
}

/** AVIF 4:4:4 principal, WebP sans perte en repli ; décoratif (alt vide). */
function Picture({ base, className, style }: { base: ImageBase; className: string; style?: CSSProperties }) {
  return (
    <picture>
      <source type="image/avif" srcSet={`${base}.avif`} />
      <img src={`${base}.webp`} alt="" className={className} style={style} loading="lazy" decoding="async" draggable={false} />
    </picture>
  );
}

function Composition({
  layout,
  composition: C,
  offering,
  headingLevel,
}: {
  layout: "mobile" | "desktop";
  composition: OfferingsV1Composition;
  offering: OfferingKind;
  headingLevel: "page" | "section";
}) {
  const scene = C.scenes[offering];
  const TitleTag = headingLevel === "page" ? "h1" : "h2";
  const vars = {
    "--canvas-w": C.canvas.width,
    "--canvas-h": C.canvas.height,
    "--axis": C.axis,
    ...textVars("her", C.header.heritage),
    ...textVars("sub", C.header.subtitle),
    ...textVars("title", C.header.title),
    ...textVars("script", C.header.script),
    "--conf-size": scene.confirmation.size,
    "--conf-base": scene.confirmation.baseline,
    "--conf-lh": scene.confirmation.lineHeight,
    "--conf-max": scene.confirmation.textMaxWidth,
    "--button-gap": scene.buttonGap,
    "--button-max": scene.buttonMaxWidth,
  } as CSSProperties;

  return (
    <section className={styles.scene} data-layout={layout} data-testid={`offerings-v1-${layout}`} style={vars}>
      <Picture base={C.fond} className={styles.fond} />

      {/* Ombre large puis ombre de contact : deux fois le même objet, dans
          l'ordre de composition des maquettes. */}
      <div className={styles.offering} aria-hidden="true">
        <Picture base={scene.object} className={styles.box} style={{ ...boxVars(scene.box), ...dropShadow(scene.shadows[0]) }} />
        <Picture base={scene.object} className={styles.box} style={{ ...boxVars(scene.box), ...dropShadow(scene.shadows[1]) }} />
        {scene.wax !== undefined && (
          <div className={`${styles.box} ${styles.wax}`} style={boxVars(scene.box)} data-glow="wax">
            <span className={`${styles.box} ${styles.glow}`} style={glowStyle(scene.wax)} />
          </div>
        )}
        {scene.halo !== undefined && <span className={`${styles.box} ${styles.glow}`} style={glowStyle(scene.halo)} data-glow="halo" />}
        {scene.flame !== undefined && <Picture base={scene.flame.image} className={styles.box} style={boxVars(scene.flame.box)} />}
      </div>

      <header className={styles.header}>
        <p className={`${styles.text} ${styles.heritage}`}>{OFFERINGS_V1_TEXT_FR.heritage}</p>
        <p className={`${styles.text} ${styles.subtitle}`}>{OFFERINGS_V1_TEXT_FR.subtitle}</p>
        <TitleTag className={styles.heading}>
          <span className={`${styles.text} ${styles.title}`}>{OFFERINGS_V1_TEXT_FR.title}</span>{" "}
          <span className={`${styles.text} ${styles.script}`}>{OFFERINGS_V1_TEXT_FR.script}</span>
        </TitleTag>
      </header>

      <div className={styles.confirm}>
        <p className={styles.confirmText}>
          {scene.confirmation.lines.map((line) => (
            <span key={line} className={styles.line}>
              {line}{" "}
            </span>
          ))}
        </p>
        {/* Pilote statique : bouton réel mais inerte (comportement en M2). */}
        <button type="button" className={styles.continue}>
          {OFFERINGS_V1_TEXT_FR.continue}
        </button>
      </div>
    </section>
  );
}
