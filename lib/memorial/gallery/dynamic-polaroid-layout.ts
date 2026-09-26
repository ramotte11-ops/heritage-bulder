import {
  A13_PILOT_POLAROID,
  A13_PILOT_PHOTO_POLICY,
  type A13Anchor,
  type A13Slot,
} from "@/config/gallery-a13-pilot-manifest";

/**
 * A13 Dynamic Polaroid — pure geometry, CALIBRATION V2 (Desktop Light).
 *
 * The photograph adapts the FORMAT of the tirage; it never chooses its
 * position. `media[i] → slot[i]` is decided from `slot.mediaIndex`, never
 * here: no sort, no permutation, no masonry, no placement search.
 *
 * ## Algorithm (contract V2 §3 — every constant comes from the manifest)
 *
 * 1. Start from the slot's target OUTER area `A × f` (`f` = 1 unless a
 *    caption collision forces a reduction, see `resolveComposition`).
 * 2. Solve the outer width/height of that area whose photo window has the
 *    photo's own ratio, with the V2 paper: side/top margin = 4 % of the
 *    outer width clamped 12–17 px, bottom band = 18 % of the outer height
 *    clamped 58–82 px. The window ratio is monotonic in the width, so a
 *    bisection finds it exactly: EXACT mode, 100 % of the photo visible.
 * 3. If that outer ratio leaves 0.67–1.78, the OUTER format is bounded at
 *    the nearest limit (same area) and the photo goes to CONTAIN, centred,
 *    the rest of the window being paper ("bounded-outer-ratio-plus-contain").
 *    No crop, no stretch: the photo rect always keeps the source ratio.
 * 4. The box is placed so the slot's ANCHOR point of the reference box stays
 *    fixed (e.g. D1 left-bottom: grows right and up). The whole slot frame
 *    rotates by `rotationDeg` around the reference centre.
 *
 * The envelope of V1 no longer exists: size is never "whatever fits".
 *
 * ## Frame
 *
 * Rects are in the slot's LOCAL frame: origin at the reference centre,
 * before rotation. `outer` is the tirage; `window`, `photo` and `safeZone`
 * are relative to `outer`'s top-left.
 */

export interface PhotoSource {
  width: number;
  height: number;
  /** Subject point in [0,1]² — informative in V2 (no crop path is used). */
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
  sourceRatio: number;
  mode: PolaroidImageMode;
  areaFactor: number;
  /** Outer paper rect, slot-local frame (origin = reference centre). */
  outer: Rect;
  outerRatio: number;
  outerBounded: boolean;
  margin: number;
  bottomBand: number;
  /** Photo window, relative to `outer`. */
  window: Rect;
  /** Full photo rect, relative to `window` (inside it in both modes). */
  photo: Rect;
  /** Caption safe zone, relative to `outer`. */
  safeZone: Rect;
  /** Fraction of the source photo left visible — always 1 in V2. */
  visibleFraction: number;
}

const EPS = 1e-9;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function paperFor(width: number, height: number) {
  const { photoSidePadding: sp, bottomBand: bb } = A13_PILOT_POLAROID;
  return {
    margin: clamp(sp.percent * width, sp.minPx, sp.maxPx),
    bottomBand: clamp(bb.heightFactor * height, bb.minPx, bb.maxPx),
  };
}

function windowOf(width: number, height: number) {
  const { margin, bottomBand } = paperFor(width, height);
  return { width: width - 2 * margin, height: height - margin - bottomBand, margin, bottomBand };
}

/** Outer width of area `area` whose photo window has ratio `p`. */
function solveWidth(area: number, p: number) {
  let lo = 30;
  let hi = Math.sqrt(area * 50);
  for (let i = 0; i < 200; i++) {
    const w = (lo + hi) / 2;
    const win = windowOf(w, area / w);
    const r = win.height > 0 ? win.width / win.height : Infinity;
    if (r < p) lo = w;
    else hi = w;
  }
  return (lo + hi) / 2;
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

export function layoutDynamicPolaroid(slot: A13Slot, source: PhotoSource, areaFactor = 1): PolaroidLayout {
  if (!(source.width > 0 && source.height > 0)) {
    throw new Error(`layoutDynamicPolaroid: invalid source size for ${slot.slotId}`);
  }
  const { min: rMin, max: rMax } = A13_PILOT_PHOTO_POLICY.adaptiveOuterRatio;
  const area = slot.targetOuterArea * areaFactor;
  const p = source.width / source.height;

  let W = solveWidth(area, p);
  let outerRatio = (W * W) / area;
  let outerBounded = false;
  if (outerRatio < rMin - EPS || outerRatio > rMax + EPS) {
    outerBounded = true;
    outerRatio = outerRatio < rMin ? rMin : rMax;
    W = Math.sqrt(area * outerRatio);
  }
  const H = area / W;
  const win = windowOf(W, H);

  let photo: Rect;
  let mode: PolaroidImageMode;
  if (!outerBounded) {
    mode = "exact";
    photo = { x: 0, y: 0, width: win.width, height: win.height };
  } else {
    mode = "contain-paper";
    const pw = Math.min(win.width, win.height * p);
    const ph = pw / p;
    photo = { x: (win.width - pw) / 2, y: (win.height - ph) / 2, width: pw, height: ph };
  }

  const pos = placeAtAnchor(slot.anchor, slot.referenceSize, W, H);
  const sz = slot.captionSafeZone;
  return {
    slotId: slot.slotId,
    mediaIndex: slot.mediaIndex,
    sourceRatio: p,
    mode,
    areaFactor,
    outer: { x: pos.x, y: pos.y, width: W, height: H },
    outerRatio: W / H,
    outerBounded,
    margin: win.margin,
    bottomBand: win.bottomBand,
    window: { x: win.margin, y: win.margin, width: win.width, height: win.height },
    photo,
    safeZone: { x: sz.xMin * W, y: sz.yMin * H, width: (sz.xMax - sz.xMin) * W, height: (sz.yMax - sz.yMin) * H },
    visibleFraction: 1,
  };
}

/**
 * Family order is the authority: `media[i] → slot whose mediaIndex === i`.
 * A missing media leaves its slot empty; an extra media is ignored.
 */
export function assignMediaToSlots<T>(slots: readonly A13Slot[], media: readonly T[]) {
  return slots.map((slot) => ({ slot, media: media[slot.mediaIndex] ?? null }));
}
