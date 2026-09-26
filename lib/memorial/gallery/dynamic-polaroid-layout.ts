import {
  A13_PILOT_POLAROID,
  A13_PILOT_PHOTO_POLICY,
  type A13Anchor,
  type A13Slot,
} from "@/config/gallery-a13-pilot-manifest";

/**
 * A13 Dynamic Polaroid — pure geometry, CALIBRATION V2 + V2.1 (Desktop Light).
 *
 * The photograph adapts the FORMAT of the tirage; it never chooses its
 * position. `media[i] → slot[i]` is decided from `slot.mediaIndex`, never
 * here: no sort, no permutation, no masonry, no placement search.
 *
 * ## Algorithm (V2.1 §4 — every constant comes from the manifest)
 *
 * 1. CLASSIFY on the media ratio only (`mediaWidth / mediaHeight`), before
 *    any outer geometry exists:
 *    - inside 0.67–1.78: the photo window takes exactly the media ratio
 *      (EXACT: whole photo, no crop, no distortion);
 *    - outside: the format is bounded — the window takes the nearest range
 *      limit (0.67 or 1.78) — and the photo is shown whole in CONTAIN,
 *      centred, the rest of the window being paper.
 * 2. SOLVE the window width so the OUTER area equals the slot's target
 *    area (V2): outerWidth = window + 2 × side padding, outerHeight =
 *    window height + top padding + bottom band, side padding = top padding
 *    = clamp(4 % × outerWidth, 12, 17), band = clamp(18 % × outerHeight,
 *    58, 82) — except D5, fixed at 72 px (V2.1 §2.4). The outer ratio is a
 *    RESULT, never an input.
 * 3. PLACE the box so the slot's ANCHOR point of the reference box stays
 *    fixed; the whole slot frame rotates by `rotationDeg` around the
 *    reference centre. No tirage is ever reduced for a caption (V2.1 §3).
 *
 * ## Frame
 *
 * Rects are in the slot's LOCAL frame: origin at the reference centre,
 * before rotation. `outer` is the tirage; `window`, `photo` and `band` are
 * relative to `outer`'s top-left.
 */

export interface PhotoSource {
  width: number;
  height: number;
  /** Subject point in [0,1]² — never used to classify (V2.1 §4.2). */
  focal?: { x: number; y: number } | null;
}

