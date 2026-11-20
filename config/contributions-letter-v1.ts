/**
 * M8-E6-A — « La lettre des proches » : géométrie des deux Masters du Studio
 * (direction artistique validée par la PO), en pixels du Master.
 *
 * Les Masters sont les décors définitifs : ils ne sont jamais recréés en CSS
 * ni régénérés. Les deux ambiances (Light, Dark) utilisent le même Master ;
 * seul le fond derrière la lettre change.
 *
 * Mesures relevées sur les fichiers (détection des couleurs du filet doré et
 * des rameaux) :
 *  - `rule` : filet doré intérieur ;
 *  - `header`, `body`, `footer`, `close` : zones de lecture sûres, hors des
 *    rameaux et de l'enveloppe ;
 *  - `band` (Mobile seulement) : bandeau sans ornement, entre le bas de
 *    l'enveloppe et le haut du rameau inférieur, où la lettre peut être
 *    allongée (voir `letterLayout`).
 *
 * Desktop : AUCUN bandeau propre n'existe (l'enveloppe occupe les lignes
 * 250 à 650 et le rameau inférieur commence ligne 615) ; le Master garde
 * donc ses proportions exactes et le contenu long défile à l'intérieur.
 */

export interface LetterRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LetterMaster {
  src: string;
  width: number;
  height: number;
  rule: LetterRect;
  close: LetterRect;
  header: LetterRect;
  body: LetterRect;
  footer: LetterRect;
  /** Bandeau répétable en miroir ; `null` : aucune extension possible. */
  band: { top: number; bottom: number } | null;
}

export type LetterFrame = "desktop" | "mobile";

export const LETTER_MASTERS: Readonly<Record<LetterFrame, LetterMaster>> = {
  desktop: {
    src: "/assets/contributions/v1/lettre/lettre-des-proches-desktop.webp",
    width: 1536,
    height: 1024,
    rule: { left: 140, top: 87, right: 1406, bottom: 913 },
    close: { left: 1330, top: 104, right: 1392, bottom: 166 },
    header: { left: 430, top: 108, right: 1106, bottom: 268 },
    body: { left: 412, top: 272, right: 1124, bottom: 812 },
    footer: { left: 412, top: 818, right: 1124, bottom: 900 },
    band: null,
  },
  mobile: {
    src: "/assets/contributions/v1/lettre/lettre-des-proches-mobile.webp",
    width: 1090,
    height: 1443,
    rule: { left: 130, top: 68, right: 996, bottom: 1289 },
    close: { left: 924, top: 84, right: 984, bottom: 144 },
    header: { left: 470, top: 92, right: 920, bottom: 330 },
    body: { left: 172, top: 345, right: 954, bottom: 905 },
    footer: { left: 172, top: 925, right: 690, bottom: 1272 },
    band: { top: 830, bottom: 900 },
  },
};

/** Au-delà de cette largeur de fenêtre, la lettre Desktop (paysage). */
export const LETTER_DESKTOP_MIN_WIDTH = 760;

/** Lettre Desktop : largeur maximale, marge autour de la lettre. */
export const LETTER_DESKTOP_MAX_WIDTH = 1000;
export const LETTER_VIEWPORT_MARGIN = 16;

/** Mobile : hauteur maximale de la lettre allongée, en multiple du Master. */
export const LETTER_MOBILE_MAX_GROWTH = 1.6;

export interface LetterLayout {
  frame: LetterFrame;
  /** Échelle : pixels CSS par pixel du Master. */
  scale: number;
  width: number;
  /** Hauteur totale, extensions comprises. */
  height: number;
  /** Nombre de paires de bandeaux ajoutées (0 : le Master tel quel). */
  extensions: number;
  /** Hauteur ajoutée en pixels CSS (les zones sous le bandeau descendent d'autant). */
  extensionPx: number;
}

/**
 * Taille de la lettre. Aucune déformation : une seule échelle, la même en
 * largeur et en hauteur. Sur Mobile, la lettre s'allonge par PAIRES de
 * bandeaux (bandeau retourné, puis bandeau), si bien que la suite des
 * bandeaux, bandeau d'origine compris, est toujours impaire : chaque
 * jonction rejoint exactement la ligne voisine du Master (aucune couture).
 *
 * `contentOverflow` : hauteur (pixels CSS) qui manque au contenu dans la
 * zone `body` à l'échelle courante ; `maxHeight` : hauteur que la lettre
 * ne doit pas dépasser (au-delà, le contenu défile à l'intérieur).
 */
export function letterLayout(input: { viewportWidth: number; viewportHeight: number; contentOverflow: number }): LetterLayout {
  const desktop = input.viewportWidth >= LETTER_DESKTOP_MIN_WIDTH;
  const frame: LetterFrame = desktop ? "desktop" : "mobile";
  const m = LETTER_MASTERS[frame];
  const margin = LETTER_VIEWPORT_MARGIN;
  const width = desktop
    ? Math.floor(Math.min(LETTER_DESKTOP_MAX_WIDTH, input.viewportWidth - 2 * margin, ((input.viewportHeight - 2 * margin) * m.width) / m.height))
    : Math.floor(Math.min(input.viewportWidth, 560));
  const scale = width / m.width;
  const base = m.height * scale;
  let extensions = 0;
  if (m.band && input.contentOverflow > 0) {
    const pair = 2 * (m.band.bottom - m.band.top) * scale;
    // Mobile : la lettre peut dépasser l'écran (la fenêtre défile, ce qui reste
    // naturel au doigt et avec le clavier ouvert), jusqu'à 1,6 fois sa hauteur.
    const room = Math.max(0, Math.max(input.viewportHeight - 2 * margin, LETTER_MOBILE_MAX_GROWTH * base) - base);
    const maxPairs = Math.floor(room / pair);
    extensions = Math.min(maxPairs, Math.ceil(input.contentOverflow / pair));
  }
  const extensionPx = m.band ? extensions * 2 * (m.band.bottom - m.band.top) * scale : 0;
  return { frame, scale, width, height: base + extensionPx, extensions, extensionPx };
}

/**
 * Les morceaux du Master à dessiner, de haut en bas, en pixels du Master.
 * `flip` : bandeau retourné verticalement (miroir).
 */
export function letterSlices(frame: LetterFrame, extensions: number): { top: number; bottom: number; flip: boolean }[] {
  const m = LETTER_MASTERS[frame];
  if (!m.band || extensions <= 0) return [{ top: 0, bottom: m.height, flip: false }];
  const slices = [{ top: 0, bottom: m.band.bottom, flip: false }];
  for (let i = 0; i < extensions; i++) {
    slices.push({ top: m.band.top, bottom: m.band.bottom, flip: true });
    slices.push({ top: m.band.top, bottom: m.band.bottom, flip: false });
  }
  slices.push({ top: m.band.bottom, bottom: m.height, flip: false });
  return slices;
}
