/**
 * Contributions des proches — RELEVÉ DES MASTERS (mission M0).
 *
 * Relevé M0, intégré tel que contrôlé par le chef de projet délégué (M4). Il
 * n'importe aucun module A13. Lecteur : `lib/memorial/contributions/` (M4), qui
 * emploie la géométrie PROPRE à chaque Master (Light et Dark séparés) ; la
 * moyenne `CONTRIBUTIONS_CANONICAL_SLOTS` reste informative, non lue.
 *
 * ## Sources (autorité artistique)
 *
 * Seize images transmises par la PO (empreinte SHA-256, 12 premiers
 * caractères) :
 * - 4 Masters « avec contributions » (scène à 4 contributions) ;
 * - 4 fonds vierges correspondants (supports runtime des scènes avec contributions) ;
 * - 4 Masters de l'état public sans contribution ;
 * - 4 versions nettoyées de cet état (supports runtime de l'état vide).
 *
 * ## Méthode et tolérance
 *
 * Coins des cartes lus à la main sur grilles de 50 px et de 10 px,
 * recoupés par superposition des quadrilatères sur les Masters ; boîtes du
 * titre, des textes et des boutons lues par différence Master / fond vierge
 * (composantes connexes) quand elle est nette, sinon sur grille.
 * Tolérance : ±8 px sur les positions, ±12 px sur les tailles, ±1,5° sur les
 * inclinaisons, ±2 px sur les corps de caractères estimés (pas de ligne / 1,3).
 * Toutes les valeurs sont en pixels SOURCE du Master (repère d'origine en
 * haut à gauche, y vers le bas). Aucune valeur n'est inventée : ce qui n'est
 * pas lisible sur les Masters est marqué `null` et listé dans les obstacles.
 */

export type ContributionsFormat = "desktop" | "mobile";
export type ContributionsTheme = "light" | "dark";
export type ContributionsSceneState = "with-contributions" | "empty";
export type ContributionsSlotId = "R1" | "R2" | "C1" | "P1";
export type ContributionsCardFormat = "condolence" | "story-tall" | "story-wide" | "polaroid";

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ── Sources ────────────────────────────────────────────────────────────

export const CONTRIBUTIONS_MASTER_SOURCES = {
  withContributions: {
    desktop: {
      light: { file: "Hommage à Élise en mots et souvenirs.png", size: [1672, 941], sha256: "995e62c7ce04" },
      dark: { file: "Hommage à Élise, en mots et souvenirs(1).png", size: [1672, 941], sha256: "3b35a5a7ae8c" },
    },
    mobile: {
      light: { file: "Hommage à Élise Martin en souvenirs.png", size: [941, 1672], sha256: "2fdd69d62bd3" },
      dark: { file: "Hommage à Élise Martin(1).png", size: [941, 1672], sha256: "4dc7c9146fbf" },
    },
  },
  blankBackgrounds: {
    desktop: {
      light: { file: "Papier vintage aux bordures botaniques.png", size: [1671, 941], sha256: "c3ebfa800cac" },
      dark: { file: "Cadre vintage bronze et feuillage d’olivier.png", size: [1671, 941], sha256: "4f0a7296f42f" },
    },
    mobile: {
      light: { file: "Papier vintage aux feuillages et sceau en bronze.png", size: [941, 1671], sha256: "5498e6f7f019" },
      dark: { file: "Fond rustique bronze et sceau botanique.png", size: [941, 1671], sha256: "9634e746b256" },
    },
  },
  emptyMasters: {
    desktop: {
      light: { file: "Image ChatGPT 17 nov. 2026, 18_54_15.png", size: [1672, 941], sha256: "8facbc6279b8" },
      dark: { file: "Image ChatGPT 17 nov. 2026, 18_53_47.png", size: [1672, 941], sha256: "7ddaa655fc11" },
    },
    mobile: {
      light: { file: "Image ChatGPT 17 nov. 2026, 18_54_31.png", size: [941, 1672], sha256: "0b2ee2d51f81" },
      dark: { file: "Image ChatGPT 17 nov. 2026, 18_53_14.png", size: [941, 1672], sha256: "41d9c258b855" },
    },
  },
  emptyCleaned: {
    desktop: {
      light: { file: "Carte vintage botanique aux feuillages d’olivier(1).png", size: [1671, 941], sha256: "dc7c338987f2" },
      dark: { file: "Papier parchemin vintage aux feuillages olive(1).png", size: [1671, 941], sha256: "85f920b3e15c" },
    },
    mobile: {
      light: { file: "Papeterie botanique élégante sans texte(1).png", size: [941, 1671], sha256: "325662a4c71d" },
      dark: { file: "Papeterie élégante aux accents botaniques(1).png", size: [941, 1671], sha256: "c78e7a25e670" },
    },
  },
} as const;

