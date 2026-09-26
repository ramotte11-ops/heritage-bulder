import { A13_PILOT_CANVAS, A13_PILOT_COLLISION_MARGIN, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";

/**
 * A13 Dynamic Polaroid — QA measurements (PILOT). Read-only: nothing here
 * ever moves, resizes or reorders a tirage ("Toute collision non prescrite
 * est RED ; aucune correction automatique"). It only reports.
 *
 * All polygons are in the 1670 × 941 canvas frame, with each slot's
 * rotation applied around its anchor — exactly what the renderer draws.
 */

export type Point = { x: number; y: number };

/** Slot-local rect → canvas polygon (clockwise, 4 points). */
export function slotRectToCanvas(slot: A13Slot, r: Rect): Point[] {
  const ox = slot.anchor.x - slot.maxEnvelope.width / 2;
  const oy = slot.anchor.y - slot.maxEnvelope.height / 2;
  const a = (slot.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  return corners.map(({ x, y }) => {
    const dx = ox + x - slot.anchor.x;
    const dy = oy + y - slot.anchor.y;
    return { x: slot.anchor.x + dx * cos - dy * sin, y: slot.anchor.y + dx * sin + dy * cos };
  });
}

export function pointInConvex(pt: Point, poly: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** Area of the intersection of two convex polygons (Sutherland–Hodgman). */
export function convexIntersectionArea(subject: Point[], clip: Point[]): number {
  let out = subject;
  const orient = Math.sign(signedArea(clip)) || 1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: Point) => orient * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn !== prevIn) out.push(lineIntersect(prev, cur, a, b));
      if (curIn) out.push(cur);
    }
  }
  return out.length >= 3 ? Math.abs(signedArea(out)) : 0;
}

function signedArea(p: Point[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function lineIntersect(p1: Point, p2: Point, p3: Point, p4: Point): Point {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

export interface SlotQa {
  slotId: A13Slot["slotId"];
  /** Tirage stays inside its envelope (slot-local, 0.5 px tolerance). */
  insideEnvelope: boolean;
  /** How far (canvas px) the rotated tirage runs past the 1670 × 941
   * canvas edge, 0 when fully inside. Envelope + rotation are the
   * manifest's; this only reports the consequence. */
  canvasOverflow: number;
  /** Share of the VISIBLE photo area hidden by higher-z tirages, [0,1]. */
  photoOccludedFraction: number;
  /** Slot ids of higher-z tirages that cover part of this photo. */
  occludedBy: string[];
  /** Same, for the bottom band that carries the caption. */
  bandOccludedFraction: number;
  bandOccludedBy: string[];
}

export interface PairQa {
  lower: string;
  upper: string;
  /** Overlap of the two tirages (canvas px²). */
  overlapArea: number;
  /** Prescribed = the two envelopes (grown by the 12 px collision margin)
   * already overlap in the manifest, i.e. the Master composes them
   * overlapping. An overlap outside that is an unprescribed collision. */
  prescribed: boolean;
  status: "none" | "prescribed-overlap" | "RED-unprescribed";
}

function visiblePhotoRect(l: PolaroidLayout): Rect {
  // Photo ∩ window, relative to outer, then to slot-local.
  const x0 = Math.max(0, l.photo.x);
  const y0 = Math.max(0, l.photo.y);
  const x1 = Math.min(l.window.width, l.photo.x + l.photo.width);
  const y1 = Math.min(l.window.height, l.photo.y + l.photo.height);
  return {
    x: l.outer.x + l.window.x + x0,
    y: l.outer.y + l.window.y + y0,
    width: x1 - x0,
    height: y1 - y0,
  };
}

function bandRect(l: PolaroidLayout): Rect {
  const top = l.window.y + l.window.height;
  return { x: l.outer.x, y: l.outer.y + top, width: l.outer.width, height: l.outer.height - top };
}

/** Grid-samples a slot-local rect; share covered by any higher-z tirage. */
function sampleOcclusion(
  slot: A13Slot,
  r: Rect,
  uppers: { slot: A13Slot }[],
  outerPoly: Map<string, Point[]>,
  step: number,
) {
  let total = 0;
  let hidden = 0;
  const by = new Set<string>();
  for (let y = r.y + step / 2; y < r.y + r.height; y += step) {
    for (let x = r.x + step / 2; x < r.x + r.width; x += step) {
      total++;
      const [pt] = slotRectToCanvas(slot, { x, y, width: 0, height: 0 });
      let covered = false;
      for (const u of uppers) {
        if (pointInConvex(pt, outerPoly.get(u.slot.slotId)!)) {
          covered = true;
          by.add(u.slot.slotId);
        }
      }
      if (covered) hidden++;
    }
  }
  return { fraction: total ? hidden / total : 0, by: [...by].sort() };
}

function grow(slot: A13Slot, m: number): Rect {
  return { x: -m, y: -m, width: slot.maxEnvelope.width + 2 * m, height: slot.maxEnvelope.height + 2 * m };
}

export function measureComposition(entries: { slot: A13Slot; layout: PolaroidLayout | null }[], sampleStep = 3) {
  const placed = entries.filter((e): e is { slot: A13Slot; layout: PolaroidLayout } => e.layout !== null);
  const outerPoly = new Map(placed.map((e) => [e.slot.slotId, slotRectToCanvas(e.slot, e.layout.outer)]));

  const slots: SlotQa[] = placed.map(({ slot, layout }) => {
    const o = layout.outer;
    const insideEnvelope =
      o.x >= -0.5 && o.y >= -0.5 && o.x + o.width <= slot.maxEnvelope.width + 0.5 && o.y + o.height <= slot.maxEnvelope.height + 0.5;

    const poly = outerPoly.get(slot.slotId)!;
    const canvasOverflow = Math.max(
      0,
      ...poly.map((p) => Math.max(-p.x, -p.y, p.x - A13_PILOT_CANVAS.width, p.y - A13_PILOT_CANVAS.height)),
    );

    const uppers = placed.filter((e) => e.slot.zIndex > slot.zIndex);
    const photo = sampleOcclusion(slot, visiblePhotoRect(layout), uppers, outerPoly, sampleStep);
    const band = sampleOcclusion(slot, bandRect(layout), uppers, outerPoly, sampleStep);
    return {
      slotId: slot.slotId,
      insideEnvelope,
      canvasOverflow,
      photoOccludedFraction: photo.fraction,
      occludedBy: photo.by,
      bandOccludedFraction: band.fraction,
      bandOccludedBy: band.by,
    };
  });

  const pairs: PairQa[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [lo, up] =
        placed[i].slot.zIndex < placed[j].slot.zIndex ? [placed[i], placed[j]] : [placed[j], placed[i]];
      const overlapArea = convexIntersectionArea(outerPoly.get(lo.slot.slotId)!, outerPoly.get(up.slot.slotId)!);
      const prescribed =
        convexIntersectionArea(
          slotRectToCanvas(lo.slot, grow(lo.slot, A13_PILOT_COLLISION_MARGIN)),
          slotRectToCanvas(up.slot, grow(up.slot, A13_PILOT_COLLISION_MARGIN)),
        ) > 0;
      pairs.push({
        lower: lo.slot.slotId,
        upper: up.slot.slotId,
        overlapArea,
        prescribed,
        status: overlapArea <= 0.5 ? "none" : prescribed ? "prescribed-overlap" : "RED-unprescribed",
      });
    }
  }
  return { slots, pairs };
}
