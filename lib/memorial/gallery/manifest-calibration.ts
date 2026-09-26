import { A13_PILOT_CANVAS, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import {
  A13_OCCLUSION_CAPS,
  A13_PROTECTED_TITLE_ZONE,
  A13_SCALE_PRECISION,
  A13_SLOT_CALIBRATION,
  type A13CalibratedStateId,
} from "@/config/gallery-a13-calibration-v1-1";
import { layoutDynamicPolaroid, type PhotoSource, type PolaroidLayout, type Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/**
 * A13 Desktop Light — manifest CALIBRATION V1.1 (G2–G5).
 *
 * The ONLY new variable is a uniform scale-down factor `s ≤ 1` per
 * Polaroid, around its prescribed anchor. Everything photographic stays in
 * the unchanged V2.1 engine: `s` is applied by calling
 * `layoutDynamicPolaroid` with the slot's target outer surface × s² (its
 * existing `areaFactor` input), so the anchor, the rotation, the z-index,
 * the media ratio, the whole photo and the V2.1 paper rules are untouched.
 *
 * Reading stated for QG: a literal CSS-style scale of the whole print would
 * also shrink the caption below 27 px source and G5-D5's band below the
 * 72 px source that V1.1 §6 fixes "with or without caption" — both are
 * contractual invariants (V2.1 caption contract "intégral"). Scaling the
 * target surface keeps them exact; the outer box scales by `s` whenever its
 * paper is in its proportional range, the clamped margins/band stay fixed.
 *
 * Deterministic resolution (V1.1 §4):
 * - slots are resolved in ascending z-index, so every constraint a slot is
 *   responsible for (as the OCCLUDER) is evaluated against lower slots that
 *   are already final — a reduction never lands on the hidden memory;
 * - for each slot, `s` scans 1.000 → minScale by 0.001 and keeps the first
 *   (largest) value satisfying: canvas, rotated quad inside the slot
 *   envelope, 0 px² with the protected title zone, per-relation and
 *   aggregate photo-occlusion caps where it is the occluder, and 0 px² with
 *   the real centred caption glyphs (+6/4 px) of the slots it protects;
 * - no valid `s` ≥ minScale → `MANIFEST_ENVELOPE_UNRESOLVED_STOP` (the slot
 *   is kept at minScale for the report; nothing else is attempted).
 *
 * Captions are then laid out by the unchanged V2.1 engine (local X shift),
 * which is resolution step 2.
 */

export type ConstraintId = "canvas" | "envelope" | "title" | "occlusion" | "occlusion-aggregate" | "caption-glyphs";

export interface ConstraintFailure {
  id: ConstraintId;
  detail: string;
  /** Amount over the limit: px² (areas) or percentage points (occlusion). */
  excess: number;
}

export interface CalibratedSlot {
  slot: A13Slot;
  layout: PolaroidLayout;
  scale: number;
  minScale: number;
  status: "placed" | "MANIFEST_ENVELOPE_UNRESOLVED_STOP";
  /** Constraints that forced s below 1 (checked at s + 0.001), or the
   * failures left at minScale for a STOP. */
  limitedBy: ConstraintFailure[];
}

const EPS_AREA = 1e-6;

function signedArea(p: Point[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Convex ∩ convex (Sutherland–Hodgman), returned as a polygon. */
export function clipConvex(subject: Point[], clip: Point[]): Point[] {
  let out = subject;
  const orient = Math.sign(signedArea(clip)) || 1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: Point) => orient * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0 !== sp >= 0) {
        const t = sp / (sp - sc);
        out.push({ x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) });
      }
      if (sc >= 0) out.push(cur);
    }
  }
  return out.length >= 3 ? out : [];
}

/** Exact area of (∪ covers) ∩ target, by inclusion–exclusion (convex). */
export function unionCoverArea(target: Point[], covers: Point[][]): number {
  const parts = covers.map((c) => clipConvex(target, c)).filter((p) => p.length);
  let total = 0;
  const n = parts.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let poly: Point[] | null = null;
    let bits = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        bits++;
        poly = poly === null ? parts[i] : clipConvex(poly, parts[i]);
        if (!poly.length) break;
      }
    }
    if (poly && poly.length) total += (bits % 2 ? 1 : -1) * Math.abs(signedArea(poly));
  }
  return total;
}

const rectPoly = (r: { x: number; y: number; width: number; height: number }): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

export const TITLE_ZONE_POLYGON = rectPoly(A13_PROTECTED_TITLE_ZONE);

export function outerQuad(slot: A13Slot, l: PolaroidLayout) {
  return slotRectToCanvas(slot, l.outer);
}

export function windowQuad(slot: A13Slot, l: PolaroidLayout) {
  const w: Rect = { x: l.outer.x + l.window.x, y: l.outer.y + l.window.y, width: l.window.width, height: l.window.height };
  return slotRectToCanvas(slot, w);
}

/** Share (0–100) of `lower`'s photo window covered by the given outers. */
export function occlusionPercent(lowerSlot: A13Slot, lower: PolaroidLayout, covers: Point[][]) {
  const win = windowQuad(lowerSlot, lower);
  return (unionCoverArea(win, covers) / Math.abs(signedArea(win))) * 100;
}

export interface CalibrationInput {
  slot: A13Slot;
  source: PhotoSource;
  captionText: string | null;
}

