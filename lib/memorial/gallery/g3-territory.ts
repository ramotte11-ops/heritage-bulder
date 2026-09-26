import { A13_PILOT_CANVAS, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import {
  G3_RELATIONS,
  G3_SEARCH,
  G3_TERRITORY_SLOTS,
  type G3TerritorySlot,
} from "@/config/gallery-a13-g3-territory";
import { layoutDynamicPolaroid, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/**
 * A13 — G3 Desktop Light — SLOT TERRITORY + BOUNDED LOCAL TRANSLATION
 * (pilot study V1). Solver for the three G3 slots only.
 *
 * Variables per slot: a translation (dx, dy) of the slot frame from its
 * Master witness centre, bounded by the slot's closed centre territory,
 * and a linear scale s (outer surface = preferred × s², laid out by the
 * unchanged V2.1 engine). Rotation, anchor, z-index, media order: fixed.
 *
 * Hard constraints (priorities 1–2 of the contract): whole photo, no
 * distortion (engine); every tirage inside the canvas; 0 px² with the
 * measured title protection; D2 photo window occluded ≤ 12 % by D3; D3
 * never over D2's caption glyphs (+6/4 px); D2–D3 contour gap ≤ 28 px;
 * D2 centre above D3 centre; ≥ 34 px horizontal breathing between D1's
 * photo window and any right-group photo window; D1 area ≥ D2 and D3
 * areas; D1's caption glyphs not covered by D2/D3; s ≥ absolute floor.
 *
 * Objective (lexicographic): max min scale → max total area → min
 * normalized translation Σ (dx/range)² + (dy/range)², range = the
 * territory's extent from the witness on that side.
 *
 * Search (contract §6): translations on a 2 px lattice anchored at the
 * witness centre, then 0.5 px refinement around the optimum; scales by
 * 0.005 then 0.001. Resolution order (§8): phase A requires every caption
 * clear at its CENTRED position (translation, then bounded scale); only if
 * phase A has no solution above the floors does phase B allow the V2.1
 * local X caption shift. No solution → `G3_SLOT_TERRITORY_UNRESOLVED_STOP`.
 *
 * Readings stated for QG:
 * - the territory bounds the translated slot centre (witness + delta), the
 *   point the contract's "translation from witness" columns measure;
 * - "max total area" at the optimal minimum scale is reached greedily, one
 *   slot at a time in descending preferred area (D1, D3, D2);
 * - the D1 ↔ right-group breathing is a horizontal gap between photo
 *   windows (contract: "respiration horizontale minimale").
 */

export interface TitleZone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface G3Input {
  slots: readonly A13Slot[]; // G3 manifest, [D1, D2, D3]
  sources: readonly PhotoSource[];
  captions: readonly (string | null)[];
  measurer: CaptionMeasurer | null;
  title: TitleZone;
}

export interface G3SlotResult {
  slotId: string;
  slot: A13Slot; // with the final centre
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  scale: number;
  area: number;
  delta: { x: number; y: number };
  center: { x: number; y: number };
  belowSoftFloor: boolean;
}

export interface G3Metrics {
  titleIntersectionPx2: number[];
  d2PhotoOcclusionPercent: number;
  d2d3GapPx: number;
  d2d3OverlapPx2: number;
  d1RightWindowGapPx: number;
  captionCollisionPx2: number[];
  d1Dominant: boolean;
  normalizedTranslation: number;
}

export interface G3Result {
  status: "solved" | "G3_SLOT_TERRITORY_UNRESOLVED_STOP";
  phase: "A" | "B" | null;
  slots: G3SlotResult[];
  metrics: G3Metrics | null;
  /** Why the last candidate failed (STOP only). */
  reason?: string;
}

type Vec = { x: number; y: number };
const add = (p: Point[], d: Vec) => p.map((q) => ({ x: q.x + d.x, y: q.y + d.y }));
const EPS = 1e-6;

function polyArea(p: Point[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function segDist(p: Point, a: Point, b: Point) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(a.x + t * vx - p.x, a.y + t * vy - p.y);
}

/** Distance between two convex polygons (0 when they touch/overlap). */
export function convexDistance(a: Point[], b: Point[]) {
  if (convexIntersectionArea(a, b) > EPS) return 0;
  let d = Infinity;
  for (const p of a) for (let i = 0; i < b.length; i++) d = Math.min(d, segDist(p, b[i], b[(i + 1) % b.length]));
  for (const p of b) for (let i = 0; i < a.length; i++) d = Math.min(d, segDist(p, a[i], a[(i + 1) % a.length]));
  return d;
}

const rectPoly = (z: TitleZone): Point[] => [
  { x: z.x0, y: z.y0 },
  { x: z.x1, y: z.y0 },
  { x: z.x1, y: z.y1 },
  { x: z.x0, y: z.y1 },
];

interface Shape {
  slot: A13Slot;
  terr: G3TerritorySlot;
  layout: PolaroidLayout;
  scale: number;
  area: number;
  quad0: Point[];
  win0: Point[];
  /** Centred caption glyphs + margin (phase A guard), or null. */
  guard0: Point[] | null;
  text: string | null;
}

function buildShape(i: number, input: G3Input, scale: number): Shape {
  const slot = input.slots[i];
  const terr = G3_TERRITORY_SLOTS[i];
  const layout = layoutDynamicPolaroid(slot, input.sources[i], scale * scale);
  const quad0 = slotRectToCanvas(slot, layout.outer);
  const win0 = slotRectToCanvas(slot, {
    x: layout.outer.x + layout.window.x,
    y: layout.outer.y + layout.window.y,
    width: layout.window.width,
    height: layout.window.height,
  });
  const text = input.captions[i];
  let guard0: Point[] | null = null;
  if (text && input.measurer) {
    const c = layoutCaption(slot, layout, text, input.measurer, []);
    guard0 = slotRectToCanvas(slot, {
      x: layout.outer.x + c.protectedBox.x,
      y: layout.outer.y + c.protectedBox.y,
      width: c.protectedBox.width,
      height: c.protectedBox.height,
    });
  }
  return { slot, terr, layout, scale, area: layout.outer.width * layout.outer.height, quad0, win0, guard0, text };
}

/** Lattice of 2 px steps from the witness centre, inside the territory. */
function lattice(terr: G3TerritorySlot) {
  const st = G3_SEARCH.translationStepPx;
  const { witnessCenter: w, centerTerritory: t } = terr;
  return {
    kx0: Math.ceil((t.xMin - w.x) / st - 1e-9),
    kx1: Math.floor((t.xMax - w.x) / st + 1e-9),
    ky0: Math.ceil((t.yMin - w.y) / st - 1e-9),
    ky1: Math.floor((t.yMax - w.y) / st + 1e-9),
  };
}

function cost(terr: G3TerritorySlot, d: Vec) {
  const { witnessCenter: w, centerTerritory: t } = terr;
  const rx = d.x >= 0 ? t.xMax - w.x : w.x - t.xMin;
  const ry = d.y >= 0 ? t.yMax - w.y : w.y - t.yMin;
  return (d.x / rx) ** 2 + (d.y / ry) ** 2;
}

function inTerritory(terr: G3TerritorySlot, d: Vec) {
  const c = { x: terr.witnessCenter.x + d.x, y: terr.witnessCenter.y + d.y };
  const t = terr.centerTerritory;
  return c.x >= t.xMin - 1e-9 && c.x <= t.xMax + 1e-9 && c.y >= t.yMin - 1e-9 && c.y <= t.yMax + 1e-9;
}

function insideCanvas(q: Point[]) {
  return q.every((p) => p.x >= -1e-9 && p.y >= -1e-9 && p.x <= A13_PILOT_CANVAS.width + 1e-9 && p.y <= A13_PILOT_CANVAS.height + 1e-9);
}

type Phase = "A" | "B";

/** Memoisation shared by every Problem of one solve (pure functions of
 * the scales, so caching never changes a result). */
interface Cache {
  shapes: Map<string, Shape>;
  cands: Map<string, Cand[]>;
  rel: Map<string, { kx: number; ky: number }[]>;
}

class Problem {
  readonly title: Point[];
  constructor(
    readonly input: G3Input,
    readonly s: [Shape, Shape, Shape],
    readonly phase: Phase,
    readonly cache: Cache,
  ) {
    this.title = rectPoly(input.title);
  }

  /** Constraints of one slot alone at translation d. */
  single(i: number, d: Vec) {
    const q = add(this.s[i].quad0, d);
    return insideCanvas(q) && convexIntersectionArea(q, this.title) <= EPS;
  }

  /** D2/D3 constraints for relative offset r = d3 − d2 (D2 at d2 = 0). */
  pair23(r: Vec) {
    const [, s2, s3] = this.s;
    if (s3.slot.center.y + r.y <= s2.slot.center.y) return false; // D2 stays above D3
    const q3 = add(s3.quad0, r);
    if (convexDistance(s2.quad0, q3) > G3_RELATIONS.maximumContourGapPx + 1e-9) return false;
    const occl = (convexIntersectionArea(s2.win0, q3) / polyArea(s2.win0)) * 100;
    if (occl > G3_RELATIONS.maximumD2PhotoOcclusionPercent + 1e-9) return false;
    if (s2.text && this.input.measurer) {
      if (this.phase === "A") {
        if (s2.guard0 && convexIntersectionArea(s2.guard0, q3) > EPS) return false;
      } else {
        const c = layoutCaption(s2.slot, s2.layout, s2.text, this.input.measurer, [{ slotId: s3.slot.slotId, polygon: q3 }]);
        if (c.status !== "placed") return false;
      }
    }
    return true;
  }

  /** D1 caption vs D2 (d2 − d1) and D3 (d3 − d1). */
  d1Caption(r2: Vec, r3: Vec) {
    const [s1, s2, s3] = this.s;
    if (!s1.text || !this.input.measurer) return true;
    const q2 = add(s2.quad0, r2);
    const q3 = add(s3.quad0, r3);
    if (this.phase === "A") return !!s1.guard0 && convexIntersectionArea(s1.guard0, q2) <= EPS && convexIntersectionArea(s1.guard0, q3) <= EPS;
    const c = layoutCaption(s1.slot, s1.layout, s1.text, this.input.measurer, [
      { slotId: s2.slot.slotId, polygon: q2 },
      { slotId: s3.slot.slotId, polygon: q3 },
    ]);
    return c.status === "placed";
  }

  /** D1 window right edge + 34 ≤ window left edge of D2 and D3. */
  gapOk(d1: Vec, d2: Vec, d3: Vec) {
    const [s1, s2, s3] = this.s;
    const r1 = Math.max(...s1.win0.map((p) => p.x)) + d1.x + G3_RELATIONS.minimumPhotoWindowGapPx;
    return r1 <= Math.min(...s2.win0.map((p) => p.x)) + d2.x + 1e-9 && r1 <= Math.min(...s3.win0.map((p) => p.x)) + d3.x + 1e-9;
  }

  areasOk() {
    const [s1, s2, s3] = this.s;
    return s1.area >= s2.area - 1e-6 && s1.area >= s3.area - 1e-6;
  }

  all(d: [Vec, Vec, Vec]) {
    return (
      d.every((di, i) => inTerritory(this.s[i].terr, di) && this.single(i, di)) &&
      this.pair23({ x: d[2].x - d[1].x, y: d[2].y - d[1].y }) &&
      this.gapOk(d[0], d[1], d[2]) &&
      this.d1Caption({ x: d[1].x - d[0].x, y: d[1].y - d[0].y }, { x: d[2].x - d[0].x, y: d[2].y - d[0].y })
    );
  }
}

interface Cand {
  kx: number;
  ky: number;
  d: Vec;
  c: number;
}

function candidates(p: Problem, i: number): Cand[] {
  const key = `${p.phase}|${i}|${p.s[i].scale}`;
  const hit = p.cache.cands.get(key);
  if (hit) return hit;
  const out = computeCandidates(p, i);
  p.cache.cands.set(key, out);
  return out;
}

function computeCandidates(p: Problem, i: number): Cand[] {
  const st = G3_SEARCH.translationStepPx;
  const L = lattice(p.s[i].terr);
  const out: Cand[] = [];
  for (let kx = L.kx0; kx <= L.kx1; kx++) {
    for (let ky = L.ky0; ky <= L.ky1; ky++) {
      const d = { x: kx * st, y: ky * st };
      if (p.single(i, d)) out.push({ kx, ky, d, c: cost(p.s[i].terr, d) });
    }
  }
  return out;
}

/**
 * Exact optimum on the 2 px lattice for fixed scales: min Σ cost subject to
 * every constraint, or null. `firstOnly` stops at any feasible triple.
 */
function optimize(p: Problem, firstOnly: boolean): [Vec, Vec, Vec] | null {
  if (!p.areasOk()) return null;
  const st = G3_SEARCH.translationStepPx;
  const P1 = candidates(p, 0);
  const P2 = candidates(p, 1);
  const P3 = candidates(p, 2);
  if (!P1.length || !P2.length || !P3.length) return null;

  const [s1, s2, s3] = p.s;
  const win1R = Math.max(...s1.win0.map((q) => q.x));
  const win2L = Math.min(...s2.win0.map((q) => q.x));
  const win3L = Math.min(...s3.win0.map((q) => q.x));
  const gap = G3_RELATIONS.minimumPhotoWindowGapPx;

  // D1 by column: best cost among dx1 ≤ bound, via prefix minima over kx.
  const L1 = lattice(s1.terr);
  const P1byKx = new Map<number, Cand[]>();
  for (const c of P1) (P1byKx.get(c.kx) ?? P1byKx.set(c.kx, []).get(c.kx)!).push(c);
  for (const list of P1byKx.values()) list.sort((a, b) => a.c - b.c);
  const prefBest: number[] = [];
  let run = Infinity;
  for (let kx = L1.kx0; kx <= L1.kx1; kx++) {
    for (const c of P1byKx.get(kx) ?? []) run = Math.min(run, c.c);
    prefBest.push(run);
  }
  const minDx1 = Math.min(...P1.map((c) => c.d.x));
  const bestC1 = (bound: number) => {
    const k = Math.floor((bound + 1e-9) / st) - L1.kx0;
    if (k < 0) return Infinity;
    return prefBest[Math.min(k, prefBest.length - 1)];
  };

  // D3 lookup table and the relative D2/D3 feasibility set.
  const L3 = lattice(s3.terr);
  const W3 = L3.kx1 - L3.kx0 + 1;
  const H3 = L3.ky1 - L3.ky0 + 1;
  const P3cost = new Float64Array(W3 * H3).fill(-1);
  for (const c of P3) P3cost[(c.kx - L3.kx0) * H3 + (c.ky - L3.ky0)] = c.c;
  const L2 = lattice(s2.terr);
  const rkx0 = L3.kx0 - L2.kx1;
  const rkx1 = L3.kx1 - L2.kx0;
  const rky0 = L3.ky0 - L2.ky1;
  const rky1 = L3.ky1 - L2.ky0;
  // Witness offsets differ: r (lattice) is relative to each slot's own
  // witness, so the physical relative translation is r·st exactly.
  const relKey = `${p.phase}|${s2.scale}|${s3.scale}`;
  let R = p.cache.rel.get(relKey);
  if (!R) {
    R = [];
    for (let kx = rkx0; kx <= rkx1; kx++) {
      for (let ky = rky0; ky <= rky1; ky++) {
        if (p.pair23({ x: kx * st, y: ky * st })) R.push({ kx, ky });
      }
    }
    p.cache.rel.set(relKey, R);
  }
  if (!R.length) return null;

  const P2s = [...P2].filter((c) => c.d.x >= win1R + gap + minDx1 - win2L - 1e-9).sort((a, b) => a.c - b.c);
  const minC3 = Math.min(...P3.map((c) => c.c));
  const minC1 = Math.min(...P1.map((c) => c.c));
  let best: { tot: number; d: [Vec, Vec, Vec] } | null = null;

  for (const c2 of P2s) {
    if (best && c2.c + minC3 + minC1 >= best.tot) break;
    for (const r of R) {
      const k3x = c2.kx + r.kx;
      const k3y = c2.ky + r.ky;
      if (k3x < L3.kx0 || k3x > L3.kx1 || k3y < L3.ky0 || k3y > L3.ky1) continue;
      const c3 = P3cost[(k3x - L3.kx0) * H3 + (k3y - L3.ky0)];
      if (c3 < 0) continue;
      const d2 = c2.d;
      const d3 = { x: k3x * st, y: k3y * st };
      const bound = Math.min(win2L + d2.x, win3L + d3.x) - gap - win1R;
      const lb = c2.c + c3 + bestC1(bound);
      if (!Number.isFinite(lb) || (best && lb >= best.tot)) continue;
      // Exact D1 choice: cheapest column-feasible D1 whose caption is clear.
      let c1Best: Cand | null = null;
      for (let kx = L1.kx0; kx <= Math.floor((bound + 1e-9) / st); kx++) {
        for (const c1 of P1byKx.get(kx) ?? []) {
          if (c1Best && c1.c >= c1Best.c) break;
          if (p.d1Caption({ x: d2.x - c1.d.x, y: d2.y - c1.d.y }, { x: d3.x - c1.d.x, y: d3.y - c1.d.y })) {
            c1Best = c1;
            break;
          }
        }
      }
      if (!c1Best) continue;
      const tot = c1Best.c + c2.c + c3;
      if (!best || tot < best.tot) best = { tot, d: [c1Best.d, d2, d3] };
      if (firstOnly) return best.d;
    }
  }
  return best ? best.d : null;
}

function problemAt(input: G3Input, scales: [number, number, number], phase: Phase, cache: Cache) {
  const s = scales.map((sc, i) => {
    const key = `${i}|${sc}`;
    let sh = cache.shapes.get(key);
    if (!sh) {
      sh = buildShape(i, input, sc);
      cache.shapes.set(key, sh);
    }
    return sh;
  }) as [Shape, Shape, Shape];
  return new Problem(input, s, phase, cache);
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function solvePhase(input: G3Input, phase: Phase): { scales: [number, number, number]; d: [Vec, Vec, Vec]; p: Problem } | null {
  const floors = G3_TERRITORY_SLOTS.map((t) => t.absoluteMinimumLinearScale);
  const at = (S: number): [number, number, number] => floors.map((f) => r3(Math.max(S, f))) as [number, number, number];
  const cache: Cache = { shapes: new Map(), cands: new Map(), rel: new Map() };
  const feasible = (sc: [number, number, number]) => optimize(problemAt(input, sc, phase, cache), true) !== null;

  // 1 — largest common minimum scale (0.005 steps, then 0.001 refinement).
  const lowest = Math.min(...floors);
  let S: number | null = null;
  for (let S5 = 1; S5 >= lowest - 1e-9; S5 = r3(S5 - G3_SEARCH.scaleStep)) {
    if (feasible(at(S5))) {
      S = S5;
      break;
    }
  }
  if (S === null) return null;
  for (let S1 = r3(S + G3_SEARCH.scaleStep - G3_SEARCH.scaleRefine); S1 > S + 1e-9 && S1 <= 1; S1 = r3(S1 - G3_SEARCH.scaleRefine)) {
    if (feasible(at(S1))) {
      S = S1;
      break;
    }
  }
  const scales = at(S);

  // 2 — maximise total area: raise slots one by one (D1, D3, D2).
  for (const i of [0, 2, 1]) {
    let hi = scales[i];
    for (let v = r3(hi + G3_SEARCH.scaleStep); v <= 1 + 1e-9; v = r3(v + G3_SEARCH.scaleStep)) {
      const t = [...scales] as [number, number, number];
      t[i] = v;
      if (!feasible(t)) break;
      hi = v;
    }
    for (let v = r3(hi + G3_SEARCH.scaleRefine); v <= Math.min(1, hi + G3_SEARCH.scaleStep) + 1e-9; v = r3(v + G3_SEARCH.scaleRefine)) {
      const t = [...scales] as [number, number, number];
      t[i] = v;
      if (!feasible(t)) break;
      hi = v;
    }
    scales[i] = hi;
  }

  // 3 — exact minimal translation on the 2 px lattice, then 0.5 px refine.
  const p = problemAt(input, scales, phase, cache);
  const d = optimize(p, false);
  if (!d) return null;
  const refine = G3_SEARCH.translationRefinePx;
  const span = G3_SEARCH.translationStepPx;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 3; i++) {
      let bestD = d[i];
      let bestC = cost(p.s[i].terr, d[i]);
      for (let ox = -span; ox <= span + 1e-9; ox += refine) {
        for (let oy = -span; oy <= span + 1e-9; oy += refine) {
          const cand = { x: d[i].x + ox, y: d[i].y + oy };
          const c = cost(p.s[i].terr, cand);
          if (c >= bestC - 1e-12) continue;
          const trial = [...d] as [Vec, Vec, Vec];
          trial[i] = cand;
          if (p.all(trial)) {
            bestD = cand;
            bestC = c;
          }
        }
      }
      d[i] = bestD;
    }
  }
  return { scales, d, p };
}

export function solveG3Territory(input: G3Input): G3Result {
  for (const phase of ["A", "B"] as const) {
    const sol = solvePhase(input, phase);
    if (!sol) continue;
    const { scales, d, p } = sol;
    const placed = p.s.map((sh, i) => ({
      ...sh.slot,
      center: { x: sh.terr.witnessCenter.x + d[i].x, y: sh.terr.witnessCenter.y + d[i].y },
    }));
    const quads = p.s.map((sh, i) => add(sh.quad0, d[i]));
    const slots: G3SlotResult[] = p.s.map((sh, i) => {
      const obstacles = [0, 1, 2]
        .filter((j) => p.s[j].slot.zIndex > sh.slot.zIndex)
        .map((j) => ({ slotId: p.s[j].slot.slotId, polygon: quads[j] }));
      return {
        slotId: sh.slot.slotId,
        slot: placed[i],
        layout: sh.layout,
        caption: sh.text && input.measurer ? layoutCaption(placed[i], sh.layout, sh.text, input.measurer, obstacles) : null,
        scale: scales[i],
        area: sh.area,
        delta: d[i],
        center: placed[i].center,
        belowSoftFloor: scales[i] < sh.terr.softMinimumLinearScale - 1e-9,
      };
    });
    const [q1, q2, q3] = quads;
    const w = p.s.map((sh, i) => add(sh.win0, d[i]));
    const title = rectPoly(input.title);
    const metrics: G3Metrics = {
      titleIntersectionPx2: quads.map((q) => convexIntersectionArea(q, title)),
      d2PhotoOcclusionPercent: (convexIntersectionArea(w[1], q3) / polyArea(w[1])) * 100,
      d2d3GapPx: convexDistance(q2, q3),
      d2d3OverlapPx2: convexIntersectionArea(q2, q3),
      d1RightWindowGapPx: Math.min(...w[1].map((q) => q.x), ...w[2].map((q) => q.x)) - Math.max(...w[0].map((q) => q.x)),
      captionCollisionPx2: slots.map((s) => s.caption?.collisionAreaPx2 ?? 0),
      d1Dominant: slots[0].area >= slots[1].area - 1e-6 && slots[0].area >= slots[2].area - 1e-6,
      normalizedTranslation: p.s.reduce((acc, sh, i) => acc + cost(sh.terr, d[i]), 0),
    };
    void q1;
    return { status: "solved", phase, slots, metrics };
  }
  return { status: "G3_SLOT_TERRITORY_UNRESOLVED_STOP", phase: null, slots: [], metrics: null, reason: "aucune solution au-dessus des planchers absolus (phases A et B)" };
}
