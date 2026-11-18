import type { Box, ContributionsTheme } from "@/config/contributions-master-measurements";
import type { ContributionsGeometry } from "@/lib/memorial/contributions/contributions-scene";

/**
 * M5-B — Contributions des proches, MOBILE : géométries EXPLORATOIRES.
 *
 * Aucune n'est validée : elles existent pour que la PO compare et décide
 * (rapport M5-B). Principe commun : le TEXTE garde une taille lisible en px
 * CSS, quelle que soit la largeur (320 à 430 px) ; c'est la géométrie qui
 * s'adapte, jamais la police. Repère : largeur 941 px source, comme les
 * Masters Mobile ; la scène est mise à l'échelle W / 941.
 *
 * Pourquoi pas la hauteur du Master Mobile (941 × 1671, soit 666 px CSS à
 * 375) : avec un titre, un sous-titre et deux boutons lisibles (≥ 44 px), il
 * ne reste que 1671 − 580 − 840 = 251 px source (≈ 100 px CSS) pour les
 * contributions — pas même une carte lisible.
 *
 * Stacking (cartes mémorielles) : la rubrique suivante recouvre la scène PAR
 * LE BAS. Les boutons sont donc placés au-dessus d'une zone de sécurité
 * (phrase finale, sceau) de 515 px source, soit ≈ 205 px CSS à 375.
 */

export type ContributionsMobileLayoutId = "grille-2x2" | "colonne" | "colonne-2";

/** Tailles de texte en px CSS, fixes à toutes les largeurs (jamais réduites). */
export const CONTRIBUTIONS_MOBILE_TYPE_CSS = {
  title: 30,
  subtitle: 15,
  storyBody: 15,
  condolenceBody: 15,
  overline: 11,
  signature: 24,
  caption: 17,
  button: 16,
  viewAll: 15,
  closing: 15,
} as const;

/** Hauteur de bouton minimale (px CSS) : cible tactile. */
export const CONTRIBUTIONS_MOBILE_MIN_TOUCH_CSS = 44;

export interface ContributionsMobileChrome {
  emblem: Box;
  title: Box;
  subtitle: Box;
  leafDivider: Box;
  leaveMessageButton: Box;
  viewAllButton: Box;
  heartDividerY: number;
  closingPhrase: Box;
}

export interface ContributionsMobileLayout {
  id: ContributionsMobileLayoutId;
  label: string;
  /** Hauteur de la scène, px source (largeur 941). */
  height: number;
  /** Nombre de contributions montrées dans la scène. */
  sceneCapacity: number;
  /** Écart à la règle d'affichage PO (null = règle respectée). */
  ruleChange: string | null;
  chrome: ContributionsMobileChrome;
  geometry: Record<ContributionsTheme, ContributionsGeometry>;
}

const W = 941;
const HEADER_END = 580;
/** Pied : boutons, filet au cœur, phrase finale, zone de sécurité (sceau). */
const FOOTER = 840;

function chromeFor(H: number): ContributionsMobileChrome {
  return {
    emblem: { x0: 435, y0: 40, x1: 506, y1: 110 },
    // M5-C : 2 lignes de titre à 30 px tiennent dès 320 px (204 px source = 69 px CSS).
    title: { x0: 60, y0: 118, x1: 881, y1: 322 },
    subtitle: { x0: 80, y0: 328, x1: 861, y1: 502 },
    leafDivider: { x0: 435, y0: 510, x1: 506, y1: 552 },
    // 140 / 130 px source : ≥ 44 px CSS dès 320 px de large.
    leaveMessageButton: { x0: 160, y0: H - 810, x1: 781, y1: H - 670 },
    viewAllButton: { x0: 205, y0: H - 645, x1: 736, y1: H - 515 },
    heartDividerY: H - 465,
    closingPhrase: { x0: 100, y0: H - 440, x1: 841, y1: H - 330 },
  };
}

function protectedZonesFor(H: number): Box[] {
  return [
    { x0: 60, y0: 20, x1: 881, y1: 500 },
    { x0: 400, y0: 500, x1: 541, y1: 560 },
    { x0: 140, y0: H - 830, x1: 801, y1: H - 500 },
    { x0: 80, y0: H - 480, x1: 861, y1: H - 320 },
    { x0: 720, y0: H - 250, x1: 930, y1: H - 80 },
  ];
}

type Anchor = { center: { x: number; y: number }; rotationDeg: number; zIndex: number };

function geometryFor(
  id: string,
  H: number,
  anchors: Record<"R1" | "C1" | "R2" | "P1", Anchor>,
  order: ContributionsGeometry["order"],
  rows: ContributionsGeometry["rows"],
  formats: ContributionsGeometry["formats"],
): ContributionsGeometry {
  return {
    id,
    anchors,
    order,
    rows,
    formats,
    protectedZones: protectedZonesFor(H),
    band: { x0: 16, y0: HEADER_END, x1: 925, y1: H - FOOTER },
    safeX: [16, 925],
    // 44 px CSS à 320 px de large (le cas le plus étroit).
    hitTargetPx: Math.ceil(44 / (320 / W)),
  };
}

// ── P1 — grille 2 × 2 compacte (esprit du Master Mobile) ─────────────────

