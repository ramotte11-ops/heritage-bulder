import type { MediaPurpose } from "./media";

/**
 * Optimisation photographique V1 — doctrine HERITAGE (décision PO).
 *
 * Une photographie envoyée = UN SEUL fichier optimisé stocké. Elle est
 * préparée dans le navigateur, avant l'envoi
 * (`lib/media/photo-preparation.ts`) : l'original lourd ne quitte jamais
 * l'appareil de la famille et n'est jamais conservé. HERITAGE est une
 * plateforme d'hommage, pas un service d'archivage photographique.
 *
 * Les poids sont des CIBLES de conception, pas des garanties : la
 * compression est adaptative (qualité puis dimensions) et une image qui
 * ne peut raisonnablement pas atteindre sa cible est envoyée dans sa
 * meilleure version optimisée — jamais l'original (`targetMet: false`
 * dans le rapport de préparation).
 *
 * Format privilégié : WebP. Repli JPEG quand le navigateur ne sait pas
 * encoder le WebP (Safari, à la date de cette version) — les deux sont
 * déjà admis par le serveur (`ALLOWED_IMAGE_MIME_TYPES`).
 */
export interface PhotoProfile {
  /** Grand côté maximal du fichier envoyé, en pixels. */
  maxSide: number;
  /** Poids visé (borne haute), en octets. */
  targetMaxBytes: number;
  /** Qualité de départ (0–1) : la plus haute, abaissée seulement si besoin. */
  qualityStart: number;
  /** Qualité plancher : en dessous, on réduit plutôt les dimensions. */
  qualityFloor: number;
}

export const PHOTO_PROFILES: Readonly<Record<MediaPurpose, PhotoProfile>> = {
  // Hero — unique exception : plus grand, qualité un peu supérieure,
  // plancher élevé pour préserver la netteté des visages.
  hero: { maxSide: 2400, targetMaxBytes: 700 * 1024, qualityStart: 0.86, qualityFloor: 0.74 },
  // Galerie, Album et toute autre photographie.
  gallery: { maxSide: 1600, targetMaxBytes: 350 * 1024, qualityStart: 0.8, qualityFloor: 0.62 },
};

/** Pas de baisse de qualité entre deux essais. */
export const PHOTO_QUALITY_STEP = 0.06;

/** Réductions successives des dimensions quand le plancher de qualité
 * ne suffit pas (facteurs appliqués au grand côté du profil). */
export const PHOTO_SCALE_STEPS: readonly number[] = [1, 0.85, 0.72];

/**
 * Garde-fous MÉMOIRE du navigateur, vérifiés sur l'en-tête du fichier
 * AVANT tout décodage : une image décodée occupe ~4 octets par pixel
 * (50 Mpx ≈ 200 Mo). Au-delà, un téléphone modeste risque de saturer — la
 * famille reçoit un message clair, jamais un plantage.
 *
 * - 50 Mpx couvre les capteurs 48/50 Mpx des téléphones actuels
 *   (8160 × 6120 = 49,9 Mpx). Mesure Chromium (émulation mobile) : pic
 *   ≈ +270 Mo à 50 Mpx avec le décodage redimensionné, contre ≈ +600 Mo
 *   à 50–60 Mpx avant lui — d'où l'abaissement depuis 60 Mpx.
 * - 40 Mo couvre les JPEG les plus lourds de ces capteurs.
 */
export const PHOTO_INPUT_MAX_PIXELS = 50_000_000;
export const PHOTO_INPUT_MAX_BYTES = 40 * 1024 * 1024;
