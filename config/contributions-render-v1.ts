import type { ContributionsTheme } from "@/config/contributions-master-measurements";

/**
 * M5-A — Contributions des proches, PREMIER RENDU (Desktop Light / Dark).
 *
 * Provenance des éléments graphiques (rapport M5-A) :
 * - fonds : les deux fonds vierges Desktop transmis par la PO, copiés à
 *   l'identique (empreintes SHA-256 relevées en M0) ;
 * - matières : les fonds Récit de vie V2 du dépôt (centre uni, tuile en
 *   miroir) — ivoire tel quel, pêche = ivoire teinté vers la carte pêche du
 *   Master, bleu pétrole = grain du Récit de vie autour de la teinte de la
 *   carte du Master ;
 * - papier du Polaroid : la tuile papier du Viewer A13 (réutilisée telle quelle) ;
 * - bords déchirés des récits : contour irrégulier déterministe (CSS) ; le
 *   masque 9 tranches du Viewer A13 a été essayé, son bord est trop régulier
 *   pour les papiers des Masters ;
 * - ornements (emblème, rameaux) : détourés des Masters de la PO ;
 * - cœurs, cadre doré, plume, ruban adhésif : reconstruits (SVG / CSS) ;
 * - photographie de démonstration : celle du Polaroid du Master (fictive),
 *   redressée, déclinée en trois formats.
 */

const V1 = "/assets/contributions/v1";

export const CONTRIBUTIONS_RENDER_ASSETS = {
  background: { light: `${V1}/fonds/fond-desktop-light.png`, dark: `${V1}/fonds/fond-desktop-dark.png` },
  /**
   * M8-E3 — état public SANS contribution (Masters M0 « état vide ») : les
   * quatre versions nettoyées remises par la PO (relevé M0 `emptyCleaned`,
   * empreintes dc7c338987f2, 85f920b3e15c, 325662a4c71d, c78e7a25e670),
   * converties en WebP (qualité 90) sans retouche. La carte centrale et ses
   * rameaux font partie du fond ; textes, emblème, filets et bouton sont
   * posés par le runtime aux boîtes relevées (CONTRIBUTIONS_CHROME.empty).
   */
  emptyBackground: {
    desktop: { light: `${V1}/fonds/fond-vide-desktop-light.webp`, dark: `${V1}/fonds/fond-vide-desktop-dark.webp` },
    mobile: { light: `${V1}/fonds/fond-vide-mobile-light.webp`, dark: `${V1}/fonds/fond-vide-mobile-dark.webp` },
  },
  paper: {
    ivory: `${V1}/matieres/papier-ivoire.webp`,
    peach: `${V1}/matieres/papier-peche.webp`,
    petrol: `${V1}/matieres/papier-bleu-petrole.webp`,
    polaroid: "/assets/viewer/a13-desktop-v2/a13-viewer-print-paper-light-tile-v1.png",
  },
  emblem: { light: `${V1}/ornements/embleme-light.png`, dark: `${V1}/ornements/embleme-dark.png` },
  dividerSprig: { light: `${V1}/ornements/rameau-filet-light.png`, dark: `${V1}/ornements/rameau-filet-dark.png` },
  storySprig: `${V1}/ornements/rameau-recit.png`,
  condolenceSprig: `${V1}/ornements/rameau-condoleance-or.png`,
} as const;

/**
 * M8-E3 (directive PO) — ornements de la carte centrale de l'état vide, PROPRES
 * à chaque Master M0 (texte identique en Light et Dark, composition
 * graphique indépendante). Relevés au pixel sur les Masters (filets sombres,
 * luminance < 150), en pixels source :
 *  - Desktop Light : filets au cœur entre l'accueil et l'invitation ;
 *  - Desktop Dark  : un court filet simple entre l'accueil et l'invitation ;
 *  - Mobile Light  : filets au cœur entre l'accueil et l'invitation ;
 *  - Mobile Dark   : un filet simple sous l'invitation. Le Master place aussi
 *    un cœur entre deux filets AU-DESSUS de l'accueil, mais le fond nettoyé
 *    remis pour ce Master (c78e7a25e670) porte à cet endroit précis un rameau :
 *    le support d'exécution fait foi, le cœur n'est pas dessiné par-dessus
 *    (écart Master / support signalé à la PO, M8-E3).
 * Les rameaux et la carte font partie des fonds nettoyés.
 */