const H_GRID = 2420;
const GRID_FORMATS = {
  condolence: { width: 450, height: 380 },
  "story-tall": { width: 430, height: 470 },
  "story-wide": { width: 450, height: 380 },
  polaroid: { width: 410, height: 460 },
} as const;
const gridAnchors = (dy: number): Record<"R1" | "C1" | "R2" | "P1", Anchor> => ({
  R1: { center: { x: 245, y: 830 + dy }, rotationDeg: -4.7, zIndex: 10 },
  R2: { center: { x: 700, y: 818 + dy }, rotationDeg: -3.9, zIndex: 20 },
  C1: { center: { x: 250, y: 1330 + dy }, rotationDeg: -4.6, zIndex: 30 },
  P1: { center: { x: 705, y: 1320 + dy }, rotationDeg: 6.7, zIndex: 40 },
});

// ── P3 — colonne (une contribution par rangée, cartes larges) ────────────

const COLUMN_FORMATS = {
  condolence: { width: 800, height: 520 },
  "story-tall": { width: 720, height: 620 },
  "story-wide": { width: 820, height: 460 },
  // Témoin du Polaroid : il tient dans le pas de la colonne (aucun recouvrement de sa légende).
  polaroid: { width: 560, height: 620 },
} as const;
const COLUMN_PITCH = 650;
// Profondeur : la contribution du haut repose SUR celle du dessous (sa signature
// ou sa légende, en bas, n'est jamais recouverte par la suivante).
const columnAnchors = (): Record<"R1" | "C1" | "R2" | "P1", Anchor> => ({
  R1: { center: { x: 455, y: HEADER_END + 345 }, rotationDeg: -2.2, zIndex: 40 },
  C1: { center: { x: 486, y: HEADER_END + 345 + COLUMN_PITCH }, rotationDeg: 1.6, zIndex: 30 },
  R2: { center: { x: 452, y: HEADER_END + 345 + 2 * COLUMN_PITCH }, rotationDeg: -1.4, zIndex: 20 },
  P1: { center: { x: 488, y: HEADER_END + 345 + 3 * COLUMN_PITCH }, rotationDeg: 2.6, zIndex: 10 },
});
const H_COLUMN = HEADER_END + 4 * COLUMN_PITCH + 40 + FOOTER;
const H_COLUMN_2 = HEADER_END + 2 * COLUMN_PITCH + 40 + FOOTER;
const COLUMN_ORDER = ["R1", "C1", "R2", "P1"] as const;
const COLUMN_ROWS = [["R1"], ["C1"], ["R2"], ["P1"]] as const;

function layout(id: ContributionsMobileLayoutId, label: string, H: number, capacity: number, ruleChange: string | null, make: (theme: ContributionsTheme) => ContributionsGeometry): ContributionsMobileLayout {
  return { id, label, height: H, sceneCapacity: capacity, ruleChange, chrome: chromeFor(H), geometry: { light: make("light"), dark: make("dark") } };
}

export const CONTRIBUTIONS_MOBILE_LAYOUTS: Record<ContributionsMobileLayoutId, ContributionsMobileLayout> = {
  "grille-2x2": layout("grille-2x2", "P1 · Grille 2 × 2 compacte", H_GRID, 4, null, (theme) =>
    geometryFor(`mobile-grille-${theme}`, H_GRID, gridAnchors(0), ["R1", "R2", "C1", "P1"], [["R1", "R2"], ["C1", "P1"]], GRID_FORMATS),
  ),
  colonne: layout("colonne", "P3 · Colonne", H_COLUMN, 4, null, (theme) => geometryFor(`mobile-colonne-${theme}`, H_COLUMN, columnAnchors(), COLUMN_ORDER, COLUMN_ROWS, COLUMN_FORMATS)),
  "colonne-2": layout(
    "colonne-2",
    "P4 · Colonne, deux contributions + « Voir tous »",
    H_COLUMN_2,
    2,
    "Deux contributions dans la scène (au lieu de quatre), « Voir tous les messages » dès la troisième : décision PO requise.",
    (theme) => {
      const a = columnAnchors();
      // Deux ancrages seulement servent ; les deux autres restent hors de la bande et ne sont jamais choisis.
      return geometryFor(`mobile-colonne2-${theme}`, H_COLUMN_2, a, ["R1", "C1"], [["R1"], ["C1"]], COLUMN_FORMATS);
    },
  ),
};

/** Fonds Mobile prolongeables : haut et bas décorés (fonds vierges PO), milieu uni raccordable. */
export const CONTRIBUTIONS_MOBILE_BACKGROUND: Record<ContributionsTheme, { top: string; middle: string; bottom: string; topHeight: number; bottomHeight: number; middleHeight: number }> = {
  light: {
    top: "/assets/contributions/v1/fonds/fond-mobile-light-haut.webp",
    middle: "/assets/contributions/v1/fonds/fond-mobile-light-milieu.webp",
    bottom: "/assets/contributions/v1/fonds/fond-mobile-light-bas.webp",
    topHeight: 620,
    middleHeight: 960,
    bottomHeight: 571,
  },
  dark: {
    top: "/assets/contributions/v1/fonds/fond-mobile-dark-haut.webp",
    middle: "/assets/contributions/v1/fonds/fond-mobile-dark-milieu.webp",
    bottom: "/assets/contributions/v1/fonds/fond-mobile-dark-bas.webp",
    topHeight: 620,
    middleHeight: 960,
    bottomHeight: 571,
  },
};

export const CONTRIBUTIONS_MOBILE_FRAME_WIDTH = W;
