import type { SkinVariant } from "@/config/skins";

/**
 * Récit de vie — RUNTIME tokens, Handoff GREEN QG
 * `HERITAGE_RDV_HANDOFF_RUNTIME_V1_0_QG_AUDIT` (transmitted via the
 * lightweight `HERITAGE_RDV_OPUS_RUNTIME_PACKAGE_LIGHT_V1`). Every value
 * below is transcribed verbatim from that package's own
 * `geometry/mobile.json`, `geometry/desktop.json` and
 * `execution-contract.json` — nothing here is eyeballed, interpolated,
 * or redrawn. This supersedes the withdrawn V1.3.1 package in full
 * (per this Handoff's own "Anciens packages V1.3/V1.3.1... exclus").
 *
 * ## Architecture — ONE fixed scene per breakpoint family, never
 * extensible
 *
 * Unlike the withdrawn V1.3.1 package (dynamic-height BODY, `repeat-y`),
 * this Handoff is explicit: "La hauteur ne dépend JAMAIS du texte" —
 * both Mobile and Desktop are single, fixed-aspect-ratio scenes scaled
 * UNIFORMLY with the rendered section width, and the family/fallback
 * text is an overlay of fixed-size boxes on top. Architecturally this is
 * the exact `single_scene_per_variant` technique
 * `config/ceremony-intemporel-tokens.ts`/`config/hero-intemporel-tokens.ts`
 * already establish (one master image, content positioned as a
 * percentage of the canonical canvas) — reused here, not reinvented.
 *
 * ## Mobile — three images, bord à bord, ONE coordinate space
 *
 * `top` (941×950) + `middle` (941×800) + `bottom` (941×1050) stack with
 * zero gap into one continuous 941×2800 logical canvas (Handoff: "sans
 * espace... Une seule couche d'overlays couvre l'assemblage complet").
 * The three images are rendered as three normal-flow `<img>` elements
 * (each `display:block; width:100%; height:auto`, so no explicit height
 * math is needed to keep them seamless — intrinsic ratio does it), and
 * every overlay position below is a PERCENTAGE of the full 941×2800
 * canvas, so a box can straddle an image seam (contract: "l'overlay A12
 * traverse visuellement le raccord MIDDLE/BOTTOM") without needing to
 * know which physical image it falls over.
 *
 * `scale = renderedSectionWidth / 941`, applied uniformly to every
 * coordinate, box dimension, font size and line height alike (Handoff
 * section 3) — including between the documented breakpoints (375-1023
 * is "même famille verticale", no intermediate breakpoint changes the
 * composition). A plain CSS `vw` unit already IS this exact linear
 * function of viewport width once the wrapper is full-bleed
 * (`width:100%`, no internal padding — Handoff: "Le conteneur ne doit
 * ajouter aucun padding interne"), so every mobile position/size below
 * is expressed in the component/stylesheet as `(value / 941) * 100`vw —
 * never a `clamp()` (there is no independent floor/ceiling for Mobile;
 * the family scales continuously up to the strict 1024 cutover).
 *
 * ## Desktop — ONE fixed 1448×1086 scene, three columns
 *
 * A single ART-ONLY image per theme (no top/middle/bottom split — the
 * Desktop composition is one scene, three matières laid out
 * HORIZONTALLY side by side: `a10` at x=132, `a11` at x=555, `a12` at
 * x=978). `scale = renderedSectionWidth / 1448` for 1024-1447, capped
 * at `1448` (canvas centered) beyond. Percentage-of-container handles
 * the 1024-1447 continuous scale AND the 1448 cap for free (`width:
 * 100%; max-width: 1448px`, exactly `CeremonyIntemporel`'s own
 * `.wrap` rule) for every position; font sizes use the same
 * `clamp(floorAt1024Px, Nvw, ceilingAt1448Px)` technique
 * `CeremonyIntemporel.module.css` already established for an
 * identical "fluid until it hits its own canonical cap" requirement.
 *
 * ## Icons/medallions/rail are BAKED ART this time — never a runtime
 * overlay
 *
 * Unlike the withdrawn V1.3.1 package (separate runtime icon PNGs +
 * a CSS-drawn rail), this Handoff's `execution-contract.json` lists no
 * icon overlay at all, and visual inspection of the ART-ONLY assets
 * confirms the medallion/glyph/connecting line are painted directly
 * into `top`/`middle`/`bottom`/the Desktop scene. This runtime therefore
 * never renders a separate icon `<img>` or a CSS rail — doing so would
 * duplicate pixels the asset already carries and would be exactly the
 * kind of "reconstruction du décor" this Handoff forbids.
 */