export type ContributionsEmptyCardOrnament =
  | { kind: "heart"; y: number; left: [number, number]; right: [number, number] }
  | { kind: "rule"; y: number; x0: number; x1: number };

export const CONTRIBUTIONS_EMPTY_CARD_ORNAMENTS: Record<"desktop" | "mobile", Record<"light" | "dark", readonly ContributionsEmptyCardOrnament[]>> = {
  desktop: {
    light: [{ kind: "heart", y: 539.5, left: [717, 805], right: [865, 956] }],
    dark: [{ kind: "rule", y: 507.5, x0: 783, x1: 888 }],
  },
  mobile: {
    light: [{ kind: "heart", y: 850, left: [349, 437], right: [507, 594] }],
    dark: [{ kind: "rule", y: 976, x0: 429, x1: 546 }],
  },
};

/** Couleurs relevées sur les Masters (encre, or, boutons), par thème. */
export interface ContributionsPalette {
  title: string;
  text: string;
  rule: string;
  gold: string;
  buttonFill: string;
  buttonBorder: string;
  buttonText: string;
  outlineBorder: string;
  outlineText: string;
  cardShadow: string;
}

export const CONTRIBUTIONS_PALETTE: Record<ContributionsTheme, ContributionsPalette> = {
  light: {
    title: "#221d19",
    text: "#3a322b",
    rule: "#8d7d6a",
    gold: "#a8783f",
    buttonFill: "#3c4535",
    buttonBorder: "#b8915a",
    buttonText: "#f3ead8",
    outlineBorder: "#6f6253",
    outlineText: "#2f2924",
    cardShadow: "drop-shadow(0 calc(var(--u) * 6) calc(var(--u) * 9) rgba(70, 45, 20, 0.30)) drop-shadow(0 calc(var(--u) * 1) calc(var(--u) * 2) rgba(40, 25, 10, 0.25))",
  },
  dark: {
    title: "#f1e5cc",
    text: "#e7dac2",
    rule: "#b99862",
    gold: "#d3ab66",
    buttonFill: "rgba(30, 24, 18, 0.72)",
    buttonBorder: "#c9a15e",
    buttonText: "#f3e7cf",
    outlineBorder: "#cdb488",
    outlineText: "#efe2c8",
    cardShadow: "drop-shadow(0 calc(var(--u) * 8) calc(var(--u) * 12) rgba(0, 0, 0, 0.55)) drop-shadow(0 calc(var(--u) * 1) calc(var(--u) * 2) rgba(0, 0, 0, 0.45))",
  },
};

/** Encres des cartes (identiques dans les deux thèmes : l'habillage ne change pas). */
export const CONTRIBUTIONS_CARD_INK = {
  story: "#2b241e",
  storySignature: "#2b241e",
  condolence: "#f3ead9",
  condolenceOverline: "#e8dcc4",
  condolenceSignature: "#dcb56b",
  condolenceFrame: "#c9a35f",
  polaroidCaption: "#2b2622",
} as const;

/** Interligne des corps de texte (multiple du corps). */
export const CONTRIBUTIONS_LINE_HEIGHT = 1.32;

/** Nombre de lignes d'un corps de texte qui tiennent dans sa zone (jamais de réduction du corps). */
export function bodyLineCapacity(zoneHeightPx: number, fontSizePx: number, lineHeight = CONTRIBUTIONS_LINE_HEIGHT): number {
  if (!(zoneHeightPx > 0 && fontSizePx > 0)) return 0;
  return Math.max(0, Math.floor(zoneHeightPx / (fontSizePx * lineHeight) + 1e-9));
}