/**
 * Repères. Les Masters mesurent 1672 (ou 941 × 1672) et les fonds 1671 : un
 * pixel d'écart, sans conséquence. Le repère Desktop canonique est celui d'A13
 * (1670 × 941) ; `toCanonical` = 1670 / 1671 est appliqué par le runtime, pas
 * ici (même convention que `A13_ALBUM_SOURCE_TO_CANONICAL`). Le repère Mobile
 * est conservé à 941 × 1671 : il n'a pas d'équivalent A13 (le cadre Mobile
 * A13 fait 1024 de large).
 */
export const CONTRIBUTIONS_FRAMES = {
  desktop: { width: 1671, height: 941, canonicalWidth: 1670, toCanonical: 1670 / 1671 },
  mobile: { width: 941, height: 1671 },
} as const;

/** Facteur source → CSS aux largeurs de référence (pont responsive A13). */
export const CONTRIBUTIONS_CSS_SCALE = {
  desktopAt1200: 1200 / 1670,
  desktopAt1024: 1024 / 1670,
  mobileAt375: 375 / 941,
  mobileAt430: 430 / 941,
} as const;

// ── Scène avec contributions : relevé brut par Master ──────────────────

export interface MasterItem {
  format: ContributionsCardFormat;
  /** Coins du papier, ordre haut-gauche, haut-droit, bas-droit, bas-gauche. */
  corners: readonly [Pt, Pt, Pt, Pt];
  center: Pt;
  size: { width: number; height: number };
  /** Positif = sens horaire (repère y vers le bas). */
  rotationDeg: number;
  /** Profondeur lue sur le Master (plus grand = au-dessus). */
  zIndex: number;
}

