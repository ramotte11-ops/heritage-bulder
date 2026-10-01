/**
 * A13 — FULL ALBUM MOBILE LIGHT — runtime authority (Handoff V1.1).
 *
 * Transcribed from package `A13_FULL_ALBUM_MOBILE_LIGHT_FINAL_HANDOFF_V1_1`
 * (`contract/album-mobile-light.v1.json`, `geometry/mobile-grammars.v1.json`,
 * unchanged since V1, and the V1.1 minimums / caption bands). The Mobile
 * Album is a PROFILE of the shared Album engine (partition, local solver,
 * DynamicPolaroid, paint order, captions, Viewer activation): no second
 * engine, no Desktop geometry.
 *
 * - Reference frame 1024 × 1536 source px, rendered at s = viewportWidth /
 *   1024 (375 / 390 / 430). The media count never changes s: more media
 *   add groups and height — the page grows, memories never shrink.
 * - Partition: TOP3 always first, then PAIR_A / PAIR_B alternating; a final
 *   odd remainder becomes CLOSURE3. No singleton, no permutation, no ratio
 *   sorting, no random. Album from 7 media.
 * - Placement: TOP3 and the first PAIR_A / PAIR_B at their absolute Master
 *   positions, then the deterministic advances (226 after a PAIR_A, 220
 *   after a PAIR_B). CLOSURE3 uses its witness slots P8…P10, which sit in
 *   the Master at the third body position (after PAIR_A + PAIR_B).
 * - Sizes are the 375 profile, proportional at 390 / 430 ("preserve Master
 *   geometry proportionally from the 375 profile"): the composition is
 *   solved ONCE in source px with the 375 values (dominant ≥ 96 CSS px,
 *   secondary ≥ 72 CSS px, 44 px target, 1936 px² visible area, thin band
 *   14 CSS px) and scaled by s.
 * - Captions (V1.1): 11 / 13 CSS px, ≤ 32 characters, ≤ 2 lines; the band
 *   grows DOWNWARD only (14 → 22 → 34 CSS px): the photo window and the
 *   group geometry never change; an occluded caption is a PASS.
 * - Materials: the TOP (photo-free) once, then the BODY stacked downward
 *   without stretch, linear alpha crossfades 112 (TOP→BODY) and 64
 *   (BODY→BODY) source px, 164 source px of paper after the last paper.
 *   The Master is a QA authority only, never a runtime image.
 */

export const A13_ALBUM_MOBILE_HANDOFF_ID = "A13_FULL_ALBUM_MOBILE_LIGHT_FINAL_HANDOFF_V1_1" as const;

export const A13_ALBUM_MOBILE_FRAME = { width: 1024, height: 1536 } as const;

/** Contractual viewports; the size profile is the 375 one. */
export const A13_ALBUM_MOBILE_VIEWPORTS = [375, 390, 430] as const;
export const A13_ALBUM_MOBILE_PROFILE_VIEWPORT = 375;
/** CSS px per source px of the 375 profile. */
export const A13_ALBUM_MOBILE_PROFILE_SCALE = A13_ALBUM_MOBILE_PROFILE_VIEWPORT / A13_ALBUM_MOBILE_FRAME.width;
/** CSS px of the 375 profile → source px. */
export const profilePx = (css: number) => css / A13_ALBUM_MOBILE_PROFILE_SCALE;

/** Profile range: the Mobile Album renders from 375 to 430 px. */
export function a13AlbumMobileActive(width: number) {
  return width >= 375 - 1e-6 && width <= 430 + 1e-6;
}

export const A13_ALBUM_MOBILE_MIN_MEDIA = 7;

export type AlbumMobileGrammarId = "TOP3" | "PAIR_A" | "PAIR_B" | "CLOSURE3";
export type AlbumMobileSlotId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9" | "P10" | "P11";

/** `geometry/mobile-grammars.v1.json` `grammars`. */
export const A13_ALBUM_MOBILE_GRAMMARS: Record<AlbumMobileGrammarId, { heightRefPx: number; advanceRefPx: number | null; slots: readonly AlbumMobileSlotId[]; role: string }> = {
  TOP3: { heightRefPx: 620, advanceRefPx: null, slots: ["P1", "P2", "P3"], role: "one dominant memory plus linked secondary pair" },
  PAIR_A: { heightRefPx: 250, advanceRefPx: 226, slots: ["P4", "P5"], role: "wide left lead, smaller right overlap" },
  PAIR_B: { heightRefPx: 250, advanceRefPx: 220, slots: ["P6", "P7"], role: "balanced pair with inverse rotation" },
  CLOSURE3: { heightRefPx: 430, advanceRefPx: 405, slots: ["P8", "P9", "P10"], role: "pair followed by centered-left closer; closes rhythm, never closes page permanently" },
};
/** TOP3 `entryYRefPx` (informative: the witness P1 top is the authority). */
export const A13_ALBUM_MOBILE_TOP3_ENTRY_Y = 112;

export interface AlbumMobileWitness {
  center: { x: number; y: number };
  outerReference: { width: number; height: number };
  rotationDeg: number;
  /** Paint rank inside its group (1 = bottom). */
  zRank: number;
}

