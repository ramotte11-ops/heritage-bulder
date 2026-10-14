import type { SkinVariant } from "@/config/skins";

/**
 * Avis de décès V2 — pilote Mobile (Light : phases 1-2 ; Dark : phase 3).
 *
 * Même moteur que le Récit de vie V2 (config/recit-de-vie-v2-tokens.ts),
 * réglages propres à l'Avis : Master authentique + papier central CSS +
 * hauteur dynamique. Rien ici n'est recopié du Récit (coupe, teinte,
 * grain, zones).
 *
 * ## Autorités
 *
 * Pour chaque variante, son propre fond (`02_FONDS_VIERGES/MOBILE_LIGHT.png`,
 * `…/MOBILE_DARK.png`) du ZIP `HERITAGE_AVIS_DE_DECES_8_REFERENCES_AUDIT_OPUS`,
 * copié octet pour octet (SHA-256 ci-dessous, vérifié par les tests).
 * Composition : la maquette de la MÊME variante
 * (`01_MAQUETTES_ILLUSTREES/MOBILE_LIGHT.png` ou `…/MOBILE_DARK.png`),
 * mesurée en px de canevas — chaque valeur `*Canvas` ci-dessous est la
 * valeur relevée sur cette maquette.
 *
 * ## Le décor
 *
 * Le Master n'est jamais modifié ni découpé : le haut [0:cutY] et le bas
 * [cutY:H] sont le même fichier, positionné par CSS. Quand le contenu
 * demande plus de hauteur que le Master, une surface de papier CSS s'ouvre
 * à la ligne de coupe (teinte = profil horizontal, grain = trois tuiles
 * dérivées du Master, fondu de `fadePx` aux deux raccords). Dérivations
 * reproductibles : scripts/pilot/avis-v2-mobile-light-derive.py.
 *
 * ## Périmètre
 *
 * Mobile Light (phases 1-2, validé PO, CLOSED) et Mobile Dark (phase 3).
 * Desktop Light et Desktop Dark n'ont pas encore de réglages. Les
 * ornements (médaillons, rameau, cœur, filets) sont reconstruits en SVG/CSS
 * dans components/memorial/death-notice/v2/, avec une palette par variante.
 * Ce renderer n'est branché sur aucun registre de production.
 */

export interface DeathNoticeV2MobileTokens {
  masterSrc: string;
  /** SHA-256 du Master, identique au fichier de référence de la PO. */
  masterSha256: string;
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  noiseBlend: string;
  /** Teinte de la surface : image 941×2 (profil au-dessus du raccord haut,
   * profil sous le raccord bas), étirée sur toute la surface. */
  paperTone: string;
  canvas: { width: number; height: number };
  /** Ligne de coupe : dernière rangée du haut = cutY − 1. */
  cutY: number;
  fadePx: number;
  /** Haut du bloc de texte (haut de la ligne du titre), en px de canevas. */
  textTopCanvas: number;
  /** Réserve basse au-dessus du bord déchiré, en px de canevas, quand la
   * dernière rangée est le bloc unique et centré de la maquette (ou
   * l'annonce seule) : il tient dans le bas resserré du papier. */
  footCanvas: number;
  /**
   * Deux colonnes, dernière rangée en paire : le contenu s'arrête plus haut
   * (rangée 1160), où le bouquet de droite laisse le texte aller jusqu'à
   * `pairRightCanvas`. À gauche, le médaillon peut couvrir le feuillage
   * FLOU du bord, comme dans la maquette ; aucun texte n'y va.
   */
  footPairCanvas: number;
  pairRightCanvas: number;
  /**
   * Une colonne (téléphones) : chaque précision est pleine largeur ; le
   * contenu s'arrête à la rangée 1220 et toutes les précisions restent dans
   * la bande de papier nu `singleColumnBand*Canvas`.
   */
  footSingleColumnCanvas: number;
  singleColumnBandLeftCanvas: number;
  singleColumnBandRightCanvas: number;
  /** Bande horizontale du contenu, en px de canevas. */
  textLeftCanvas: number;
  textRightCanvas: number;
  /**
   * Sous cette largeur réelle de conteneur (px CSS), la grille 2 + 2 + 1
   * passe en une colonne (adaptation autorisée par la PO). Critère mesuré :
   * en deux colonnes, les étiquettes FR doivent tenir sur une ligne — la
   * colonne de texte vaut 0,207 × largeur à gauche (« LIEU GÉNÉRAL »,
   * ≈ 100 px à 10 px) et 0,274 × largeur à droite (« MOT DE LA FAMILLE »,
   * ≈ 140 px), d'où ≈ 512 px. Tous les téléphones (320–430 px) sont donc
   * en une colonne ; la maquette 2 + 2 + 1 est conservée dès 520 px.
   * Doit rester égal à la requête de conteneur du module CSS.
   */
  singleColumnBelowPx: number;
  ink: string;
  inkSoft: string;
  label: string;
  accent: string;
  rule: string;
}

