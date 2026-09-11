import { HERO_CROP_NEUTRAL_ZOOM, type HeroCrop } from "@/types/hero";

/**
 * Mission 034 — T07's crop geometry: ONE pure, framework-free helper
 * that turns a `HeroCrop` (Mission 031's model — `focalX`/`focalY`/
 * `zoom`, unchanged, no second representation) plus an image's own
 * intrinsic pixel dimensions into the numbers needed to actually DRAW
 * the photo inside the Hero's crop window, and back again (a drag/zoom
 * gesture into a new, valid `HeroCrop`).
 *
 * ## Why this exists as its own module (mission brief section 18)
 *
 * T07 (this mission) and the future T08 Hero renderer must agree on
 * EXACTLY the same geometry — what the family frames here must be what
 * they see there. Rather than let T07's cropper invent its own math and
 * risk a future renderer drifting from it, every number either screen
 * will ever need comes from this one module. T08 is not built by this
 * mission (mission brief section 25); this file is only the seam left
 * ready for it.
 *
 * ## The ratio (mission brief sections 2-3)
 *
 * `HERO_CROP_WINDOW_RATIO` is the one and only crop window shape:
 * portrait 4:5 (width:height), identical on mobile and desktop. Nothing
 * in this module reads a viewport size, a breakpoint, or a device kind
 * — the ratio is a fixed constant, never derived, so "the same relative
 * framing on mobile and desktop" (section 3) is true by construction:
 * every number below is expressed as a PERCENT of the crop window's own
 * width/height, never a pixel, so the exact same `HeroCrop` produces the
 * exact same relative result at any window size.
 *
 * ## The "cover" behaviour (mission brief section 17)
 *
 * At `zoom = HERO_CROP_NEUTRAL_ZOOM` (1), the image is scaled to the
 * SMALLEST size that still fully covers the 4:5 window on both axes —
 * conceptually equivalent to CSS `object-fit: cover` — so a portrait,
 * landscape or square photo all fill the window with no artificial
 * bands, and the image's own aspect ratio is never distorted (this
 * module never stretches width and height independently). `zoom` above
 * 1 scales further in, past that baseline; `resolveHeroCropGeometry`
 * mathematically cannot produce a gap for any `zoom >= HERO_CROP_MIN_ZOOM`
 * (== `HERO_CROP_NEUTRAL_ZOOM`), which is exactly why the UI never lets
 * zoom go below it (see `clampHeroCropZoom`/`HERO_CROP_MIN_ZOOM`).
 *
 * ## Panning is always clamped to "no gap" (mission brief section 17)
 *
 * `resolveHeroCropGeometry`, `panHeroCrop` and `zoomHeroCrop` all clamp
 * the image's position so its edges never retreat inside the window —
 * there is no `HeroCrop` this module will ever render with a blank
 * strip on any side. `focalX`/`focalY` stay within Mission 031's own
 * `[0, 1]` contract (`isUnitInterval` in lib/memorial/hero.ts) as a
 * direct consequence: the clamp on screen position IS the clamp on the
 * stored focal point, computed once, not two separate rules that could
 * drift apart.
 *
 * ## The zoom ceiling (mission brief section 7)
 *
 * `HERO_CROP_NEUTRAL_ZOOM` (Mission 031, re-exported nowhere new here —
 * `zoomHeroCrop`/`clampHeroCropZoom` import it directly) is reused
 * unchanged as the floor: `HERO_CROP_MIN_ZOOM`. A ceiling is genuinely
 * needed — not for any artistic reason, but because the interaction
 * itself (a `<input type="range">` slider, the one control the mission
 * brief says is "acceptable et probablement préférable pour V1", section
 * 9) structurally requires a finite `max` to exist at all. `HERO_CROP_MAX_ZOOM`
 * is the simplest, most conservative bound that still allows a
 * meaningful adjustment without turning this into a professional
 * retouching tool: 3x the neutral "cover" scale. This is a genuine,
 * flagged technical constraint of T07's own interaction (mission brief
 * section 7's own instruction — "documenter comme contrainte technique
 * de T07 et la signaler au QG"), not an invented UX opinion; a future
 * mission can revisit the exact number without touching anything else
 * in this file — every function below reads it from this one constant.
 */
