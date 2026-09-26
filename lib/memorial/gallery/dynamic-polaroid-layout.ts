import {
  A13_PILOT_CANVAS,
  A13_PILOT_PAPER,
  A13_PILOT_PHOTO_POLICY,
  type A13Slot,
} from "@/config/gallery-a13-pilot-manifest";

/**
 * A13 Dynamic Polaroid — pure geometry (PILOT, Desktop Light).
 *
 * The photograph adapts the FORMAT of the tirage; it never chooses its
 * position. Every input here is one slot of the manifest plus one photo's
 * intrinsic size (and optional focal point). There is no sort, no
 * permutation, no masonry and no placement search: `media[i] → slot[i]`
 * is decided by the caller from `slot.mediaIndex`, never by this module.
 *
 * ## Algorithm (every constant comes from the manifest or `A13_PILOT_PAPER`)
 *
 * 1. EXACT — the largest photo window of the photo's own ratio that fits
 *    the envelope once the paper (border ×2 + bottom band) is added. If the
 *    resulting OUTER ratio lies in `adaptiveOuterRatioRange` (0.67–1.78),
 *    the photo is shown whole: no crop, no paper breathing.
 * 2. Otherwise the OUTER format is bounded at the nearest range limit and
 *    made as large as the envelope allows at that ratio. The window it
 *    leaves has a different ratio than the photo:
 *    - SAFE CROP (`cover`) only if the visible fraction stays ≥ 0.80 with a
 *      focal point, ≥ 0.85 without one; the crop is centred on the focal
 *      point (clamped so it never slides past the photo's edge);
 *    - else CONTAIN with paper breathing: the whole photo, centred, the
 *      remaining window area is paper.
 *    Never a stretch: every photo rect below keeps the source ratio exactly.
 *
 * ## Expansion — how the manifest strings are resolved (QG to confirm)
 *
 * The manifest names a direction ("inward-and-up", …) but does not define
 * it. Resolution used by this pilot, stated so QG can accept or correct it:
 * a tirage smaller than its envelope stays pinned to the envelope edge(s)
 * OPPOSITE its expansion direction, so it "grows" toward that direction.
 * "inward" = toward the canvas centre (835, 470.5) on both axes; the
 * second word overrides one axis: "up" (vertical: grows up), "left"
 * (horizontal: grows left), "vertical" (vertical: both ways, centred),
 * "horizontal" (horizontal: both ways, centred).
 *
 * ## Frame
 *
 * All rects returned are in the slot's LOCAL frame: origin at the top-left
 * of the envelope, before the slot's own rotation (the whole slot rotates
 * by `rotationDeg` around its anchor, like a physical print).
 */

export interface PhotoSource {
  width: number;
  height: number;
  /** Subject point in [0,1]² of the source photo, if the family gave one. */
  focal?: { x: number; y: number } | null;
}

export type PolaroidImageMode = "exact" | "cover-safe-crop" | "contain-paper";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pins {
  /** 0 = pinned left, 1 = pinned right, 0.5 = centred. */
  ax: number;
  /** 0 = pinned top, 1 = pinned bottom, 0.5 = centred. */
  ay: number;
}

export interface PolaroidLayout {
  slotId: A13Slot["slotId"];
  mediaIndex: number;
  sourceRatio: number;
  mode: PolaroidImageMode;
  pins: Pins;
  /** Outer paper rect, slot-local frame. */
  outer: Rect;
  outerRatio: number;
  /** True when the outer ratio was bounded at 0.67 or 1.78. */
  outerBounded: boolean;
  /** Photo window, relative to `outer`. */
  window: Rect;
  /** The photo's full rendered rect, relative to `window` (may overflow it
   * in `cover-safe-crop`, always inside it in `contain-paper`). */
  photo: Rect;
  /** Fraction of the source photo area left visible (1 = uncropped). */
  visibleFraction: number;
  cropAxis: "none" | "x" | "y";
  /** Rendered photo px (canonical 1670 frame, DPR 1) per source px. */
  upscale: number;
  /** Envelope area left unused by the outer paper, in [0,1]. */
  envelopeUnusedFraction: number;
}

const EPS = 1e-6;

export function resolveExpansionPins(slot: A13Slot): Pins {
  const cx = A13_PILOT_CANVAS.width / 2;
  const cy = A13_PILOT_CANVAS.height / 2;
  // "inward": grows toward the canvas centre => pinned on the far side.
  let ax = slot.anchor.x < cx ? 0 : slot.anchor.x > cx ? 1 : 0.5;
  let ay = slot.anchor.y < cy ? 0 : slot.anchor.y > cy ? 1 : 0.5;
  switch (slot.expansion) {
    case "inward-and-up":
      ay = 1;
      break;
    case "inward-and-vertical":
      ay = 0.5;
      break;
    case "inward-and-horizontal":
      ax = 0.5;
      break;
    case "inward-and-left":
      ax = 1;
      break;
  }
  return { ax, ay };
}

