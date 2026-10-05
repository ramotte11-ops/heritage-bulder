import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13_PILOT_MEDIA } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * A13 Mobile Light — PILOT / QA fixtures (never product data).
 *
 * The QA matrix of the Handoff V1.5 (`QA_MATRIX.md`): media ratios 3:4,
 * 4:3, 1:1, 9:16, 16:9, 2.39:1 and a natural mix; captions absent, short,
 * 24 and 32 characters, one line and two lines, with narrow FR/EN/ES
 * cases — every caption in natural sentence case, ≤ 32 characters. The
 * photographs are the existing pilot files (`public/pilot/a13-dynamic-polaroid/`)
 * at their REAL intrinsic size — a ratio is never simulated by stretching
 * a file.
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

export const A13_MOBILE_CAPTION_SETS = ["aucune", "courte", "24", "32", "deux-lignes", "etroit-fr", "etroit-en", "etroit-es"] as const;
export type A13MobileCaptionSet = (typeof A13_MOBILE_CAPTION_SETS)[number];

/** Natural case, ≤ 32 characters, always two lines in a Mobile print. */
const TWO_LINES = [
  "Maman et Mamie, à Mimizan, 1966.",
  "Tous les deux sur la colline, 71",
  "Son chapeau de paille, été 1982",
  "Sous l'arche de la vieille ferme",
  "Le ponton du lac, soir d'août 98",
  "Le village depuis le vieux muret",
];

/**
 * Narrow cases per language (natural case, ≤ 32 characters): long words,
 * few break points — the lines a narrow print cannot hold without
 * widening its bottom band.
 */
const NARROW: Record<"fr" | "en" | "es", readonly string[]> = {
  fr: [
    "Retrouvailles extraordinaires",
    "Anniversaire de Joséphine, 1987",
    "Mamie Marguerite à Pontarlier",
    "Communion d'Anne-Charlotte",
    "Réveillon chez Maximilien, 1978",
    "Photographie impressionnante",
  ],
  en: [
    "Grandmother's birthday, Brighton",
    "Unforgettable Thanksgiving 1979",
    "Christmas morning at Whitstable",
    "Grandfather's woodworking shed",
    "Extraordinary reunion, 1983",
    "Congratulations, Bartholomew!",
  ],
  es: [
    "Cumpleaños de la abuela Mercedes",
    "Inolvidables vacaciones en 1985",
    "Bautizo de Guadalupe, Albacete",
    "Nochebuena en Villanueva, 1972",
    "Reencuentro extraordinario",
    "Felicitaciones, Maximiliano",
  ],
};

export const A13_MOBILE_CAPTION_TEXTS = { twoLines: TWO_LINES, narrow: NARROW } as const;

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
    case "etroit-fr":
      return NARROW.fr[i % NARROW.fr.length];
    case "etroit-en":
      return NARROW.en[i % NARROW.en.length];
    case "etroit-es":
      return NARROW.es[i % NARROW.es.length];
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
