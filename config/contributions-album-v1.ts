import type { ContributionsSlotId, ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_FRAMES } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_MOBILE_BACKGROUND, CONTRIBUTIONS_MOBILE_FRAME_WIDTH } from "@/config/contributions-mobile-v1";
import { masterGeometry, type ContributionsGeometry } from "@/lib/memorial/contributions/contributions-scene";

/**
 * M6 — Album complet des Contributions des proches : GÉOMÉTRIES des planches.
 *
 * L'Album est une suite de PLANCHES. Une planche reçoit trois (Desktop) ou
 * quatre (Mobile) contributions consécutives (partition A13, `contributions-album.ts`) et
 * est composée par le solveur de la scène principale (M4 → M5-B), donc par la
 * `GroupSession` A13. Aucune règle de placement nouvelle : seule la bande
 * change (plus de titre ni de boutons dans une planche) et l'air autour.
 *
 *  - Desktop : la rangée de quatre ancrages du Master (R1 · C1 · R2 · P1,
 *    inclinaisons et profondeurs du thème), recentrée dans une bande sans
 *    en-tête. Phase B (Thue–Morse, comme l'Album A13) : la même rangée EN
 *    MIROIR — Polaroid à gauche, inclinaisons inversées — pour que l'Album
 *    respire sans jamais inventer de nouvelle grammaire.
 *  - Mobile : la colonne P3 de M5-B, une carte large par rangée (texte en
 *    px CSS fixes, lisible dès 320 px). La hauteur compacte ne concerne que
 *    la scène soumise au stacking ; l'Album est une vue de consultation.
 *
 * Repères : ceux des scènes (Desktop 1671 de large, Mobile 941).
 */

export type ContributionsAlbumFrame = "desktop" | "mobile";
export type ContributionsAlbumPhase = "A" | "B";

export interface ContributionsAlbumFrameSpec {
  /**
   * Contributions par planche pleine. Desktop : TROIS (une rangée aérée ;
   * quatre condoléances de front dépassent la largeur utile — 4 × ≈ 460 px
   * inclinés pour 1632 px — et forcent recouvrements et permutations).
   * Mobile : quatre, une par rangée de la colonne.
   */
  groupSize: 3 | 4;
  /** Largeur du repère (px source). */
  width: number;
  /** Hauteur d'une planche AVANT ajustement à son contenu (px source). */
  plateHeight: number;
  /** Air conservé au-dessus et au-dessous des papiers d'une planche ajustée (px source). */
  plateMargin: number;
}

export const CONTRIBUTIONS_ALBUM_FRAMES: Record<ContributionsAlbumFrame, ContributionsAlbumFrameSpec> = {
  desktop: { groupSize: 3, width: CONTRIBUTIONS_FRAMES.desktop.width, plateHeight: 600, plateMargin: 44 },
  mobile: { groupSize: 4, width: CONTRIBUTIONS_MOBILE_FRAME_WIDTH, plateHeight: 2960, plateMargin: 40 },
};

// ── Desktop ────────────────────────────────────────────────────────────

/** Ligne médiane de la rangée du Master (y source) et de la planche. */
const DESKTOP_MASTER_ROW_Y = 516;
const DESKTOP_PLATE_ROW_Y = CONTRIBUTIONS_ALBUM_FRAMES.desktop.plateHeight / 2;
const DESKTOP_BAND_INSET_Y = 24;

function desktopPlate(theme: ContributionsTheme, phase: ContributionsAlbumPhase): ContributionsGeometry {
  const master = masterGeometry("desktop", theme);
  const W = CONTRIBUTIONS_ALBUM_FRAMES.desktop.width;
  const H = CONTRIBUTIONS_ALBUM_FRAMES.desktop.plateHeight;
  const dy = DESKTOP_PLATE_ROW_Y - DESKTOP_MASTER_ROW_Y;
  const ids = Object.keys(master.anchors) as ContributionsSlotId[];
  const anchors = Object.fromEntries(
    ids.map((id) => {
      const a = master.anchors[id];
      const x = phase === "A" ? a.center.x : W - a.center.x;
      // `0 - r` : une inclinaison nulle reste +0 (empreintes stables).
      return [id, { center: { x, y: a.center.y + dy }, rotationDeg: phase === "A" ? a.rotationDeg : 0 - a.rotationDeg, zIndex: a.zIndex }];
    }),
  ) as ContributionsGeometry["anchors"];
  // Ordre de lecture : de gauche à droite, dans les deux phases.
  const order = [...ids].sort((a, b) => anchors[a].center.x - anchors[b].center.x);
  return {
    id: `album-desktop-${theme}-${phase}`,
    anchors,
    order,
    rows: [order],
    formats: master.formats,
    protectedZones: [],
    band: { x0: master.safeX[0], y0: DESKTOP_BAND_INSET_Y, x1: master.safeX[1], y1: H - DESKTOP_BAND_INSET_Y },
    safeX: master.safeX,
    hitTargetPx: master.hitTargetPx,
  };
}