/** Largest w×h of ratio `r` (w/h) inside maxW×maxH. */
function fitRatio(r: number, maxW: number, maxH: number) {
  const w = Math.min(maxW, maxH * r);
  return { width: w, height: w / r };
}

export function layoutDynamicPolaroid(slot: A13Slot, source: PhotoSource): PolaroidLayout {
  if (!(source.width > 0 && source.height > 0)) {
    throw new Error(`layoutDynamicPolaroid: invalid source size for ${slot.slotId}`);
  }
  const { border, bottomBand } = A13_PILOT_PAPER;
  const { min: rMin, max: rMax } = A13_PILOT_PHOTO_POLICY.adaptiveOuterRatioRange;
  const env = slot.maxEnvelope;
  const padX = 2 * border;
  const padY = border + bottomBand;
  const p = source.width / source.height;

  // 1 — EXACT: the window takes the photo's own ratio.
  const exactWin = fitRatio(p, env.width - padX, env.height - padY);
  const exactOuterRatio = (exactWin.width + padX) / (exactWin.height + padY);

  let outerW: number;
  let outerH: number;
  let win: { width: number; height: number };
  let outerBounded = false;

  if (exactOuterRatio >= rMin - EPS && exactOuterRatio <= rMax + EPS) {
    win = exactWin;
    outerW = win.width + padX;
    outerH = win.height + padY;
  } else {
    // 2 — BOUNDED outer format at the nearest range limit.
    outerBounded = true;
    const bound = exactOuterRatio < rMin ? rMin : rMax;
    const o = fitRatio(bound, env.width, env.height);
    outerW = o.width;
    outerH = o.height;
    win = { width: outerW - padX, height: outerH - padY };
  }

  const winRatio = win.width / win.height;
  const ratioGap = Math.min(p, winRatio) / Math.max(p, winRatio);
  const focal = source.focal ?? null;
  const threshold = focal
    ? A13_PILOT_PHOTO_POLICY.cropVisibleFractionWithFocalPoint
    : A13_PILOT_PHOTO_POLICY.cropVisibleFractionWithoutFocalPoint;

  let mode: PolaroidImageMode;
  let photo: Rect;
  let visibleFraction = 1;
  let cropAxis: PolaroidLayout["cropAxis"] = "none";

  if (Math.abs(p - winRatio) <= EPS * Math.max(p, 1)) {
    mode = "exact";
    photo = { x: 0, y: 0, width: win.width, height: win.height };
  } else if (ratioGap >= threshold - EPS) {
    mode = "cover-safe-crop";
    visibleFraction = ratioGap;
    const scale = Math.max(win.width / source.width, win.height / source.height);
    const pw = source.width * scale;
    const ph = source.height * scale;
    const fx = focal ? focal.x : 0.5;
    const fy = focal ? focal.y : 0.5;
    // Centre the crop on the focal point, clamped inside the photo.
    const x = -Math.min(Math.max(fx * pw - win.width / 2, 0), pw - win.width);
    const y = -Math.min(Math.max(fy * ph - win.height / 2, 0), ph - win.height);
    cropAxis = pw > win.width + EPS ? "x" : "y";
    photo = { x, y, width: pw, height: ph };
  } else {
    mode = "contain-paper";
    const fit = fitRatio(p, win.width, win.height);
    photo = { x: (win.width - fit.width) / 2, y: (win.height - fit.height) / 2, width: fit.width, height: fit.height };
  }

  const pins = resolveExpansionPins(slot);
  const outer: Rect = {
    x: (env.width - outerW) * pins.ax,
    y: (env.height - outerH) * pins.ay,
    width: outerW,
    height: outerH,
  };

  return {
    slotId: slot.slotId,
    mediaIndex: slot.mediaIndex,
    sourceRatio: p,
    mode,
    pins,
    outer,
    outerRatio: outerW / outerH,
    outerBounded,
    window: { x: border, y: border, width: win.width, height: win.height },
    photo,
    visibleFraction,
    cropAxis,
    upscale: photo.width / source.width,
    envelopeUnusedFraction: 1 - (outerW * outerH) / (env.width * env.height),
  };
}

/**
 * Family order is the authority: `media[i] → slot whose mediaIndex === i`.
 * A missing media leaves its slot empty; an extra media is ignored. Never
 * a sort, never a permutation.
 */
export function assignMediaToSlots<T>(slots: readonly A13Slot[], media: readonly T[]) {
  return slots.map((slot) => ({ slot, media: media[slot.mediaIndex] ?? null }));
}
