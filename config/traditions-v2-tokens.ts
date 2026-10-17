import type { SkinVariant } from "@/config/skins";

/**
 * Traditions & repères V2 — pilotes Mobile Light (P1) et Mobile Dark (P2),
 * GO QG. Un seul moteur et un seul composant ; chaque variante a ses
 * réglages, ses textures et ses assets.
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
 * Mobile Light (P1) et Mobile Dark (P2), validés PO ; Desktop Light (P3) ;
 * Desktop Dark (P4, pilote). Une variante sans réglages (`null`) ne rend
 * rien et ne se rabat jamais sur une autre. Ce renderer n'est branché
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
  /** Filet du surtitre : un filet dessous (Light) ou un de chaque côté
   * (Dark). */
  surtitleRules: "below" | "flanked";
  /** Ornement entre les deux filets du pied. */
  footerOrnament: "sprig" | "heart";
  /** Teinte du rameau d'olivier : feuillage (Light) ou bronze doré (Dark). */
  sprigTone: "olive" | "bronze";
  /**
   * Mention manuscrite fixe hors de la feuille, ancrée en haut du Master
   * (Dark : « Des gestes qui ont du sens » et son cœur, sur le papier
   * sombre du coin haut droit). `null` : absente du Master.
   */
  cornerNote: { leftCanvas: number; topCanvas: number; widthCanvas: number; rotateDeg: number } | null;
}

/** Une zone du décor Desktop : sa coupe, sa teinte et, si le décor en
 * offre une qui se répète sans motif, sa bande des bords. */
export interface TraditionsV2DesktopZone {
  cutY: number;
  fadePx: number;
  paperTone: string;
  edgeStrip: { src: string; heightCanvas: number } | null;
}

/**
 * Desktop (méthode de l'Avis de décès V2 Desktop) : à partir de 1024 px de
 * largeur RÉELLE du conteneur, plafond 1448 px, même DOM et mêmes données
 * que le Mobile ; seule la feuille de style bascule sur le Master Desktop.
 * Aucune rangée du décor Desktop n'est calme sur toute sa largeur : deux
 * zones (gauche, droite) ont chacune leur coupe, fondues l'une dans
 * l'autre dans le papier nu du centre (`zoneSplitCanvas` ±
 * `zoneBlendCanvas` / 2).
 */
export interface TraditionsV2DesktopTokens {
  masterSrc: string;
  masterSha256: string;
  canvas: { width: number; height: number };
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  noiseBlend: string;
  zones: { left: TraditionsV2DesktopZone; right: TraditionsV2DesktopZone };
  zoneSplitCanvas: number;
  zoneBlendCanvas: number;
  textTopCanvas: number;
  footCanvas: number;
  /** Bande des feuillets (deux colonnes), en px de canevas. */
  textLeftCanvas: number;
  textRightCanvas: number;
  axisCanvas: number;
  /** Mention manuscrite du coin, si le Master Desktop la porte. */
  cornerNote: { leftCanvas: number; topCanvas: number; widthCanvas: number; rotateDeg: number } | null;
}

export interface TraditionsV2VariantTokens {
  mobile: TraditionsV2MobileTokens;
  /** `null` : pas de composition Desktop pour cette variante (le Mobile
   * s'applique à toute largeur, comme avant). */
  desktop: TraditionsV2DesktopTokens | null;
}

const ROOT = "/assets/traditions/v2/mobile/light";
const ROOT_DARK = "/assets/traditions/v2/mobile/dark";
const ROOT_DESKTOP_LIGHT = "/assets/traditions/v2/desktop/light";
const ROOT_DESKTOP_DARK = "/assets/traditions/v2/desktop/dark";

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
  surtitleRules: "below",
  footerOrnament: "sprig",
  sprigTone: "olive",
  cornerNote: null,
};

