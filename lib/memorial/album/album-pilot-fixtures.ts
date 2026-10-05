import { A13_ALBUM_GRAMMARS } from "@/config/album-a13-grammars";
import { partitionAlbum } from "@/lib/memorial/album/album-partition";
import { witnessMediaRatio } from "@/lib/memorial/album/album-group-solver";

/**
 * A13 Album pilot — fixtures (PILOT ONLY, never product content).
 *
 * Ratio sets (Handoff §16 "ratios master-like, mixed-natural, extremes"):
 * - `master-like`: each media takes the measured Master window ratio of the
 *   slot it lands in (partition-dependent, family order untouched);
 * - `mixed-natural` / `extremes`: the common A13 fixture cycles (V2 matrix);
 *   period 5 — they line up with full groups, the harshest repetition test;
 * - `natural-mix`: a family-like mix with period 7 (coprime with 5), so no
 *   two consecutive full groups receive the same ratio sequence.
 * Captions (§16 "absentes, mixtes, puis 32 caractères / 2 lignes").
 *
 * Photos: the synthetic A13 test photos (`public/pilot/a13-dynamic-polaroid`);
 * `master-like` media are centre-cropped at runtime to the exact ratio (the
 * media itself — never distorted), as in the Gallery V2 pilot.
 */

export const ALBUM_RATIO_SETS = ["master-like", "mixed-natural", "extremes", "natural-mix"] as const;
export type AlbumRatioSet = (typeof ALBUM_RATIO_SETS)[number];
export const ALBUM_CAPTION_SETS = ["none", "mixed", "32-two-lines"] as const;
export type AlbumCaptionSet = (typeof ALBUM_CAPTION_SETS)[number];

const BASE = "/pilot/a13-dynamic-polaroid";
export const ALBUM_TEST_PHOTOS = {
  portrait: { src: `${BASE}/p1-portrait-3x4.jpg`, width: 1200, height: 1600 },
  landscape: { src: `${BASE}/p2-paysage-4x3.jpg`, width: 1600, height: 1200 },
  "landscape-3x2": { src: `${BASE}/p2-paysage-3x2.jpg`, width: 1800, height: 1200 },
  square: { src: `${BASE}/p3-carre-1x1.jpg`, width: 1400, height: 1400 },
  "narrow-portrait": { src: `${BASE}/p4-portrait-etroit-9x16.jpg`, width: 1080, height: 1920 },
  "wide-landscape": { src: `${BASE}/p5-paysage-large-16x9.jpg`, width: 1920, height: 1080 },
  "bounded-panorama": { src: `${BASE}/p6b-panorama-239x100.jpg`, width: 2390, height: 1000 },
  panorama: { src: `${BASE}/p6-panorama-3x1.jpg`, width: 2700, height: 900 },
} as const;
export type AlbumPhotoId = keyof typeof ALBUM_TEST_PHOTOS;

const CYCLES: Record<Exclude<AlbumRatioSet, "master-like">, AlbumPhotoId[]> = {
  "mixed-natural": ["portrait", "landscape", "square", "narrow-portrait", "wide-landscape"],
  extremes: ["bounded-panorama", "narrow-portrait", "wide-landscape", "portrait", "square"],
  "natural-mix": ["landscape", "portrait", "wide-landscape", "square", "landscape-3x2", "narrow-portrait", "bounded-panorama"],
};

const SHORT = ["Maman", "Tous les deux", "Son chapeau", "Sous l'arche", "Le ponton", "Le village", "Noël 1979"];
const C24 = ["Maman, un soir à Gordes.", "Tous deux sur la colline", "Son chapeau, l'été 1982.", "Sous l'arche de la ferme", "Le ponton du lac, été 98"];
export const ALBUM_C32 = "MAMAN ET MAMIE, À MIMIZAN, 1966.";

export function albumCaption(set: AlbumCaptionSet, i: number): string | null {
  if (set === "none") return null;
  if (set === "32-two-lines") return ALBUM_C32;
  // mixed: absent, short, 24, 32, absent, short… (period 4, coprime-free with 5 on purpose)
  const m = i % 4;
  return m === 0 ? null : m === 1 ? SHORT[i % SHORT.length] : m === 2 ? C24[i % C24.length] : ALBUM_C32;
}

export interface AlbumFixtureMedia {
  mediaId: string;
  width: number;
  height: number;
  caption: string | null;
  /** Photo file, or a Master ratio to centre-crop at runtime. */
  photo: AlbumPhotoId;
  cropToRatio: number | null;
}

/** Nearest test photo for a ratio (log distance). */
export function nearestPhoto(r: number): AlbumPhotoId {
  return (Object.keys(ALBUM_TEST_PHOTOS) as AlbumPhotoId[]).sort((a, b) => {
    const pa = ALBUM_TEST_PHOTOS[a];
    const pb = ALBUM_TEST_PHOTOS[b];
    return Math.abs(Math.log(pa.width / pa.height / r)) - Math.abs(Math.log(pb.width / pb.height / r)) || (a < b ? -1 : 1);
  })[0];
}

export function albumFixture(count: number, ratios: AlbumRatioSet, captions: AlbumCaptionSet): AlbumFixtureMedia[] {
  const masterRatio: number[] = [];
  if (ratios === "master-like") {
    for (const g of partitionAlbum(count)) {
      A13_ALBUM_GRAMMARS[g.grammar].slots.forEach((s) => masterRatio.push(witnessMediaRatio(s)));
    }
  }
  return Array.from({ length: count }, (_, i) => {
    const caption = albumCaption(captions, i);
    if (ratios === "master-like") {
      const r = masterRatio[i];
      const width = Math.round(r * 1000);
      return { mediaId: `mem-${String(i + 1).padStart(3, "0")}`, width, height: 1000, caption, photo: nearestPhoto(r), cropToRatio: width / 1000 };
    }
    const id = CYCLES[ratios][i % CYCLES[ratios].length];
    const p = ALBUM_TEST_PHOTOS[id];
    return { mediaId: `mem-${String(i + 1).padStart(3, "0")}`, width: p.width, height: p.height, caption, photo: id, cropToRatio: null };
  });
}