export const CONTRIBUTIONS_MASTER_ITEMS: Record<ContributionsFormat, Record<ContributionsTheme, Record<ContributionsSlotId, MasterItem>>> = {
  desktop: {
    light: {
      R1: { format: "story-tall", corners: [{ x: 32, y: 352 }, { x: 415, y: 343 }, { x: 440, y: 688 }, { x: 62, y: 717 }], center: { x: 237.2, y: 525.0 }, size: { width: 381.1, height: 356.1 }, rotationDeg: -2.9, zIndex: 10 },
      C1: { format: "condolence", corners: [{ x: 420, y: 400 }, { x: 870, y: 385 }, { x: 880, y: 652 }, { x: 430, y: 667 }], center: { x: 650.0, y: 526.0 }, size: { width: 450.2, height: 267.2 }, rotationDeg: -1.9, zIndex: 30 },
      R2: { format: "story-wide", corners: [{ x: 845, y: 385 }, { x: 1270, y: 358 }, { x: 1278, y: 655 }, { x: 848, y: 682 }], center: { x: 1060.2, y: 520.0 }, size: { width: 428.4, height: 297.1 }, rotationDeg: -3.6, zIndex: 20 },
      P1: { format: "polaroid", corners: [{ x: 1305, y: 308 }, { x: 1636, y: 340 }, { x: 1580, y: 735 }, { x: 1236, y: 688 }], center: { x: 1439.2, y: 517.8 }, size: { width: 339.9, height: 392.6 }, rotationDeg: 6.7, zIndex: 40 },
    },
    dark: {
      R1: { format: "story-tall", corners: [{ x: 35, y: 345 }, { x: 430, y: 315 }, { x: 455, y: 670 }, { x: 60, y: 700 }], center: { x: 245.0, y: 507.5 }, size: { width: 396.1, height: 355.9 }, rotationDeg: -4.3, zIndex: 10 },
      C1: { format: "condolence", corners: [{ x: 432, y: 388 }, { x: 870, y: 372 }, { x: 880, y: 632 }, { x: 445, y: 648 }], center: { x: 656.8, y: 510.0 }, size: { width: 436.8, height: 260.3 }, rotationDeg: -2.1, zIndex: 30 },
      R2: { format: "story-wide", corners: [{ x: 865, y: 372 }, { x: 1275, y: 345 }, { x: 1280, y: 640 }, { x: 845, y: 655 }], center: { x: 1066.2, y: 503.0 }, size: { width: 423.1, height: 289.4 }, rotationDeg: -2.9, zIndex: 20 },
      P1: { format: "polaroid", corners: [{ x: 1320, y: 282 }, { x: 1640, y: 340 }, { x: 1595, y: 715 }, { x: 1250, y: 670 }], center: { x: 1451.2, y: 501.8 }, size: { width: 336.6, height: 386.0 }, rotationDeg: 8.9, zIndex: 40 },
    },
  },
  mobile: {
    light: {
      R1: { format: "story-tall", corners: [{ x: 29, y: 494 }, { x: 447, y: 453 }, { x: 494, y: 800 }, { x: 59, y: 829 }], center: { x: 257.2, y: 644.0 }, size: { width: 428.0, height: 343.3 }, rotationDeg: -4.7, zIndex: 10 },
      R2: { format: "story-wide", corners: [{ x: 470, y: 482 }, { x: 906, y: 453 }, { x: 929, y: 782 }, { x: 494, y: 812 }], center: { x: 699.8, y: 632.2 }, size: { width: 436.5, height: 330.3 }, rotationDeg: -3.9, zIndex: 20 },
      C1: { format: "condolence", corners: [{ x: 24, y: 897 }, { x: 541, y: 856 }, { x: 547, y: 1138 }, { x: 41, y: 1179 }], center: { x: 288.2, y: 1017.5 }, size: { width: 513.1, height: 282.3 }, rotationDeg: -4.6, zIndex: 30 },
      P1: { format: "polaroid", corners: [{ x: 594, y: 782 }, { x: 906, y: 808 }, { x: 898, y: 1250 }, { x: 512, y: 1191 }], center: { x: 727.5, y: 1007.8 }, size: { width: 351.8, height: 429.6 }, rotationDeg: 6.7, zIndex: 40 },
    },
    dark: {
      R1: { format: "story-tall", corners: [{ x: 29, y: 512 }, { x: 441, y: 465 }, { x: 471, y: 824 }, { x: 53, y: 876 }], center: { x: 248.5, y: 669.2 }, size: { width: 417.9, height: 362.5 }, rotationDeg: -6.8, zIndex: 10 },
      R2: { format: "story-wide", corners: [{ x: 471, y: 504 }, { x: 912, y: 453 }, { x: 924, y: 771 }, { x: 488, y: 782 }], center: { x: 698.8, y: 627.5 }, size: { width: 440.0, height: 298.4 }, rotationDeg: -4.0, zIndex: 20 },
      C1: { format: "condolence", corners: [{ x: 29, y: 909 }, { x: 518, y: 879 }, { x: 529, y: 1150 }, { x: 47, y: 1185 }], center: { x: 280.8, y: 1030.8 }, size: { width: 486.6, height: 273.9 }, rotationDeg: -3.8, zIndex: 30 },
      P1: { format: "polaroid", corners: [{ x: 565, y: 765 }, { x: 924, y: 841 }, { x: 894, y: 1250 }, { x: 500, y: 1185 }], center: { x: 720.8, y: 1010.2 }, size: { width: 383.1, height: 417.5 }, rotationDeg: 10.7, zIndex: 40 },
    },
  },
};

// ── M4.2 — Formats communs Light / Dark (décision PO) ──────────────────

/**
 * Décision PO M4.2 : les Masters sont des références d'INTENTION (harmonie,
 * matières, inclinaisons, superpositions discrètes), pas des contrats de
 * reproduction au pixel. Les cartes ont les MÊMES dimensions dans les deux
 * thèmes ; seul l'habillage change (bleu pétrole, ivoire, pêche). Référence
 * retenue : le Master Dark (proposée par la PO pour la condoléance, étendue
 * aux deux récits et au Polaroid pour un contrat unique). Desktop et Mobile
 * gardent chacun leurs formats (responsive). Arrondi au pixel.
 */
export const CONTRIBUTIONS_FORMAT_REFERENCE_THEME: ContributionsTheme = "dark";

const referenceSize = (frame: ContributionsFormat, slot: ContributionsSlotId) => {
  const s = CONTRIBUTIONS_MASTER_ITEMS[frame][CONTRIBUTIONS_FORMAT_REFERENCE_THEME][slot].size;
  return { width: Math.round(s.width), height: Math.round(s.height) };
};

/** Formats communs par repère : identiques en Light et en Dark. */
export const CONTRIBUTIONS_COMMON_FORMATS: Record<ContributionsFormat, Record<ContributionsCardFormat, { width: number; height: number }>> = {
  desktop: { condolence: referenceSize("desktop", "C1"), "story-tall": referenceSize("desktop", "R1"), "story-wide": referenceSize("desktop", "R2"), polaroid: referenceSize("desktop", "P1") },
  mobile: { condolence: referenceSize("mobile", "C1"), "story-tall": referenceSize("mobile", "R1"), "story-wide": referenceSize("mobile", "R2"), polaroid: referenceSize("mobile", "P1") },
};

