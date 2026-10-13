import type { SkinVariant } from "@/config/skins";

/**
 * Avis de décès V2 — pilote Mobile Light uniquement (phases 1 et 2, GO QG).
 *
 * Même moteur que le Récit de vie V2 (config/recit-de-vie-v2-tokens.ts),
 * réglages propres à l'Avis : Master authentique + papier central CSS +
 * hauteur dynamique. Rien ici n'est recopié du Récit (coupe, teinte,
 * grain, zones).
 *
 * ## Autorités
 *
 * Fond : `02_FONDS_VIERGES/MOBILE_LIGHT.png` du ZIP
 * `HERITAGE_AVIS_DE_DECES_8_REFERENCES_AUDIT_OPUS`, copié octet pour octet
 * (SHA-256 ci-dessous, vérifié par les tests). Composition : maquette
 * `01_MAQUETTES_ILLUSTREES/MOBILE_LIGHT.png` (941×1671), mesurée en px de
 * canevas — chaque valeur `*Canvas` ci-dessous est la valeur relevée sur
 * la maquette.
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
 * Mobile Light seulement. Mobile Dark, Desktop Light et Desktop Dark n'ont
 * pas encore de réglages (`null`). Les ornements Mobile Light (médaillons,
 * rameau, cœur, filets — phase 2) sont reconstruits en SVG/CSS dans
 * components/memorial/death-notice/v2/. Ce renderer n'est branché sur aucun
 * registre de production.
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

export interface DeathNoticeV2VariantTokens {
  mobile: DeathNoticeV2MobileTokens;
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

/** Phase 1 : seule la variante Light a des réglages Mobile. */
export const DEATH_NOTICE_V2_TOKENS: Readonly<Record<SkinVariant, DeathNoticeV2VariantTokens | null>> = Object.freeze({
  light: { mobile: MOBILE_LIGHT },
  dark: null,
});
