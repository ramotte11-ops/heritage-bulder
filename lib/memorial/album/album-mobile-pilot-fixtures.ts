import { A13_ALBUM_MOBILE_GRAMMARS, A13_ALBUM_MOBILE_PAPER, A13_ALBUM_MOBILE_WITNESS } from "@/config/album-a13-mobile-light";
import { partitionAlbumMobile } from "@/lib/memorial/album/album-partition";
import { ALBUM_MOBILE_THIN_BAND } from "@/lib/memorial/album/album-mobile-layout";
import { ALBUM_TEST_PHOTOS, nearestPhoto, type AlbumPhotoId } from "@/lib/memorial/album/album-pilot-fixtures";

/**
 * A13 Full Album Mobile Light — pilot fixtures (PILOT ONLY, never product
 * content). QA matrix of the Handoff V1.1:
 *
 * - ratios: `witness` (each media takes the window ratio of the witness
 *   slot it lands in — partition-dependent, family order untouched; the
 *   photo is centre-cropped at runtime to that ratio, never distorted),
 *   3:4, 4:3, 1:1, 9:16, 16:9 (uniform sets) and `natural-mix` (a family
 *   mix, period 7, coprime with the 2 / 3 group sizes);
 * - captions: none, 12, 24 and 32 characters, one line, two lines —
 *   natural case, ≤ 32 characters.
 */

export const ALBUM_MOBILE_RATIO_SETS = ["witness", "3x4", "4x3", "1x1", "9x16", "16x9", "natural-mix"] as const;
export type AlbumMobileRatioSet = (typeof ALBUM_MOBILE_RATIO_SETS)[number];
export const ALBUM_MOBILE_CAPTION_SETS = ["aucune", "12", "24", "32", "une-ligne", "deux-lignes"] as const;
export type AlbumMobileCaptionSet = (typeof ALBUM_MOBILE_CAPTION_SETS)[number];
export const ALBUM_MOBILE_COUNTS = [7, 8, 11, 20, 40] as const;

const UNIFORM: Record<Exclude<AlbumMobileRatioSet, "witness" | "natural-mix">, AlbumPhotoId> = {
  "3x4": "portrait",
  "4x3": "landscape",
  "1x1": "square",
  "9x16": "narrow-portrait",
  "16x9": "wide-landscape",
};
const MIX: AlbumPhotoId[] = ["landscape", "portrait", "wide-landscape", "square", "landscape-3x2", "narrow-portrait", "bounded-panorama"];

/** Exactly 12, 24 and 32 characters, natural case. */
const C12 = ["Maman, 1966.", "Noël à Lyon.", "Le vieux pré", "Été au parc."];
const C24 = ["Maman et Papa, à Gordes.", "Le ponton du lac, été 98", "Sous l'arche de la ferme", "Tous deux sur la colline"];
const C32 = ["Maman et mamie, à Mimizan, 1966.", "Le village depuis le vieux muret", "Son chapeau de paille, été 1982.", "Le ponton du lac, un soir d'août"];
const ONE_LINE = ["Maman", "Noël 1979", "Le ponton", "Tous les deux"];
const TWO_LINES = ["Le village depuis le vieux muret", "Son chapeau de paille, été 1982.", "Maman et mamie à Mimizan en 1966", "Un dimanche d'été chez Mamie"];

export function albumMobileCaption(set: AlbumMobileCaptionSet, i: number): string | null {
  switch (set) {
    case "aucune":
      return null;
    case "12":
      return C12[i % C12.length];
    case "24":
      return C24[i % C24.length];
    case "32":
      return C32[i % C32.length];
    case "une-ligne":
      return ONE_LINE[i % ONE_LINE.length];
    case "deux-lignes":
      return TWO_LINES[i % TWO_LINES.length];
  }
}

export interface AlbumMobileFixtureMedia {
  mediaId: string;
  width: number;
  height: number;
  caption: string | null;
  photo: AlbumPhotoId;
  /** Ratio to centre-crop the photo to at runtime (witness set), or null. */
  cropToRatio: number | null;
}

/** Window ratio of a witness slot under the Mobile Album paper. */
export function albumMobileWitnessRatio(id: keyof typeof A13_ALBUM_MOBILE_WITNESS) {
  const { width, height } = A13_ALBUM_MOBILE_WITNESS[id].outerReference;
  const m = A13_ALBUM_MOBILE_PAPER.sideTopSourcePx;
  return (width - 2 * m) / (height - m - ALBUM_MOBILE_THIN_BAND);
}

export function albumMobileFixture(count: number, ratios: AlbumMobileRatioSet, captions: AlbumMobileCaptionSet): AlbumMobileFixtureMedia[] {
  const witness: number[] = [];
  if (ratios === "witness") for (const g of partitionAlbumMobile(count)) for (const id of A13_ALBUM_MOBILE_GRAMMARS[g.grammar].slots) witness.push(albumMobileWitnessRatio(id));
  return Array.from({ length: count }, (_, i) => {
    const mediaId = `mem-${String(i + 1).padStart(3, "0")}`;
    const caption = albumMobileCaption(captions, i);
    if (ratios === "witness") {
      const r = witness[i];
      return { mediaId, width: Math.round(r * 1000), height: 1000, caption, photo: nearestPhoto(r), cropToRatio: Math.round(r * 1000) / 1000 };
    }
    const id = ratios === "natural-mix" ? MIX[i % MIX.length] : UNIFORM[ratios];
    const p = ALBUM_TEST_PHOTOS[id];
    return { mediaId, width: p.width, height: p.height, caption, photo: id, cropToRatio: null };
  });
}