/**
 * Géométrie canonique : moyenne Light / Dark par format, proposée en M0 (O3).
 * INFORMATIVE depuis M4 : la mission demande de ne pas imposer de moyenne
 * artistique ; le moteur lit `CONTRIBUTIONS_MASTER_ITEMS` thème par thème.
 * `lightDarkDelta` garde l'écart mesuré entre les deux Masters.
 */
export interface CanonicalSlot {
  format: ContributionsCardFormat;
  center: Pt;
  size: { width: number; height: number };
  rotationDeg: number;
  zIndex: number;
  lightDarkDelta: { center: number; width: number; height: number; rotationDeg: number };
}

export const CONTRIBUTIONS_CANONICAL_SLOTS: Record<ContributionsFormat, Record<ContributionsSlotId, CanonicalSlot>> = {
  desktop: {
    R1: { format: "story-tall", center: { x: 241.1, y: 516.2 }, size: { width: 388.6, height: 356.0 }, rotationDeg: -3.6, zIndex: 10, lightDarkDelta: { center: 19.1, width: 15.0, height: 0.2, rotationDeg: 1.5 } },
    C1: { format: "condolence", center: { x: 653.4, y: 518.0 }, size: { width: 443.5, height: 263.7 }, rotationDeg: -2.0, zIndex: 30, lightDarkDelta: { center: 17.4, width: 13.5, height: 6.9, rotationDeg: 0.2 } },
    R2: { format: "story-wide", center: { x: 1063.2, y: 511.5 }, size: { width: 425.7, height: 293.2 }, rotationDeg: -3.2, zIndex: 20, lightDarkDelta: { center: 18.0, width: 5.3, height: 7.7, rotationDeg: 0.7 } },
    P1: { format: "polaroid", center: { x: 1445.2, y: 509.8 }, size: { width: 338.2, height: 389.3 }, rotationDeg: 7.8, zIndex: 40, lightDarkDelta: { center: 20.0, width: 3.3, height: 6.6, rotationDeg: 2.2 } },
  },
  mobile: {
    R1: { format: "story-tall", center: { x: 252.9, y: 656.6 }, size: { width: 423.0, height: 352.9 }, rotationDeg: -5.8, zIndex: 10, lightDarkDelta: { center: 26.7, width: 10.0, height: 19.3, rotationDeg: 2.1 } },
    R2: { format: "story-wide", center: { x: 699.2, y: 629.9 }, size: { width: 438.3, height: 314.4 }, rotationDeg: -3.9, zIndex: 20, lightDarkDelta: { center: 4.9, width: 3.5, height: 32.0, rotationDeg: 0.1 } },
    C1: { format: "condolence", center: { x: 284.5, y: 1024.1 }, size: { width: 499.9, height: 278.1 }, rotationDeg: -4.2, zIndex: 30, lightDarkDelta: { center: 15.2, width: 26.5, height: 8.4, rotationDeg: 0.8 } },
    P1: { format: "polaroid", center: { x: 724.1, y: 1009.0 }, size: { width: 367.5, height: 423.6 }, rotationDeg: 8.7, zIndex: 40, lightDarkDelta: { center: 7.2, width: 31.4, height: 12.1, rotationDeg: 3.9 } },
  },
};

// ── En-tête, actions et pied : relevé par Master ────────────────────────

export interface ChromeLayout {
  emblem: Box;
  /** Bloc du titre (encre, toutes lignes). */
  title: Box;
  titleLines: 1 | 2;
  subtitle: Box;
  subtitleLines: number;
  leafDivider: Box;
  /** Texte d'accueil sur la carte centrale (état vide seulement). */
  welcome: Box | null;
  /** Invitation en italique (état vide seulement). */
  invitation: Box | null;
  /** Carte centrale du décor (état vide : présente dans le fond nettoyé). */
  centralCard: Box | null;
  leaveMessageButton: Box;
  /** « Voir tous les messages » : absent de l'état vide. */
  viewAllButton: Box | null;
  heartDividerY: number;
  closingPhrase: Box;
  closingLines: 1 | 2;
  /** Sceau : élément du fond (disque de cire, détection de cercle), relevé pour les zones protégées. */
  seal: { center: Pt; diameter: number };
}