export const RECIT_RUNTIME_BREAKPOINT_DESKTOP_PX = 1024;

const ASSET_ROOT = "/assets/recit-de-vie/runtime";

export const RECIT_RUNTIME_SCENE_SRC: Record<
  SkinVariant,
  { mobileTop: string; mobileMiddle: string; mobileBottom: string; desktop: string }
> = {
  light: {
    mobileTop: `${ASSET_ROOT}/mobile/light/top.png`,
    mobileMiddle: `${ASSET_ROOT}/mobile/light/middle.png`,
    mobileBottom: `${ASSET_ROOT}/mobile/light/bottom.png`,
    desktop: `${ASSET_ROOT}/desktop/light.png`,
  },
  dark: {
    mobileTop: `${ASSET_ROOT}/mobile/dark/top.png`,
    mobileMiddle: `${ASSET_ROOT}/mobile/dark/middle.png`,
    mobileBottom: `${ASSET_ROOT}/mobile/dark/bottom.png`,
    desktop: `${ASSET_ROOT}/desktop/dark.png`,
  },
};

/** `geometry/mobile.json`'s `coordinate_space` + `scene_stack`, verbatim. */
export const RECIT_MOBILE_CANVAS = { width: 941, height: 2800 } as const;
export const RECIT_MOBILE_SCENE_STACK = {
  top: { height: 950 },
  middle: { height: 800 },
  bottom: { height: 1050 },
} as const;

export interface RecitOverlayBox {
  x: number;
  y: number;
  w: number;
  h: number;
  align: "left" | "center";
}

/** `geometry/mobile.json`'s `overlays`, verbatim (source px, 941×2800
 * canvas). */
export const RECIT_MOBILE_OVERLAYS: {
  globalTitle: RecitOverlayBox;
  a10Label: RecitOverlayBox;
  a10Body: RecitOverlayBox;
  a11Label: RecitOverlayBox;
  a11Body: RecitOverlayBox;
  a12Label: RecitOverlayBox;
  a12Body: RecitOverlayBox;
  microcopy: RecitOverlayBox;
} = {
  globalTitle: { x: 208.275, y: 67.752, w: 526.96, h: 60.72, align: "center" },
  a10Label: { x: 323.704, y: 276.027, w: 589.693, h: 45.168, align: "left" },
  a10Body: { x: 323.704, y: 363.853, w: 579.656, h: 499.357, align: "left" },
  a11Label: { x: 323.704, y: 1046.392, w: 589.693, h: 45.168, align: "left" },
  a11Body: { x: 323.704, y: 1129.2, w: 579.656, h: 499.357, align: "left" },
  a12Label: { x: 323.704, y: 1643.613, w: 604.749, h: 45.168, align: "left" },
  a12Body: { x: 323.704, y: 1731.44, w: 579.656, h: 499.357, align: "left" },
  // `microcopy` — corrected by HERITAGE_RDV_HANDOFF_ADDENDUM_MICROCOPY_
  // MOBILE_V1 (QG GREEN). The withdrawn V1.0 value (x:403.996,
  // y:2481.729, w:195.728, h:90.336) was the visible GLYPH bbox measured
  // off the canonical proof, not a CSS composition box — too narrow to
  // compose "Des souvenirs qui restent." on its documented 2 lines, so
  // this runtime wrapped it to 4. The addendum's own measurement method
  // (ADDENDUM.md section 3) reconstructs the true line box around the
  // glyphs instead of reusing their visible bbox. Mobile-only; Desktop's
  // own `RECIT_DESKTOP_OVERLAYS.microcopy` is untouched by this addendum.
  microcopy: { x: 381.418667, y: 2466.674667, w: 240.896, h: 105.392, align: "center" },
};

