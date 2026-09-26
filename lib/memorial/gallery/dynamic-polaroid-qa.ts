import {
  A13_PILOT_CAPTION_SAFE_ZONE_INTERSECTION_PX,
  type A13Slot,
} from "@/config/gallery-a13-pilot-manifest";
import {
  layoutDynamicPolaroid,
  placeAtAnchor,
  type PhotoSource,
  type PolaroidLayout,
  type Rect,
} from "@/lib/memorial/gallery/dynamic-polaroid-layout";

/**
 * A13 Dynamic Polaroid V2 — composition resolution + QA measurements.
 *
 * `resolveComposition` applies the ONE correction the V2 contract allows:
 * when an opaque tirage covers another tirage's caption safe zone, the
 * covering (higher-z) tirage's SURFACE is reduced — comfortable range
 * first, then down to its hard minimum — never its position, anchor,
 * rotation or z-index (§3, §5: "réduire D3 dans sa plage confortable puis,
 * au besoin, jusqu'à son minimum dur. Aucun déplacement."). Anything still
 * colliding at the hard minimum is reported, never hidden.
 *
 * Polygons are in the 1670 × 941 canvas frame, each slot rotated around
 * its reference centre — exactly what the renderer draws.
 */

export type Point = { x: number; y: number };

/** Slot-local rect (origin = reference centre) → canvas polygon. */
export function slotRectToCanvas(slot: A13Slot, r: Rect): Point[] {
  const a = (slot.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ].map(({ x, y }) => ({ x: slot.center.x + x * cos - y * sin, y: slot.center.y + x * sin + y * cos }));
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
      if (inside(cur) !== inside(prev)) out.push(lineIntersect(prev, cur, a, b));
      if (inside(cur)) out.push(cur);
    }
  }
  return out.length >= 3 ? Math.abs(signedArea(out)) : 0;
}

const offset = (base: Rect, r: Rect): Rect => ({ x: base.x + r.x, y: base.y + r.y, width: r.width, height: r.height });

export function outerPolygon(slot: A13Slot, l: PolaroidLayout) {
  return slotRectToCanvas(slot, l.outer);
}

export function safeZonePolygon(slot: A13Slot, l: PolaroidLayout) {
  return slotRectToCanvas(slot, offset(l.outer, l.safeZone));
}

type Placed = { slot: A13Slot; layout: PolaroidLayout };

export interface SafeZoneHit {
  /** Slot whose caption safe zone is intersected. */
  covered: string;
  /** Opaque tirage intersecting it. */
  by: string;
  areaPx2: number;
  /** true = `by` is ABOVE `covered` (its paper hides the caption). */
  above: boolean;
}

/** Tolerance for floating-point noise only; contract is 0 px. */
const ZERO_PX2 = 0.01;

export function safeZoneHits(placed: Placed[]): SafeZoneHit[] {
  const hits: SafeZoneHit[] = [];
  for (const s of placed) {
    const zone = safeZonePolygon(s.slot, s.layout);
    for (const u of placed) {
      if (u === s) continue;
      const area = convexIntersectionArea(zone, outerPolygon(u.slot, u.layout));
      if (area > A13_PILOT_CAPTION_SAFE_ZONE_INTERSECTION_PX + ZERO_PX2) {
        hits.push({ covered: s.slot.slotId, by: u.slot.slotId, areaPx2: area, above: u.slot.zIndex > s.slot.zIndex });
      }
    }
  }
  return hits;
}

export interface CompositionEntry {
  slot: A13Slot;
  source: PhotoSource | null;
}

export interface ResolvedComposition {
  entries: { slot: A13Slot; layout: PolaroidLayout | null }[];
  /** Surface reductions applied, with the caption they protect. */
  reductions: { slotId: string; areaFactor: number; protects: string[] }[];
  /** Covering hits left once every culprit reached its hard minimum. */
  unresolved: SafeZoneHit[];
}

export function resolveComposition(input: CompositionEntry[], step = 0.001): ResolvedComposition {
  const factor = new Map<string, number>(input.map((e) => [e.slot.slotId, 1]));
  const protects = new Map<string, Set<string>>();
  const layoutAll = () =>
    input.map(({ slot, source }) => ({
      slot,
      layout: source ? layoutDynamicPolaroid(slot, source, factor.get(slot.slotId)!) : null,
    }));

  for (let iter = 0; iter < 2000; iter++) {
    const entries = layoutAll();
    const placed = entries.filter((e): e is Placed => e.layout !== null);
    const covering = safeZoneHits(placed).filter((h) => h.above);
    const culprits = new Set<string>();
    for (const h of covering) {
      const slot = input.find((e) => e.slot.slotId === h.by)!.slot;
      if (factor.get(h.by)! - step >= slot.hardAreaFactor.min - 1e-9) {
        culprits.add(h.by);
        if (!protects.has(h.by)) protects.set(h.by, new Set());
        protects.get(h.by)!.add(h.covered);
      }
    }
    if (culprits.size === 0) {
      return {
        entries,
        reductions: [...protects.entries()].map(([slotId, set]) => ({
          slotId,
          areaFactor: factor.get(slotId)!,
          protects: [...set].sort(),
        })),
        unresolved: covering,
      };
    }
    for (const id of culprits) factor.set(id, +(factor.get(id)! - step).toFixed(6));
  }
  throw new Error("resolveComposition: did not converge");
}

