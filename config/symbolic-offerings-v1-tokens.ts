import type { SkinVariant } from "@/config/skins";

/**
 * Offrandes symboliques Intemporel V1 — scènes de recueillement (état final
 * après le geste), pilote statique M1. Aucune entrée de registre, aucun
 * ordre de rubrique : page pilote seulement.
 *
 * Toute la géométrie est en px de canevas du fond de la variante (Mobile
 * 941 × 1672, Desktop 1670 × 942) et reprend exactement les 12 maquettes
 * statiques validées par la PO (placement, échelle, ombres, ancrage
 * flamme / mèche, halo, lueur de la cire, lignes de base des textes).
 * Les textes sont posés par leur ligne de base : `baseline` est la ligne
 * de base de la maquette ; leur corps a un plancher de lecture en px CSS.
 *
 * `textMaxWidth` : largeur libre du fond, symétrique autour de l'axe, sur
 * la hauteur des lignes de confirmation de la maquette (mesurée sur le
 * fond) : au-delà, une confirmation agrandie par son plancher passe à la
 * ligne plutôt que de recouvrir le décor.
 */

export type OfferingKind = "bougie" | "lys" | "coeur";
export const OFFERING_KINDS: readonly OfferingKind[] = ["bougie", "lys", "coeur"];

/** Chemin servi, sans extension : `.avif` (principal) et `.webp` (repli sans perte). */
export type ImageBase = string;

export interface OfferingsV1Text { size: number; baseline: number; trackingEm?: number }
export interface OfferingsV1Box { left: number; top: number; width: number; height: number }
export interface OfferingsV1Shadow { dx: number; dy: number; sigma: number; color: string }
export interface OfferingsV1Glow { cx: number; cy: number; rx: number; ry: number; peak: number; rgb: readonly [number, number, number] }

export interface OfferingsV1Scene {
  object: ImageBase;
  box: OfferingsV1Box;
  /** Ombre portée large, puis ombre de contact (ordre de composition). */
  shadows: readonly [OfferingsV1Shadow, OfferingsV1Shadow];
  /** Bougie seulement : flamme calée sur la mèche, halo, lueur de la cire
   * (`wax` : coordonnées relatives à `box`, limitée à la bougie). */
  flame?: { image: ImageBase; box: OfferingsV1Box; wick: readonly [number, number] };
  halo?: OfferingsV1Glow;
  wax?: OfferingsV1Glow;
  confirmation: { lines: readonly string[]; size: number; baseline: number; lineHeight: number; textMaxWidth: number };
  /** Écart vertical entre le bas des lignes de confirmation et le bouton. */
  buttonGap: number;
  /** Largeur libre du fond autour de l'axe à hauteur du bouton (marge de
   * 8 px) : avec les planchers de lecture, le bouton n'en sort jamais ; son
   * libellé passe sur deux lignes s'il le faut. */
  buttonMaxWidth: number;
}

/** Bloc de lignes centrées : ligne de base de la première, pas entre lignes. */
export interface OfferingsV1Lines { lines: readonly string[]; size: number; baseline: number; step: number }

/**
 * État « cartes » — RECONSTITUTION PROVISOIRE, NON VALIDÉE ARTISTIQUEMENT.
 * Décor de sélection validé (avec cartes, sans texte) ; textes posés
 * d'après les Masters illustrés (hauts et largeurs d'encre). Pilote
 * seulement, jusqu'à validation PO.
 */
export interface OfferingsV1Card {
  kind: OfferingKind;
  box: OfferingsV1Box;
  title: OfferingsV1Lines;
  description: OfferingsV1Lines;
  /** Encres propres à une carte (papier olive du Desktop Dark). */
  ink?: { title: string; body: string };
}

export interface OfferingsV1Selection {
  decor: ImageBase;
  intro: OfferingsV1Lines;
  footer: OfferingsV1Lines;
  cards: readonly OfferingsV1Card[];
}

export interface OfferingsV1Composition {
  canvas: { width: number; height: number };
  fond: ImageBase;
  /** Axe des textes (x). */
  axis: number;
  header: { heritage: OfferingsV1Text; subtitle: OfferingsV1Text; title: OfferingsV1Text; script: OfferingsV1Text };
  scenes: Readonly<Record<OfferingKind, OfferingsV1Scene>>;
  selection: OfferingsV1Selection;
}