/**
 * Mobile Dark. Le décor vierge (941×1671) correspond au Master (941×1672)
 * décalé de 1 à 2 px vers le bas sous la rangée 300 ; les positions
 * ci-dessous sont relevées sur le Master et ramenées au décor.
 *
 * Coupe Y = 1114, fondu 40 px : rangées 1040–1160, seule fenêtre où les
 * profils de part et d'autre du raccord se suivent sur toute la largeur
 * (au-dessus, papiers ivoire manuscrits à droite ; dessous, bouquet à
 * droite dès 1200). 28 px de détail net par rangée : le gaufrage de la
 * feuille chocolat. Bande des bords : rangées 934–1154 (L = 220), fleurs
 * floues de gauche retirées de la bande. Grain : trois tuiles de la
 * feuille centrale (460×420, 400×260, 340×340).
 */
const MOBILE_DARK: TraditionsV2MobileTokens = {
  masterSrc: `${ROOT_DARK}/traditions-mobile-dark-master.png`,
  masterSha256: "bbea9d4b7c3c95ad278e2961da23e80954380ce854ff90fa67f058ff379c2389",
  paperGrains: [
    { src: `${ROOT_DARK}/traditions-mobile-dark-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT_DARK}/traditions-mobile-dark-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT_DARK}/traditions-mobile-dark-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  paperTone: `${ROOT_DARK}/traditions-mobile-dark-tone.png`,
  edgeStrip: { src: `${ROOT_DARK}/traditions-mobile-dark-edges.png`, heightCanvas: 220 },
  canvas: { width: 941, height: 1671 },
  cutY: 1114,
  fadePx: 40,
  /** Master : capitales du surtitre à y 298. */
  textTopCanvas: 292,
  /** Master : bas de la phrase manuscrite à 1569 ; cœur du pied à 1451. */
  footCanvas: 96,
  /** Master : feuillets x 130–826. */
  textLeftCanvas: 130,
  textRightCanvas: 826,
  /** Master : titre, introduction et pied centrés sur x ≈ 472. */
  axisCanvas: 472,
  /** Encres échantillonnées sur le Master (médiane des pixels d'encre). */
  ink: "#f6ecd9",
  inkSoft: "#e9e1d4",
  label: "#ecdfca",
  rule: "rgb(224 178 122 / 0.9)",
  surtitleRules: "flanked",
  footerOrnament: "heart",
  sprigTone: "bronze",
  /** Master : « Des gestes / qui ont du sens », x 717–912, y 72–165, en
   * diagonale montante (≈ −20°) ; cœur x 837–869, y 127–177. */
  cornerNote: { leftCanvas: 706, topCanvas: 54, widthCanvas: 220, rotateDeg: -20 },
};

/**
 * Desktop Light (P3). Master `DESKTOP_LIGHT_MASTER_ILLUSTRE.png` (1671×941,
 * SHA-256 a42cd2ee…45fd) ; décor `DESKTOP_LIGHT_DECOR_VIERGE.png`
 * (1670×941), aligné sur le Master à 1 px près.
 *
 * - Zone gauche (colonnes 120–830) : coupe Y = 626, fondu 36 : sous le
 *   sceau et ses fleurs, là où le papier vert (x 130–215) et le bord de la
 *   feuille (x ≈ 220) sont verticaux. Bande des bords : rangées 562–662.
 * - Zone droite (colonnes 830–1560) : coupe Y = 310, fondu 26 : sous
 *   l'aquarelle et la mention manuscrite, au-dessus du bouquet (rangées
 *   340–890), qui descend avec le bas sans jamais être coupé. Pas de bande
 *   des bords : le bord droit de la feuille tourne en diagonale au-dessus
 *   de 300 (escalier des papiers dessous), puis le bouquet le recouvre ;
 *   toute bande s'y répétait en motif visible. Teinte et grain portent
 *   seuls l'extension ; dès x 1490, la teinte est celle du papier sous la
 *   coupe (ni l'aquarelle ni l'ombre des papiers ne s'étirent).
 * - Les deux zones se fondent dans le papier nu du centre, x 830 ± 120.
 * - Grain : trois tuiles du papier central (460×300, 400×200, 340×120).
 */
const DESKTOP_LIGHT: TraditionsV2DesktopTokens = {
  masterSrc: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-master.png`,
  masterSha256: "e21f17ca490a5d1a8a51e5850418ae6db28593fac8f0371dcb0673ebf7165566",
  canvas: { width: 1670, height: 941 },
  paperGrains: [
    { src: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  zones: {
    left: {
      cutY: 626,
      fadePx: 36,
      paperTone: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-left-tone.png`,
      edgeStrip: { src: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-left-edges.png`, heightCanvas: 100 },
    },
    right: {
      cutY: 310,
      fadePx: 26,
      paperTone: `${ROOT_DESKTOP_LIGHT}/traditions-desktop-light-right-tone.png`,
      edgeStrip: null,
    },
  },
  zoneSplitCanvas: 830,
  zoneBlendCanvas: 240,
  /** Master : capitales du surtitre à y 139. */
  textTopCanvas: 134,
  /** Master : bas de la phrase manuscrite à 899. */
  footCanvas: 40,
  /** Master : feuillets x 225–1468, deux colonnes. */
  textLeftCanvas: 225,
  textRightCanvas: 1468,
  /** Master : surtitre, filet, rameau et pied centrés sur x ≈ 834. */
  axisCanvas: 836,
  /** Master : « Des gestes / qui ont du sens », x 1453–1640, y 115–240,
   * doré sur l'aquarelle bleue ; cœur x 1563–1607, y 188–242. */
  cornerNote: { leftCanvas: 1440, topCanvas: 100, widthCanvas: 230, rotateDeg: -18 },
};

/**
 * Desktop Dark (P4). Master `DESKTOP_DARK_MASTER_ILLUSTRE.png` (1671×941,
 * SHA-256 c83de759…2ed8) ; décor `DESKTOP_DARK_DECOR_VIERGE.png` (1670×942),
 * aligné sur le Master à 1 px près.
 *
 * Les bords de la feuille chocolat ne sont presque verticaux qu'entre les
 * rangées 560 et 720 (gauche x ≈ 197, droite x ≈ 1495) : une seule coupe,
 * Y = 620, fondu 30, commune aux deux zones ; chaque zone porte la bande de
 * son propre bord (rangées 530–650 : liseré cuivré et papier clair à
 * gauche, liseré cuivré seul à droite). Au-delà des bords, les papiers
 * anciens en diagonale se répéteraient : la teinte y suffit. Sceau, bouquet
 * et mention restent en haut ; fleurs floues des coins bas descendent avec
 * le bas.
 */
const DESKTOP_DARK: TraditionsV2DesktopTokens = {
  masterSrc: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-master.png`,
  masterSha256: "83c1e431bdbb2e6b372001267190c0a0b0952b70be904b2dfa7223b563e10c98",
  canvas: { width: 1670, height: 942 },
  paperGrains: [
    { src: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  zones: {
    left: {
      cutY: 620,
      fadePx: 30,
      paperTone: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-left-tone.png`,
      edgeStrip: { src: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-left-edges.png`, heightCanvas: 120 },
    },
    right: {
      cutY: 620,
      fadePx: 30,
      paperTone: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-right-tone.png`,
      edgeStrip: { src: `${ROOT_DESKTOP_DARK}/traditions-desktop-dark-right-edges.png`, heightCanvas: 120 },
    },
  },
  zoneSplitCanvas: 835,
  zoneBlendCanvas: 240,
  /** Master : capitales du surtitre à y 163. */
  textTopCanvas: 158,
  /** Master : bas de la phrase manuscrite à 892. */
  footCanvas: 46,
  /** Master : feuillets x 232–1450, deux colonnes. */
  textLeftCanvas: 232,
  textRightCanvas: 1450,
  /** Master : surtitre, titre, rameau et pied centrés sur x ≈ 836. */
  axisCanvas: 836,
  /** Master : « Des gestes / qui ont du sens », x 1464–1648, y 35–130,
   * doré sur le papier sombre du coin haut droit ; cœur x 1588–1630,
   * y 108–170. */
  cornerNote: { leftCanvas: 1450, topCanvas: 12, widthCanvas: 220, rotateDeg: -18 },
};

/** Mobile Light (P1) et Mobile Dark (P2), validés ; Desktop Light (P3) ;
 * Desktop Dark (P4). */
export const TRADITIONS_V2_TOKENS: Readonly<Record<SkinVariant, TraditionsV2VariantTokens | null>> = Object.freeze({
  light: { mobile: MOBILE_LIGHT, desktop: DESKTOP_LIGHT },
  dark: { mobile: MOBILE_DARK, desktop: DESKTOP_DARK },
});