/** Une zone de la surface Desktop : sa coupe, son fondu et sa teinte. */
export interface DeathNoticeV2DesktopZoneTokens {
  /** Ligne de coupe de la zone : dernière rangée du haut = cutY − 1. */
  cutY: number;
  fadePx: number;
  /** Teinte du papier seul (image W×2 : au-dessus du raccord haut, sous le
   * raccord bas), étirée sur la surface de la zone. */
  paperTone: string;
}

export type DeathNoticeV2PrecisionCount = 1 | 2 | 3 | 4 | 5;

export interface DeathNoticeV2DesktopTokens {
  masterSrc: string;
  /** SHA-256 du Master, identique au fichier de référence de la PO. */
  masterSha256: string;
  paperGrains: readonly { src: string; tileWidth: number; blend: string }[];
  noiseBlend: string;
  canvas: { width: number; height: number };
  /**
   * Deux piles Master + surface : `left` sert tout le décor, `right` le
   * recouvre à partir du fondu vertical centré sur `zoneSplitCanvas`
   * (largeur `zoneBlendCanvas`), placé dans le papier nu du centre. Sans
   * extension, les deux piles montrent le même Master : le raccord est
   * invisible par construction.
   */
  zones: { left: DeathNoticeV2DesktopZoneTokens; right: DeathNoticeV2DesktopZoneTokens };
  zoneSplitCanvas: number;
  zoneBlendCanvas: number;
  /** Haut du bloc de texte (haut de la ligne du titre), en px de canevas. */
  textTopCanvas: number;
  /** Réserve basse commune : bas du contenu de la maquette (rangée 775). */
  footCanvas: number;
  /** Axe de la composition, en px de canevas. */
  axisCanvas: number;
  /**
   * Bande des précisions sans ornement, à toutes les hauteurs où le décor
   * latéral peut descendre avec l'extension : bouquet gauche jusqu'à
   * x 175, bouquet droit dès x 1539 ; « Paris, France » (maquette
   * x 189–344) et « qui partagent son souvenir. » (x 1291–1528) y tiennent.
   */
  precisionLeftCanvas: number;
  precisionRightCanvas: number;
  /** Pas des colonnes selon le nombre de précisions rendues : 286 pour cinq
   * (maquette), plus large quand il y en a moins, groupe centré sur l'axe. */
  columnPitchCanvas: Readonly<Record<DeathNoticeV2PrecisionCount, number>>;
  /** Retrait du texte de part et d'autre, dans sa colonne. */
  columnInsetCanvas: number;
  /**
   * Réserve basse supplémentaire de chaque colonne, en px de canevas : le
   * bord déchiré du bas remonte à gauche (rangée 745 sous la première
   * colonne de cinq, 805 au centre) ; chaque texte s'arrête 18 px au-dessus
   * du bord qui passe sous lui.
   */
  columnFootCanvas: Readonly<Record<DeathNoticeV2PrecisionCount, readonly number[]>>;
}