/** `geometry/mobile.json`'s `typography_at_375`, verbatim — the
 * "witness width" the Handoff reports these at; scales linearly with
 * viewport width exactly like every position above (see this file's
 * own top docstring). `microcopy` corrected by
 * HERITAGE_RDV_HANDOFF_ADDENDUM_MICROCOPY_MOBILE_V1 (20px/23.6px ->
 * 16px/21px) — see `RECIT_MOBILE_OVERLAYS.microcopy`'s own comment. */
export const RECIT_MOBILE_TYPOGRAPHY_AT_375_WITNESS_WIDTH_PX = 375;
export const RECIT_MOBILE_TYPOGRAPHY = {
  title: { fontSizePx: 22, lineHeightPx: 24.2 },
  label: { fontSizePx: 12, lineHeightPx: 15.36 },
  body: { fontSizePx: 17, lineHeightPx: 24.82 },
  microcopy: { fontSizePx: 16, lineHeightPx: 21 },
} as const;

/** `geometry/desktop.json`'s `coordinate_space`, verbatim. */
export const RECIT_DESKTOP_CANVAS = { width: 1448, height: 1086 } as const;

export interface RecitDesktopOverlayBox extends RecitOverlayBox {
  rotationDeg?: number;
}

/** `geometry/desktop.json`'s `overlays`, verbatim (source px, 1448×1086
 * canvas). Three matières side by side (a10/a11/a12 at x=132/555/978),
 * never stacked vertically — this is the Handoff's own "composition
 * horizontale validée", not a Sonnet layout choice. */
export const RECIT_DESKTOP_OVERLAYS: {
  globalTitle: RecitDesktopOverlayBox;
  a10Label: RecitDesktopOverlayBox;
  a10Body: RecitDesktopOverlayBox;
  a11Label: RecitDesktopOverlayBox;
  a11Body: RecitDesktopOverlayBox;
  a12Label: RecitDesktopOverlayBox;
  a12Body: RecitDesktopOverlayBox;
  microcopy: RecitDesktopOverlayBox;
} = {
  globalTitle: { x: 430, y: 160, w: 588, h: 60, align: "center" },
  a10Label: { x: 132, y: 450, w: 338, h: 36, align: "center" },
  a10Body: { x: 132, y: 498, w: 338, h: 224, align: "center" },
  a11Label: { x: 555, y: 450, w: 338, h: 36, align: "center" },
  a11Body: { x: 555, y: 498, w: 338, h: 224, align: "center" },
  a12Label: { x: 978, y: 450, w: 338, h: 36, align: "center" },
  a12Body: { x: 978, y: 498, w: 338, h: 224, align: "center" },
  microcopy: { x: 1240, y: 232, w: 150, h: 128, align: "center", rotationDeg: -10 },
};

/** `geometry/desktop.json`'s `typography_at_1448`, verbatim. */
export const RECIT_DESKTOP_TYPOGRAPHY = {
  title: { fontSizePx: 40, lineHeightPx: 48 },
  label: { fontSizePx: 22, lineHeightPx: 26.4 },
  body: { fontSizePx: 22, lineHeightPx: 27.5 },
  microcopy: { fontSizePx: 30, lineHeightPx: 34 },
} as const;

/** `execution-contract.json`'s `colors`/`geometry/mobile.json`'s
 * `colors` (identical values in both), verbatim. Measured on real glyph
 * core pixels — see the Handoff's own note on anti-aliasing fringes not
 * being converted into a shadow/outline. */
export const RECIT_RUNTIME_INK: Record<SkinVariant, string> = {
  light: "#39332E",
  dark: "#F9F2E4",
};

/** `execution-contract.json`'s `data`, verbatim — which `MemorialContent`
 * field each matter reads. Never inferred, generated, or reformulated. */
export const RECIT_RUNTIME_DATA_FIELD = {
  a10: "personWords.text",
  a11: "lovedThings.text",
  a12: "legacy.text",
} as const;

/** `execution-contract.json`'s `max_characters_each`, verbatim — a
 * product/Builder-side target this runtime does not itself enforce by
 * truncating (truncation is an explicit RED condition; see the
 * component's own docstring). */
export const RECIT_RUNTIME_MAX_CHARACTERS_EACH = 240;