// ---------------------------------------------------------------------------
// QA measurements (read-only)
// ---------------------------------------------------------------------------

export interface SlotQa {
  slotId: string;
  areaFactor: number;
  areaZone: "comfortable" | "hard" | "OUT";
  /** Anchor point drift vs the reference box's anchor, canvas px. */
  anchorDriftPx: number;
  /** Rotated outer extents in canvas px. */
  extents: { minX: number; maxX: number; minY: number; maxY: number };
  photoOccludedFraction: number;
  photoOccludedBy: string[];
}

function anchorLocal(slot: A13Slot, box: Rect): Point {
  const ax = slot.anchor.startsWith("left") ? box.x : slot.anchor.startsWith("right") ? box.x + box.width : box.x + box.width / 2;
  const ay = slot.anchor.includes("bottom") ? box.y + box.height : slot.anchor.includes("top") ? box.y : box.y + box.height / 2;
  return { x: ax, y: ay };
}

export function measureComposition(entries: { slot: A13Slot; layout: PolaroidLayout | null }[], sampleStep = 3) {
  const placed = entries.filter((e): e is Placed => e.layout !== null);
  const outerPoly = new Map(placed.map((e) => [e.slot.slotId, outerPolygon(e.slot, e.layout)]));

  const slots: SlotQa[] = placed.map(({ slot, layout }) => {
    const f = layout.areaFactor;
    const areaZone =
      f >= slot.comfortableAreaFactor.min - 1e-9 && f <= slot.comfortableAreaFactor.max + 1e-9
        ? "comfortable"
        : f >= slot.hardAreaFactor.min - 1e-9 && f <= slot.hardAreaFactor.max + 1e-9
          ? "hard"
          : "OUT";
    const ref = placeAtAnchor(slot.anchor, slot.referenceSize, slot.referenceSize.width, slot.referenceSize.height);
    const refAnchor = anchorLocal(slot, { ...ref, ...slot.referenceSize });
    const boxAnchor = anchorLocal(slot, layout.outer);
    const anchorDriftPx = Math.hypot(refAnchor.x - boxAnchor.x, refAnchor.y - boxAnchor.y);

    const poly = outerPoly.get(slot.slotId)!;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);

    // Visible photo rect (slot-local), grid-sampled against higher tirages.
    const vis = offset(offset(layout.outer, layout.window), layout.photo);
    const uppers = placed.filter((e) => e.slot.zIndex > slot.zIndex);
    let total = 0;
    let hidden = 0;
    const by = new Set<string>();
    for (let y = vis.y + sampleStep / 2; y < vis.y + vis.height; y += sampleStep) {
      for (let x = vis.x + sampleStep / 2; x < vis.x + vis.width; x += sampleStep) {
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
    return {
      slotId: slot.slotId,
      areaFactor: f,
      areaZone,
      anchorDriftPx,
      extents: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      photoOccludedFraction: total ? hidden / total : 0,
      photoOccludedBy: [...by].sort(),
    };
  });

  const pairs = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [lo, up] = placed[i].slot.zIndex < placed[j].slot.zIndex ? [placed[i], placed[j]] : [placed[j], placed[i]];
      pairs.push({
        lower: lo.slot.slotId,
        upper: up.slot.slotId,
        overlapArea: convexIntersectionArea(outerPoly.get(lo.slot.slotId)!, outerPoly.get(up.slot.slotId)!),
      });
    }
  }
  return { slots, pairs, safeZoneHits: safeZoneHits(placed) };
}

/**
 * Caption TEXT box (measured in the DOM, relative to the print's outer
 * top-left, source px) against every higher-z tirage. 0 px² = the caption
 * is fully readable, whatever the safe-zone verdict.
 */
export function captionTextHits(
  entries: { slot: A13Slot; layout: PolaroidLayout | null }[],
  textRects: Record<string, Rect>,
) {
  const placed = entries.filter((e): e is Placed => e.layout !== null);
  const out: Record<string, { areaPx2: number; by: string[] }> = {};
  for (const s of placed) {
    const r = textRects[s.slot.slotId];
    if (!r) continue;
    const poly = slotRectToCanvas(s.slot, offset(s.layout.outer, r));
    let area = 0;
    const by: string[] = [];
    for (const u of placed) {
      if (u.slot.zIndex <= s.slot.zIndex) continue;
      const a = convexIntersectionArea(poly, outerPolygon(u.slot, u.layout));
      if (a > ZERO_PX2) {
        area += a;
        by.push(u.slot.slotId);
      }
    }
    out[s.slot.slotId] = { areaPx2: area, by };
  }
  return out;
}
