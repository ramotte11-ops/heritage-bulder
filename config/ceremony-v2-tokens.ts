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
 * Mobile Light (C1), Mobile Dark (C2) et Desktop Light (C3), validés PO ;
 * Desktop Dark (C4) provisoire (technique seulement, artistique OPEN). Une variante sans réglages (`null`) ne rend rien et
 * ne se rabat jamais sur une autre ; une variante sans réglages Desktop
 * (`desktop: null`) garde sa composition Mobile à toute largeur. Ce
 * renderer n'est branché sur aucun registre de production : page pilote
 * seulement.
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

/** Une zone du décor Desktop : sa coupe, sa teinte et, s'il y a lieu, sa
 * bande des bords. */
export interface CeremonyV2DesktopZone {
  cutY: number;
  fadePx: number;
  paperTone: string;
  edgeStrip: { src: string; heightCanvas: number } | null;
}

/**
 * Réglages Desktop d'une variante : son propre Master (paysage), ses deux
 * zones de décor et sa géométrie, relevée sur son Master illustré
 * Desktop — jamais un agrandissement du Mobile.
 */
export interface CeremonyV2DesktopTokens {
  masterSrc: string;
  masterSha256: string;
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  noiseBlend: string;
  canvas: { width: number; height: number };
  /** Deux zones (gauche, droite), chacune avec sa coupe, fondues l'une
   * dans l'autre autour de `zoneSplitCanvas` sur `zoneBlendCanvas`. */
  zones: { left: CeremonyV2DesktopZone; right: CeremonyV2DesktopZone };
  zoneSplitCanvas: number;
  zoneBlendCanvas: number;
  textTopCanvas: number;
  footCanvas: number;
  cardsLeftCanvas: number;
  cardsRightCanvas: number;
  axisCanvas: number;
  /** Mention manuscrite du coin haut droit, si le Master la porte. */
  cornerNote: { leftCanvas: number; topCanvas: number; widthCanvas: number; rotateDeg: number } | null;
  /** `"validated"` : calé sur le Master illustré et validé par la PO.
   * `"provisional"` : socle technique seulement, finition artistique
   * à reprendre (rendu exposé en `data-desktop-status`). */
  status: "validated" | "provisional";
}