export const HERO_CROP_WINDOW_RATIO = 4 / 5; // width / height — portrait 4:5, never derived from a viewport.

export const HERO_CROP_MIN_ZOOM = HERO_CROP_NEUTRAL_ZOOM; // 1 — below this, the window could show a gap (section 17).

/** See this module's own docstring, "The zoom ceiling", for why this
 * bound exists at all and why 3 was chosen. */
export const HERO_CROP_MAX_ZOOM = 3;

/** The crop shown before the family has ever touched anything (mission
 * brief section 8): centered, at the neutral "cover" zoom. The one and
 * only neutral value — never a second one invented elsewhere. */
export const NEUTRAL_HERO_CROP: HeroCrop = {
  focalX: 0.5,
  focalY: 0.5,
  zoom: HERO_CROP_NEUTRAL_ZOOM,
};

/** An image's own intrinsic pixel dimensions — read from the actual
 * decoded photo in the browser (`<img>`'s `naturalWidth`/`naturalHeight`),
 * never from `Media.width`/`Media.height` (Mission 030 never populates
 * those today — see types/media.ts). */
export interface HeroCropImageSize {
  naturalWidth: number;
  naturalHeight: number;
}

/** Everything needed to actually PLACE the image inside the crop
 * window: a `position: relative` box the caller sizes to the 4:5 ratio
 * (e.g. CSS `aspect-ratio: 4 / 5`), with the image absolutely positioned
 * at `left`/`top`, sized `width`/`height` — all four already expressed
 * as the percentage CSS itself expects (`left`/`width` as % of the
 * window's own width, `top`/`height` as % of its own height). Always
 * `widthPercent >= 100` and `heightPercent >= 100` (section 17: the
 * image always at least covers the window), and always
 * `leftPercent <= 0 <= leftPercent + widthPercent - 100`-consistent
 * (i.e. `leftPercent` in `[100 - widthPercent, 0]`, same for `top`) —
 * which is precisely "no gap, ever". */
export interface HeroCropWindowGeometry {
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps a candidate zoom into `[HERO_CROP_MIN_ZOOM, HERO_CROP_MAX_ZOOM]`
 * — the one place that bound is enforced, so a slider, a keyboard step,
 * or a malformed stored value all funnel through the same rule. A
 * non-finite input (e.g. a stray `NaN`) fails safe to the neutral floor
 * rather than propagating. */
export function clampHeroCropZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return HERO_CROP_MIN_ZOOM;
  return clamp(zoom, HERO_CROP_MIN_ZOOM, HERO_CROP_MAX_ZOOM);
}

/** The image's intrinsic aspect ratio (width/height). Falls back to `1`
 * (square) when the real dimensions are not yet known (e.g. the browser
 * has not decoded the image yet) — a defensive fallback that keeps this
 * function total, never a crash, while the caller waits for the real
 * `naturalWidth`/`naturalHeight`. */
