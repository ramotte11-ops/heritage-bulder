import { A13_DESKTOP_CANVAS, type A13Slot } from "@/config/gallery-a13-desktop-manifest";
import {
  G3_RELATIONS,
  G3_SEARCH,
  G3_TERRITORY_SLOTS,
  type G3TerritorySlot,
} from "@/config/gallery-a13-g3-territory";
import { G3_COUPLE } from "@/config/gallery-a13-g3-coupled-territory";
import { layoutDynamicPolaroid, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/**
 * ⚠ LEGACY / STUDY ONLY — NOT A RUNTIME API (dette D8). Used only by the
 * `/g3-territoire` historical study page and its tests; the G3 authority is
 * the V2 runtime (`solveV2` through `runDesktopGallery`). Import guard:
 * `gallery-authority.test.ts`.
 *
 * A13 — G3 Desktop Light — SLOT TERRITORY (study V1) + COUPLED SLOT
 * TERRITORY (calibration V1, D2 ↔ D3 only). Solver for the three G3 slots.
 *
 * Variables per slot: a translation (dx, dy) of the slot frame from its
 * Master witness centre, bounded by the slot's closed centre territory,
 * and a linear scale s (outer surface = preferred × s², laid out by the
 * unchanged V2.1 engine). Rotation, anchor, z-index, media order: fixed.
 *
 * Hard constraints (contract priorities 1–4):
 * - whole photo, no distortion (engine); every tirage inside the canvas;
 *   0 px² with the measured title protection; s ≥ absolute floor;
 * - D1 (Slot Territory V1, unchanged): its territory; ≥ 34 px horizontal
 *   breathing between its photo window and D2/D3 windows; its caption
 *   glyphs not covered by D2/D3; D1 area ≥ D2 and D3 areas;
 * - the D2/D3 COUPLE: both centres in their V1 territories; couple centre
 *   C = (D2 + D3) / 2 in its territory; relative vector R = D3 − D2 with
 *   ΔX < 0, ΔY > 0, inside the relative ellipse, centre distance and angle
 *   in range; contour gap ≤ 24 px when not overlapping; D3 in front;
 *   D2 photo window occluded ≤ 12 % by D3; D3 never over D2's caption
 *   glyphs (+6/4 px).
 *
 * Objective (lexicographic, after the constraints): max min scale → max
 * total area → D1 translation (V1 normalized cost; D1 is never moved to
 * improve the couple) → couple proximity E = 3·Er + 1.5·Ec + Ei, ties by
 * Er, then Ec, then Ei.
 *
 * Search (Slot Territory V1 §6): translations on a 2 px lattice anchored at
 * each witness centre, then 0.5 px refinement; scales by 0.005 then 0.001.
 * Resolution order: phase A requires every caption clear at its CENTRED
 * position; only if phase A has no solution above the floors does phase B
 * allow the V2.1 local X caption shift. No solution →
 * `G3_COUPLED_TERRITORY_UNRESOLVED_STOP` (no relaxation of any bound).
 *
 * Readings stated for QG:
 * - territories bound the translated slot centre (witness + delta);
 * - "max total area" at the optimal minimum scale is reached greedily, one
 *   slot at a time in descending preferred area (D1, D3, D2);
 * - the D1 ↔ right-group breathing is a horizontal gap between windows;
 * - Er = elliptic radius of R − R_witness (radii 85 / 80, = 1 on the
 *   ellipse); Ec = distance of C − C_witness normalized per side by the
 *   couple territory extent from the witness; Ei = Σ over D2, D3 of the
 *   distance of the centre normalized per side by its V1 territory extent.
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

export interface G3CoupleMetrics {
  center: { x: number; y: number };
  relativeVector: { x: number; y: number };
  distancePx: number;
  angleDeg: number;
  /** ((ΔX + 111.9) / 85)² + ((ΔY − 311) / 80)², ≤ 1 required. */
  ellipseValue: number;
  er: number;
  ec: number;
  ei: number;
  e: number;
}

