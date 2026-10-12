import type { SkinVariant } from "@/config/skins";

/**
 * Récit de vie V2 — Mobile, architecture « A » retenue par le QG (Master
 * authentique + papier central CSS + hauteur dynamique, sans nouvel asset
 * Studio). PROTOTYPE LOCAL — non branché sur le Mémorial.
 *
 * ## Matière ≠ nom de fichier du handoff (autorité PO)
 *
 * Les assets et les jeux de réglages portent le nom de leur MATIÈRE,
 * jamais l'étiquette « light/dark » des fichiers du handoff
 * `HERITAGE_A03_HANDOFF_RUNTIME_FINAL_V2`. L'affectation d'une matière à
 * une variante est une décision artistique de la PO, propre au Récit de
 * vie, et vit dans une seule table : `RECIT_V2_ARTWORK_FOR_VARIANT`.
 *
 *   - Récit LIGHT = bleu pétrole (handoff : `mobile_dark.png`) ;
 *   - Récit DARK  = ivoire / champagne (handoff : `mobile_light.png`).
 *
 * Cette table ne change ni `skin_variant`, ni le Hero, ni aucune autre
 * section : elle ne fait que traduire, pour le Récit V2 seul, la variante
 * du mémorial en matière.
 *
 * ## Le décor
 *
 * Le Master est copié octet pour octet et n'est jamais modifié ni découpé
 * en fichiers : le haut [0:cutY] et le bas [cutY:H] sont le même fichier,
 * positionné par CSS. Quand le texte demande plus de hauteur que le
 * Master, une surface de papier CSS s'ouvre à la ligne de coupe : teinte =
 * profil horizontal moyen de rangées sans feuillage autour de la coupe,
 * lissé (aucune rangée de pixels étirée) ; grain = tuile dérivée du Master
 * (seul le grain du papier se répète, jamais un ornement) ; fondu de
 * `fadePx` aux deux raccords.
 */

export type RecitV2Artwork = "ivoireChampagne" | "bleuPetrole";

/** Décision PO — Récit de vie seulement. Toute autre affectation est une
 * régression (verrouillée par les tests). */
export const RECIT_V2_ARTWORK_FOR_VARIANT: Readonly<Record<SkinVariant, RecitV2Artwork>> = Object.freeze({
  light: "bleuPetrole",
  dark: "ivoireChampagne",
});

/** Tout ce qui distingue une matière ; le moteur de mise en page
 * (`RecitDeVieMobileV2`) est commun. Géométrie en px de canevas ou en
 * fraction du Master ; couleurs en valeurs CSS. */
export interface RecitV2MobileArtworkTokens {
  masterSrc: string;
  /** SHA-256 du Master, identique au fichier du handoff. */
  masterSha256: string;
  grainSrc: string;
  canvas: { width: number; height: number };
  /** Ligne de coupe : dernière rangée du haut = cutY − 1. */
  cutY: number;
  fadePx: number;
  /** Tuile de grain (px de canevas). */
  grainTile: { width: number; height: number };
  /** Début du texte et marge de pied, en fraction de la hauteur du Master. */
  textTop: number;
  foot: number;
  /** Zone de texte horizontale de l'en-tête, en fraction de la largeur. */
  textLeft: number;
  textRight: number;
  /** Limite droite des chapitres, en fraction de la largeur. */
  chapterRight: number;
  paperProfile: string;
  /** Modes de fusion des trois couches du papier : grain, bruit, teinte. */
  paperBlend: string;
  ink: string;
  /** Filets : séparateur, filets entre chapitres, filet vertical. */
  rule: string;
  /** Petit filet sous le titre de chapitre. */
  accentRule: string;
  numberGradient: string;
}

/**
 * Ivoire / champagne — Récit DARK. Master : `mobile_light.png` du handoff
 * (941×1672). Profil : rangées 960–1040, lissé σ = 22 px ; grain : zone
 * 420×300 la plus calme (x 240 / y 660), tendance basse fréquence retirée,
 * mise en miroir ; fondu dans les rangées 964–1035, mesurées sans
 * feuillage. Rendu validé artistiquement par le QG (16 captures de
 * référence : court, moyen, long, mixte × 320/375/390/430).
 */