// ── Mobile : la colonne P3 de M5-B (formats repris, pas élargi) ─────────
// Pas 720 (P3 : 650) : chaque papier (620 à 650 px une fois incliné) a sa
// rangée sans chevauchement ; mesuré en M6, le pas de 650 imposait aux
// Polaroids de formats variés des recouvrements, des permutations d'ordre et
// jusqu'à 19 s de recherche par planche. L'Album n'a pas de hauteur imposée.

const MOBILE_FORMATS = {
  condolence: { width: 800, height: 520 },
  "story-tall": { width: 720, height: 620 },
  "story-wide": { width: 820, height: 460 },
  polaroid: { width: 560, height: 620 },
} as const;
const MOBILE_PITCH = 720;
const MOBILE_FIRST_Y = 360;
const MOBILE_BAND_INSET_Y = 20;

function mobilePlate(theme: ContributionsTheme, phase: ContributionsAlbumPhase): ContributionsGeometry {
  const W = CONTRIBUTIONS_ALBUM_FRAMES.mobile.width;
  const H = CONTRIBUTIONS_ALBUM_FRAMES.mobile.plateHeight;
  // Mêmes ancrages que la colonne P3 ; phase B : alternance gauche / droite et inclinaisons en miroir.
  const column: { id: ContributionsSlotId; x: number; r: number; z: number }[] = [
    { id: "R1", x: 455, r: -2.2, z: 40 },
    { id: "C1", x: 486, r: 1.6, z: 30 },
    { id: "R2", x: 452, r: -1.4, z: 20 },
    { id: "P1", x: 488, r: 2.6, z: 10 },
  ];
  const anchors = Object.fromEntries(
    column.map((a, k) => [a.id, { center: { x: phase === "A" ? a.x : W - a.x, y: MOBILE_FIRST_Y + k * MOBILE_PITCH }, rotationDeg: phase === "A" ? a.r : 0 - a.r, zIndex: a.z }]),
  ) as ContributionsGeometry["anchors"];
  const order = column.map((a) => a.id);
  return {
    id: `album-mobile-${theme}-${phase}`,
    anchors,
    order,
    rows: order.map((id) => [id]),
    formats: MOBILE_FORMATS,
    protectedZones: [],
    band: { x0: 16, y0: MOBILE_BAND_INSET_Y, x1: 925, y1: H - MOBILE_BAND_INSET_Y },
    safeX: [16, 925],
    hitTargetPx: Math.ceil(44 / (320 / W)),
  };
}

const CACHE = new Map<string, ContributionsGeometry>();

/** Géométrie d'une planche (mémorisée : la même référence à chaque appel). */
export function contributionsAlbumPlateGeometry(frame: ContributionsAlbumFrame, theme: ContributionsTheme, phase: ContributionsAlbumPhase): ContributionsGeometry {
  const key = `${frame}-${theme}-${phase}`;
  let g = CACHE.get(key);
  if (!g) {
    g = frame === "desktop" ? desktopPlate(theme, phase) : mobilePlate(theme, phase);
    CACHE.set(key, g);
  }
  return g;
}

// ── Fonds prolongeables ─────────────────────────────────────────────────

export interface ContributionsAlbumBackground {
  top: string;
  middle: string;
  bottom: string;
  /** Hauteurs en px source (largeur du repère). */
  topHeight: number;
  middleHeight: number;
  bottomHeight: number;
}

const DESKTOP_FONDS = "/assets/contributions/v1/fonds";

/**
 * Desktop : haut et bas du fond vierge du Master (décors), milieu uni
 * raccordable tiré des rangées unies du même fond (bande recopiée puis
 * renversée : raccord sans couture), bas fondu sur 80 px. Rendus DÉRIVÉS,
 * ajoutés en M6 sans rien remplacer. Mobile : les fonds prolongeables de M5-B.
 */
export const CONTRIBUTIONS_ALBUM_BACKGROUND: Record<ContributionsAlbumFrame, Record<ContributionsTheme, ContributionsAlbumBackground>> = {
  desktop: {
    light: {
      top: `${DESKTOP_FONDS}/fond-album-desktop-light-haut.webp`,
      middle: `${DESKTOP_FONDS}/fond-album-desktop-light-milieu.webp`,
      bottom: `${DESKTOP_FONDS}/fond-album-desktop-light-bas.webp`,
      topHeight: 480,
      middleHeight: 240,
      bottomHeight: 341,
    },
    dark: {
      top: `${DESKTOP_FONDS}/fond-album-desktop-dark-haut.webp`,
      middle: `${DESKTOP_FONDS}/fond-album-desktop-dark-milieu.webp`,
      bottom: `${DESKTOP_FONDS}/fond-album-desktop-dark-bas.webp`,
      topHeight: 600,
      middleHeight: 200,
      bottomHeight: 241,
    },
  },
  mobile: {
    light: { ...CONTRIBUTIONS_MOBILE_BACKGROUND.light },
    dark: { ...CONTRIBUTIONS_MOBILE_BACKGROUND.dark },
  },
};