export interface CeremonyV2VariantTokens {
  mobile: CeremonyV2MobileTokens;
  desktop: CeremonyV2DesktopTokens | null;
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

const ROOT_DESKTOP = "/assets/ceremony/v2/desktop/light";

/**
 * Desktop Light (C3). Autorité : le Master illustré Desktop Light
 * (1672×941, ramené à 1670×941 pour la mesure : agrandissement uniforme du
 * décor vierge, aligné à 0 px près). Décor runtime :
 * `CEREMONIE_DESKTOP_LIGHT_RUNTIME_VIERGE.png` (1670×941), copié octet pour
 * octet. Composition paysage : en-tête centré sur x ≈ 836, quatre
 * cartouches en deux colonnes (x 272–828 et 844–1424), médaillon à gauche
 * de chaque cartouche, pied centré, mention manuscrite sur l'aquarelle du
 * coin haut droit.
 *
 * Décor étendu en deux zones (méthode de Traditions V2 Desktop) :
 *   - gauche, coupe Y = 728, fondu 30 : sous le papier vert du sceau, au-
 *     dessus du feuillage flou du coin bas gauche (fenêtre 690–780, détail
 *     net minimal dans les colonnes 120–830) ;
 *   - droite, coupe imposée Y = 310, fondu 26 : sous l'aquarelle, au-
 *     dessus du bouquet droit (rangées 340–870), qui n'est jamais tranché.
 * Aucune bande des bords : à ces hauteurs, les bords de la feuille sont
 * en diagonale ou trop courts pour se répéter sans dents de scie ; teinte
 * et grain portent seuls la surface. Teintes : médianes des 50 rangées de
 * part et d'autre de chaque raccord, lissées σ = 22 px ; à gauche de la
 * feuille (x < 240), papier beige du collage (quantile clair des rangées
 * 600–900) au lieu du fondu papier vert → feuillage flou ; à droite, teinte
 * du dessous dès x 1490. Grain : trois tuiles de la feuille nue (460×300,
 * 400×200, 340×120), moins de 0,01 % de pixels nets.
 */
const DESKTOP_LIGHT: CeremonyV2DesktopTokens = {
  masterSrc: `${ROOT_DESKTOP}/ceremony-desktop-light-master.png`,
  masterSha256: "cdfc36d81e903d4452b9852775901055c68faac899bb3a14d2cb4dfbd3e45c16",
  paperGrains: [
    { src: `${ROOT_DESKTOP}/ceremony-desktop-light-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT_DESKTOP}/ceremony-desktop-light-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT_DESKTOP}/ceremony-desktop-light-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  canvas: { width: 1670, height: 941 },
  zones: {
    left: { cutY: 728, fadePx: 30, paperTone: `${ROOT_DESKTOP}/ceremony-desktop-light-left-tone.png`, edgeStrip: null },
    right: { cutY: 310, fadePx: 26, paperTone: `${ROOT_DESKTOP}/ceremony-desktop-light-right-tone.png`, edgeStrip: null },
  },
  zoneSplitCanvas: 830,
  zoneBlendCanvas: 240,
  /** Master : capitales du surtitre à y 124. */
  textTopCanvas: 119,
  /** Master : bas du rameau du pied à 917. */
  footCanvas: 14,
  /** Master : cartouches x 272–828 et 844–1424. */
  cardsLeftCanvas: 272,
  cardsRightCanvas: 1424,
  /** Master : surtitre, titre et cœur du pied centrés sur x ≈ 836. */
  axisCanvas: 836,
  /** Master : « Des gestes / qui ont du sens » et son cœur, x 1453–1637,
   * y 108–242, lignes montant à −17°. */
  cornerNote: { leftCanvas: 1440, topCanvas: 90, widthCanvas: 220, rotateDeg: -17 },
  status: "validated",
};

const ROOT_DESKTOP_DARK = "/assets/ceremony/v2/desktop/dark";

/**
 * Desktop Dark (C4) — PROVISOIRE : socle technique seulement, finition
 * artistique OPEN. Décor runtime : `CEREMONIE_DESKTOP_DARK_RUNTIME_VIERGE.png`
 * (1670×941) du ZIP officiel, copié octet pour octet. Les dérivés (deux
 * zones, coupes trouvées automatiquement : gauche 672 / fondu 30, droite
 * 234 / fondu 26, sans bande des bords) et TOUTE la géométrie ci-dessous
 * sont repris du Desktop Light en attendant le relevé sur le Master
 * illustré Desktop Dark : rien n'y est encore calé. Pas de mention du
 * coin tant que le Master Dark n'a pas été relevé.
 */
const DESKTOP_DARK: CeremonyV2DesktopTokens = {
  masterSrc: `${ROOT_DESKTOP_DARK}/ceremony-desktop-dark-master.png`,
  masterSha256: "22cf955b2820a8f5f240a4c7cf2c936bfe2fef76873dd8b9d56666b84bc37359",
  paperGrains: [
    { src: `${ROOT_DESKTOP_DARK}/ceremony-desktop-dark-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT_DESKTOP_DARK}/ceremony-desktop-dark-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT_DESKTOP_DARK}/ceremony-desktop-dark-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  canvas: { width: 1670, height: 941 },
  zones: {
    left: { cutY: 672, fadePx: 30, paperTone: `${ROOT_DESKTOP_DARK}/ceremony-desktop-dark-left-tone.png`, edgeStrip: null },
    right: { cutY: 234, fadePx: 26, paperTone: `${ROOT_DESKTOP_DARK}/ceremony-desktop-dark-right-tone.png`, edgeStrip: null },
  },
  zoneSplitCanvas: 830,
  zoneBlendCanvas: 240,
  textTopCanvas: 119,
  footCanvas: 14,
  cardsLeftCanvas: 272,
  cardsRightCanvas: 1424,
  axisCanvas: 836,
  cornerNote: null,
  status: "provisional",
};

export const CEREMONY_V2_TOKENS: Record<SkinVariant, CeremonyV2VariantTokens | null> = {
  light: { mobile: MOBILE_LIGHT, desktop: DESKTOP_LIGHT },
  dark: { mobile: MOBILE_DARK, desktop: DESKTOP_DARK },
};