export const CONTRIBUTIONS_CHROME: Record<ContributionsSceneState, Record<ContributionsFormat, Record<ContributionsTheme, ChromeLayout>>> = {
  "with-contributions": {
    desktop: {
      light: {
        emblem: { x0: 798, y0: 26, x1: 872, y1: 127 },
        title: { x0: 409, y0: 138, x1: 1265, y1: 218 },
        titleLines: 1,
        subtitle: { x0: 422, y0: 232, x1: 1253, y1: 286 },
        subtitleLines: 2,
        leafDivider: { x0: 809, y0: 304, x1: 877, y1: 348 },
        welcome: null,
        invitation: null,
        centralCard: null,
        leaveMessageButton: { x0: 402, y0: 731, x1: 832, y1: 817 },
        viewAllButton: { x0: 868, y0: 736, x1: 1253, y1: 803 },
        heartDividerY: 845,
        closingPhrase: { x0: 525, y0: 871, x1: 1143, y1: 896 },
        closingLines: 1,
        seal: { center: { x: 1503, y: 846 }, diameter: 105 },
      },
      dark: {
        emblem: { x0: 796, y0: 22, x1: 875, y1: 126 },
        title: { x0: 376, y0: 132, x1: 1297, y1: 205 },
        titleLines: 1,
        subtitle: { x0: 399, y0: 214, x1: 1278, y1: 273 },
        subtitleLines: 2,
        leafDivider: { x0: 800, y0: 290, x1: 880, y1: 335 },
        welcome: null,
        invitation: null,
        centralCard: null,
        leaveMessageButton: { x0: 399, y0: 709, x1: 822, y1: 798 },
        viewAllButton: { x0: 868, y0: 720, x1: 1253, y1: 797 },
        heartDividerY: 828,
        closingPhrase: { x0: 519, y0: 852, x1: 1155, y1: 877 },
        closingLines: 1,
        seal: { center: { x: 1518, y: 822 }, diameter: 112 },
      },
    },
    mobile: {
      light: {
        emblem: { x0: 438, y0: 48, x1: 508, y1: 115 },
        title: { x0: 279, y0: 161, x1: 663, y1: 293 },
        titleLines: 2,
        subtitle: { x0: 236, y0: 306, x1: 705, y1: 385 },
        subtitleLines: 3,
        leafDivider: { x0: 443, y0: 400, x1: 504, y1: 439 },
        welcome: null,
        invitation: null,
        centralCard: null,
        leaveMessageButton: { x0: 241, y0: 1248, x1: 700, y1: 1330 },
        viewAllButton: { x0: 271, y0: 1346, x1: 671, y1: 1405 },
        heartDividerY: 1438,
        closingPhrase: { x0: 310, y0: 1470, x1: 634, y1: 1525 },
        closingLines: 2,
        seal: { center: { x: 806, y: 1505 }, diameter: 136 },
      },
      dark: {
        emblem: { x0: 433, y0: 41, x1: 509, y1: 111 },
        title: { x0: 259, y0: 165, x1: 676, y1: 282 },
        titleLines: 2,
        subtitle: { x0: 185, y0: 304, x1: 756, y1: 395 },
        subtitleLines: 3,
        leafDivider: { x0: 445, y0: 411, x1: 510, y1: 452 },
        welcome: null,
        invitation: null,
        centralCard: null,
        leaveMessageButton: { x0: 218, y0: 1250, x1: 720, y1: 1332 },
        viewAllButton: { x0: 251, y0: 1356, x1: 686, y1: 1418 },
        heartDividerY: 1456,
        closingPhrase: { x0: 287, y0: 1487, x1: 656, y1: 1548 },
        closingLines: 2,
        seal: { center: { x: 808, y: 1514 }, diameter: 139 },
      },
    },
  },
  empty: {
    desktop: {
      light: {
        emblem: { x0: 804, y0: 7, x1: 873, y1: 73 },
        title: { x0: 407, y0: 100, x1: 1267, y1: 160 },
        titleLines: 1,
        subtitle: { x0: 520, y0: 176, x1: 1153, y1: 229 },
        subtitleLines: 2,
        leafDivider: { x0: 800, y0: 245, x1: 870, y1: 280 },
        welcome: { x0: 620, y0: 396, x1: 1050, y1: 511 },
        invitation: { x0: 615, y0: 567, x1: 1050, y1: 640 },
        centralCard: { x0: 473, y0: 287, x1: 1193, y1: 700 },
        leaveMessageButton: { x0: 573, y0: 753, x1: 1097, y1: 823 },
        viewAllButton: null,
        heartDividerY: 851,
        closingPhrase: { x0: 496, y0: 869, x1: 1177, y1: 896 },
        closingLines: 1,
        seal: { center: { x: 1515, y: 805 }, diameter: 110 },
      },
      dark: {
        emblem: { x0: 800, y0: 13, x1: 873, y1: 80 },
        title: { x0: 407, y0: 127, x1: 1267, y1: 193 },
        titleLines: 1,
        subtitle: { x0: 416, y0: 213, x1: 1257, y1: 267 },
        subtitleLines: 2,
        leafDivider: { x0: 795, y0: 290, x1: 880, y1: 322 },
        welcome: { x0: 585, y0: 409, x1: 1110, y1: 480 },
        invitation: { x0: 575, y0: 533, x1: 1105, y1: 600 },
        centralCard: { x0: 440, y0: 333, x1: 1220, y1: 687 },
        leaveMessageButton: { x0: 576, y0: 709, x1: 1096, y1: 787 },
        viewAllButton: null,
        heartDividerY: 829,
        closingPhrase: { x0: 475, y0: 853, x1: 1200, y1: 880 },
        closingLines: 1,
        seal: { center: { x: 1497, y: 829 }, diameter: 131 },
      },
    },
    mobile: {
      light: {
        emblem: { x0: 440, y0: 44, x1: 511, y1: 107 },
        title: { x0: 278, y0: 156, x1: 662, y1: 278 },
        titleLines: 2,
        subtitle: { x0: 233, y0: 300, x1: 711, y1: 389 },
        subtitleLines: 3,
        leafDivider: { x0: 435, y0: 405, x1: 505, y1: 430 },
        welcome: { x0: 270, y0: 656, x1: 670, y1: 800 },
        invitation: { x0: 245, y0: 900, x1: 695, y1: 989 },
        centralCard: { x0: 144, y0: 500, x1: 778, y1: 1200 },
        leaveMessageButton: { x0: 222, y0: 1262, x1: 716, y1: 1351 },
        viewAllButton: null,
        heartDividerY: 1400,
        closingPhrase: { x0: 265, y0: 1433, x1: 680, y1: 1493 },
        closingLines: 2,
        seal: { center: { x: 808, y: 1507 }, diameter: 131 },
      },
      dark: {
        emblem: { x0: 422, y0: 33, x1: 500, y1: 122 },
        title: { x0: 56, y0: 189, x1: 878, y1: 256 },
        titleLines: 1,
        subtitle: { x0: 82, y0: 293, x1: 856, y1: 356 },
        subtitleLines: 2,
        leafDivider: { x0: 430, y0: 388, x1: 515, y1: 412 },
        welcome: { x0: 265, y0: 629, x1: 690, y1: 756 },
        invitation: { x0: 255, y0: 811, x1: 690, y1: 933 },
        centralCard: { x0: 167, y0: 456, x1: 789, y1: 1156 },
        leaveMessageButton: { x0: 167, y0: 1200, x1: 767, y1: 1300 },
        viewAllButton: null,
        heartDividerY: 1367,
        closingPhrase: { x0: 255, y0: 1407, x1: 690, y1: 1471 },
        closingLines: 2,
        seal: { center: { x: 787, y: 1552 }, diameter: 134 },
      },
    },
  },
};

