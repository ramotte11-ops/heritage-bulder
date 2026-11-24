import type { SkinVariant } from "@/config/skins";

/**
 * VID-05A — les quatre Masters de la rubrique « Des instants pour se souvenir ».
 *
 * Architecture « scène unique » validée par la PO : chaque Master est affiché
 * en entier, à ses proportions, sans découpage ni bande répétable. Textes,
 * lecteur et sélecteurs sont posés par-dessus, dans la zone libre.
 *
 * | Variante       | Dimensions   | Fichier officiel                          |
 * |----------------|--------------|-------------------------------------------|
 * | Desktop Light  | 1670 × 942   | HERITAGE_VIDEO_Desktop_Light_MASTER.png   |
 * | Desktop Dark   | 1670 × 942   | HERITAGE_VIDEO_Desktop_Dark_MASTER.png    |
 * | Mobile Light   | 1024 × 1536  | HERITAGE_VIDEO_Mobile_Light_MASTER.png    |
 * | Mobile Dark    | 1024 × 1536  | HERITAGE_VIDEO_Mobile_Dark_MASTER.png     |
 *
 * INSTALLATION EN ATTENTE. Les PNG officiels n'étaient pas disponibles dans
 * l'environnement de développement de VID-05A ; seules des copies converties
 * en WebP circulaient, et l'ordre de mission interdit de les substituer.
 * Tant que `VIDEO_MASTERS_INSTALLED` vaut `false`, la rubrique ne demande
 * aucune image (aucune adresse cassée) et pose la scène sur un aplat de la
 * teinte du papier, signalé par `data-masters="absent"`.
 *
 * À l'installation (convention des Offrandes) :
 *   1. copier les PNG octet pour octet dans `assets/video-hommage-v1/source/`
 *      avec leur SHA-256 dans un README ;
 *   2. dériver AVIF et WebP sans perte dans `public/assets/video/v1/fonds/`,
 *      sans redimensionnement (script `scripts/pilot/…-derive.py`) — ou selon
 *      la convention de versionnement du lot 06-D de Chef 06, à concerter ;
 *   3. passer `VIDEO_MASTERS_INSTALLED` à `true`.
 */
export const VIDEO_MASTERS_INSTALLED = false;

export type VideoMasterLayout = "desktop" | "mobile";

export interface VideoMasterSpec {
  width: number;
  height: number;
  /** Chemin servi, sans extension : `${base}.avif` puis repli `${base}.webp`. */
  base: string;
  /** Teinte du papier au centre du Master, mesurée sur les copies de travail. */
  paper: string;
}

export const VIDEO_MASTERS: Record<VideoMasterLayout, Record<SkinVariant, VideoMasterSpec>> = {
  desktop: {
    light: { width: 1670, height: 942, base: "/assets/video/v1/fonds/desktop-light", paper: "#fde8cb" },
    dark: { width: 1670, height: 942, base: "/assets/video/v1/fonds/desktop-dark", paper: "#391f0e" },
  },
  mobile: {
    light: { width: 1024, height: 1536, base: "/assets/video/v1/fonds/mobile-light", paper: "#fdead1" },
    dark: { width: 1024, height: 1536, base: "/assets/video/v1/fonds/mobile-dark", paper: "#392312" },
  },
};
