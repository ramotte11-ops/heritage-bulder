import type { SkinVariant } from "@/config/skins";

/**
 * Cérémonie Intemporel V2 — pilote C1 Mobile Light, GO QG. Un seul moteur
 * et un seul composant ; chaque variante aura ses réglages, ses textures
 * et ses assets (C2–C4 non engagés).
 *
 * Même moteur que Traditions V2 et l'Avis de décès V2 : Master
 * authentique, papier central CSS, hauteur dynamique. Rien n'est recopié
 * de ces sections : coupe, teinte, grain et positions sont mesurés sur
 * les références Cérémonie.
 *
 * ## Autorités
 *
 * - Autorité de composition : le Master illustré Mobile Light validé par
 *   la PO (941×1672, ramené à 941×1671 pour la mesure : c'est un
 *   agrandissement uniforme du décor vierge, aligné à 0 px près). Chaque
 *   valeur `*Canvas` y est relevée, en px de canevas.
 * - Décor runtime : `CEREMONIE_MOBILE_LIGHT_RUNTIME_VIERGE.png` (941×1671)
 *   du ZIP officiel, copié octet pour octet (SHA-256 ci-dessous, vérifié
 *   par les tests). Il porte déjà le sceau bronze « arbre de vie », les
 *   bouquets, les papiers et la grande feuille : il n'est jamais modifié
 *   ni découpé en fichiers.
 *
 * ## Le décor
 *
 * Le haut [0:cutY] et le bas [cutY:H] sont le même fichier, positionnés
 * par CSS. Quand le contenu dépasse le Master, une surface de papier CSS
 * s'ouvre à la ligne de coupe : teinte = profils mesurés de part et
 * d'autre du raccord, grain = trois tuiles de la grande feuille, bande
 * des bords = les deux liserés déchirés de la feuille. Aucun ornement
 * n'est étiré ni répété. Dérivations reproductibles :
 * scripts/pilot/ceremony-v2-derive.py.
 *
 * ## Les cartouches
 *
 * Absents du décor vierge : reconstruits en CSS d'après le Master
 * (papier de la teinte de la feuille, bord irrégulier par déplacement
 * SVG, liseré clair, ombre brun chaud portée vers le bas), un par bloc
 * de contenu présent ; aucun emplacement fantôme.
 *
 * ## Périmètre
 *
 * Mobile Light (C1, validé PO) et Mobile Dark (C2, pilote). Une variante
 * sans réglages (`null`) ne rend rien et ne se rabat jamais sur une
 * autre. Ce renderer n'est branché sur aucun registre de production :
 * page pilote seulement.
 */

export interface CeremonyV2MobileTokens {
  masterSrc: string;
  /** SHA-256 du décor vierge, identique au fichier du ZIP officiel. */
  masterSha256: string;
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  noiseBlend: string;
  /** Teinte de la surface : image 941×2 étirée sur toute la surface. */
  paperTone: string;
  /** Bande des bords déchirés de la grande feuille, répétée vers le haut
   * depuis le bas de la surface. */
  edgeStrip: { src: string; heightCanvas: number };
  canvas: { width: number; height: number };
  /** Ligne de coupe : dernière rangée du haut = cutY − 1. */
  cutY: number;
  fadePx: number;
  /** Haut du bloc de texte (haut de la ligne du surtitre). */
  textTopCanvas: number;
  /** Réserve basse sous le rameau du pied. */
  footCanvas: number;
  /** Bande des cartouches, en px de canevas. */
  cardsLeftCanvas: number;
  cardsRightCanvas: number;
  /** Axe de l'en-tête et du pied. */
  axisCanvas: number;
  /** Rameaux : teinte (feuillage gris-vert du Light, bronze du Dark) et
   * jeu de tracés relevés sur le Master de la variante. */
  sprigTone: "olive" | "bronze";
  sprigShapes:
    | { title: "title"; date: "date"; footer: "footer" }
    | { title: "titleDark"; date: "dateDark"; footer: "footerDark" };
}

export interface CeremonyV2VariantTokens {
  mobile: CeremonyV2MobileTokens;
}

const ROOT = "/assets/ceremony/v2/mobile/light";

