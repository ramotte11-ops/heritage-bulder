import { A13_PILOT_CAPTION, A13_PILOT_CANVAS, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/**
 * A13 Dynamic Polaroid — caption placement, CALIBRATION V2.1 §2 (pure).
 *
 * The forbidden collision is on the RENDERED GLYPHS (+6 px x / +4 px y),
 * not on the whole bottom band. Deterministic order:
 *
 * 1. one centred line if the text fits the useful width;
 * 2. otherwise every break at a space into two lines, choosing the smallest
 *    maximum line width, then the smallest width difference;
 * 3. the block is centred in the bottom band;
 * 4. if the protected box meets a higher-z tirage, ONLY the text moves, on
 *    the print's local X axis, by 2 px steps up to ±18 % of the band width;
 * 5. smallest absolute shift wins; on a tie, the shift toward the canvas
 *    centre;
 * 6. no position protects the glyphs → `CAPTION_COLLISION_UNRESOLVED`.
 *    No tirage moves, no font shrinks.
 *
 * Measurements come from the caller (`CaptionMeasurer`), who must have
 * confirmed La Belle Aurore is loaded: canvas `measureText` gives the
 * advance and the four `actualBoundingBox*` metrics per line, and the font
 * ascent/descent used to place the baseline in a CSS-like line box.
 *
 * Contract readings stated for QG:
 * - "useful width" (step 1) = the photo window width (paper minus the two
 *   side paddings);
 * - "la translation reste interne à la bande basse" = the ink box of every
 *   shifted candidate stays inside the band's horizontal extent.
 */

export interface LineMetrics {
  /** Advance width. */
  width: number;
  actualBoundingBoxLeft: number;
  actualBoundingBoxRight: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
}

export interface CaptionMeasurer {
  measure(text: string): LineMetrics;
  /** Font (not ink) ascent/descent at 27 px — baseline placement. */
  fontAscent: number;
  fontDescent: number;
}

export interface CaptionLine {
  text: string;
  /** Text start x (alignment point), relative to the print's outer box. */
  x: number;
  /** Baseline y, relative to the print's outer box. */
  baseline: number;
  metrics: LineMetrics;
}

export type CaptionStatus = "placed" | "CAPTION_COLLISION_UNRESOLVED";

export interface CaptionLayout {
  status: CaptionStatus;
  lines: CaptionLine[];
  /** Local X shift applied to the whole block (0 = centred). */
  shiftX: number;
  /** Union of the lines' ink boxes (after shift), outer-relative. */
  ink: Rect;
  /** Ink dilated by the 6/4 px safety margin. */
  protectedBox: Rect;
  /** Any line wider than the useful width (never shrunk — reported). */
  exceedsUsefulWidth: boolean;
  /** Protected box height fits inside the band. */
  fitsBandHeight: boolean;
  /** Max shift allowed for this band (±). */
  maxShift: number;
  /** Candidates tried before success/failure (proof of the search). */
  candidatesTried: number;
  /** Area (px²) of higher-z paper over the protected box at the chosen
   * position; 0 when placed. For an unresolved caption: at shift 0. */
  collisionAreaPx2: number;
  collidingWith: string[];
}

export function breakCaption(text: string, usefulWidth: number, measure: (t: string) => LineMetrics): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (measure(clean).width <= usefulWidth) return [clean];
  const spaces: number[] = [];
  for (let i = 0; i < clean.length; i++) if (clean[i] === " ") spaces.push(i);
  if (spaces.length === 0) return [clean];
  let best: { lines: string[]; max: number; diff: number } | null = null;
  for (const i of spaces) {
    const a = clean.slice(0, i);
    const b = clean.slice(i + 1);
    const wa = measure(a).width;
    const wb = measure(b).width;
    const max = Math.max(wa, wb);
    const diff = Math.abs(wa - wb);
    if (!best || max < best.max - 1e-9 || (Math.abs(max - best.max) <= 1e-9 && diff < best.diff)) {
      best = { lines: [a, b], max, diff };
    }
  }
  return best!.lines;
}

