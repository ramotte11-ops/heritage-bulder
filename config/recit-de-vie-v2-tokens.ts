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
  /** Couches de grain du papier central (tuiles dérivées du Master), de la
   * plus haute à la plus basse ; largeur de tuile en px de canevas. */
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  canvas: { width: number; height: number };
  /** Ligne de coupe : dernière rangée du haut = cutY − 1. */
  cutY: number;
  fadePx: number;
  /** Début du texte et marge de pied, en fraction de la hauteur du Master. */
  textTop: number;
  foot: number;
  /** Zone de texte horizontale de l'en-tête, en fraction de la largeur. */
  textLeft: number;
  textRight: number;
  /** Limite droite des chapitres, en fraction de la largeur. */
  chapterRight: number;
  /** Retraits supplémentaires de l'en-tête (gauche, droite), en fraction de
   * la largeur, au-delà de textLeft / textRight. */
  headerInsetLeft: number;
  headerInsetRight: number;
  /** Colonne des numéros (largeur) et retrait du numéro dans la colonne,
   * en fraction de la largeur. */
  numberColumn: number;
  numberInset: number;
  /** Taille des numéros 01/02/03, en px CSS. */
  numberSize: number;
  /** Écart minimal garanti entre le numéro le plus large et le filet
   * vertical, en px CSS ; 0 = pas de garde. Aux largeurs où l'écart naturel
   * est plus petit, le filet se décale vers la droite DANS la marge du
   * texte : la colonne de lecture ne bouge pas. */
  ruleMinGap: number;
  paperProfile: string;
  /** Mode de fusion du bruit grossier SVG, sous les grains. */
  noiseBlend: string;
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
  paperGrains: [{ src: "/assets/recit-de-vie/runtime-v2/mobile/ivoire-champagne-grain.png", tileWidth: 840, blend: "overlay" }],
  canvas: { width: 941, height: 1672 },
  cutY: 1000,
  fadePx: 36,
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
  headerInsetLeft: 0,
  headerInsetRight: 0,
  /** Le numéro commence à 0,165 (maquette : 0,19), hors de l'arbuste flou
   * du bas, qui atteint 0,15 entre les rangées 1240 et 1440. */
  numberColumn: 0.205,
  numberInset: 0.035,
  numberSize: 46,
  ruleMinGap: 0,
  paperProfile: "linear-gradient(to right, rgb(205,154,111) 0.0%, rgb(211,157,110) 4.1%, rgb(223,171,123) 8.3%, rgb(234,195,156) 12.6%, rgb(240,206,170) 16.7%, rgb(242,210,175) 20.9%, rgb(244,213,179) 25.0%, rgb(245,216,183) 29.1%, rgb(245,217,185) 33.3%, rgb(244,217,186) 37.4%, rgb(244,218,188) 41.7%, rgb(245,219,189) 45.9%, rgb(245,219,190) 50.0%, rgb(245,219,190) 54.1%, rgb(244,219,189) 58.3%, rgb(244,218,187) 62.6%, rgb(244,217,186) 66.7%, rgb(244,216,185) 70.9%, rgb(243,215,184) 75.0%, rgb(242,213,182) 79.1%, rgb(240,211,179) 83.3%, rgb(239,207,174) 87.4%, rgb(234,197,160) 91.7%, rgb(211,167,123) 95.9%, rgb(202,153,101) 100.0%)",
  noiseBlend: "soft-light",
  ink: "#39332E",
  rule: "rgb(139 106 69 / 0.7)",
  accentRule: "rgb(148 89 43 / 0.85)",
  numberGradient: "linear-gradient(180deg, #c08850 0%, #94592b 55%, #6e3f1c 100%)",
};