export type PolaroidImageMode = "exact" | "contain-paper";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolaroidLayout {
  slotId: A13Slot["slotId"];
  mediaIndex: number;
  /** Intrinsic media ratio — the ONLY classification input. */
  mediaRatio: number;
  /** "inside" the adaptive range, or bounded "below"/"above" it. */
  mediaClass: "inside" | "below" | "above";
  mode: PolaroidImageMode;
  /** Ratio given to the photo window (= mediaRatio when inside). */
  windowRatio: number;
  areaFactor: number;
  /** Outer paper rect, slot-local frame (origin = reference centre). */
  outer: Rect;
  /** Result only. */
  outerRatio: number;
  margin: number;
  bottomBand: number;
  /** Photo window, relative to `outer`. */
  window: Rect;
  /** Full photo rect, relative to `window` (always inside it). */
  photo: Rect;
  /** Bottom band, relative to `outer`. */
  band: Rect;
  /** Fraction of the source photo left visible — always 1. */
  visibleFraction: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** V2 paper for a given outer box (D5: V2.1 fixed band). */
export function paperFor(width: number, height: number, bandOverridePx?: number) {
  const { photoSidePadding: sp, bottomBand: bb } = A13_PILOT_POLAROID;
  return {
    margin: clamp(sp.percent * width, sp.minPx, sp.maxPx),
    bottomBand: bandOverridePx ?? clamp(bb.heightFactor * height, bb.minPx, bb.maxPx),
  };
}

/** Outer width from the window width (piecewise-linear, monotonic). */
function outerWidthFromWindow(winW: number) {
  const { percent, minPx, maxPx } = A13_PILOT_POLAROID.photoSidePadding;
  const wMin = winW + 2 * minPx;
  if (percent * wMin <= minPx) return wMin;
  const wMax = winW + 2 * maxPx;
  if (percent * wMax >= maxPx) return wMax;
  return winW / (1 - 2 * percent);
}

/** Outer height from the window height and top margin (monotonic). */
function outerHeightFromWindow(winH: number, margin: number, bandOverridePx?: number) {
  if (bandOverridePx !== undefined) return winH + margin + bandOverridePx;
  const { heightFactor, minPx, maxPx } = A13_PILOT_POLAROID.bottomBand;
  const hMin = winH + margin + minPx;
  if (heightFactor * hMin <= minPx) return hMin;
  const hMax = winH + margin + maxPx;
  if (heightFactor * hMax >= maxPx) return hMax;
  return (winH + margin) / (1 - heightFactor);
}

function outerFromWindow(winW: number, windowRatio: number, bandOverridePx?: number) {
  const W = outerWidthFromWindow(winW);
  const { margin } = paperFor(W, 0);
  const H = outerHeightFromWindow(winW / windowRatio, margin, bandOverridePx);
  return { W, H, margin };
}

export function classifyMediaRatio(mediaRatio: number) {
  const { min, max } = A13_PILOT_PHOTO_POLICY.adaptiveMediaRatio;
  if (mediaRatio < min) return { mediaClass: "below" as const, windowRatio: min };
  if (mediaRatio > max) return { mediaClass: "above" as const, windowRatio: max };
  return { mediaClass: "inside" as const, windowRatio: mediaRatio };
}

export function layoutDynamicPolaroid(slot: A13Slot, source: PhotoSource, areaFactor = 1): PolaroidLayout {
  if (!(source.width > 0 && source.height > 0)) {
    throw new Error(`layoutDynamicPolaroid: invalid source size for ${slot.slotId}`);
  }
  const mediaRatio = source.width / source.height;
  // 1 — classification, before and independently of any outer geometry.
  const { mediaClass, windowRatio } = classifyMediaRatio(mediaRatio);
  const mode: PolaroidImageMode = mediaClass === "inside" ? "exact" : "contain-paper";

  // 2 — window width whose outer box meets the target area (bisection).
  const area = slot.targetOuterArea * areaFactor;
  const override = slot.bottomBandOverridePx;
  let lo = 1;
  let hi = 4000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const { W, H } = outerFromWindow(mid, windowRatio, override);
    if (W * H < area) lo = mid;
    else hi = mid;
  }
  const winW = (lo + hi) / 2;
  const winH = winW / windowRatio;
  const { W, H, margin } = outerFromWindow(winW, windowRatio, override);
  const bottomBand = H - margin - winH;

  let photo: Rect;
  if (mode === "exact") {
    photo = { x: 0, y: 0, width: winW, height: winH };
  } else {
    const pw = Math.min(winW, winH * mediaRatio);
    const ph = pw / mediaRatio;
    photo = { x: (winW - pw) / 2, y: (winH - ph) / 2, width: pw, height: ph };
  }

  // 3 — anchor.
  const pos = placeAtAnchor(slot.anchor, slot.referenceSize, W, H);
  return {
    slotId: slot.slotId,
    mediaIndex: slot.mediaIndex,
    mediaRatio,
    mediaClass,
    mode,
    windowRatio,
    areaFactor,
    outer: { x: pos.x, y: pos.y, width: W, height: H },
    outerRatio: W / H,
    margin,
    bottomBand,
    window: { x: margin, y: margin, width: winW, height: winH },
    photo,
    band: { x: 0, y: H - bottomBand, width: W, height: bottomBand },
    visibleFraction: 1,
  };
}

/** Top-left of a W×H box that keeps the reference box's anchor point. */
export function placeAtAnchor(anchor: A13Anchor, ref: { width: number; height: number }, w: number, h: number) {
  const L = -ref.width / 2;
  const R = ref.width / 2;
  const T = -ref.height / 2;
  const B = ref.height / 2;
  switch (anchor) {
    case "left-bottom":
      return { x: L, y: B - h };
    case "bottom-center":
      return { x: -w / 2, y: B - h };
    case "top-center":
      return { x: -w / 2, y: T };
    case "right-top":
      return { x: R - w, y: T };
    case "right-bottom":
      return { x: R - w, y: B - h };
  }
}

/**
 * Family order is the authority: `media[i] → slot whose mediaIndex === i`.
 * A missing media leaves its slot empty; an extra media is ignored.
 */
export function assignMediaToSlots<T>(slots: readonly A13Slot[], media: readonly T[]) {
  return slots.map((slot) => ({ slot, media: media[slot.mediaIndex] ?? null }));
}