export function calibrateState(
  stateId: A13CalibratedStateId,
  input: CalibrationInput[],
  measurer: CaptionMeasurer | null,
): CalibratedSlot[] {
  const caps = A13_OCCLUSION_CAPS.filter((c) => c.state === stateId);
  const order = [...input].sort((a, b) => a.slot.zIndex - b.slot.zIndex);
  const done = new Map<string, { slot: A13Slot; layout: PolaroidLayout; captionGuard: Point[] | null }>();
  const result = new Map<string, CalibratedSlot>();

  for (const { slot, source, captionText } of order) {
    const cal = A13_SLOT_CALIBRATION[slot.slotId];
    if (!cal) throw new Error(`calibrateState: no V1.1 calibration for ${slot.slotId}`);
    const [ex0, ey0, ex1, ey1] = cal.envelope;
    const lowerDone = [...done.values()];

    const check = (l: PolaroidLayout): ConstraintFailure[] => {
      const fails: ConstraintFailure[] = [];
      const q = outerQuad(slot, l);
      const xs = q.map((p) => p.x);
      const ys = q.map((p) => p.y);
      const canvasOver = Math.max(0, -Math.min(...xs), -Math.min(...ys), Math.max(...xs) - A13_PILOT_CANVAS.width, Math.max(...ys) - A13_PILOT_CANVAS.height);
      if (canvasOver > 1e-9) fails.push({ id: "canvas", detail: "hors canvas", excess: canvasOver });
      const envOver = Math.max(0, ex0 - Math.min(...xs), ey0 - Math.min(...ys), Math.max(...xs) - ex1, Math.max(...ys) - ey1);
      if (envOver > 1e-9) fails.push({ id: "envelope", detail: `enveloppe dépassée`, excess: envOver });
      const title = convexIntersectionArea(q, TITLE_ZONE_POLYGON);
      if (title > EPS_AREA) fails.push({ id: "title", detail: "zone titre", excess: title });

      for (const cap of caps.filter((c) => c.occluder === slot.slotId)) {
        const lower = done.get(cap.protectedPhoto);
        if (!lower) continue;
        const pct = occlusionPercent(lower.slot, lower.layout, [q]);
        if (pct > cap.maxPercent + 1e-9) {
          fails.push({ id: "occlusion", detail: `${slot.slotId} → ${cap.protectedPhoto}`, excess: pct - cap.maxPercent });
        }
      }
      // Aggregate caps of every lower photo this slot covers.
      const aggregates = new Map<string, number>();
      for (const cap of caps) aggregates.set(cap.protectedPhoto, cap.aggregateMaxPercent);
      for (const [pid, aggMax] of aggregates) {
        const lower = done.get(pid);
        if (!lower || lower.slot.zIndex >= slot.zIndex) continue;
        const covers = lowerDone.filter((d) => d.slot.zIndex > lower.slot.zIndex).map((d) => outerQuad(d.slot, d.layout));
        const pct = occlusionPercent(lower.slot, lower.layout, [...covers, q]);
        if (pct > aggMax + 1e-9) fails.push({ id: "occlusion-aggregate", detail: `agrégé ${pid}`, excess: pct - aggMax });
      }
      for (const pid of cal.protectCaptionOf ?? []) {
        const guard = done.get(pid)?.captionGuard;
        if (!guard) continue;
        const a = convexIntersectionArea(guard, q);
        if (a > EPS_AREA) fails.push({ id: "caption-glyphs", detail: `glyphes ${pid}`, excess: a });
      }
      return fails;
    };

    let chosen: { s: number; layout: PolaroidLayout } | null = null;
    let prevFails: ConstraintFailure[] = [];
    const steps = Math.round((1 - cal.minScale) / A13_SCALE_PRECISION);
    for (let i = 0; i <= steps; i++) {
      const s = +(1 - i * A13_SCALE_PRECISION).toFixed(3);
      const l = layoutDynamicPolaroid(slot, source, s * s);
      const fails = check(l);
      if (!fails.length) {
        chosen = { s, layout: l };
        break;
      }
      prevFails = fails;
    }

    let entry: CalibratedSlot;
    if (chosen) {
      entry = { slot, layout: chosen.layout, scale: chosen.s, minScale: cal.minScale, status: "placed", limitedBy: chosen.s < 1 ? prevFails : [] };
    } else {
      const l = layoutDynamicPolaroid(slot, source, cal.minScale * cal.minScale);
      entry = { slot, layout: l, scale: cal.minScale, minScale: cal.minScale, status: "MANIFEST_ENVELOPE_UNRESOLVED_STOP", limitedBy: check(l) };
    }
    result.set(slot.slotId, entry);

    // The slot's own centred caption glyphs (+margin), as uppers must see them.
    let captionGuard: Point[] | null = null;
    if (measurer && captionText) {
      const c = layoutCaption(slot, entry.layout, captionText, measurer, []);
      captionGuard = slotRectToCanvas(slot, {
        x: entry.layout.outer.x + c.protectedBox.x,
        y: entry.layout.outer.y + c.protectedBox.y,
        width: c.protectedBox.width,
        height: c.protectedBox.height,
      });
    }
    done.set(slot.slotId, { slot, layout: entry.layout, captionGuard });
  }

  return input.map(({ slot }) => result.get(slot.slotId)!);
}