export interface DeathNoticeV2VariantTokens {
  mobile: DeathNoticeV2MobileTokens;
  /** Composition Desktop, ou `null` tant que la variante n'en a pas : la
   * composition Mobile s'applique alors à toutes les largeurs. */
  desktop: DeathNoticeV2DesktopTokens | null;
}

const ROOT = "/assets/death-notice/v2/mobile/light";

/**
 * Mobile Light. Coupe Y = 955, fondu 40 px : rangées 800–1080 presque nues
 * (4 px de détail net par rangée en moyenne dans la fenêtre du fondu,
 * contre 90 à 270 au-dessus de 760 et sous 1200). Teinte : médianes des
 * rangées 865–915 (au-dessus du raccord haut) et 995–1045 (sous le raccord
 * bas), lissées σ = 22 px : un profil unique laissait un écart de 27 à 35
 * niveaux sur les 5 % de chaque bord au raccord haut. Grain : trois tuiles du papier
 * central (460×620, 400×540, 340×460), tendance basse fréquence retirée,
 * raccordables sans miroir.
 */
const MOBILE_LIGHT: DeathNoticeV2MobileTokens = {
  masterSrc: `${ROOT}/avis-mobile-light-master.png`,
  masterSha256: "757fab95d4094a9fcf3ee3c651b1b3c962a0a723a781a3ccde14f89608fb3e6a",
  paperGrains: [
    { src: `${ROOT}/avis-mobile-light-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${ROOT}/avis-mobile-light-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${ROOT}/avis-mobile-light-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  paperTone: `${ROOT}/avis-mobile-light-tone.png`,
  canvas: { width: 941, height: 1671 },
  cutY: 955,
  fadePx: 40,
  textTopCanvas: 236,
  /** Papier nu mesuré (aucun pixel de décor à plus de 40 niveaux du papier
   * sur plus de 5 % d'une bande de 20 rangées) : x 0,07–0,92 jusqu'à la
   * rangée 1020 ; x 0,19–0,86 de 1020 à 1220 ; x 0,22–0,75 de 1240 à 1300,
   * où la maquette ne pose que son bloc final centré (texte jusqu'à 1289). */
  /** 346 : phase 2, les rangées des précisions suivent la maquette au
   * pixel près (dernier texte à 1289 comme la maquette). */
  footCanvas: 346,
  footPairCanvas: 511,
  pairRightCanvas: 850,
  footSingleColumnCanvas: 451,
  singleColumnBandLeftCanvas: 180,
  singleColumnBandRightCanvas: 810,
  /** Médaillons de gauche à x 90 ; textes de droite jusqu'à x 880 (la
   * maquette : « accompagnera toujours.” » finit à x 880, sous les
   * marguerites du bord droit, qui descendent jusqu'à la rangée 860). */
  textLeftCanvas: 88,
  textRightCanvas: 880,
  singleColumnBelowPx: 520,
  /** Encres échantillonnées sur la maquette (médiane des pixels d'encre). */
  ink: "#211d13",
  inkSoft: "#2f2a20",
  /** Phase 2 : étiquettes un peu plus sombres, comme la maquette. */
  label: "#3a3226",
  accent: "#8a5a2c",
  rule: "rgb(58 47 32 / 0.55)",
};

const DARK_ROOT = "/assets/death-notice/v2/mobile/dark";

/**
 * Mobile Dark (phase 3). Réglages mesurés sur SES références — fond
 * `02_FONDS_VIERGES/MOBILE_DARK.png` (941×1672, SHA-256 ci-dessous) et
 * maquette `01_MAQUETTES_ILLUSTREES/MOBILE_DARK.png` —, jamais recopiés du
 * Light. Coupe Y = 895, fondu 40 px : minimum de détail net aux bords
 * (31 px/rangée) ; seules de fines brindilles dorées du bord gauche
 * (x < 0,075) traversent la fenêtre du fondu ; plus bas (≈ 1130), le bord
 * déchiré droit traverse tout le fondu. Teinte : médianes des rangées
 * 805–855 et 935–985. Grain : trois tuiles du cuir central craquelé.
 * Cuir nu mesuré (aucun pixel à plus de 40 niveaux du cuir sur plus de 5 %
 * d'une bande de 20 rangées) : x 0,08–0,93 de 840 à 1180, x 0,16–0,89 vers
 * 1220, x 0,20–0,79 de 1240 à 1280, x 0,24–0,73 vers 1300.
 */
const MOBILE_DARK: DeathNoticeV2MobileTokens = {
  masterSrc: `${DARK_ROOT}/avis-mobile-dark-master.png`,
  masterSha256: "0164cefbe1281d61bdff86c2e6bc24c385f6ee45350a4dd4328b2a5be2b43980",
  paperGrains: [
    { src: `${DARK_ROOT}/avis-mobile-dark-grain-a.png`, tileWidth: 460, blend: "overlay" },
    { src: `${DARK_ROOT}/avis-mobile-dark-grain-b.png`, tileWidth: 400, blend: "overlay" },
    { src: `${DARK_ROOT}/avis-mobile-dark-grain-c.png`, tileWidth: 340, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  paperTone: `${DARK_ROOT}/avis-mobile-dark-tone.png`,
  canvas: { width: 941, height: 1672 },
  cutY: 895,
  fadePx: 40,
  /** Maquette Dark : titre à y 252 (Light 245). */
  textTopCanvas: 243,
  /** Dernier texte de la maquette Dark à 1278 (rendu : 1284) ; le cuir se
   * resserre dès 1240. 356 : le contenu de référence tient exactement dans
   * le Master à 941 px. */
  footCanvas: 356,
  /** Paire en dernière rangée : contenu arrêté à 1180, où le cuir reste nu
   * jusqu'à x 0,92. */
  footPairCanvas: 492,
  pairRightCanvas: 866,
  /** Une colonne : contenu arrêté à 1220, bande x 180–830. */
  footSingleColumnCanvas: 452,
  singleColumnBandLeftCanvas: 180,
  singleColumnBandRightCanvas: 830,
  /** Maquette Dark : médaillons de gauche dès x 90, « toujours.” » finit à
   * x 878. */
  textLeftCanvas: 88,
  textRightCanvas: 880,
  singleColumnBelowPx: 520,
  /** Encres crème de la maquette Dark (médiane des pixels d'encre). */
  ink: "#f4e9d8",
  inkSoft: "#e7ddcb",
  label: "#c6bcab",
  accent: "#d9b886",
  rule: "rgb(216 190 150 / 0.6)",
};

const DESKTOP_LIGHT_ROOT = "/assets/death-notice/v2/desktop/light";

/**
 * Desktop Light (phase 4). Réglages mesurés sur SES références — fond
 * `02_FONDS_VIERGES/DESKTOP_LIGHT.png` (1672×941, SHA-256 ci-dessous) et
 * maquette `01_MAQUETTES_ILLUSTREES/DESKTOP_LIGHT.png` (1670×941, même
 * cadrage à x 0) —, jamais recopiés du Mobile.
 *
 * Coupes (scripts/pilot/avis-v2-derive.py) : à gauche (colonnes 0–420),
 * rangée 468, fondu 28, entre le bas des feuillets écrits et le haut du
 * bouquet ; à droite (colonnes 1250–1672), rangée 616, fondu 40, sous le
 * brin fleuri et les ombres de feuilles (9 px de détail net par rangée).
 * Raccord des deux piles : fondu de 600 px centré sur x 836, où les
 * rangées 468–616 sont du papier nu. Grain : trois tuiles du papier
 * central (560 / 480 / 410).
 */
const DESKTOP_LIGHT: DeathNoticeV2DesktopTokens = {
  masterSrc: `${DESKTOP_LIGHT_ROOT}/avis-desktop-light-master.png`,
  masterSha256: "f95b05ce584292ae3059f4d2f4463b8bd62ad72fb6ed7f6433d451e9d721c070",
  paperGrains: [
    { src: `${DESKTOP_LIGHT_ROOT}/avis-desktop-light-grain-a.png`, tileWidth: 560, blend: "overlay" },
    { src: `${DESKTOP_LIGHT_ROOT}/avis-desktop-light-grain-b.png`, tileWidth: 480, blend: "overlay" },
    { src: `${DESKTOP_LIGHT_ROOT}/avis-desktop-light-grain-c.png`, tileWidth: 410, blend: "overlay" },
  ],
  noiseBlend: "soft-light",
  canvas: { width: 1672, height: 941 },
  zones: {
    left: { cutY: 468, fadePx: 28, paperTone: `${DESKTOP_LIGHT_ROOT}/avis-desktop-light-tone-left.png` },
    right: { cutY: 616, fadePx: 40, paperTone: `${DESKTOP_LIGHT_ROOT}/avis-desktop-light-tone-right.png` },
  },
  zoneSplitCanvas: 836,
  zoneBlendCanvas: 600,
  /** Maquette : capitales du titre à y 102 (accents à 98). */
  textTopCanvas: 95,
  /** Dernière ligne de la maquette (« qui demeure.” ») à 773. */
  footCanvas: 166,
  /** Titre, nom, dates, cœur et annonce centrés sur x 835 (maquette). */
  axisCanvas: 836,
  precisionLeftCanvas: 182,
  precisionRightCanvas: 1530,
  /** Maquette : médaillons centrés à 262 / 550 / 835 / 1113 / 1407. */
  columnPitchCanvas: { 1: 480, 2: 380, 3: 330, 4: 310, 5: 286 },
  /** Texte le plus large de la maquette : 237 px dans une colonne de 286
   * (« qui partagent son souvenir. ») ; 244 px de place utile. */
  columnInsetCanvas: 21,
  columnFootCanvas: {
    1: [9],
    2: [9, 0],
    3: [17, 1, 0],
    4: [42, 9, 0, 0],
    5: [48, 17, 0, 0, 0],
  },
};

/** Mobile Light (phases 1-2, CLOSED), Mobile Dark (phase 3) et Desktop
 * Light (phase 4). */
export const DEATH_NOTICE_V2_TOKENS: Readonly<Record<SkinVariant, DeathNoticeV2VariantTokens | null>> = Object.freeze({
  light: { mobile: MOBILE_LIGHT, desktop: DESKTOP_LIGHT },
  dark: { mobile: MOBILE_DARK, desktop: null },
});

/** Breakpoint Desktop (décision PO), sur la largeur RÉELLE du conteneur.
 * Doit rester égal à la requête de conteneur du module CSS. */
export const DEATH_NOTICE_V2_DESKTOP_MIN_PX = 1024;

/** Largeur maximale de la composition Desktop (décision PO). */
export const DEATH_NOTICE_V2_DESKTOP_MAX_PX = 1448;

export interface DeathNoticeV2DesktopColumn {
  /** Centre et largeur de la colonne, en px de canevas. */
  center: number;
  pitch: number;
  /** Demi-largeur disponible pour l'intitulé et le texte. */
  half: number;
  /** Réserve basse supplémentaire de la colonne. */
  foot: number;
}

/**
 * Colonnes Desktop des précisions réellement rendues (1 à 5) : groupe
 * centré sur l'axe, pas `columnPitchCanvas[count]`, chaque texte borné par
 * sa colonne et par la bande sans ornement.
 */
export function deathNoticeV2DesktopColumns(D: DeathNoticeV2DesktopTokens, count: number): DeathNoticeV2DesktopColumn[] {
  if (count < 1 || count > 5) return [];
  const n = count as DeathNoticeV2PrecisionCount;
  const pitch = D.columnPitchCanvas[n];
  return Array.from({ length: n }, (_, index) => {
    const center = D.axisCanvas + (index - (n - 1) / 2) * pitch;
    const half = Math.min(pitch / 2 - D.columnInsetCanvas, center - D.precisionLeftCanvas, D.precisionRightCanvas - center);
    return { center, pitch, half, foot: D.columnFootCanvas[n][index] ?? 0 };
  });
}
