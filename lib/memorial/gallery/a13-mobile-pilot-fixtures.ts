import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13_PILOT_MEDIA } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * A13 Mobile Light — PILOT / QA fixtures (never product data).
 *
 * The QA matrix of the Handoff V1.4 (`QA_MATRIX.md`): media ratios 3:4,
 * 4:3, 1:1, 9:16, 16:9, 2.39:1 and a natural mix; captions absent, short,
 * 24 and 32 characters, and two lines. The photographs are the existing
 * pilot files (`public/pilot/a13-dynamic-polaroid/`) at their REAL
 * intrinsic size — a ratio is never simulated by stretching a file.
 * The family order is the list order.
 */

const BASE = "/pilot/a13-dynamic-polaroid";

const PHOTOS = {
  "3x4": { src: `${BASE}/p1-portrait-3x4.jpg`, width: 1200, height: 1600 },
  "4x3": { src: `${BASE}/p2-paysage-4x3.jpg`, width: 1600, height: 1200 },
  "1x1": { src: `${BASE}/p3-carre-1x1.jpg`, width: 1400, height: 1400 },
  "9x16": { src: `${BASE}/p4-portrait-etroit-9x16.jpg`, width: 1080, height: 1920 },
  "16x9": { src: `${BASE}/p5-paysage-large-16x9.jpg`, width: 1920, height: 1080 },
  "239": { src: `${BASE}/p6b-panorama-239x100.jpg`, width: 2390, height: 1000 },
} as const;

export const A13_MOBILE_RATIO_SETS = ["mixte", "3x4", "4x3", "1x1", "9x16", "16x9", "239"] as const;
export type A13MobileRatioSet = (typeof A13_MOBILE_RATIO_SETS)[number];

/** Natural mix: portrait, landscape, square, narrow portrait, wide landscape, panorama — cycled. */
const MIX: (keyof typeof PHOTOS)[] = ["3x4", "4x3", "1x1", "9x16", "16x9", "239"];

export const A13_MOBILE_CAPTION_SETS = ["aucune", "courte", "24", "32", "deux-lignes"] as const;
export type A13MobileCaptionSet = (typeof A13_MOBILE_CAPTION_SETS)[number];

/** Wide capitals (≤ 32 characters) that always break on two lines in a Mobile print. */
const TWO_LINES = [
  "MAMAN ET MAMIE, À MIMIZAN, 1966.",
  "TOUS LES DEUX SUR LA COLLINE",
  "SON CHAPEAU DE PAILLE, ÉTÉ 1982",
  "SOUS L'ARCHE DE LA VIEILLE FERME",
  "LE PONTON DU LAC, SOIR D'AOÛT 98",
  "LE VILLAGE DEPUIS LE VIEUX MURET",
];

function captionFor(set: A13MobileCaptionSet, i: number): string | null {
  const c = A13_PILOT_MEDIA[i % A13_PILOT_MEDIA.length].captions;
  switch (set) {
    case "aucune":
      return null;
    case "courte":
      return c["une-ligne"];
    case "24":
      return c["24"];
    case "32":
      return c["32"];
    case "deux-lignes":
      return TWO_LINES[i % TWO_LINES.length];
  }
}

export function a13MobileFixture(n: number, ratios: A13MobileRatioSet, captions: A13MobileCaptionSet): A13FamilyMedia[] {
  return Array.from({ length: n }, (_, i) => {
    const key = ratios === "mixte" ? MIX[i % MIX.length] : ratios;
    const p = PHOTOS[key];
    const caption = captionFor(captions, i);
    return { mediaId: `mobile-${i + 1}`, src: p.src, width: p.width, height: p.height, focal: null, alt: caption ?? `Souvenir ${i + 1}`, caption };
  });
}

/** HERITAGE Gallery texts (the Desktop adapter's own, `GALLERY_HERITAGE_TEXTS`). */
export const A13_MOBILE_PILOT_TITLE = {
  fr: { title: "Souvenirs de famille", subtitle: "Les instants que nous gardons près de nous" },
  en: { title: "Family Memories", subtitle: "The moments we hold close" },
  es: { title: "Recuerdos de familia", subtitle: "Los instantes que guardamos cerca del corazón" },
} as const;