const IVOIRE_CHAMPAGNE: RecitV2MobileArtworkTokens = {
  masterSrc: "/assets/recit-de-vie/runtime-v2/mobile/ivoire-champagne.png",
  masterSha256: "7c228a98e628d5074082c0d6d1916ef6804af1dd301620ee5b1634d89198056f",
  grainSrc: "/assets/recit-de-vie/runtime-v2/mobile/ivoire-champagne-grain.png",
  canvas: { width: 941, height: 1672 },
  cutY: 1000,
  fadePx: 36,
  grainTile: { width: 840, height: 600 },
  /** 0,157 : maquette. Pied 0,055 (maquette : 0,045) : sous la rangée 1580,
   * le bord déchiré droit rentre jusqu'à x 0,84. */
  textTop: 0.157,
  foot: 0.055,
  /** Contrat V2 : x 0,12–0,88 ; feuilles gauche jusqu'à x ≈ 0,117. */
  textLeft: 0.13,
  textRight: 0.88,
  /** Le bord déchiré du feuillet droit atteint x 0,87 entre les rangées
   * 1400 et 1560 du bas ; l'en-tête, centré, garde 0,88. */
  chapterRight: 0.86,
  paperProfile: "linear-gradient(to right, rgb(205,154,111) 0.0%, rgb(211,157,110) 4.1%, rgb(223,171,123) 8.3%, rgb(234,195,156) 12.6%, rgb(240,206,170) 16.7%, rgb(242,210,175) 20.9%, rgb(244,213,179) 25.0%, rgb(245,216,183) 29.1%, rgb(245,217,185) 33.3%, rgb(244,217,186) 37.4%, rgb(244,218,188) 41.7%, rgb(245,219,189) 45.9%, rgb(245,219,190) 50.0%, rgb(245,219,190) 54.1%, rgb(244,219,189) 58.3%, rgb(244,218,187) 62.6%, rgb(244,217,186) 66.7%, rgb(244,216,185) 70.9%, rgb(243,215,184) 75.0%, rgb(242,213,182) 79.1%, rgb(240,211,179) 83.3%, rgb(239,207,174) 87.4%, rgb(234,197,160) 91.7%, rgb(211,167,123) 95.9%, rgb(202,153,101) 100.0%)",
  paperBlend: "overlay, soft-light, normal",
  ink: "#39332E",
  rule: "rgb(139 106 69 / 0.7)",
  accentRule: "rgb(148 89 43 / 0.85)",
  numberGradient: "linear-gradient(180deg, #c08850 0%, #94592b 55%, #6e3f1c 100%)",
};

/** Les matières disponibles. `bleuPetrole` (Récit LIGHT) n'est pas encore
 * construit : il n'a pas d'entrée, et le Récit LIGHT ne se rabat JAMAIS sur
 * une autre matière (voir `resolveRecitV2MobileArtwork`). */
export const RECIT_V2_MOBILE_ARTWORKS: Readonly<Partial<Record<RecitV2Artwork, RecitV2MobileArtworkTokens>>> = Object.freeze({
  ivoireChampagne: IVOIRE_CHAMPAGNE,
});

export type RecitV2MobileArtworkResolution =
  | { status: "ready"; artwork: RecitV2Artwork; tokens: RecitV2MobileArtworkTokens }
  | { status: "pending"; artwork: RecitV2Artwork };

/** La matière du Récit V2 Mobile pour une variante — `pending` tant que
 * cette matière n'est pas construite, sans repli sur l'autre. */
export function resolveRecitV2MobileArtwork(variant: SkinVariant): RecitV2MobileArtworkResolution {
  const artwork = RECIT_V2_ARTWORK_FOR_VARIANT[variant];
  const tokens = RECIT_V2_MOBILE_ARTWORKS[artwork];
  return tokens === undefined ? { status: "pending", artwork } : { status: "ready", artwork, tokens };
}