export interface OfferingsV1Ink { title: string; lockup: string; body: string; script: string; buttonLine: string; buttonLabel: string }

const IMG = "/assets/offrandes/v1";

/** Encres relevées sur les Masters (Light : Mobile Light ; Dark : Mobile Dark), communes Mobile/Desktop. */
export const OFFERINGS_V1_INK: Readonly<Record<SkinVariant, OfferingsV1Ink>> = {
  light: { title: "rgb(44 38 28)", lockup: "rgb(44 38 28)", body: "rgb(60 55 44)", script: "rgb(111 81 40)", buttonLine: "rgb(111 81 40 / 0.784)", buttonLabel: "rgb(60 55 44)" },
  dark: { title: "rgb(246 232 216)", lockup: "rgb(232 224 208)", body: "rgb(216 213 201)", script: "rgb(229 209 175)", buttonLine: "rgb(216 191 144 / 0.824)", buttonLabel: "rgb(232 224 208)" },
};

export const OFFERINGS_V1_TOKENS: Readonly<Record<SkinVariant, { mobile: OfferingsV1Composition; desktop: OfferingsV1Composition }>> = {
  light: {
    mobile: {
      canvas: { width: 941, height: 1672 },
      fond: `${IMG}/fonds/mobile-light`,
      axis: 472,
      header: {
        heritage: { size: 40, baseline: 77.0, trackingEm: 0.1 },
        subtitle: { size: 14, baseline: 95.0, trackingEm: 0.3286 },
        title: { size: 75, baseline: 200.0 },
        script: { size: 68, baseline: 259.0 },
      },
      scenes: {
        bougie: {
          object: `${IMG}/objets/bougie`,
          box: { left: 154, top: 640, width: 622, height: 415 },
          shadows: [
            { dx: 6, dy: 11, sigma: 14, color: "rgba(78,52,30,0.3)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(60,40,22,0.16)" },
          ],
          flame: { image: `${IMG}/objets/flamme`, box: { left: 350, top: 596, width: 239, height: 159 }, wick: [471.72, 741.25] },
          halo: { cx: 471.72, cy: 667.58, rx: 167.44, ry: 180.84, peak: 0.22, rgb: [255, 226, 180] },
          wax: { cx: 317.72, cy: 111.38, rx: 151.88, ry: 70.88, peak: 0.42, rgb: [255, 214, 150] },
          confirmation: { lines: ["Une lumière brille désormais", "en sa mémoire."], size: 28, baseline: 1065.0, lineHeight: 1.35714, textMaxWidth: 382 },
          buttonGap: 42.93,
          buttonMaxWidth: 262,
        },
        lys: {
          object: `${IMG}/objets/lys`,
          box: { left: 204, top: 667, width: 538, height: 358 },
          shadows: [
            { dx: 5, dy: 10, sigma: 14, color: "rgba(78,52,30,0.3)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(60,40,22,0.16)" },
          ],
          confirmation: { lines: ["Une fleur déposée en sa mémoire."], size: 28, baseline: 1064.0, lineHeight: 1.35714, textMaxWidth: 506 },
          buttonGap: 42.93,
          buttonMaxWidth: 272,
        },
        coeur: {
          object: `${IMG}/objets/coeur`,
          box: { left: 168, top: 643, width: 599, height: 399 },
          shadows: [
            { dx: 6, dy: 11, sigma: 14, color: "rgba(78,52,30,0.3)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(60,40,22,0.16)" },
          ],
          confirmation: { lines: ["Une pensée d’amour offerte", "en sa mémoire."], size: 28, baseline: 1064.0, lineHeight: 1.35714, textMaxWidth: 382 },
          buttonGap: 42.93,
          buttonMaxWidth: 262,
        },
      },
      selection: {
        decor: `${IMG}/selection/mobile-light`,
        intro: { lines: ["À travers un simple geste,", "faites vivre votre présence", "et honorez son souvenir."], size: 29, baseline: 320.0, step: 33.5 },
        footer: { lines: ["Chaque geste est une pensée", "offerte en sa mémoire."], size: 29, baseline: 1382.0, step: 36.0 },
        cards: [
          { kind: "lys", box: { left: 78, top: 442, width: 387, height: 431 }, title: { lines: ["Déposer une fleur"], size: 38, baseline: 748.0, step: 0.0 }, description: { lines: ["Une fleur pour exprimer", "votre affection."], size: 28, baseline: 805.0, step: 38.0 } },
          { kind: "bougie", box: { left: 480, top: 442, width: 408, height: 431 }, title: { lines: ["Allumer une bougie"], size: 38, baseline: 748.0, step: 0.0 }, description: { lines: ["Une lumière pour garder", "son souvenir vivant."], size: 28, baseline: 805.0, step: 36.0 } },
          { kind: "coeur", box: { left: 267, top: 877, width: 411, height: 403 }, title: { lines: ["Offrir un cœur"], size: 38, baseline: 1165.0, step: 0.0 }, description: { lines: ["Un symbole d’amour", "toujours présent."], size: 28, baseline: 1224.0, step: 37.0 } },
        ],
      },
    },
    desktop: {
      canvas: { width: 1670, height: 942 },
      fond: `${IMG}/fonds/desktop-light`,
      axis: 836,
      header: {
        heritage: { size: 38, baseline: 60.0, trackingEm: 0.1 },
        subtitle: { size: 13, baseline: 77.0, trackingEm: 0.3385 },
        title: { size: 74, baseline: 176.0 },
        script: { size: 77, baseline: 243.0 },
      },
      scenes: {
        bougie: {
          object: `${IMG}/objets/bougie`,
          box: { left: 510, top: 360, width: 637, height: 425 },
          shadows: [
            { dx: 6, dy: 11, sigma: 14, color: "rgba(78,52,30,0.3)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(60,40,22,0.16)" },
          ],
          flame: { image: `${IMG}/objets/flamme`, box: { left: 711, top: 315, width: 245, height: 163 }, wick: [835.57, 463.75] },
          halo: { cx: 835.57, cy: 388.26, rx: 171.58, ry: 185.3, peak: 0.22, rgb: [255, 226, 180] },
          wax: { cx: 325.57, cy: 114.12, rx: 155.62, ry: 72.62, peak: 0.42, rgb: [255, 214, 150] },
          confirmation: { lines: ["Une lumière brille désormais en sa mémoire."], size: 28, baseline: 794.0, lineHeight: 1.35714, textMaxWidth: 646 },
          buttonGap: 42.93,
          buttonMaxWidth: 284,
        },
        lys: {
          object: `${IMG}/objets/lys`,
          box: { left: 536, top: 372, width: 576, height: 384 },
          shadows: [
            { dx: 6, dy: 10, sigma: 14, color: "rgba(78,52,30,0.3)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(60,40,22,0.16)" },
          ],
          confirmation: { lines: ["Une fleur déposée en sa mémoire."], size: 28, baseline: 795.0, lineHeight: 1.35714, textMaxWidth: 644 },
          buttonGap: 42.93,
          buttonMaxWidth: 282,
        },
        coeur: {
          object: `${IMG}/objets/coeur`,
          box: { left: 542, top: 392, width: 568, height: 379 },
          shadows: [
            { dx: 6, dy: 10, sigma: 14, color: "rgba(78,52,30,0.3)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(60,40,22,0.16)" },
          ],
          confirmation: { lines: ["Une pensée d’amour offerte en sa mémoire."], size: 28, baseline: 795.0, lineHeight: 1.35714, textMaxWidth: 644 },
          buttonGap: 42.93,
          buttonMaxWidth: 282,
        },
      },
      selection: {
        decor: `${IMG}/selection/desktop-light`,
        intro: { lines: ["À travers un simple geste, faites vivre votre présence", "et honorez son souvenir."], size: 27, baseline: 287.0, step: 29.0 },
        footer: { lines: ["Chaque geste est une pensée offerte en sa mémoire."], size: 27, baseline: 835.0, step: 0.0 },
        cards: [
          { kind: "lys", box: { left: 287, top: 371, width: 353, height: 387 }, title: { lines: ["Déposer une fleur"], size: 33, baseline: 634.0, step: 0.0 }, description: { lines: ["Une fleur pour exprimer", "votre affection."], size: 25, baseline: 690.0, step: 33.0 } },
          { kind: "bougie", box: { left: 658, top: 371, width: 364, height: 387 }, title: { lines: ["Allumer une bougie"], size: 33, baseline: 634.0, step: 0.0 }, description: { lines: ["Une lumière pour garder", "son souvenir vivant."], size: 25, baseline: 690.0, step: 31.0 } },
          { kind: "coeur", box: { left: 1040, top: 371, width: 351, height: 387 }, title: { lines: ["Offrir un cœur"], size: 33, baseline: 634.0, step: 0.0 }, description: { lines: ["Un symbole d’amour", "toujours présent."], size: 25, baseline: 690.0, step: 32.0 } },
        ],
      },
    },
  },
  dark: {
    mobile: {
      canvas: { width: 941, height: 1672 },
      fond: `${IMG}/fonds/mobile-dark`,
      axis: 470,
      header: {
        heritage: { size: 40, baseline: 74.0, trackingEm: 0.0353 },
        subtitle: { size: 15, baseline: 96.0, trackingEm: 0.2563 },
        title: { size: 74, baseline: 217.0 },
        script: { size: 62, baseline: 276.0 },
      },
      scenes: {
        bougie: {
          object: `${IMG}/objets/bougie`,
          box: { left: 213, top: 528, width: 507, height: 338 },
          shadows: [
            { dx: 5, dy: 9, sigma: 14, color: "rgba(0,0,0,0.55)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(0,0,0,0.35)" },
          ],
          flame: { image: `${IMG}/objets/flamme`, box: { left: 373, top: 492, width: 195, height: 130 }, wick: [471.88, 610.5] },
          halo: { cx: 471.88, cy: 550.47, rx: 136.43, ry: 147.35, peak: 0.22, rgb: [255, 226, 180] },
          wax: { cx: 258.88, cy: 90.75, rx: 123.75, ry: 57.75, peak: 0.42, rgb: [255, 214, 150] },
          confirmation: { lines: ["Une lumière brille désormais", "en sa mémoire."], size: 28, baseline: 884.0, lineHeight: 1.35714, textMaxWidth: 348 },
          buttonGap: 42.93,
          buttonMaxWidth: 396,
        },
        lys: {
          object: `${IMG}/objets/lys`,
          box: { left: 217, top: 496, width: 522, height: 348 },
          shadows: [
            { dx: 5, dy: 9, sigma: 14, color: "rgba(0,0,0,0.55)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(0,0,0,0.35)" },
          ],
          confirmation: { lines: ["Une fleur déposée en sa mémoire."], size: 28, baseline: 884.0, lineHeight: 1.35714, textMaxWidth: 354 },
          buttonGap: 42.93,
          buttonMaxWidth: 376,
        },
        coeur: {
          object: `${IMG}/objets/coeur`,
          box: { left: 202, top: 486, width: 561, height: 374 },
          shadows: [
            { dx: 5, dy: 10, sigma: 14, color: "rgba(0,0,0,0.55)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(0,0,0,0.35)" },
          ],
          confirmation: { lines: ["Une pensée d’amour offerte", "en sa mémoire."], size: 28, baseline: 884.0, lineHeight: 1.35714, textMaxWidth: 348 },
          buttonGap: 42.93,
          buttonMaxWidth: 396,
        },
      },
      selection: {
        decor: `${IMG}/selection/mobile-dark`,
        intro: { lines: ["À travers un simple geste,", "faites vivre votre présence", "et honorez son souvenir."], size: 31, baseline: 349.0, step: 29.5 },
        footer: { lines: ["Chaque geste est une pensée", "offerte en sa mémoire."], size: 31, baseline: 1438.0, step: 32.0 },
        cards: [
          { kind: "lys", box: { left: 90, top: 473, width: 371, height: 398 }, title: { lines: ["Déposer une fleur"], size: 35, baseline: 761.0, step: 0.0 }, description: { lines: ["Une fleur pour exprimer", "votre affection."], size: 26, baseline: 824.0, step: 35.0 } },
          { kind: "bougie", box: { left: 488, top: 479, width: 367, height: 411 }, title: { lines: ["Allumer une bougie"], size: 35, baseline: 766.0, step: 0.0 }, description: { lines: ["Une lumière pour garder", "son souvenir vivant."], size: 26, baseline: 825.0, step: 36.0 } },
          { kind: "coeur", box: { left: 262, top: 879, width: 423, height: 400 }, title: { lines: ["Offrir un cœur"], size: 35, baseline: 1161.0, step: 0.0 }, description: { lines: ["Un symbole d’amour", "toujours présent."], size: 26, baseline: 1227.0, step: 35.0 } },
        ],
      },
    },
    desktop: {
      canvas: { width: 1670, height: 942 },
      fond: `${IMG}/fonds/desktop-dark`,
      axis: 848,
      header: {
        heritage: { size: 38, baseline: 60.0, trackingEm: 0.0307 },
        subtitle: { size: 14, baseline: 80.0, trackingEm: 0.2331 },
        title: { size: 82, baseline: 184.0 },
        script: { size: 85, baseline: 255.0 },
      },
      scenes: {
        bougie: {
          object: `${IMG}/objets/bougie`,
          box: { left: 534, top: 374, width: 614, height: 410 },
          shadows: [
            { dx: 6, dy: 11, sigma: 14, color: "rgba(0,0,0,0.55)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(0,0,0,0.35)" },
          ],
          flame: { image: `${IMG}/objets/flamme`, box: { left: 727, top: 330, width: 236, height: 158 }, wick: [847.8, 474.0] },
          halo: { cx: 847.8, cy: 401.24, rx: 165.38, ry: 178.61, peak: 0.22, rgb: [255, 226, 180] },
          wax: { cx: 313.8, cy: 110.0, rx: 150.0, ry: 70.0, peak: 0.42, rgb: [255, 214, 150] },
          confirmation: { lines: ["Une lumière brille désormais en sa mémoire."], size: 28, baseline: 795.0, lineHeight: 1.35714, textMaxWidth: 528 },
          buttonGap: 42.93,
          buttonMaxWidth: 258,
        },
        lys: {
          object: `${IMG}/objets/lys`,
          box: { left: 522, top: 322, width: 653, height: 435 },
          shadows: [
            { dx: 6, dy: 12, sigma: 14, color: "rgba(0,0,0,0.55)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(0,0,0,0.35)" },
          ],
          confirmation: { lines: ["Une fleur déposée en sa mémoire."], size: 28, baseline: 794.0, lineHeight: 1.35714, textMaxWidth: 528 },
          buttonGap: 42.93,
          buttonMaxWidth: 260,
        },
        coeur: {
          object: `${IMG}/objets/coeur`,
          box: { left: 485, top: 287, width: 737, height: 492 },
          shadows: [
            { dx: 7, dy: 13, sigma: 14, color: "rgba(0,0,0,0.55)" },
            { dx: 2, dy: 4, sigma: 4, color: "rgba(0,0,0,0.35)" },
          ],
          confirmation: { lines: ["Une pensée d’amour offerte en sa mémoire."], size: 28, baseline: 795.0, lineHeight: 1.35714, textMaxWidth: 528 },
          buttonGap: 42.93,
          buttonMaxWidth: 258,
        },
      },
      selection: {
        decor: `${IMG}/selection/desktop-dark`,
        intro: { lines: ["À travers un simple geste, faites vivre votre présence", "et honorez son souvenir."], size: 25, baseline: 301.0, step: 25.0 },
        footer: { lines: ["Chaque geste est une pensée offerte en sa mémoire."], size: 25, baseline: 886.0, step: 0.0 },
        cards: [
          { kind: "lys", box: { left: 307, top: 357, width: 349, height: 383 }, title: { lines: ["Déposer une fleur"], size: 33, baseline: 624.0, step: 0.0 }, description: { lines: ["Une fleur pour exprimer", "votre affection."], size: 24, baseline: 676.0, step: 35.0 }, ink: { title: "rgb(240 232 216)", body: "rgb(226 219 204)" } },
          { kind: "bougie", box: { left: 675, top: 360, width: 349, height: 381 }, title: { lines: ["Allumer une bougie"], size: 33, baseline: 624.0, step: 0.0 }, description: { lines: ["Une lumière pour garder", "son souvenir vivant."], size: 24, baseline: 676.0, step: 33.0 } },
          { kind: "coeur", box: { left: 1039, top: 358, width: 343, height: 384 }, title: { lines: ["Offrir un cœur"], size: 33, baseline: 624.0, step: 0.0 }, description: { lines: ["Un symbole d’amour", "toujours présent."], size: 24, baseline: 676.0, step: 34.0 }, ink: { title: "rgb(240 232 216)", body: "rgb(226 219 204)" } },
        ],
      },
    },
  },
};
