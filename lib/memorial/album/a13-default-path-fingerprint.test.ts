import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { albumGeometrySnapshot, clearAlbumSolveCache, layoutAlbum } from "@/lib/memorial/album/album-layout";
import { albumFixture, type AlbumCaptionSet, type AlbumRatioSet } from "@/lib/memorial/album/album-pilot-fixtures";
import { albumMobileSnapshot, layoutAlbumMobile } from "@/lib/memorial/album/album-mobile-layout";
import { albumMobileFixture, type AlbumMobileCaptionSet, type AlbumMobileRatioSet } from "@/lib/memorial/album/album-mobile-pilot-fixtures";
import { runMobileGallery } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { a13MobileFixture } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";
import { buildG6FamilyState } from "@/lib/memorial/gallery/gallery-state";
import { rotateMatrixMedia } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * M4 Contributions — NON-RÉGRESSION A13 par empreinte.
 *
 * Les empreintes ci-dessous ont été calculées sur `main` @ 62648f4, AVANT
 * toute modification du solveur partagé (`album-group-solver.ts`). Elles
 * figent, au bit près, la géométrie produite par le chemin PAR DÉFAUT (sans
 * aucun paramètre Contributions) de l'Album Desktop, de l'Album Mobile, de la
 * Galerie Mobile et des états G6 / Signature 7+ de la Galerie Desktop.
 *
 * Toute différence d'un seul octet fait échouer ce fichier : une extension
 * du moteur qui change le comportement A13 ne peut donc pas passer.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 7,
};

const ALBUM_DESKTOP: [number, AlbumRatioSet, AlbumCaptionSet][] = [
  [2, "master-like", "none"],
  [7, "mixed-natural", "mixed"],
  [11, "master-like", "32-two-lines"],
  [13, "extremes", "mixed"],
  [24, "natural-mix", "mixed"],
];
const ALBUM_MOBILE: [number, AlbumMobileRatioSet, AlbumMobileCaptionSet, number][] = [
  [7, "witness", "aucune", 375],
  [8, "natural-mix", "deux-lignes", 390],
  [11, "9x16", "32", 430],
  [20, "16x9", "une-ligne", 375],
];

function a13Fingerprints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [n, r, c] of ALBUM_DESKTOP) {
    clearAlbumSolveCache();
    out[`album-desktop/${n}/${r}/${c}`] = sha(albumGeometrySnapshot(layoutAlbum(albumFixture(n, r, c), fake)));
  }
  for (const [n, r, c, W] of ALBUM_MOBILE) {
    out[`album-mobile/${n}/${r}/${c}/${W}`] = sha(albumMobileSnapshot(layoutAlbumMobile(albumMobileFixture(n, r, c), fake, W)));
  }
  for (const n of [2, 3, 4, 5, 6, 9]) {
    const run = runMobileGallery({ media: a13MobileFixture(n, "mixte", "courte"), captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
    out[`gallery-mobile/${n}`] = sha(JSON.stringify(run));
  }
  for (const [n, rot] of [[6, 0], [6, 3], [7, 1]] as const) {
    const media = rotateMatrixMedia(rot, n);
    out[`gallery-desktop-g6/${n}/r${rot}`] = sha(JSON.stringify(buildG6FamilyState(media, (m) => m.captions["24"], fake)));
  }
  return out;
}

const PINNED: Record<string, string> = {
  "album-desktop/2/master-like/none": "4ee6b958b2beeacd",
  "album-desktop/7/mixed-natural/mixed": "c0bda54d1e86bc8a",
  "album-desktop/11/master-like/32-two-lines": "7fcdcc18d877ae8d",
  "album-desktop/13/extremes/mixed": "cf14f87c93a272a3",
  "album-desktop/24/natural-mix/mixed": "b3d1135ac50f91aa",
  "album-mobile/7/witness/aucune/375": "8626040d0b18951d",
  "album-mobile/8/natural-mix/deux-lignes/390": "e938b7aa8957a435",
  "album-mobile/11/9x16/32/430": "3284b967ce75afaa",
  "album-mobile/20/16x9/une-ligne/375": "1af763f1a90e9c00",
  "gallery-mobile/2": "d12aa31df9434e08",
  "gallery-mobile/3": "244f5706287dde8c",
  "gallery-mobile/4": "11a26177f98dd99f",
  "gallery-mobile/5": "00a88671bf7a6785",
  "gallery-mobile/6": "4788006ce39a367d",
  "gallery-mobile/9": "69df226ecf5c8db8",
  "gallery-desktop-g6/6/r0": "dd0d5f6d233d482d",
  "gallery-desktop-g6/6/r3": "d8d3416cf0cddd26",
  "gallery-desktop-g6/7/r1": "6239fa314bc46a8d",
};

describe("A13 — empreintes du chemin par défaut (non-régression M4 Contributions)", () => {
  it("reproduit au bit près la géométrie de main @ 62648f4", () => {
    const got = a13Fingerprints();
    if (process.env.A13_PRINT_FINGERPRINTS) console.log(JSON.stringify(got, null, 2));
    expect(got).toEqual(PINNED);
  }, 600_000);
});