function unionInk(lines: CaptionLine[]): Rect {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const l of lines) {
    x0 = Math.min(x0, l.x - l.metrics.actualBoundingBoxLeft);
    x1 = Math.max(x1, l.x + l.metrics.actualBoundingBoxRight);
    y0 = Math.min(y0, l.baseline - l.metrics.actualBoundingBoxAscent);
    y1 = Math.max(y1, l.baseline + l.metrics.actualBoundingBoxDescent);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function dilate(r: Rect): Rect {
  const { x, y } = A13_PILOT_CAPTION.safetyMarginPx;
  return { x: r.x - x, y: r.y - y, width: r.width + 2 * x, height: r.height + 2 * y };
}

const ZERO_PX2 = 1e-6;

/** Higher-z paper overlapping a protected box (outer-relative rect). */
function collision(slot: A13Slot, layout: PolaroidLayout, box: Rect, obstacles: { slotId: string; polygon: Point[] }[]) {
  const poly = slotRectToCanvas(slot, {
    x: layout.outer.x + box.x,
    y: layout.outer.y + box.y,
    width: box.width,
    height: box.height,
  });
  let area = 0;
  const ids: string[] = [];
  for (const o of obstacles) {
    const a = convexIntersectionArea(poly, o.polygon);
    if (a > ZERO_PX2) {
      area += a;
      ids.push(o.slotId);
    }
  }
  return { area, ids };
}

export function layoutCaption(
  slot: A13Slot,
  layout: PolaroidLayout,
  text: string,
  m: CaptionMeasurer,
  /** Outer polygons (canvas frame) of every tirage ABOVE this one. */
  obstacles: { slotId: string; polygon: Point[] }[],
): CaptionLayout {
  const { fontSizePx, lineHeight, shiftStepPx, maxShiftFactorOfBandWidth } = A13_PILOT_CAPTION;
  const L = fontSizePx * lineHeight;
  const band = layout.band;
  const usefulWidth = layout.window.width;
  const texts = breakCaption(text, usefulWidth, (t) => m.measure(t));
  const metrics = texts.map((t) => m.measure(t));

  // Block centred in the band; baseline placed as in a CSS line box.
  const blockTop = band.y + (band.height - texts.length * L) / 2;
  const baselineInLine = (L - (m.fontAscent + m.fontDescent)) / 2 + m.fontAscent;
  const centreX = band.x + band.width / 2;
  const at = (dx: number): CaptionLine[] =>
    texts.map((t, i) => ({
      text: t,
      x: centreX - metrics[i].width / 2 + dx,
      baseline: blockTop + i * L + baselineInLine,
      metrics: metrics[i],
    }));

  // Local +X direction in canvas: toward the canvas centre?
  const a = (slot.rotationDeg * Math.PI) / 180;
  const inkCentre0 = unionInk(at(0));
  const [c] = slotRectToCanvas(slot, {
    x: layout.outer.x + inkCentre0.x + inkCentre0.width / 2,
    y: layout.outer.y + inkCentre0.y + inkCentre0.height / 2,
    width: 0,
    height: 0,
  });
  const towardCentre =
    Math.cos(a) * (A13_PILOT_CANVAS.width / 2 - c.x) + Math.sin(a) * (A13_PILOT_CANVAS.height / 2 - c.y) >= 0 ? 1 : -1;

  const maxShift = maxShiftFactorOfBandWidth * band.width;
  const candidates: number[] = [0];
  for (let d = shiftStepPx; d <= maxShift + 1e-9; d += shiftStepPx) candidates.push(towardCentre * d, -towardCentre * d);

  const exceedsUsefulWidth = metrics.some((mm) => mm.width > usefulWidth + 1e-9);
  const base = collision(slot, layout, dilate(inkCentre0), obstacles);
  let tried = 0;
  for (const dx of candidates) {
    const lines = at(dx);
    const ink = unionInk(lines);
    tried++;
    // The translation stays inside the bottom band (ink on the paper).
    if (dx !== 0 && (ink.x < band.x - 1e-9 || ink.x + ink.width > band.x + band.width + 1e-9)) continue;
    const prot = dilate(ink);
    const hit = collision(slot, layout, prot, obstacles);
    if (hit.area <= ZERO_PX2) {
      return {
        status: "placed",
        lines,
        shiftX: dx,
        ink,
        protectedBox: prot,
        exceedsUsefulWidth,
        fitsBandHeight: prot.y >= band.y - 1e-9 && prot.y + prot.height <= band.y + band.height + 1e-9,
        maxShift,
        candidatesTried: tried,
        collisionAreaPx2: 0,
        collidingWith: [],
      };
    }
  }
  const lines = at(0);
  const ink = unionInk(lines);
  const prot = dilate(ink);
  return {
    status: "CAPTION_COLLISION_UNRESOLVED",
    lines,
    shiftX: 0,
    ink,
    protectedBox: prot,
    exceedsUsefulWidth,
    fitsBandHeight: prot.y >= band.y - 1e-9 && prot.y + prot.height <= band.y + band.height + 1e-9,
    maxShift,
    candidatesTried: tried,
    collisionAreaPx2: base.area,
    collidingWith: base.ids,
  };
}