// ── Formats des cartes et zones de texte ───────────────────────────────

/**
 * Zones exprimées en fractions du papier de la carte (repère local, avant
 * rotation : 0,0 = coin haut-gauche, 1,1 = coin bas-droit). Relevées sur les
 * deux exemplaires de chaque format et recoupées par le calcul de
 * recouvrement : sur les quatre Masters, aucun recouvrement n'atteint ces zones.
 */
export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TextCardFormat {
  kind: "condolence" | "story";
  /** Taille du papier, pixels source : format COMMUN Light / Dark (M4.2). */
  paper: Record<ContributionsFormat, { width: number; height: number }>;
  /** Corps du message. Aucune autre carte ni photo ne peut couvrir cette zone. */
  body: Zone;
  /** Filet de séparation (y seul) avant la signature, ou null. */
  ruleY: number | null;
  /** Signature (prénom ou « Marie et Pierre »). */
  signature: Zone;
  /** En-tête fixe de la carte (« POUR LA FAMILLE »), ou null. */
  overline: Zone | null;
  /** Ornement (cœur, rameau) : jamais recouvert par le texte. */
  ornaments: readonly Zone[];
  /** Fraction minimale de papier visible (Masters : ≥ 0,91 mesurée). */
  minVisiblePaper: number;
}

