import type { SkinVariant } from "@/config/skins";

/**
 * Traditions & repères V2 — pilote Mobile Light (P1, GO QG).
 *
 * Même moteur que le Récit de vie V2 et l'Avis de décès V2 : Master
 * authentique, papier central CSS, hauteur dynamique. Rien n'est recopié
 * de ces deux sections : coupe, teinte, grain et positions sont mesurés
 * sur les références Traditions.
 *
 * ## Autorités
 *
 * - Autorité artistique : `MOBILE_LIGHT_MASTER_ILLUSTRE.png` (941×1671,
 *   SHA-256 90fdbb4d…8e72) du ZIP `HERITAGE_TRADITIONS_01_MASTERS_ILLUSTRES`.
 *   Chaque valeur `*Canvas` ci-dessous y est relevée, en px de canevas.
 * - Décor runtime : `MOBILE_LIGHT_DECOR_VIERGE.png` (941×1671) du ZIP
 *   `HERITAGE_TRADITIONS_02_DECORS_VIERGES`, copié octet pour octet
 *   (SHA-256 ci-dessous, vérifié par les tests). Le décor porte déjà le
 *   grand sceau bronze « arbre de vie », les bouquets et les papiers : il
 *   n'est jamais modifié ni découpé en fichiers.
 *
 * ## Le décor
 *
 * Le haut [0:cutY] et le bas [cutY:H] sont le même fichier, positionnés
 * par CSS. Quand le contenu dépasse le Master, une surface de papier CSS
 * s'ouvre à la ligne de coupe : teinte = profils mesurés de part et
 * d'autre du raccord, grain = trois tuiles du papier central, fondu de
 * `fadePx` aux deux raccords. Aucun ornement n'est étiré ni répété.
 * Dérivations reproductibles : scripts/pilot/traditions-v2-derive.py.
 *
 * ## Les feuillets
 *
 * Absents du décor vierge : reconstruits en CSS d'après le Master
 * (papier éclairci laissant voir le grain du décor, bord irrégulier par
 * déplacement SVG, liseré clair, ombre portée vers le bas à gauche,
 * médaillon et filet vertical). Un feuillet par repère de la famille,
 * de la hauteur de son texte ; aucun nombre ni longueur imposé.
 *
 * ## Périmètre
 *
 * Mobile Light uniquement (P1). Mobile Dark, Desktop Light et Desktop
 * Dark n'ont pas encore de réglages (`null`). Ce renderer n'est branché
 * sur aucun registre de production : page pilote seulement.
 */

export interface TraditionsV2MobileTokens {
  masterSrc: string;
  /** SHA-256 du décor vierge, identique au fichier de référence de la PO. */
  masterSha256: string;
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  noiseBlend: string;
  /** Teinte de la surface : image 941×2 étirée sur toute la surface. */
  paperTone: string;
  /**
   * Bande des bords : la grande feuille centrale a des bords déchirés
   * verticaux que la teinte lissée ne porte pas. Bande pleine largeur
   * tirée des rangées calmes [cut + fade − L, cut + fade), raccordable
   * verticalement, opaque sur les côtés seulement ; répétée vers le haut
   * depuis le bas de la surface (continuité exacte au raccord bas).
   */
  edgeStrip: { src: string; heightCanvas: number };
  canvas: { width: number; height: number };
  /** Ligne de coupe : dernière rangée du haut = cutY − 1. */
  cutY: number;
  fadePx: number;
  /** Haut du bloc de texte (haut de la ligne du surtitre). */
  textTopCanvas: number;
  /** Réserve basse sous la phrase manuscrite finale. */
  footCanvas: number;
  /** Bande horizontale du contenu (feuillets), en px de canevas. */
  textLeftCanvas: number;
  textRightCanvas: number;
  /** Axe de l'en-tête et du pied. */
  axisCanvas: number;
  ink: string;
  inkSoft: string;
  label: string;
  rule: string;
}

export interface TraditionsV2VariantTokens {
  mobile: TraditionsV2MobileTokens;
}

const ROOT = "/assets/traditions/v2/mobile/light";

/**
 * Mobile Light. Coupe Y = 938, fondu 40 px : les rangées 720–990 sont la
 * seule fenêtre où les deux côtés sont calmes (bord déchiré de la feuille
 * et papier de fond nus ; au-dessus, feuillage flou à gauche et bouquet à
 * droite ; en dessous, papier déchiré à droite puis feuillage flou à
 * gauche dès 1180). 13 px de détail net par rangée dans la fenêtre du
 * fondu. Teinte : médianes des rangées 848–898 et 978–1028, lissées
 * σ = 22 px. Bande des bords : rangées 758–978 (L = 220).
 * Grain : trois tuiles du papier central (460×620, 400×300, 340×340),
 * moins de 0,05 % de pixels nets.
 */
const MOBILE_LIGHT: TraditionsV2MobileTokens = {
  masterSrc: `${ROOT}/traditions-mobile-light-master.png`,
  masterSha256: "203dfe8eb18c82b3c4ecdf0d78c9d2ee2cb08ff097d0bef83a67e7c8f40357b5",
  paperGrains: [
    { src: `${ROOT}/traditions-mobile-light-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT}/traditions-mobile-light-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT}/traditions-mobile-light-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  paperTone: `${ROOT}/traditions-mobile-light-tone.png`,
  edgeStrip: { src: `${ROOT}/traditions-mobile-light-edges.png`, heightCanvas: 220 },
  canvas: { width: 941, height: 1671 },
  cutY: 938,
  fadePx: 40,
  /** Master : capitales du surtitre à y 217. */
  textTopCanvas: 212,
  /** Master : bas de la phrase manuscrite à 1579 ; filets du pied à 1450. */
  footCanvas: 116,
  /** Master : feuillets x 128–819 (ombre comprise à gauche dès x 117). */
  textLeftCanvas: 128,
  textRightCanvas: 819,
  /** Master : titre, introduction et pied centrés sur x ≈ 471. */
  axisCanvas: 471,
  /** Encres échantillonnées sur le Master (médiane des pixels d'encre). */
  ink: "#16190a",
  inkSoft: "#21201b",
  label: "#373631",
  rule: "rgb(74 72 62 / 0.9)",
};

/** Mobile Light seulement (P1). */
export const TRADITIONS_V2_TOKENS: Readonly<Record<SkinVariant, TraditionsV2VariantTokens | null>> = Object.freeze({
  light: { mobile: MOBILE_LIGHT },
  dark: null,
});