/**
 * Mobile Light. Coupe Y = 850, fondu 40 px : entre la rangée des deux
 * cartouches du haut et le déroulement. La fenêtre la moins nette (986)
 * tranche la grande feuille du bouquet bas gauche ; 850 est la seule
 * fenêtre où les profils de part et d'autre du raccord se suivent aux
 * deux bords (collage de papiers à gauche, papiers en diagonale à droite)
 * sans rien couper de figuratif. Teinte : médianes des rangées 760–810 et
 * 890–940, lissées σ = 22 px. Bande des bords : rangées 670–890 (L = 220),
 * liserés seuls. Grain : trois tuiles de la grande feuille (460×420,
 * 400×300, 340×160), moins de 0,02 % de pixels nets.
 */
const MOBILE_LIGHT: CeremonyV2MobileTokens = {
  masterSrc: `${ROOT}/ceremony-mobile-light-master.png`,
  masterSha256: "254a036942b2a1102bf03a5bc308190b88ece96b1c1ec44b4331a508b7bca002",
  paperGrains: [
    { src: `${ROOT}/ceremony-mobile-light-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT}/ceremony-mobile-light-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT}/ceremony-mobile-light-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  paperTone: `${ROOT}/ceremony-mobile-light-tone.png`,
  edgeStrip: { src: `${ROOT}/ceremony-mobile-light-edges.png`, heightCanvas: 220 },
  canvas: { width: 941, height: 1671 },
  cutY: 850,
  fadePx: 40,
  /** Master : capitales du surtitre à y 165. */
  textTopCanvas: 160,
  /** Master : bas du rameau du pied à 1571 (boîte SVG 11 px plus bas). */
  footCanvas: 88,
  /** Master : cartouches x 108–846. */
  cardsLeftCanvas: 108,
  cardsRightCanvas: 846,
  /** Master : titre, introduction et pied centrés sur x ≈ 474. */
  axisCanvas: 474,
  sprigTone: "olive",
  sprigShapes: { title: "title", date: "date", footer: "footer" },
};

const ROOT_DARK = "/assets/ceremony/v2/mobile/dark";

/**
 * Mobile Dark (C2). Master illustré Dark (941×1672, ramené à 941×1671 :
 * agrandissement uniforme du décor vierge, aligné à 0 px près). Même
 * composition que le Light, mais sa propre géométrie : tout est plus
 * haut (cartouches dès y 447, pied à 1394), la frise du déroulement et
 * le texte des informations pratiques commencent plus à gauche, la
 * feuille chocolat se termine plus haut (réserve basse 152).
 *
 * Coupe Y = 813, fondu 40 px : juste sous l'intervalle entre les
 * cartouches du haut et le déroulement ; fenêtre 760–920 où les profils
 * de part et d'autre du raccord se suivent le mieux aux deux bords
 * (papier vert et coins beiges à gauche, papiers beiges en diagonale à
 * droite). Teinte : médianes des rangées 723–773 et 853–903, lissées
 * σ = 22 px. Bande des bords : rangées 633–853 (L = 220), liserés seuls.
 * Grain : trois tuiles de la feuille chocolat (460×420, 400×300,
 * 340×160).
 */
const MOBILE_DARK: CeremonyV2MobileTokens = {
  masterSrc: `${ROOT_DARK}/ceremony-mobile-dark-master.png`,
  masterSha256: "37da7b45d008c2ea673f55af16216d02664439fe6c1205b898c98f0f79f5bb75",
  paperGrains: [
    { src: `${ROOT_DARK}/ceremony-mobile-dark-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT_DARK}/ceremony-mobile-dark-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT_DARK}/ceremony-mobile-dark-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  paperTone: `${ROOT_DARK}/ceremony-mobile-dark-tone.png`,
  edgeStrip: { src: `${ROOT_DARK}/ceremony-mobile-dark-edges.png`, heightCanvas: 220 },
  canvas: { width: 941, height: 1671 },
  cutY: 813,
  fadePx: 40,
  /** Master : capitales du surtitre à y 162. */
  textTopCanvas: 157,
  /** Master : bas du rameau du pied à 1519 ; la feuille chocolat finit en
   * pointe vers 1540. */
  footCanvas: 143,
  /** Master : cartouches x 107–843. */
  cardsLeftCanvas: 107,
  cardsRightCanvas: 843,
  /** Master : titre et pied centrés sur x ≈ 474. */
  axisCanvas: 474,
  sprigTone: "bronze",
  sprigShapes: { title: "titleDark", date: "dateDark", footer: "footerDark" },
};

export const CEREMONY_V2_TOKENS: Record<SkinVariant, CeremonyV2VariantTokens | null> = {
  light: { mobile: MOBILE_LIGHT },
  dark: { mobile: MOBILE_DARK },
};