export const CONTRIBUTIONS_TEXT_CARD_FORMATS: Record<Exclude<ContributionsCardFormat, "polaroid">, TextCardFormat> = {
  condolence: {
    kind: "condolence",
    paper: { desktop: CONTRIBUTIONS_COMMON_FORMATS.desktop.condolence, mobile: CONTRIBUTIONS_COMMON_FORMATS.mobile.condolence },
    overline: { x0: 0.2, y0: 0.24, x1: 0.8, y1: 0.33 },
    body: { x0: 0.14, y0: 0.36, x1: 0.86, y1: 0.71 },
    ruleY: null,
    signature: { x0: 0.3, y0: 0.74, x1: 0.86, y1: 0.92 },
    ornaments: [
      { x0: 0.43, y0: 0.1, x1: 0.53, y1: 0.22 },
      { x0: 0.02, y0: 0.55, x1: 0.2, y1: 0.95 },
    ],
    minVisiblePaper: 0.9,
  },
  "story-tall": {
    kind: "story",
    paper: { desktop: CONTRIBUTIONS_COMMON_FORMATS.desktop["story-tall"], mobile: CONTRIBUTIONS_COMMON_FORMATS.mobile["story-tall"] },
    overline: null,
    body: { x0: 0.15, y0: 0.06, x1: 0.85, y1: 0.7 },
    ruleY: 0.76,
    signature: { x0: 0.38, y0: 0.78, x1: 0.82, y1: 0.93 },
    ornaments: [{ x0: 0.04, y0: 0.62, x1: 0.32, y1: 0.96 }],
    minVisiblePaper: 0.9,
  },
  "story-wide": {
    kind: "story",
    paper: { desktop: CONTRIBUTIONS_COMMON_FORMATS.desktop["story-wide"], mobile: CONTRIBUTIONS_COMMON_FORMATS.mobile["story-wide"] },
    overline: null,
    body: { x0: 0.12, y0: 0.12, x1: 0.84, y1: 0.62 },
    ruleY: 0.72,
    signature: { x0: 0.32, y0: 0.76, x1: 0.68, y1: 0.92 },
    ornaments: [{ x0: 0.78, y0: 0.55, x1: 0.95, y1: 0.95 }],
    minVisiblePaper: 0.9,
  },
};

/**
 * Le Polaroid de contribution est le Polaroid A13 (`layoutDynamicPolaroid`) :
 * fenêtre au ratio de la photo, CONTAIN hors 0,67–1,78, jamais de recadrage.
 * Seuls le papier et la légende diffèrent, relevés ici. `witness` = tirage
 * du Master (photo portrait proche de 0,92).
 */
export const CONTRIBUTIONS_POLAROID = {
  /** Polaroid témoin (surface de toute photographie) : format commun Light / Dark (M4.2). */
  witness: { desktop: CONTRIBUTIONS_COMMON_FORMATS.desktop.polaroid, mobile: CONTRIBUTIONS_COMMON_FORMATS.mobile.polaroid },
  /** Papier, pixels source Desktop (≈ ×1,09 en Mobile). */
  paper: { sidePaddingPx: 18, topPaddingPx: 20, bottomBandFraction: 0.22 },
  /** Ruban adhésif en haut : matière, sans effet sur la géométrie. */
  tape: true,
  /** Légende manuscrite sur deux lignes au plus : légende puis auteur. */
  caption: { maxLines: 2, carriesAuthor: true },
} as const;

// ── Typographie (estimée, pixels source) ───────────────────────────────

/**
 * Corps estimé = pas de ligne / 1,3 (ou hauteur de capitale / 0,65 pour le
 * titre). Les familles sont des identifications probables, à confirmer
 * (obstacle O5) : seules EB Garamond et La Belle Aurore existent déjà dans
 * `components/builder/fonts.ts`.
 */
export const CONTRIBUTIONS_TYPOGRAPHY = {
  families: {
    title: "EB Garamond (probable)",
    body: "EB Garamond (probable)",
    invitation: "EB Garamond Italic (probable)",
    overline: "EB Garamond, capitales espacées (probable)",
    signature: null, // script calligraphique absent du dépôt : à fournir
    polaroidCaption: "La Belle Aurore (probable)",
  },
  sizesSourcePx: {
    desktop: { title: 88, subtitle: 24, storyBody: 24, condolenceBody: 22, overline: 18, signature: 34, caption: 26, button: 26, viewAll: 22, closing: 22, welcome: 34, invitation: 30 },
    mobile: { title: 62, subtitle: 22, storyBody: 22.5, condolenceBody: 20, overline: 17, signature: 30, caption: 24, button: 28, viewAll: 24, closing: 22, welcome: 36, invitation: 32 },
  },
} as const;