export interface G3Metrics {
  titleIntersectionPx2: number[];
  d2PhotoOcclusionPercent: number;
  d2d3GapPx: number;
  d2d3OverlapPx2: number;
  d1RightWindowGapPx: number;
  captionCollisionPx2: number[];
  d1Dominant: boolean;
  /** D1 V1 normalized translation Σ (d/range)². */
  d1Cost: number;
  couple: G3CoupleMetrics;
}

export type G3Status = "solved" | "G3_COUPLED_TERRITORY_UNRESOLVED_STOP";

export interface G3Result {
  status: G3Status;
  phase: "A" | "B" | null;
  slots: G3SlotResult[];
  metrics: G3Metrics | null;
  /** Why no candidate exists (STOP only). */
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

/** Slot Territory V1 normalized translation Σ (d / side range)². */
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
  return q.every((p) => p.x >= -1e-9 && p.y >= -1e-9 && p.x <= A13_DESKTOP_CANVAS.width + 1e-9 && p.y <= A13_DESKTOP_CANVAS.height + 1e-9);
}

// ── Couple geometry ────────────────────────────────────────────────────

const W2 = G3_TERRITORY_SLOTS[1].witnessCenter;
const W3 = G3_TERRITORY_SLOTS[2].witnessCenter;
const CW = G3_COUPLE.witness.coupleCenter;
const REL = G3_COUPLE.relativeVector;
const CT = G3_COUPLE.coupleCenterTerritory;

/** Actual relative vector R = centre D3 − centre D2 for deltas d2, d3. */
function relVector(d2: Vec, d3: Vec): Vec {
  return { x: W3.x + d3.x - (W2.x + d2.x), y: W3.y + d3.y - (W2.y + d2.y) };
}

function coupleCenter(d2: Vec, d3: Vec): Vec {
  return { x: (W2.x + d2.x + W3.x + d3.x) / 2, y: (W2.y + d2.y + W3.y + d3.y) / 2 };
}

function ellipseValue(R: Vec) {
  const e = REL.ellipse;
  return ((R.x - e.center.x) / e.radiusX) ** 2 + ((R.y - e.center.y) / e.radiusY) ** 2;
}

const angleDeg = (R: Vec) => (Math.atan2(R.y, R.x) * 180) / Math.PI;

/** Vector-only couple conditions: sign, ellipse, distance, angle. */
function vectorOk(R: Vec) {
  if (REL.requireDxNegative && !(R.x < 0)) return false;
  if (REL.requireDyPositive && !(R.y > 0)) return false;
  if (ellipseValue(R) > 1 + 1e-9) return false;
  const dist = Math.hypot(R.x, R.y);
  if (dist < REL.distancePx.min - 1e-9 || dist > REL.distancePx.max + 1e-9) return false;
  const a = angleDeg(R);
  return a >= REL.angleDeg.min - 1e-9 && a <= REL.angleDeg.max + 1e-9;
}

function coupleCenterOk(C: Vec) {
  return C.x >= CT.xMin - 1e-9 && C.x <= CT.xMax + 1e-9 && C.y >= CT.yMin - 1e-9 && C.y <= CT.yMax + 1e-9;
}

/** Couple proximity terms (contract §5). */
function proximity(d2: Vec, d3: Vec) {
  const R = relVector(d2, d3);
  const er = Math.sqrt(ellipseValue(R));
  const C = coupleCenter(d2, d3);
  const cx = C.x - CW.x;
  const cy = C.y - CW.y;
  const ec = Math.hypot(cx / (cx >= 0 ? CT.xMax - CW.x : CW.x - CT.xMin), cy / (cy >= 0 ? CT.yMax - CW.y : CW.y - CT.yMin));
  const ei = Math.sqrt(cost(G3_TERRITORY_SLOTS[1], d2)) + Math.sqrt(cost(G3_TERRITORY_SLOTS[2], d3));
  const w = G3_COUPLE.proximityWeights;
  return { e: w.relative * er + w.coupleCenter * ec + w.individual * ei, er, ec, ei };
}

