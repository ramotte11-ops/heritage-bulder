import { A13_DARK_MATERIAL } from "@/config/gallery-a13-dark-material";

/**
 * A13 — Mobile Gallery DARK — runtime MATERIAL (rendering only).
 *
 * The Dark declination of the CLOSED Mobile Gallery Light (Handoff V1.7):
 * SAME RUNTIME, SAME GEOMETRY, SAME STATES G2 → 7+, DARK MATERIALS ONLY.
 * Read by the rendering components (`A13MobileGalleryScene`) after the
 * Mobile runtime has produced its final geometry — never by the runtime,
 * the manifests or the layout (`DARK_TOKEN_READ_BY_SOLVER_STOP`, guarded by
 * `theme-parity.test.ts`). No field here is a length the layout reads.
 *
 * Inks, papers, shadows, CTA states and focus are the existing A13 Dark
 * tokens (`A13_DARK_MATERIAL`, Desktop Dark V1.1, GREEN QG), applied through
 * the same `data-a13-theme="dark"` stylesheet rules and the same
 * `DynamicPolaroid` theme. Only the three Mobile-specific materials are
 * declared here, each by the rule its Light counterpart already follows.
 */

/**
 * The common photo-free Mobile Dark background — byte-identical copy of the
 * QG asset `A13_MOBILE_GALLERY_DARK_BACKGROUND_COMMON_PHOTO_FREE_V1.png`
 * (package `A13_MOBILE_GALLERY_DARK_BACKGROUND_CANONICAL_V1.zip`; PNG RGBA,
 * fully opaque). Exact thematic replacement of the Light V2 background, for
 * the six states, in the same box: `width:100%; height:auto; no crop`.
 */
export const A13_MOBILE_DARK_BACKGROUND = {
  src: "/assets/gallery/a13-mobile/a13-mobile-dark-gallery-background-common-photo-free-v1.png",
  packageAsset: "A13_MOBILE_GALLERY_DARK_BACKGROUND_COMMON_PHOTO_FREE_V1.png",
  width: 941,
  height: 1672,
  sha256: "28938f6a6a9a8bbbf4a481c8c2ad05ebbe8f329d334eeb6e165f1990029e096c",
  recolor: false,
  filter: "none",
} as const;

/**
 * The separator's Dark art: the shared HERITAGE Dark leaf sprig
 * (`runtime/dark/title-sprig.png`, the Dark `titleSprig` of the Intemporel
 * tokens, reused unchanged) drawn through its visible bounds (alpha > 8, the
 * rule that gives the Light `viewBox` 70 15 132 60), and the two rules in
 * the ink of the shared Dark rule (`runtime/dark/separator-horizontal.png`,
 * median opaque pixel — the Light rule's rgb(150 142 121) by the same
 * measure). Same box, same parts as Light.
 */
export const A13_MOBILE_DARK_SEPARATOR_ART = {
  sprigSrc: "/assets/ceremony/intemporel/runtime/dark/title-sprig.png",
  sprigFile: { width: 260, height: 95 },
  sprigViewBox: { x: 68, y: 19, width: 128, height: 58 },
  ruleColor: "rgb(168 134 84)",
} as const;

/**
 * `bottomMaterialContinuation` (V1.7 rule), Dark: the median RGB of the
 * neutral central bottom strip of the Dark background — the same strip
 * (central 30–70 % of the width, last 60 source rows) that gives the Light
 * authority #F4DFCB on background V2 — and the Dark paper texture (the
 * shared fixed-seed paper noise in the Dark fibre tone, its grain cap) at
 * 0.18, with the 20 CSS px seam fade. No stretch, no repeat, no decor.
 */
export const A13_MOBILE_DARK_BOTTOM_CONTINUATION = {
  baseColor: "#27160A",
  baseColorRgb: [39, 22, 10],
  sampledStrip: { xFromPercent: 30, xToPercent: 70, bottomRowsSource: 60 },
  textureFiber: A13_DARK_MATERIAL.polaroid.paper.fiberColor,
  textureGrainCap: A13_DARK_MATERIAL.polaroid.paper.grainOpacityMax,
  textureOpacity: 0.18,
  seamBlendCss: 20,
} as const;