// ── Zones protégées de la scène (pixels source) ────────────────────────

/** Aucun tirage ni carte ne peut y entrer (en-tête, actions, pied, sceau). */
export const CONTRIBUTIONS_PROTECTED_ZONES: Record<ContributionsFormat, readonly Box[]> = {
  desktop: [
    { x0: 370, y0: 0, x1: 1300, y1: 290 },
    { x0: 780, y0: 285, x1: 900, y1: 352 },
    { x0: 390, y0: 700, x1: 1270, y1: 820 },
    { x0: 500, y0: 822, x1: 1180, y1: 905 },
    { x0: 1440, y0: 760, x1: 1580, y1: 905 },
  ],
  mobile: [
    { x0: 170, y0: 30, x1: 770, y1: 398 },
    { x0: 420, y0: 395, x1: 530, y1: 452 },
    { x0: 200, y0: 1240, x1: 740, y1: 1425 },
    { x0: 250, y0: 1428, x1: 700, y1: 1555 },
    { x0: 730, y0: 1420, x1: 900, y1: 1590 },
  ],
};

/** Bande où vivent les contributions de la scène principale (pixels source). */
export const CONTRIBUTIONS_CARD_BAND: Record<ContributionsFormat, Box> = {
  desktop: { x0: 24, y0: 280, x1: 1656, y1: 750 },
  mobile: { x0: 16, y0: 440, x1: 935, y1: 1265 },
};

// ── États de dévoilement du Builder ────────────────────────────────────

export interface ContributionsPermissions {
  condolences: boolean;
  stories: boolean;
  photos: boolean;
}

/**
 * Le Builder montre la scène AVEC CONTRIBUTIONS (fond vierge), jamais l'état
 * public vide. Les éléments fictifs occupent leurs emplacements de Master,
 * sans recomposition : la scène est une fonction pure des autorisations,
 * donc réversible. B0…B3 nomment l'ordre du parcours guidé ; toute
 * combinaison d'autorisations est un état valide.
 */
export const CONTRIBUTIONS_BUILDER_REVEAL = [
  { id: "B0", requires: null, shows: ["emblem", "title", "subtitle", "leafDivider", "closingPhrase"], slots: [] },
  { id: "B1", requires: "condolences", shows: [], slots: ["C1"] },
  { id: "B2", requires: "stories", shows: [], slots: ["R1", "R2"] },
  { id: "B3", requires: "photos", shows: [], slots: ["P1"] },
] as const;

export function builderDemoSlots(p: ContributionsPermissions): ContributionsSlotId[] {
  const slots: ContributionsSlotId[] = [];
  if (p.stories) slots.push("R1", "R2");
  if (p.condolences) slots.push("C1");
  if (p.photos) slots.push("P1");
  return slots;
}

// ── Contrat de réutilisation A13 (pour M4, sans modifier A13) ──────────

/**
 * Paramètres que M4 devra fournir au moteur A13, et extensions attendues.
 * Les valeurs par défaut d'A13 restent celles de la Galerie et de l'Album.
 */
export const CONTRIBUTIONS_A13_REUSE_CONTRACT = {
  solverProfile: {
    desktop: { safeX: [24, 1656], hitTargetSourcePx: Math.ceil(44 / (1200 / 1670)) },
    // M4 : 925 (relevé M0) excluait le Master lui-même — R2 Mobile Light
    // atteint x = 929. La zone sûre est alignée sur la bande des contributions.
    mobile: { safeX: [16, 935], hitTargetSourcePx: Math.ceil(44 / (375 / 941)) },
  },
  /** Cartes : zone de texte visible à 100 %, papier ≥ 0,90. Polaroid : au-dessus de tout. */
  minima: { textBody: 1, textPaper: 0.9, polaroidPhoto: 1 },
  depth: { R1: 10, R2: 20, C1: 30, P1: 40 },
  requiredExtensions: [
    "fabrique de forme par emplacement (Polaroid A13 par défaut, Carte pour les messages)",
    "zone de texte de la carte transmise comme polygone protégé (rôle du polygone photo d'A13)",
    "zones protégées multiples (A13 n'a qu'une zone haute pour le premier groupe)",
    "repère Mobile 941 × 1671 (A13 Mobile : 1024)",
  ],
} as const;