type Prox = ReturnType<typeof proximity>;
/** Lexicographic E, then Er, then Ec, then Ei. */
function proxLess(a: Prox, b: Prox) {
  const keys = ["e", "er", "ec", "ei"] as const;
  for (const k of keys) {
    if (a[k] < b[k] - 1e-12) return true;
    if (a[k] > b[k] + 1e-12) return false;
  }
  return false;
}

export type Phase = "A" | "B";

/** Memoisation shared by every Problem of one solve (pure functions of
 * the scales, so caching never changes a result). */
interface Cache {
  shapes: Map<string, Shape>;
  cands: Map<string, Cand[]>;
  rel: Map<string, Rel[]>;
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

  /**
   * Couple conditions that depend only on r = d3 − d2 (D2 at d2 = 0):
   * relative vector, contour gap, occlusion, D2 caption.
   */
  pair23(r: Vec) {
    const [, s2, s3] = this.s;
    if (!vectorOk(relVector({ x: 0, y: 0 }, r))) return false;
    const q3 = add(s3.quad0, r);
    if (convexDistance(s2.quad0, q3) > G3_COUPLE.contourRelation.maximumGapWhenNotOverlappingPx + 1e-9) return false;
    const occl = (convexIntersectionArea(s2.win0, q3) / polyArea(s2.win0)) * 100;
    if (occl > G3_COUPLE.contourRelation.maximumD2PhotoOcclusionPercent + 1e-9) return false;
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
      coupleCenterOk(coupleCenter(d[1], d[2])) &&
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

/** Relative lattice offset r = d3 − d2 (in steps) and its elliptic radius. */
interface Rel {
  kx: number;
  ky: number;
  er: number;
}

function candidates(p: Problem, i: number): Cand[] {
  const key = `${p.phase}|${i}|${p.s[i].scale}`;
  const hit = p.cache.cands.get(key);
  if (hit) return hit;
  const st = G3_SEARCH.translationStepPx;
  const L = lattice(p.s[i].terr);
  const out: Cand[] = [];
  for (let kx = L.kx0; kx <= L.kx1; kx++) {
    for (let ky = L.ky0; ky <= L.ky1; ky++) {
      const d = { x: kx * st, y: ky * st };
      if (p.single(i, d)) out.push({ kx, ky, d, c: cost(p.s[i].terr, d) });
    }
  }
  p.cache.cands.set(key, out);
  return out;
}

/** Relative offsets satisfying every r-only couple condition, by Er. */
function relativeSet(p: Problem): Rel[] {
  const key = `${p.phase}|${p.s[1].scale}|${p.s[2].scale}`;
  const hit = p.cache.rel.get(key);
  if (hit) return hit;
  const st = G3_SEARCH.translationStepPx;
  const e = REL.ellipse;
  const out: Rel[] = [];
  // The ellipse is centred on the witness vector, i.e. on r = 0.
  const kx0 = Math.floor((e.center.x - e.radiusX - (W3.x - W2.x)) / st) - 1;
  const kx1 = Math.ceil((e.center.x + e.radiusX - (W3.x - W2.x)) / st) + 1;
  const ky0 = Math.floor((e.center.y - e.radiusY - (W3.y - W2.y)) / st) - 1;
  const ky1 = Math.ceil((e.center.y + e.radiusY - (W3.y - W2.y)) / st) + 1;
  for (let kx = kx0; kx <= kx1; kx++) {
    for (let ky = ky0; ky <= ky1; ky++) {
      const r = { x: kx * st, y: ky * st };
      if (p.pair23(r)) out.push({ kx, ky, er: Math.sqrt(ellipseValue(relVector({ x: 0, y: 0 }, r))) });
    }
  }
  out.sort((a, b) => a.er - b.er);
  p.cache.rel.set(key, out);
  return out;
}

/**
 * Exact optimum on the 2 px lattice for fixed scales, or null. Objective:
 * D1 cost first, then couple proximity. `firstOnly` stops at any feasible
 * triple (feasibility test of the scale search).
 */
function optimize(p: Problem, firstOnly: boolean): [Vec, Vec, Vec] | null {
  if (!p.areasOk()) return null;
  const st = G3_SEARCH.translationStepPx;
  const P1 = candidates(p, 0);
  const P2 = candidates(p, 1);
  const P3 = candidates(p, 2);
  if (!P1.length || !P2.length || !P3.length) return null;
  const R = relativeSet(p);
  if (!R.length) return null;

  const [s1, s2, s3] = p.s;
  const win1R = Math.max(...s1.win0.map((q) => q.x));
  const win2L = Math.min(...s2.win0.map((q) => q.x));
  const win3L = Math.min(...s3.win0.map((q) => q.x));
  const gap = G3_RELATIONS.minimumPhotoWindowGapPx;

  const L2 = lattice(s2.terr);
  const L3 = lattice(s3.terr);
  const H2 = L2.ky1 - L2.ky0 + 1;
  const H3 = L3.ky1 - L3.ky0 + 1;
  const ok2 = new Uint8Array((L2.kx1 - L2.kx0 + 1) * H2);
  const ok3 = new Uint8Array((L3.kx1 - L3.kx0 + 1) * H3);
  for (const c of P2) ok2[(c.kx - L2.kx0) * H2 + (c.ky - L2.ky0)] = 1;
  for (const c of P3) ok3[(c.kx - L3.kx0) * H3 + (c.ky - L3.ky0)] = 1;

  /**
   * Visit every lattice couple (D2 at k2, D3 at k2 + r) meeting the
   * couple-centre territory and both single-slot conditions, r in Er
   * order, with D2/D3 left edges ≥ `minL2`/`minL3` (D1 breathing).
   * `visit` returns true to stop; `stopAt(er)` prunes by the Er bound.
   */
  const scan = (minL2: number, minL3: number, visit: (d2: Vec, d3: Vec, rel: Rel) => boolean, stopAt?: (er: number) => boolean) => {
    for (const rel of R) {
      if (stopAt?.(rel.er)) return;
      const rx = rel.kx * st;
      const ry = rel.ky * st;
      // C = CW + d2 + r / 2 (witness C is the mid-point of the witnesses).
      const kx2lo = Math.max(L2.kx0, L3.kx0 - rel.kx, Math.ceil((CT.xMin - CW.x - rx / 2) / st - 1e-9), Math.ceil((minL2 - win2L) / st - 1e-9), Math.ceil((minL3 - win3L - rx) / st - 1e-9));
      const kx2hi = Math.min(L2.kx1, L3.kx1 - rel.kx, Math.floor((CT.xMax - CW.x - rx / 2) / st + 1e-9));
      const ky2lo = Math.max(L2.ky0, L3.ky0 - rel.ky, Math.ceil((CT.yMin - CW.y - ry / 2) / st - 1e-9));
      const ky2hi = Math.min(L2.ky1, L3.ky1 - rel.ky, Math.floor((CT.yMax - CW.y - ry / 2) / st + 1e-9));
      for (let kx = kx2lo; kx <= kx2hi; kx++) {
        const row2 = (kx - L2.kx0) * H2;
        const row3 = (kx + rel.kx - L3.kx0) * H3;
        for (let ky = ky2lo; ky <= ky2hi; ky++) {
          if (!ok2[row2 + ky - L2.ky0] || !ok3[row3 + ky + rel.ky - L3.ky0]) continue;
          const d2 = { x: kx * st, y: ky * st };
          const d3 = { x: d2.x + rx, y: d2.y + ry };
          // Guard the float mid-point against the exact bounds.
          if (!coupleCenterOk(coupleCenter(d2, d3))) continue;
          if (visit(d2, d3, rel)) return;
        }
      }
    }
  };

  const captionOk = (d1: Vec, d2: Vec, d3: Vec) => p.d1Caption({ x: d2.x - d1.x, y: d2.y - d1.y }, { x: d3.x - d1.x, y: d3.y - d1.y });

  if (firstOnly) {
    // Any D1 whose column fits the breathing bound and whose caption is clear.
    const P1byKx = new Map<number, Cand[]>();
    for (const c of P1) (P1byKx.get(c.kx) ?? P1byKx.set(c.kx, []).get(c.kx)!).push(c);
    const kxs = [...P1byKx.keys()].sort((a, b) => a - b);
    const minD1x = kxs[0] * st;
    const found: { v: [Vec, Vec, Vec] | null } = { v: null };
    scan(win1R + gap + minD1x, win1R + gap + minD1x, (d2, d3) => {
      const bound = Math.min(win2L + d2.x, win3L + d3.x) - gap - win1R;
      for (const kx of kxs) {
        if (kx * st > bound + 1e-9) break;
        for (const c1 of P1byKx.get(kx)!) {
          if (captionOk(c1.d, d2, d3)) {
            found.v = [c1.d, d2, d3];
            return true;
          }
        }
      }
      return false;
    });
    return found.v;
  }

  // D1 first (its V1 cost; never traded for the couple), then E.
  const P1s = [...P1].sort((a, b) => a.c - b.c || a.kx - b.kx || a.ky - b.ky);
  let maxBound = -Infinity;
  scan(-Infinity, -Infinity, (d2, d3) => {
    maxBound = Math.max(maxBound, Math.min(win2L + d2.x, win3L + d3.x) - gap - win1R);
    return false;
  });
  const best: { v: { c1: number; prox: Prox; d: [Vec, Vec, Vec] } | null } = { v: null };
  for (const c1 of P1s) {
    if (best.v && c1.c > best.v.c1 + 1e-12) break;
    if (c1.d.x > maxBound + 1e-9) continue;
    const minL = win1R + c1.d.x + gap;
    scan(
      minL,
      minL,
      (d2, d3) => {
        const prox = proximity(d2, d3);
        if (best.v && !proxLess(prox, best.v.prox)) return false;
        if (!captionOk(c1.d, d2, d3)) return false;
        best.v = { c1: c1.c, prox, d: [c1.d, d2, d3] };
        return false;
      },
      (er) => !!best.v && G3_COUPLE.proximityWeights.relative * er > best.v.prox.e + 1e-12,
    );
  }
  return best.v ? best.v.d : null;
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

  // 3 — exact optimum on the 2 px lattice, then 0.5 px refinement: D1 by
  // its V1 cost, then the couple by E (D2 alone, D3 alone, or together).
  const p = problemAt(input, scales, phase, cache);
  const d = optimize(p, false);
  if (!d) return null;
  const refine = G3_SEARCH.translationRefinePx;
  const span = G3_SEARCH.translationStepPx;
  const offsets: Vec[] = [];
  for (let ox = -span; ox <= span + 1e-9; ox += refine) for (let oy = -span; oy <= span + 1e-9; oy += refine) offsets.push({ x: ox, y: oy });
  for (let round = 0; round < 2; round++) {
    let best1 = d[0];
    let bestC = cost(p.s[0].terr, d[0]);
    for (const o of offsets) {
      const cand = { x: d[0].x + o.x, y: d[0].y + o.y };
      const c = cost(p.s[0].terr, cand);
      if (c >= bestC - 1e-12) continue;
      if (p.all([cand, d[1], d[2]])) {
        best1 = cand;
        bestC = c;
      }
    }
    d[0] = best1;
    let bestPair: [Vec, Vec] = [d[1], d[2]];
    let bestProx = proximity(d[1], d[2]);
    for (const o of offsets) {
      for (const mode of [0, 1, 2]) {
        const d2 = mode === 1 ? d[1] : { x: d[1].x + o.x, y: d[1].y + o.y };
        const d3 = mode === 0 ? d[2] : { x: d[2].x + o.x, y: d[2].y + o.y };
        const prox = proximity(d2, d3);
        if (!proxLess(prox, bestProx)) continue;
        if (p.all([d[0], d2, d3])) {
          bestPair = [d2, d3];
          bestProx = prox;
        }
      }
    }
    [d[1], d[2]] = bestPair;
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
    const [, q2, q3] = quads;
    const w = p.s.map((sh, i) => add(sh.win0, d[i]));
    const title = rectPoly(input.title);
    const R = relVector(d[1], d[2]);
    const metrics: G3Metrics = {
      titleIntersectionPx2: quads.map((q) => convexIntersectionArea(q, title)),
      d2PhotoOcclusionPercent: (convexIntersectionArea(w[1], q3) / polyArea(w[1])) * 100,
      d2d3GapPx: convexDistance(q2, q3),
      d2d3OverlapPx2: convexIntersectionArea(q2, q3),
      d1RightWindowGapPx: Math.min(...w[1].map((q) => q.x), ...w[2].map((q) => q.x)) - Math.max(...w[0].map((q) => q.x)),
      captionCollisionPx2: slots.map((s) => s.caption?.collisionAreaPx2 ?? 0),
      d1Dominant: slots[0].area >= slots[1].area - 1e-6 && slots[0].area >= slots[2].area - 1e-6,
      d1Cost: cost(p.s[0].terr, d[0]),
      couple: {
        center: coupleCenter(d[1], d[2]),
        relativeVector: R,
        distancePx: Math.hypot(R.x, R.y),
        angleDeg: angleDeg(R),
        ellipseValue: ellipseValue(R),
        ...proximity(d[1], d[2]),
      },
    };
    return { status: "solved", phase, slots, metrics };
  }
  return {
    status: "G3_COUPLED_TERRITORY_UNRESOLVED_STOP",
    phase: null,
    slots: [],
    metrics: null,
    reason: "aucun candidat dans territoires + territoire de couple + ellipse relative au-dessus des planchers absolus (phases A et B)",
  };
}

// ── STOP diagnosis ─────────────────────────────────────────────────────

export interface G3StopDiagnosis {
  phase: Phase;
  /** Absolute floors [D1, D2, D3]. */
  scales: [number, number, number];
  /** Lattice positions meeting canvas + title, per slot. */
  singleCandidates: [number, number, number];
  /** Relative lattice offsets D2→D3, successive filters. */
  relative: { vector: number; contourGap: number; occlusion: number; d2Caption: number };
  /** Among vector-valid offsets: smallest contour gap (px). */
  minContourGapPx: number | null;
  /** Among vector + gap valid offsets: smallest D2 photo occlusion (%). */
  minOcclusionPercent: number | null;
  /** Among vector + gap + occlusion valid offsets: smallest D3 ∩ D2
   * caption glyph area (px², centred caption + 6/4 margin). */
  minD2CaptionIntrusionPx2: number | null;
  /** Lattice couples meeting every couple condition and both territories. */
  couples: number;
  /** Exhaustive check: (s1 ∈ {floor, 1}) × s2 × s3 on the 0.005 grid from
   * the floors to 1, every constraint: combinations checked / feasible. */
  gridChecked: number;
  gridFeasible: number;
}

/**
 * Exact account of a `G3_COUPLED_TERRITORY_UNRESOLVED_STOP`: which
 * constraint family empties the candidate set at the absolute floors, the
 * closest measured miss, and an exhaustive scale-grid confirmation that no
 * combination (not only the common-scale path of the solver) is feasible.
 * Read-only: it never relaxes anything.
 */
export function diagnoseG3Stop(input: G3Input, phase: Phase): G3StopDiagnosis {
  const floors = G3_TERRITORY_SLOTS.map((t) => t.absoluteMinimumLinearScale) as [number, number, number];
  const cache: Cache = { shapes: new Map(), cands: new Map(), rel: new Map() };
  const p = problemAt(input, floors, phase, cache);
  const [, s2, s3] = p.s;
  const st = G3_SEARCH.translationStepPx;
  const e = REL.ellipse;
  const vecOk: Vec[] = [];
  const kx0 = Math.floor((e.center.x - e.radiusX - (W3.x - W2.x)) / st) - 1;
  const kx1 = Math.ceil((e.center.x + e.radiusX - (W3.x - W2.x)) / st) + 1;
  const ky0 = Math.floor((e.center.y - e.radiusY - (W3.y - W2.y)) / st) - 1;
  const ky1 = Math.ceil((e.center.y + e.radiusY - (W3.y - W2.y)) / st) + 1;
  for (let kx = kx0; kx <= kx1; kx++) for (let ky = ky0; ky <= ky1; ky++) if (vectorOk(relVector({ x: 0, y: 0 }, { x: kx * st, y: ky * st }))) vecOk.push({ x: kx * st, y: ky * st });

  let minGap: number | null = null;
  let minOccl: number | null = null;
  let minIntr: number | null = null;
  const rel = { vector: vecOk.length, contourGap: 0, occlusion: 0, d2Caption: 0 };
  for (const r of vecOk) {
    const q3 = add(s3.quad0, r);
    const gap = convexDistance(s2.quad0, q3);
    minGap = Math.min(minGap ?? Infinity, gap);
    if (gap > G3_COUPLE.contourRelation.maximumGapWhenNotOverlappingPx + 1e-9) continue;
    rel.contourGap++;
    const occl = (convexIntersectionArea(s2.win0, q3) / polyArea(s2.win0)) * 100;
    minOccl = Math.min(minOccl ?? Infinity, occl);
    if (occl > G3_COUPLE.contourRelation.maximumD2PhotoOcclusionPercent + 1e-9) continue;
    rel.occlusion++;
    if (s2.guard0) minIntr = Math.min(minIntr ?? Infinity, convexIntersectionArea(s2.guard0, q3));
    if (p.pair23(r)) rel.d2Caption++;
  }

  let couples = 0;
  const R = relativeSet(p);
  if (R.length) {
    const P2 = candidates(p, 1);
    const P3 = new Set(candidates(p, 2).map((c) => `${c.kx}|${c.ky}`));
    for (const c2 of P2) {
      for (const r of R) {
        if (!P3.has(`${c2.kx + r.kx}|${c2.ky + r.ky}`)) continue;
        if (coupleCenterOk(coupleCenter(c2.d, { x: c2.d.x + r.kx * st, y: c2.d.y + r.ky * st }))) couples++;
      }
    }
  }

  let gridChecked = 0;
  let gridFeasible = 0;
  const steps = (f: number) => {
    const out: number[] = [];
    for (let v = f; v <= 1 + 1e-9; v = r3(v + G3_SEARCH.scaleStep)) out.push(v);
    if (out[out.length - 1] < 1) out.push(1);
    return out;
  };
  for (const v1 of [floors[0], 1]) {
    for (const v2 of steps(floors[1])) {
      for (const v3 of steps(floors[2])) {
        gridChecked++;
        if (optimize(problemAt(input, [v1, v2, v3], phase, cache), true)) gridFeasible++;
      }
    }
  }

  return {
    phase,
    scales: floors,
    singleCandidates: [candidates(p, 0).length, candidates(p, 1).length, candidates(p, 2).length],
    relative: rel,
    minContourGapPx: minGap,
    minOcclusionPercent: minOccl,
    minD2CaptionIntrusionPx2: minIntr,
    couples,
    gridChecked,
    gridFeasible,
  };
}