/**
 * Bleu pétrole — Récit LIGHT. Master : `mobile_dark.png` du handoff
 * (942×1669) : aquarelle sans feuille de papier, feuillage sur les deux
 * bords presque partout. Retenu par le QG (version B).
 *
 * - Coupe Y = 1150, fondu 80 px : dans les rangées 1040–1240, les deux bords
 *   ne portent que du feuillage FLOU (5 à 260 px de feuillage net par bande
 *   de 20 rangées, contre 400 à 2 200 ailleurs) ; il s'efface au raccord
 *   comme une profondeur de champ, sans arête.
 * - Teinte : bleu pétrole pur mesuré au centre des rangées 1100–1200, hors
 *   pixels de feuillage, bords légèrement assombris, × 0,875 pour compenser
 *   l'éclaircissement des couches de grain (continuité ≤ 1 niveau aux
 *   raccords).
 * - Grain : trois tuiles de l'aquarelle authentique (zones calmes du
 *   centre, tendance basse fréquence retirée), rendues raccordables par
 *   fondu de bord — jamais en miroir —, de tailles premières entre elles
 *   (500×680, 440×600, 370×520) pour que la répétition reste invisible.
 * - Texte : en-tête dans 0,19–0,78 (feuillage haut droit jusqu'à 0,77) ;
 *   numéros à 0,215 (brindilles dorées jusqu'à 0,20), 40 px ; colonne des
 *   numéros 0,235 ; chapitres jusqu'à 0,83 (pointe de feuille floue à 0,839
 *   vers la rangée 1240, feuillage bas droit dès 0,855 entre les rangées
 *   1360 et 1440) ; pied 0,15 (bouquet bas gauche).
 */
const BLEU_PETROLE: RecitV2MobileArtworkTokens = {
  masterSrc: "/assets/recit-de-vie/runtime-v2/mobile/bleu-petrole.png",
  masterSha256: "4aef3d0f4b947c03953c380d5016835281229f52af1d6e5c7fdd9255336035c5",
  paperGrains: [
    { src: "/assets/recit-de-vie/runtime-v2/mobile/bleu-petrole-grain-a.png", tileWidth: 500, blend: "overlay" },
    { src: "/assets/recit-de-vie/runtime-v2/mobile/bleu-petrole-grain-b.png", tileWidth: 440, blend: "overlay" },
    { src: "/assets/recit-de-vie/runtime-v2/mobile/bleu-petrole-grain-c.png", tileWidth: 370, blend: "overlay" },
  ],
  canvas: { width: 942, height: 1669 },
  cutY: 1150,
  fadePx: 80,
  textTop: 0.16,
  foot: 0.15,
  textLeft: 0.13,
  textRight: 0.88,
  chapterRight: 0.83,
  headerInsetLeft: 0.06,
  headerInsetRight: 0.1,
  numberColumn: 0.235,
  numberInset: 0.085,
  numberSize: 40,
  ruleMinGap: 6,
  paperProfile: "linear-gradient(to right, rgb(0,14,18) 0.0%, rgb(0,17,21) 4.2%, rgb(0,18,24) 8.3%, rgb(0,21,25) 12.5%, rgb(0,22,27) 16.7%, rgb(0,23,28) 20.8%, rgb(0,23,29) 25.0%, rgb(0,23,29) 29.2%, rgb(0,23,29) 33.3%, rgb(0,23,29) 37.5%, rgb(0,23,29) 41.7%, rgb(0,23,29) 45.8%, rgb(0,23,29) 50.0%, rgb(0,23,29) 54.2%, rgb(0,23,29) 58.3%, rgb(0,23,29) 62.5%, rgb(0,23,29) 66.7%, rgb(0,23,29) 70.8%, rgb(0,23,29) 75.0%, rgb(0,23,28) 79.2%, rgb(0,22,27) 83.3%, rgb(0,21,25) 87.5%, rgb(0,18,24) 91.7%, rgb(0,17,21) 95.8%, rgb(0,14,18) 100.0%)",
  noiseBlend: "overlay",
  ink: "#F9F2E4",
  rule: "rgb(201 162 106 / 0.7)",
  accentRule: "rgb(214 178 120 / 0.9)",
  numberGradient: "linear-gradient(180deg, #f6dfb0 0%, #c99a55 55%, #8a5a2b 100%)",
};

/** Les deux matières. Chaque variante a la sienne ; aucune ne se rabat sur
 * l'autre. */
export const RECIT_V2_MOBILE_ARTWORKS: Readonly<Record<RecitV2Artwork, RecitV2MobileArtworkTokens>> = Object.freeze({
  ivoireChampagne: IVOIRE_CHAMPAGNE,
  bleuPetrole: BLEU_PETROLE,
});

export interface RecitV2MobileArtworkResolution {
  artwork: RecitV2Artwork;
  tokens: RecitV2MobileArtworkTokens;
}

/** La matière du Récit V2 Mobile pour une variante du mémorial. */
export function resolveRecitV2MobileArtwork(variant: SkinVariant): RecitV2MobileArtworkResolution {
  const artwork = RECIT_V2_ARTWORK_FOR_VARIANT[variant];
  return { artwork, tokens: RECIT_V2_MOBILE_ARTWORKS[artwork] };
}
