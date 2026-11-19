/**
 * M8-E2 — Contributions des proches : constantes partagées (navigateur et
 * serveur). Décisions PO closes (contrat M8-P final) :
 *  - D4/O3/O7 : longueurs en caractères VISIBLES (graphèmes), retours à la
 *    ligne admis ; nom 60, condoléance 500, récit 2000, légende 150
 *    (facultative) ;
 *  - Q2 : au plus 10 points de code par caractère visible ; la base
 *    n'applique qu'un filet de 10 N points de code (migration
 *    20261119090000_m8_e1_contributions.sql), jamais plus strict ;
 *  - Q3 : jeton de formulaire signé, délai minimal 3 s, durée de vie 2 h ;
 *  - O5 : photo ré-encodée par le serveur, 2000 px au plus grand côté,
 *    WebP, aucune métadonnée. Paramètres artistiques définitifs à fixer
 *    après essais sur photos réelles.
 */

export const CONTRIBUTION_TEXT_LIMITS = {
  authorName: 60,
  condolence: 500,
  story: 2000,
  caption: 150,
} as const;

export type ContributionTextField = keyof typeof CONTRIBUTION_TEXT_LIMITS;

/** Q2 : un caractère visible de plus de 10 points de code est refusé. */
export const CONTRIBUTION_MAX_CODE_POINTS_PER_CHARACTER = 10;

/** Les deux types de textes déposés par `submit_contribution_v1`. */
export const CONTRIBUTION_TEXT_TYPES = ["condolence", "testimonial"] as const;
export type ContributionTextType = (typeof CONTRIBUTION_TEXT_TYPES)[number];

/** Les trois types visibles dans la rubrique « Contributions des proches ». */
export const CONTRIBUTION_TYPES = ["condolence", "testimonial", "photo"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** Q3 — jeton anti-robots. */
export const CONTRIBUTION_FORM_TOKEN_MIN_AGE_MS = 3_000;
export const CONTRIBUTION_FORM_TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Taille minimale d'un secret (octets UTF-8) ; un secret plus court est ignoré. */
export const CONTRIBUTION_FORM_SECRET_MIN_BYTES = 32;

/** O5 — traitement serveur des photographies des proches. */
export const CONTRIBUTION_MEDIA_PURPOSE = "contribution";
export const CONTRIBUTION_PHOTO_MAX_SIDE = 2000;
export const CONTRIBUTION_PHOTO_WEBP_QUALITY = 85;
export const CONTRIBUTION_PHOTO_MAX_INPUT_PIXELS = 50_000_000;
/** Même plafond que le circuit média existant (MAX_MEDIA_BYTES) et que la base (max_photo_bytes). */
export const CONTRIBUTION_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/** Lecture publique : taille de page par défaut et plafond (la base borne à 100). */
export const CONTRIBUTION_PAGE_SIZE = 24;
export const CONTRIBUTION_PAGE_SIZE_MAX = 100;