function imageAspectRatio(image: HeroCropImageSize): number {
  if (!(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return 1;
  return image.naturalWidth / image.naturalHeight;
}

/**
 * The displayed image size, as a percent of the crop window's own
 * width/height, at a given (already-clamped) zoom — the "cover" math
 * this module's own docstring derives: at `zoom = 1` the image exactly
 * covers the window on its tighter axis and overflows the other, and
 * `zoom` scales uniformly from there. Never distorts the image's own
 * ratio — `widthPercent`/`heightPercent` always share the same
 * `naturalWidth`/`naturalHeight` proportion.
 */
function displaySizePercents(
  image: HeroCropImageSize,
  zoom: number,
): { widthPercent: number; heightPercent: number } {
  const imageRatio = imageAspectRatio(image);
  const widthPercent = 100 * zoom * Math.max(1, imageRatio / HERO_CROP_WINDOW_RATIO);
  const heightPercent = 100 * zoom * Math.max(1, HERO_CROP_WINDOW_RATIO / imageRatio);
  return { widthPercent, heightPercent };
}

/** A display-size percent clamped into the one range that guarantees no
 * gap on that axis: the image's leading edge can be no further right/down
 * than the window's own edge (`<= 0`), and no further left/up than would
 * leave its trailing edge short of the window's far edge
 * (`>= 100 - displayPercent`). */
function clampPositionPercent(idealPercent: number, displayPercent: number): number {
  return clamp(idealPercent, 100 - displayPercent, 0);
}

/** Where a given focal fraction (`0..1`) would ideally place the image
 * so that exact point sits at the window's center (`50%`) — BEFORE
 * clamping; `clampPositionPercent` is what keeps it gap-free. */
function focalToIdealPosition(focal: number, displayPercent: number): number {
  return 50 - focal * displayPercent;
}

/** The inverse of `focalToIdealPosition`, applied to an ALREADY clamped
 * position — this is what makes a clamped on-screen position round-trip
 * back into a focal point that is itself always within `[0, 1]`
 * (mission brief section 6), by construction rather than by a separate
 * clamp. */
function positionToFocal(positionPercent: number, displayPercent: number): number {
  if (displayPercent <= 0) return 0.5;
  return clamp((50 - positionPercent) / displayPercent, 0, 1);
}

/**
 * The full render geometry for one `HeroCrop` against one image's real
 * dimensions — the one function both T07's own preview and (later) T08's
 * renderer should call. Pure: same inputs, same output, no randomness,
 * no I/O, no DOM.
 */
export function resolveHeroCropGeometry(image: HeroCropImageSize, crop: HeroCrop): HeroCropWindowGeometry {
  const zoom = clampHeroCropZoom(crop.zoom);
  const { widthPercent, heightPercent } = displaySizePercents(image, zoom);
  const leftPercent = clampPositionPercent(focalToIdealPosition(crop.focalX, widthPercent), widthPercent);
  const topPercent = clampPositionPercent(focalToIdealPosition(crop.focalY, heightPercent), heightPercent);
  return { leftPercent, topPercent, widthPercent, heightPercent };
}

/**
 * Turns a drag/pan gesture — expressed as a delta already converted to
 * percent of the crop window's own width/height (never raw pixels; the
 * caller divides its pointer delta by the window's on-screen size first,
 * which is what makes this function itself resolution-independent) —
 * into a new, always-valid `HeroCrop`. `zoom` is left untouched; only
 * `focalX`/`focalY` move, always re-clamped so the window can never show
 * a gap (mission brief section 17).
 */
export function panHeroCrop(
  image: HeroCropImageSize,
  crop: HeroCrop,
  deltaXPercent: number,
  deltaYPercent: number,
): HeroCrop {
  const zoom = clampHeroCropZoom(crop.zoom);
  const geometry = resolveHeroCropGeometry(image, crop);
  const nextLeft = clampPositionPercent(geometry.leftPercent + deltaXPercent, geometry.widthPercent);
  const nextTop = clampPositionPercent(geometry.topPercent + deltaYPercent, geometry.heightPercent);
  return {
    focalX: positionToFocal(nextLeft, geometry.widthPercent),
    focalY: positionToFocal(nextTop, geometry.heightPercent),
    zoom,
  };
}

/**
 * Applies a new zoom (clamped into `[HERO_CROP_MIN_ZOOM, HERO_CROP_MAX_ZOOM]`),
 * keeping the SAME focal point intent but re-clamping the resulting
 * on-screen position against the new display size — zooming in or out
 * can require pulling the image back toward center to stay gap-free,
 * exactly the same clamp `resolveHeroCropGeometry` itself applies.
 */
export function zoomHeroCrop(image: HeroCropImageSize, crop: HeroCrop, nextZoom: number): HeroCrop {
  const zoom = clampHeroCropZoom(nextZoom);
  const { widthPercent, heightPercent } = displaySizePercents(image, zoom);
  const leftPercent = clampPositionPercent(focalToIdealPosition(crop.focalX, widthPercent), widthPercent);
  const topPercent = clampPositionPercent(focalToIdealPosition(crop.focalY, heightPercent), heightPercent);
  return {
    focalX: positionToFocal(leftPercent, widthPercent),
    focalY: positionToFocal(topPercent, heightPercent),
    zoom,
  };
}