/** `geometry/mobile-grammars.v1.json` `witnessSlots` (Master page frame). */
export const A13_ALBUM_MOBILE_WITNESS: Record<AlbumMobileSlotId, AlbumMobileWitness> = {
  P1: { center: { x: 463, y: 247 }, outerReference: { width: 520, height: 264 }, rotationDeg: -3, zRank: 1 },
  P2: { center: { x: 329, y: 478 }, outerReference: { width: 376, height: 216 }, rotationDeg: 7, zRank: 2 },
  P3: { center: { x: 733, y: 489 }, outerReference: { width: 235, height: 212 }, rotationDeg: 2, zRank: 3 },
  P4: { center: { x: 367, y: 712 }, outerReference: { width: 500, height: 228 }, rotationDeg: -1, zRank: 1 },
  P5: { center: { x: 789, y: 716 }, outerReference: { width: 300, height: 220 }, rotationDeg: -6, zRank: 2 },
  P6: { center: { x: 292, y: 940 }, outerReference: { width: 394, height: 230 }, rotationDeg: 0, zRank: 1 },
  P7: { center: { x: 742, y: 949 }, outerReference: { width: 370, height: 230 }, rotationDeg: 5, zRank: 2 },
  P8: { center: { x: 344, y: 1155 }, outerReference: { width: 343, height: 205 }, rotationDeg: 0, zRank: 1 },
  P9: { center: { x: 748, y: 1191 }, outerReference: { width: 370, height: 250 }, rotationDeg: 8, zRank: 2 },
  P10: { center: { x: 295, y: 1362 }, outerReference: { width: 355, height: 225 }, rotationDeg: 6, zRank: 1 },
  P11: { center: { x: 680, y: 1389 }, outerReference: { width: 305, height: 210 }, rotationDeg: -1, zRank: 2 },
};

/** Every witness slot: centre territory and scale (`territory`). */
export const A13_ALBUM_MOBILE_TERRITORY = { centerDxRefPx: [-42, 42], centerDyRefPx: [-34, 34], scale: [0.92, 1.06] } as const;
/** Preferred scale (the Master) inside the territory scale. */
export const A13_ALBUM_MOBILE_PREFERRED_SCALE = 1;

/** The dominant memory (TOP3 "one dominant memory"). */
export const A13_ALBUM_MOBILE_DOMINANT_SLOT: AlbumMobileSlotId = "P1";

/** `mobileProfile` + V1.1 `minimums` (CSS px of the 375 profile; proportional at 390 / 430). */
export const A13_ALBUM_MOBILE_MINIMUMS = {
  dominantOuterPaperShortSideCssPx: 96,
  secondaryOuterPaperShortSideCssPxAt375: 72,
  identifiableVisiblePhotoFraction: 0.28,
  clickableVisibleAreaCssPx2: 1936,
  minTouchTargetCssPx: 44,
  scaleFloor: 0.92,
  globalUpscaleToReachDominantMinimum: false,
} as const;

/** `safeHorizontalInsetRefPx`: every paper inside x ∈ [24, 1000]. */
export const A13_ALBUM_MOBILE_SAFE_INSET = 24;
/** Horizontal overflow allowed for the rotated paper SHADOW only (CSS px). */
export const A13_ALBUM_MOBILE_SHADOW_OVERFLOW_CSS = 6;

/**
 * Paper of the Mobile Album print (source px). Bottom band = the V1.1 thin
 * band, 14 CSS px of the 375 profile (= 38.2 source px, the Master's own
 * band). Side / top margin: not given by the contract — the Master's
 * measured paper margin, 12–13 source px (12.5).
 */
export const A13_ALBUM_MOBILE_PAPER = {
  sideTopSourcePx: 12.5,
  thinBandCssAt375: 14,
} as const;

/** V1.1 `captions`. */
export const A13_ALBUM_MOBILE_CAPTION = {
  maxChars: 32,
  maxLines: 2,
  fontSizeCssPx: 11,
  lineHeightCssPx: 13,
  bandHeightCssPx: { absent: 14, oneLine: 22, twoLinesMax: 34 },
  paddingCssPx: { topMin: 4, bottomMin: 4, inlineMin: 5 },
  alignment: "center_horizontal_and_vertical",
  expansionDirection: "paper_bottom_only",
  photoWindowInvariant: true,
  groupGeometryInvariant: true,
  autoShrink: false,
  thirdLine: false,
  collisionIsStop: false,
} as const;

/** `continuation` — runtime assets (copied byte for byte from `assets/`). */
export const A13_ALBUM_MOBILE_MATERIALS = {
  top: {
    src: "/assets/album/a13-mobile-light/a13-album-mobile-light-top-photo-free-v1.png",
    sha256: "802e59641fa24a2680497cbf17a635b6fa9951d2a74fcb24ef5514f8a5041ffa",
    width: 1024,
    height: 1536,
  },
  body: {
    src: "/assets/album/a13-mobile-light/a13-album-mobile-light-body-material-v1.png",
    sha256: "99e681c5c11c809c53045e71d72ee6b0eba09d1aa293830338b008254bc3b7d4",
    width: 1024,
    height: 1536,
  },
  topBodyCrossfadeRefPx: 112,
  bodyBodyCrossfadeRefPx: 64,
  endBreathingRefPx: 164,
} as const;

/** `stopConditions` — caption occlusion is NOT a STOP. */
export const A13_ALBUM_MOBILE_STOPS = [
  "MEDIA_ORDER_CHANGED",
  "DESTRUCTIVE_CROP",
  "PHOTO_DISTORTION",
  "SINGLETON_GROUP",
  "GLOBAL_SCALE_FROM_MEDIA_COUNT",
  "HORIZONTAL_SCROLL",
  "ITEM_INACCESSIBLE",
  "VISIBLE_MATERIAL_SEAM",
  "THEME_OR_DESKTOP_GEOMETRY_MUTATION",
] as const;
export type AlbumMobileStop = (typeof A13_ALBUM_MOBILE_STOPS)[number];
