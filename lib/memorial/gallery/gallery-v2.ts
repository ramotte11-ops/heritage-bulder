import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import {
  A13_V2_CONTRACT,
  A13_V2_FIXTURES,
  A13_V2_MANIFESTS,
  type V2AssignmentId,
  type V2Manifest,
  type V2Slot,
  type V2StateId,
} from "@/config/gallery-a13-v2-manifests";
import { layoutDynamicPolaroid, paperFor, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { unionCoverArea } from "@/lib/memorial/gallery/manifest-calibration";
import { polygonHitsMask, type GlyphMask } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * A13 — Desktop Light — G2…G5 runtime, SIMPLIFIED MANIFESTS V2.
 *
 * GALERIE = COMPOSER, VIEWER = CONTEMPLER. The runtime looks for a
 * technically safe composition as close as reasonably possible to the
 * Master; it never maximises photographic visibility.
 *
 * Per slot the only variables are a translation of the slot frame inside
 * its territory and a linear scale s (outer area = witness area × s²,
 * DynamicPolaroid V2.1 unchanged). Rotation, anchor, z-order, role and the
 * strict media[i] → slot[i] order are closed. No theme input exists: the
 * geometry is shared by Light and Dark (GEOMETRY DIVERGENCE: NONE).
 *
 * CONTRACT PATCH V2.1 applied: (1) title = real glyph contours of the
 * heading and the microcopy, measured separately, dilated 3 px
 * (`title-glyph-mask.ts`); (2) Master proximity ranks a declared essential
 * relation (G2-PAIR) before individual drift; (3) G4-D3 media ratio 2.09
 * recorded, never derived from the paper; (4) interactive print.
 *
 * HARD (reject a candidate):
 * - photo integrity: engine (natural ratio, bounded + contain, no crop);
 * - title: no pixel of the dilated real-glyph mask under a tirage;
 * - canvas: every tirage inside 1670 × 941 (no manifest declares an
 *   overflow);
 * - territory and scale: translation inside the territory, s inside the
 *   hard bounds;
 * - role: the dominant slot keeps the largest outer area;
 * - identifiable: visible photo ≥ min(0.35, Master), visible paper ≥
 *   min(0.30, Master) — Master values measured on the witness polygons
 *   with the Master media ratios and the same caption state;
 * - accessible: an axis-aligned 44 × 44 px square (CSS px at the 1670 px
 *   canvas) fits in the visible paper;
 * Caption ink visibility (former min(0.60, Master) hard rule) is, since the
 * QG final arbitration, a soft preference measured for ranking, diagnosis
 * and QA only: GALERIE = COMPOSER, the Viewer reads the full caption.
 *
 * SOFT (rank only, never reject): Master proximity, declared relations,
 * generous presence, extra visibility, minimum displacement.
 *
 * Selection (V2.1 ranking, after the hard rules): [1] essential relation
 * loss (G2-PAIR: signed outer hull gap drift beyond a 40 px deadband /
 * smaller witness diagonal; 0 inside the deadband); [2] individual witness
 * drift; [3] other soft relations, visibility, displacement (ties only).
 * Individual drift: candidates are visited in increasing Master distance —
 * Σ over slots of (dx/extent)² + (dy/extent)² + (Δs/preferred extent)²,
 * extents per side, plus one tier per slot whose scale leaves its
 * preferred range ("hard bounds only after the near-Master candidates
 * fail"); ties → larger scale, smaller displacement. The first candidate
 * meeting every hard rule is returned. Relations, presence and visibility
 * are measured and reported; they never reject.
 */

export interface V2Input {
  state: V2StateId;
  sources: readonly PhotoSource[];
  captions: readonly (string | null)[];
  measurer: CaptionMeasurer | null;
  /** V2.1 protected title: dilated real-glyph mask (heading + microcopy). */
  titleMask: GlyphMask;
}

export type V2Stop =
  | "MANIFEST_REJECTS_OWN_MASTER_STOP"
  | "GALLERY_ITEM_INACCESSIBLE_STOP"
  | "TITLE_COLLISION_STOP"
  | "NO_CANDIDATE_WITHIN_TERRITORIES_STOP";

export interface V2HitTarget {
  /** Largest axis-aligned square side in the visible paper (px @1670). */
  side: number;
  center: Point;
}

export interface V2SlotResult {
  slotId: string;
  role: string;
  slot: A13Slot;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  scale: number;
  translation: Point;
  center: Point;
  area: number;
  scaleInPreferred: boolean;
  visiblePhoto: number;
  visibleOuter: number;
  captionVisibleInk: number | null;
  minima: { photo: number; outer: number; ink: number | null };
  hitTarget: V2HitTarget;
}

export interface V2PairRelation {
  relationId: string;
  members: [string, string];
  /** Signed outer hull gap (negative = overlap depth, 0 = contact, > 0 = void). */
  gapPx: number;
  witnessGapPx: number;
  driftPx: number;
  deadbandPx: number;
  /** max(0, drift − deadband) / smaller witness outer diagonal. */
  loss: number;
  frontBackOk: boolean;
}

export interface V2Relations {
  pair: V2PairRelation[];
  near: { members: string[]; distance: number; witness: number; tolerance: number | null; satisfied: boolean | null }[];
  overlap: { front: string; back: string; target: string; areaPx2: number; gapPx: number; witnessAreaPx2: number; witnessGapPx: number; preserved: boolean }[];
  stack: { members: [string, string]; upperAbove: boolean; frontOnTop: boolean; satisfied: boolean }[];
}

export interface V2Result {
  state: V2StateId;
  status: "PASS" | V2Stop;
  slots: V2SlotResult[];
  masterCost: number;
  relations: V2Relations | null;
  /** Metric signals for the QG (never rejections, never a verdict). */
  signals: string[];
  /** Candidates tested jointly before the answer (search effort). */
  jointCandidates: number;
  /** How the answer was found (best-first, pair search, local repair). */
  search?: string;
  stop?: { rule: string; detail: string; best?: { failures: V2Failure[]; masterCost: number } };
}

export interface V2Failure {
  slotId: string;
  rule: "dominance" | "visible-photo" | "visible-outer" | "hit-target";
  value: number;
  minimum: number;
}

type Vec = Point;
const EPS = 1e-6;
const add = (p: Point[], d: Vec) => p.map((q) => ({ x: q.x + d.x, y: q.y + d.y }));
const TRANSLATION_STEP = 2;
const SCALE_STEP = 0.005;
const MAX_JOINT = 20000;

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

function polygonGap(a: Point[], b: Point[]) {
  if (convexIntersectionArea(a, b) > EPS) return 0;
  let d = Infinity;
  for (const p of a) for (let i = 0; i < b.length; i++) d = Math.min(d, segDist(p, b[i], b[(i + 1) % b.length]));
  for (const p of b) for (let i = 0; i < a.length; i++) d = Math.min(d, segDist(p, a[i], a[(i + 1) % a.length]));
  return d;
}

/** The engine's slot for a V2 slot at a given centre. */
export function v2SlotToA13(s: V2Slot, center = s.witness.center): A13Slot {
  return {
    slotId: s.slotId,
    mediaIndex: s.mediaIndex,
    center,
    referenceSize: s.witness.outerSize,
    targetOuterArea: s.witness.outerArea,
    comfortableAreaFactor: { min: s.scaleBounds.preferred[0] ** 2, max: s.scaleBounds.preferred[1] ** 2 },
    hardAreaFactor: { min: s.scaleBounds.hard[0] ** 2, max: s.scaleBounds.hard[1] ** 2 },
    rotationDeg: s.witness.rotationDeg,
    anchor: s.anchor,
    expansion: [],
    zIndex: s.zIndex,
    ...(s.bottomBandHeightPx !== undefined ? { bottomBandOverridePx: s.bottomBandHeightPx } : {}),
  };
}

/**
 * Master media ratio of a slot: the photo-window ratio of the witness paper
 * (outer size minus the V2.1 paper: side/top margin, bottom band). Inside
 * the adaptive range the unchanged engine reproduces the witness outer size
 * exactly; outside it (G4-D3, ≈ 2.09) the engine bounds the window and the
 * witness size is not reproducible — reported, not corrected.
 */
export function masterMediaRatio(s: V2Slot): number {
  // V2.1: an explicit witness media ratio (G4-D3 = 2.09) is the authority.
  if (s.witnessMediaRatio !== undefined) return s.witnessMediaRatio;
  const { width: W, height: H } = s.witness.outerSize;
  const p = paperFor(W, H, s.bottomBandHeightPx);
  return (W - 2 * p.margin) / (H - p.margin - p.bottomBand);
}

/** Fixture sources for a state and an assignment (strict slot order). */
export function fixtureSources(state: V2StateId, assignment: V2AssignmentId): PhotoSource[] {
  const m = A13_V2_MANIFESTS[state];
  const a = A13_V2_FIXTURES.assignments.find((x) => x.id === assignment)!;
  return m.slots.map((s, i) => {
    const r = a.cycle ? A13_V2_FIXTURES.ratios[a.cycle[i % a.cycle.length] as keyof typeof A13_V2_FIXTURES.ratios] : masterMediaRatio(s);
    return { width: r * 1000, height: 1000 };
  });
}

// ── Geometry of one slot at one scale ──────────────────────────────────

interface Shape {
  s: number;
  layout: PolaroidLayout;
  slot: A13Slot;
  outer0: Point[];
  photo0: Point[];
  bbox: [number, number, number, number];
  area: number;
}

function shapeAt(v: V2Slot, source: PhotoSource, s: number): Shape {
  const slot = v2SlotToA13(v);
  const layout = layoutDynamicPolaroid(slot, source, s * s);
  const outer0 = slotRectToCanvas(slot, layout.outer);
  const photo0 = slotRectToCanvas(slot, {
    x: layout.outer.x + layout.window.x + layout.photo.x,
    y: layout.outer.y + layout.window.y + layout.photo.y,
    width: layout.photo.width,
    height: layout.photo.height,
  });
  const xs = outer0.map((p) => p.x);
  const ys = outer0.map((p) => p.y);
  return { s, layout, slot, outer0, photo0, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], area: layout.outer.width * layout.outer.height };
}

/** Visible fraction of `target` under the union of `covers`. */
function visibleFraction(target: Point[], covers: Point[][]) {
  const a = polyArea(target);
  if (a <= EPS) return 0;
  const rel = covers.filter((c) => convexIntersectionArea(target, c) > EPS);
  return Math.max(0, 1 - unionCoverArea(target, rel) / a);
}

/** Ink polygons (one rect per line, glyph bounds) of a placed caption. */
function inkPolygons(slot: A13Slot, layout: PolaroidLayout, c: CaptionLayout): Point[][] {
  return c.lines.map((l) =>
    slotRectToCanvas(slot, {
      x: layout.outer.x + l.x - l.metrics.actualBoundingBoxLeft,
      y: layout.outer.y + l.baseline - l.metrics.actualBoundingBoxAscent,
      width: l.metrics.actualBoundingBoxLeft + l.metrics.actualBoundingBoxRight,
      height: l.metrics.actualBoundingBoxAscent + l.metrics.actualBoundingBoxDescent,
    }),
  );
}

function captionVisibleInk(slot: A13Slot, layout: PolaroidLayout, c: CaptionLayout, covers: Point[][]) {
  let total = 0;
  let covered = 0;
  for (const ink of inkPolygons(slot, layout, c)) {
    const a = polyArea(ink);
    total += a;
    const rel = covers.filter((cv) => convexIntersectionArea(ink, cv) > EPS);
    covered += unionCoverArea(ink, rel);
  }
  return total > EPS ? Math.max(0, 1 - covered / total) : 1;
}

/** x-span of a convex polygon on the line y, or null. */
function spanAt(poly: Point[], y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
      if (a.y === b.y) {
        lo = Math.min(lo, a.x, b.x);
        hi = Math.max(hi, a.x, b.x);
      } else {
        const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * Largest axis-aligned square inside the visible part of `poly` (poly minus
 * the covers), on 1 px scanlines. `minSide` > 0: stop as soon as that side
 * fits (hard check); 0: find the largest side (report).
 */
export function largestVisibleSquare(poly: Point[], covers: Point[][], minSide = 0): V2HitTarget {
  const ys = poly.map((p) => p.y);
  const y0 = Math.ceil(Math.min(...ys));
  const y1 = Math.floor(Math.max(...ys));
  const rows: [number, number][][] = [];
  for (let y = y0; y < y1; y++) {
    const yc = y + 0.5;
    const s = spanAt(poly, yc);
    let iv: [number, number][] = s ? [s] : [];
    for (const c of covers) {
      const cs = spanAt(c, yc);
      if (!cs) continue;
      const next: [number, number][] = [];
      for (const [a, b] of iv) {
        if (cs[1] <= a || cs[0] >= b) next.push([a, b]);
        else {
          if (cs[0] > a) next.push([a, cs[0]]);
          if (cs[1] < b) next.push([cs[1], b]);
        }
      }
      iv = next;
    }
    rows.push(iv);
  }
  const fits = (L: number): Point | null => {
    for (let r = 0; r + L <= rows.length; r++) {
      let acc = rows[r];
      for (let k = 1; k < L && acc.length; k++) {
        const next: [number, number][] = [];
        for (const [a, b] of acc) for (const [c, d] of rows[r + k]) {
          const u = Math.max(a, c);
          const v = Math.min(b, d);
          if (v - u >= L) next.push([u, v]);
        }
        acc = next;
      }
      const hit = acc.find(([a, b]) => b - a >= L);
      if (hit) return { x: (hit[0] + hit[1]) / 2, y: y0 + r + L / 2 };
    }
    return null;
  };
  if (minSide > 0) {
    const c = fits(minSide);
    return c ? { side: minSide, center: c } : { side: 0, center: { x: NaN, y: NaN } };
  }
  let lo = 0;
  let hi = rows.length;
  let best: V2HitTarget = { side: 0, center: { x: NaN, y: NaN } };
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    const c = mid <= rows.length ? fits(mid) : null;
    if (c) {
      lo = mid;
      best = { side: mid, center: c };
    } else hi = mid - 1;
  }
  return best;
}

// ── Master baseline (master-safe minima) ───────────────────────────────

export interface V2MasterBaseline {
  visiblePhoto: number[];
  visibleOuter: number[];
  captionVisibleInk: (number | null)[];
  minima: { photo: number; outer: number; ink: number | null }[];
  outer: Point[][];
}

/** Witness transforms, Master media ratios, the case's caption texts. */
export function masterBaseline(m: V2Manifest, captions: readonly (string | null)[], measurer: CaptionMeasurer | null): V2MasterBaseline {
  const shapes = m.slots.map((s) => shapeAt(s, { width: masterMediaRatio(s) * 1000, height: 1000 }, 1));
  const outer = shapes.map((sh) => sh.outer0);
  const coversOf = (i: number) => m.slots.map((s, j) => (s.zIndex > m.slots[i].zIndex ? outer[j] : null)).filter((p): p is Point[] => !!p);
  const visiblePhoto = shapes.map((sh, i) => visibleFraction(sh.photo0, coversOf(i)));
  const visibleOuter = shapes.map((sh, i) => visibleFraction(sh.outer0, coversOf(i)));
  const inkVisible = shapes.map((sh, i) => {
    const text = captions[i];
    if (!text || !measurer) return null;
    const obstacles = coversOf(i).map((p, k) => ({ slotId: `c${k}`, polygon: p }));
    return captionVisibleInk(sh.slot, sh.layout, layoutCaption(sh.slot, sh.layout, text, measurer, obstacles), coversOf(i));
  });
  const o = A13_V2_CONTRACT.occlusion;
  return {
    visiblePhoto,
    visibleOuter,
    captionVisibleInk: inkVisible,
    minima: m.slots.map((_, i) => ({
      photo: Math.min(o.hardMinimumVisiblePhotoFractionCap, visiblePhoto[i]),
      outer: Math.min(o.hardMinimumVisibleOuterFractionCap, visibleOuter[i]),
      ink: inkVisible[i] === null ? null : Math.min(A13_V2_CONTRACT.caption.hardMinimumVisibleInkFractionCap, inkVisible[i]!),
    })),
    outer,
  };
}

// ── Candidates ─────────────────────────────────────────────────────────

interface Cand {
  si: number; // index into the slot's scale list
  d: Vec;
  cost: number;
  tier: number;
}

function sideCost(v: number, lo: number, hi: number) {
  return v >= 0 ? (hi > 0 ? v / hi : 0) : lo < 0 ? v / -lo : 0;
}

function scaleList(v: V2Slot) {
  const [h0, h1] = v.scaleBounds.hard;
  const out: number[] = [];
  for (let k = Math.round(h0 / SCALE_STEP); k * SCALE_STEP <= h1 + 1e-9; k++) out.push(Math.round(k * SCALE_STEP * 1000) / 1000);
  return out;
}

function scaleCost(v: V2Slot, s: number) {
  const [p0, p1] = v.scaleBounds.preferred;
  const tier = s < p0 - 1e-9 || s > p1 + 1e-9 ? 1 : 0;
  const c = s >= 1 ? (s - 1) / (p1 - 1) : (1 - s) / (1 - p0);
  return { tier, cost: c * c };
}

function translationList(v: V2Slot) {
  const t = v.territory;
  const out: { d: Vec; cost: number }[] = [];
  for (let kx = Math.ceil(t.xMin / TRANSLATION_STEP); kx * TRANSLATION_STEP <= t.xMax; kx++) {
    for (let ky = Math.ceil(t.yMin / TRANSLATION_STEP); ky * TRANSLATION_STEP <= t.yMax; ky++) {
      const d = { x: kx * TRANSLATION_STEP, y: ky * TRANSLATION_STEP };
      out.push({ d, cost: sideCost(d.x, t.xMin, t.xMax) ** 2 + sideCost(d.y, t.yMin, t.yMax) ** 2 });
    }
  }
  out.sort((a, b) => a.cost - b.cost || Math.abs(a.d.x) + Math.abs(a.d.y) - (Math.abs(b.d.x) + Math.abs(b.d.y)) || a.d.y - b.d.y || a.d.x - b.d.x);
  return out;
}

/** Candidate key: tier first, then Master distance, then larger scale. */
const TIER = 1000;
function keyLess(a: Cand, b: Cand, scales: number[]) {
  const ka = a.tier * TIER + a.cost;
  const kb = b.tier * TIER + b.cost;
  if (ka !== kb) return ka < kb;
  if (scales[a.si] !== scales[b.si]) return scales[a.si] > scales[b.si];
  const da = Math.abs(a.d.x) + Math.abs(a.d.y);
  const db = Math.abs(b.d.x) + Math.abs(b.d.y);
  if (da !== db) return da < db;
  return a.d.y !== b.d.y ? a.d.y < b.d.y : a.d.x < b.d.x;
}

class MinHeap<T> {
  private a: T[] = [];
  constructor(private less: (x: T, y: T) => boolean) {}
  get size() {
    return this.a.length;
  }
  push(v: T) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Per-slot stream of candidates valid ALONE (canvas, title), in candidate
 * order: lazy merge of the sorted scale list and sorted translation list.
 */
class SlotStream {
  readonly scales: number[];
  readonly shapes = new Map<number, Shape>();
  private readonly sOrder: { si: number; tier: number; cost: number }[];
  private readonly tList: { d: Vec; cost: number }[];
  private readonly heap: MinHeap<{ a: number; b: number; c: Cand }>;
  private readonly seen = new Set<number>();
  readonly valid: Cand[] = [];
  exhausted = false;
  rejectedByTitle = 0;
  rejectedByCanvas = 0;

  constructor(
    readonly v: V2Slot,
    readonly source: PhotoSource,
    readonly title: GlyphMask,
  ) {
    this.scales = scaleList(v);
    this.sOrder = this.scales.map((s, si) => ({ si, ...scaleCost(v, s) })).sort((x, y) => x.tier * TIER + x.cost - (y.tier * TIER + y.cost) || this.scales[y.si] - this.scales[x.si]);
    this.tList = translationList(v);
    this.heap = new MinHeap((x, y) => keyLess(x.c, y.c, this.scales));
    this.pushPair(0, 0);
  }

  shape(si: number) {
    let sh = this.shapes.get(si);
    if (!sh) {
      sh = shapeAt(this.v, this.source, this.scales[si]);
      this.shapes.set(si, sh);
    }
    return sh;
  }

  private pushPair(a: number, b: number) {
    if (a >= this.sOrder.length || b >= this.tList.length) return;
    const key = a * 100000 + b;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const so = this.sOrder[a];
    const t = this.tList[b];
    this.heap.push({ a, b, c: { si: so.si, d: t.d, cost: so.cost + t.cost, tier: so.tier } });
  }

  aloneOk(c: Cand) {
    const sh = this.shape(c.si);
    const [x0, y0, x1, y1] = sh.bbox;
    const W = A13_V2_CONTRACT.canvas.width;
    const H = A13_V2_CONTRACT.canvas.height;
    if (x0 + c.d.x < -1e-9 || y0 + c.d.y < -1e-9 || x1 + c.d.x > W + 1e-9 || y1 + c.d.y > H + 1e-9) {
      this.rejectedByCanvas++;
      return false;
    }
    if (polygonHitsMask(add(sh.outer0, c.d), this.title)) {
      this.rejectedByTitle++;
      return false;
    }
    return true;
  }

  /** Valid candidate #k (extends the stream lazily), or null. */
  at(k: number): Cand | null {
    while (this.valid.length <= k && !this.exhausted) {
      const top = this.heap.pop();
      if (!top) {
        this.exhausted = true;
        break;
      }
      this.pushPair(top.a + 1, top.b);
      this.pushPair(top.a, top.b + 1);
      if (this.aloneOk(top.c)) this.valid.push(top.c);
    }
    return this.valid[k] ?? null;
  }
}

// ── Joint evaluation ───────────────────────────────────────────────────

interface Placed {
  shape: Shape;
  slot: A13Slot;
  outer: Point[];
  photo: Point[];
  d: Vec;
}

function place(v: V2Slot, sh: Shape, d: Vec): Placed {
  const center = { x: v.witness.center.x + d.x, y: v.witness.center.y + d.y };
  return { shape: sh, slot: { ...sh.slot, center }, outer: add(sh.outer0, d), photo: add(sh.photo0, d), d };
}

interface JointEval {
  failures: V2Failure[];
  captions: (CaptionLayout | null)[];
  photo: number[];
  outer: number[];
  ink: (number | null)[];
  hit: V2HitTarget[];
}

function evaluate(m: V2Manifest, placed: Placed[], input: V2Input, base: V2MasterBaseline, full: boolean): JointEval {
  const failures: V2Failure[] = [];
  const n = placed.length;
  const coversOf = (i: number) => placed.filter((_, j) => m.slots[j].zIndex > m.slots[i].zIndex).map((p) => p.outer);
  // Role: the dominant slot keeps the largest outer area.
  const dom = m.slots.findIndex((s) => s.role.startsWith("dominant"));
  if (dom >= 0) {
    const maxOther = Math.max(...placed.filter((_, j) => j !== dom).map((p) => p.shape.area));
    if (placed[dom].shape.area < maxOther - EPS) failures.push({ slotId: m.slots[dom].slotId, rule: "dominance", value: placed[dom].shape.area, minimum: maxOther });
  }
  const photo: number[] = [];
  const outer: number[] = [];
  const ink: (number | null)[] = [];
  const captions: (CaptionLayout | null)[] = [];
  const hit: V2HitTarget[] = [];
  for (let i = 0; i < n; i++) {
    const covers = coversOf(i);
    const min = base.minima[i];
    const id = m.slots[i].slotId;
    photo[i] = visibleFraction(placed[i].photo, covers);
    outer[i] = visibleFraction(placed[i].outer, covers);
    if (photo[i] < min.photo - EPS) failures.push({ slotId: id, rule: "visible-photo", value: photo[i], minimum: min.photo });
    if (outer[i] < min.outer - EPS) failures.push({ slotId: id, rule: "visible-outer", value: outer[i], minimum: min.outer });
    const text = input.captions[i];
    if (text && input.measurer) {
      const obstacles = placed.filter((_, j) => m.slots[j].zIndex > m.slots[i].zIndex).map((p) => ({ slotId: p.slot.slotId, polygon: p.outer }));
      const c = layoutCaption(placed[i].slot, placed[i].shape.layout, text, input.measurer, obstacles);
      captions[i] = c;
      ink[i] = captionVisibleInk(placed[i].slot, placed[i].shape.layout, c, covers);
      // QG final arbitration: caption ink visibility is a SOFT preference
      // (ranking, diagnosis, QA) — never a placement hard-fail.
    } else {
      captions[i] = null;
      ink[i] = null;
    }
    if (!failures.length || full) {
      const need = A13_V2_CONTRACT.accessibility.minimumConnectedHitTargetCssPx[0];
      const h = largestVisibleSquare(placed[i].outer, covers, full ? 0 : need);
      hit[i] = h;
      if (h.side < need) failures.push({ slotId: id, rule: "hit-target", value: h.side, minimum: need });
    }
    if (failures.length && !full) break;
  }
  return { failures, captions, photo, outer, ink, hit };
}

function deficit(f: V2Failure[]) {
  return f.reduce((s, x) => s + Math.max(0, (x.minimum - x.value) / (x.minimum || 1)), 0);
}

// ── Soft relations (measured, never rejecting) ─────────────────────────

function relations(m: V2Manifest, placed: Placed[], witness: Point[][]): V2Relations {
  const idx = (id: string) => m.slots.findIndex((s) => s.slotId === id);
  const centerOf = (i: number) => placed[i].slot.center;
  const out: V2Relations = { pair: [], near: [], overlap: [], stack: [] };
  for (const r of m.relations) {
    if (r.type === "pair-coherence") {
      const [a, b] = r.members.map(idx);
      const pr = pairRelation(r, witness[a], witness[b], placed[a].outer, placed[b].outer);
      out.pair.push({ ...pr, frontBackOk: m.slots[idx(r.witness.front)].zIndex > m.slots[idx(r.witness.back)].zIndex });
    } else if (r.type === "near") {
      const ids = r.members.map(idx);
      const pairs: [number, number][] = [];
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) pairs.push([ids[a], ids[b]]);
      const mean = (f: (i: number) => Point) => pairs.reduce((s, [a, b]) => s + Math.hypot(f(a).x - f(b).x, f(a).y - f(b).y), 0) / pairs.length;
      const distance = mean(centerOf);
      const wd = mean((i) => m.slots[i].witness.center);
      const tol = r.preferredTolerancePx ?? null;
      out.near.push({ members: r.members, distance, witness: r.witnessCenterDistance ?? wd, tolerance: tol, satisfied: tol === null ? null : Math.abs(distance - (r.witnessCenterDistance ?? wd)) <= tol + 1e-9 });
    } else if (r.type === "overlap") {
      const f = idx(r.front);
      const b = idx(r.back);
      const area = convexIntersectionArea(placed[f].outer, placed[b].outer);
      const wArea = convexIntersectionArea(witness[f], witness[b]);
      const gap = polygonGap(placed[f].outer, placed[b].outer);
      const wGap = polygonGap(witness[f], witness[b]);
      out.overlap.push({ front: r.front, back: r.back, target: r.target, areaPx2: area, gapPx: gap, witnessAreaPx2: wArea, witnessGapPx: wGap, preserved: wArea > EPS ? area > EPS : gap <= wGap + 1e-9 });
    } else {
      const [u, l] = r.members.map(idx);
      const upperAbove = centerOf(u).y < centerOf(l).y;
      const frontOnTop = m.slots[l].zIndex > m.slots[u].zIndex;
      out.stack.push({ members: r.members, upperAbove, frontOnTop, satisfied: upperAbove && frontOnTop });
    }
  }
  return out;
}

// ── V2.1 essential pair relation (G2-PAIR) ────────────────────────────

/**
 * Signed outer hull gap between two convex polygons: the Euclidean gap when
 * apart, 0 at contact, minus the penetration depth (separating-axis minimum
 * overlap) when they overlap. Convex in the relative translation.
 */
export function signedHullGap(a: Point[], b: Point[]): number {
  if (convexIntersectionArea(a, b) <= EPS) return polygonGap(a, b);
  let depth = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const nx = (q.y - p.y) / len;
      const ny = (p.x - q.x) / len;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        a0 = Math.min(a0, d);
        a1 = Math.max(a1, d);
      }
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        b0 = Math.min(b0, d);
        b1 = Math.max(b1, d);
      }
      depth = Math.min(depth, Math.min(a1, b1) - Math.max(a0, b0));
    }
  }
  return -depth;
}

/** Convex hull (monotone chain), counter-clockwise in canvas axes. */
function convexHull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Point[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/**
 * Minkowski difference M = A − B: B + t meets A iff t ∈ M, and the signed
 * hull gap of (A, B + t) is the signed distance from t to M.
 */
function minkowskiDifference(a: Point[], b: Point[]) {
  const pts: Point[] = [];
  for (const u of a) for (const v of b) pts.push({ x: u.x - v.x, y: u.y - v.y });
  return convexHull(pts);
}

/** Signed distance from a point to a convex polygon (negative inside). */
function signedDistanceToConvex(t: Point, m: Point[]) {
  let d = Infinity;
  let inside = true;
  let sign = 0;
  for (let i = 0; i < m.length; i++) {
    const a = m[i];
    const b = m[(i + 1) % m.length];
    d = Math.min(d, segDist(t, a, b));
    const c = (b.x - a.x) * (t.y - a.y) - (b.y - a.y) * (t.x - a.x);
    if (c !== 0) {
      const sg = c > 0 ? 1 : -1;
      if (sign === 0) sign = sg;
      else if (sg !== sign) inside = false;
    }
  }
  return inside ? -d : d;
}

type PairRel = Extract<V2Manifest["relations"][number], { type: "pair-coherence" }>;

/** Diagonal of an outer paper quad (corners 0 and 2 are opposite). */
const diagonal = (p: Point[]) => Math.hypot(p[2].x - p[0].x, p[2].y - p[0].y);

function pairRelation(r: PairRel, wa: Point[], wb: Point[], a: Point[], b: Point[]): Omit<V2PairRelation, "frontBackOk"> {
  const witnessGapPx = signedHullGap(wa, wb);
  const gapPx = signedHullGap(a, b);
  const driftPx = Math.abs(gapPx - witnessGapPx);
  const diag = Math.min(diagonal(wa), diagonal(wb));
  return { relationId: r.relationId, members: r.members, gapPx, witnessGapPx, driftPx, deadbandPx: r.deadbandPx, loss: Math.max(0, driftPx - r.deadbandPx) / diag };
}

// ── Solve ──────────────────────────────────────────────────────────────

function finish(input: V2Input, m: V2Manifest, base: V2MasterBaseline, placed: Placed[], tiers: number[], cost: number, tested: number): V2Result {
  const full = evaluate(m, placed, input, base, true);
  const slots: V2SlotResult[] = placed.map((p, i) => ({
    slotId: m.slots[i].slotId,
    role: m.slots[i].role,
    slot: p.slot,
    layout: p.shape.layout,
    caption: full.captions[i],
    scale: p.shape.s,
    translation: p.d,
    center: p.slot.center,
    area: p.shape.area,
    scaleInPreferred: tiers[i] === 0,
    visiblePhoto: full.photo[i],
    visibleOuter: full.outer[i],
    captionVisibleInk: full.ink[i],
    minima: base.minima[i],
    hitTarget: full.hit[i],
  }));
  const rel = relations(m, placed, base.outer);
  // Metric signals only — the ARTISTIC REVIEW verdict is visual (QG).
  const signals: string[] = [];
  for (const r of rel.pair) if (r.loss > 0) signals.push(`${r.relationId} : écart de coque ${r.gapPx.toFixed(1)} px (témoin ${r.witnessGapPx.toFixed(1)}, dérive ${r.driftPx.toFixed(1)} > ${r.deadbandPx})`);
  for (const s of slots) if (!s.scaleInPreferred) signals.push(`${s.slotId} échelle ${s.scale.toFixed(3)} hors plage préférée`);
  for (const r of rel.overlap) if (!r.preserved) signals.push(`overlap ${r.front}/${r.back} : aire ${r.areaPx2.toFixed(0)} px², écart ${r.gapPx.toFixed(1)} px (témoin ${r.witnessAreaPx2.toFixed(0)} px²)`);
  for (const r of rel.stack) if (!r.satisfied) signals.push(`stack ${r.members.join("/")} inversée`);
  for (const s of slots) if (s.captionVisibleInk !== null && 1 - s.captionVisibleInk > A13_V2_CONTRACT.caption.preferredMaximumInkOcclusion + 1e-9) signals.push(`${s.slotId} caption occultée à ${((1 - s.captionVisibleInk) * 100).toFixed(1)} %`);
  return { state: input.state, status: "PASS", slots, masterCost: cost, relations: rel, signals, jointCandidates: tested };
}

function stopResult(input: V2Input, code: V2Stop, tested: number, stop: V2Result["stop"]): V2Result {
  return { state: input.state, status: code, slots: [], masterCost: NaN, relations: null, signals: [], jointCandidates: tested, stop };
}

export function solveV2(input: V2Input): V2Result {
  const m = A13_V2_MANIFESTS[input.state];
  const base = masterBaseline(m, input.captions, input.measurer);
  const streams = m.slots.map((s, i) => new SlotStream(s, input.sources[i], input.titleMask));

  // A slot with no candidate valid alone: structural STOP.
  for (let i = 0; i < streams.length; i++) {
    if (!streams[i].at(0)) {
      const st = streams[i];
      const code: V2Stop = st.rejectedByTitle > 0 ? "TITLE_COLLISION_STOP" : "NO_CANDIDATE_WITHIN_TERRITORIES_STOP";
      return stopResult(input, code, 0, { rule: code === "TITLE_COLLISION_STOP" ? "title" : "canvas", detail: `${m.slots[i].slotId} : aucune position valide seule (titre ${st.rejectedByTitle}, canvas ${st.rejectedByCanvas} candidats rejetés)` });
    }
  }

  const pair = m.relations.find((r): r is PairRel => r.type === "pair-coherence" && r.essentialSoftPreference);
  if (pair && m.slots.length === 2) return solvePair(input, m, base, pair, streams);

  // Joint best-first over per-slot candidate indices, by summed key.
  const keyOf = (ix: number[]) => ix.reduce((s, k, i) => {
    const c = streams[i].at(k)!;
    return s + c.tier * TIER + c.cost;
  }, 0);
  const tieOf = (ix: number[]) => ix.reduce((s, k, i) => s - streams[i].scales[streams[i].at(k)!.si], 0);
  const heap = new MinHeap<{ ix: number[]; key: number; tie: number; id: string }>((a, b) => (a.key !== b.key ? a.key < b.key : a.tie !== b.tie ? a.tie < b.tie : a.id < b.id));
  const seen = new Set<string>();
  const push = (ix: number[]) => {
    if (ix.some((k, i) => !streams[i].at(k))) return;
    const id = ix.join(",");
    if (seen.has(id)) return;
    seen.add(id);
    heap.push({ ix, key: keyOf(ix), tie: tieOf(ix), id: ix.map((k) => String(k).padStart(7, "0")).join(",") });
  };
  push(m.slots.map(() => 0));
  let tested = 0;
  let best: { failures: V2Failure[]; masterCost: number; def: number } | null = null;
  while (heap.size && tested < MAX_JOINT) {
    const top = heap.pop()!;
    tested++;
    const cands = top.ix.map((k, i) => streams[i].at(k)!);
    const placed = cands.map((c, i) => place(m.slots[i], streams[i].shape(c.si), c.d));
    const ev = evaluate(m, placed, input, base, false);
    if (!ev.failures.length) return finish(input, m, base, placed, cands.map((c) => c.tier), cands.reduce((s, c) => s + c.cost, 0), tested);
    const def = deficit(ev.failures);
    if (!best || def < best.def) best = { failures: ev.failures, masterCost: cands.reduce((s, c) => s + c.cost, 0), def };
    for (let i = 0; i < top.ix.length; i++) {
      const nx = [...top.ix];
      nx[i]++;
      push(nx);
    }
  }
  // Budget reached without exhausting the space: deterministic local repair
  // (same hard rules, same ranking) before any STOP is declared.
  if (heap.size) {
    const rep = localRepair(m, input, base, streams, best?.failures ?? []);
    if (rep) {
      const res = finish(input, m, base, rep.placed, rep.tiers, rep.cost, tested + rep.tested);
      res.search = `réparation locale (${rep.moved.join(" + ")})`;
      return res;
    }
  }
  const rules = new Set(best?.failures.map((f) => f.rule));
  const access = rules.has("hit-target") || rules.has("visible-photo") || rules.has("visible-outer");
  return stopResult(input, access ? "GALLERY_ITEM_INACCESSIBLE_STOP" : "NO_CANDIDATE_WITHIN_TERRITORIES_STOP", tested, {
    rule: [...rules].join(", "),
    detail: heap.size ? `recherche arrêtée après ${tested} candidats joints (plafond)` : `espace de candidats épuisé (${tested} candidats joints)`,
    best: best ? { failures: best.failures, masterCost: best.masterCost } : undefined,
  });
}

const REPAIR_BUDGET = 30000;

/**
 * Local repair after the joint best-first budget: every other slot stays at
 * its individually closest valid candidate; the slots involved in the
 * remaining failure (the failing slot and the slots above it) are moved —
 * one at a time, then two at a time — in increasing Master distance. The
 * cheapest valid composition found is kept. Same hard rules; no new rule.
 */
function localRepair(m: V2Manifest, input: V2Input, base: V2MasterBaseline, streams: SlotStream[], failures: V2Failure[]) {
  const failing = [...new Set(failures.map((f) => m.slots.findIndex((s) => s.slotId === f.slotId)))].filter((i) => i >= 0);
  const movers = new Set<number>();
  for (const i of failing) {
    movers.add(i);
    m.slots.forEach((s, j) => {
      if (s.zIndex > m.slots[i].zIndex) movers.add(j);
    });
  }
  const list = [...movers].sort((a, b) => a - b);
  let tested = 0;
  let best: { cost: number; ix: number[]; moved: string[] } | null = null;
  const costOf = (ix: number[]) => ix.reduce((s, k, i) => s + streams[i].at(k)!.tier * TIER + streams[i].at(k)!.cost, 0);
  const valid = (ix: number[]) => {
    tested++;
    const cands = ix.map((k, i) => streams[i].at(k)!);
    const placed = cands.map((c, i) => place(m.slots[i], streams[i].shape(c.si), c.d));
    return evaluate(m, placed, input, base, false).failures.length === 0;
  };
  const zero = m.slots.map(() => 0);
  // One slot at a time.
  for (const i of list) {
    for (let k = 1; k < REPAIR_BUDGET && streams[i].at(k); k++) {
      const ix = [...zero];
      ix[i] = k;
      const c = costOf(ix);
      if (best && c >= best.cost - 1e-12) break;
      if (valid(ix)) {
        best = { cost: c, ix, moved: [m.slots[i].slotId] };
        break;
      }
    }
  }
  // Two slots at a time (best-first on their summed distance).
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const [i, j] = [list[a], list[b]];
      const heap = new MinHeap<{ ki: number; kj: number; c: number }>((x, y) => (x.c !== y.c ? x.c < y.c : x.ki !== y.ki ? x.ki < y.ki : x.kj < y.kj));
      const seen = new Set<number>();
      const push = (ki: number, kj: number) => {
        if (!streams[i].at(ki) || !streams[j].at(kj)) return;
        const key = ki * 1000003 + kj;
        if (seen.has(key)) return;
        seen.add(key);
        const ix = [...zero];
        ix[i] = ki;
        ix[j] = kj;
        heap.push({ ki, kj, c: costOf(ix) });
      };
      push(0, 0);
      for (let n = 0; n < REPAIR_BUDGET && heap.size; n++) {
        const t = heap.pop()!;
        if (best && t.c >= best.cost - 1e-12) break;
        const ix = [...zero];
        ix[i] = t.ki;
        ix[j] = t.kj;
        if (valid(ix)) {
          best = { cost: t.c, ix, moved: [m.slots[i].slotId, m.slots[j].slotId] };
          break;
        }
        push(t.ki + 1, t.kj);
        push(t.ki, t.kj + 1);
      }
    }
  }
  if (!best) return null;
  const cands = best.ix.map((k, i) => streams[i].at(k)!);
  return {
    placed: cands.map((c, i) => place(m.slots[i], streams[i].shape(c.si), c.d)),
    tiers: cands.map((c) => c.tier),
    cost: cands.reduce((s, c) => s + c.cost, 0),
    tested,
    moved: best.moved,
  };
}

/**
 * Two-slot state with an essential pair relation (G2). Exact on the lattice
 * for the ranking [pair loss, scale tier, individual drift]:
 * - the pair loss depends only on the scales and on t = d2 − d1; the signed
 *   hull gap is convex in t, so its range over the admissible t-rectangle
 *   is [ternary-search minimum, corner maximum] → each scale pair gets an
 *   exact "loss 0 reachable" test or its minimal loss;
 * - the individual drift is separable: for a given t, the best d1 per axis
 *   is a 1-D scan (d2 = d1 + t), so t values are visited in increasing drift
 *   and the first valid one with loss 0 is optimal for that scale pair.
 */
function solvePair(input: V2Input, m: V2Manifest, base: V2MasterBaseline, rel: PairRel, streams: SlotStream[]): V2Result {
  const W = A13_V2_CONTRACT.canvas.width;
  const H = A13_V2_CONTRACT.canvas.height;
  const ia = m.slots.findIndex((s) => s.slotId === rel.members[0]);
  const ib = m.slots.findIndex((s) => s.slotId === rel.members[1]);
  const idx = [ia, ib];
  const gw = signedHullGap(base.outer[ia], base.outer[ib]);
  const diag = Math.min(diagonal(base.outer[ia]), diagonal(base.outer[ib]));
  const lossOf = (g: number) => Math.max(0, Math.abs(g - gw) - rel.deadbandPx) / diag;
  const bandLo = gw - rel.deadbandPx;
  const bandHi = gw + rel.deadbandPx;
  const st = TRANSLATION_STEP;

  interface Axis {
    k0: number;
    k1: number;
    cost: (k: number) => number;
  }
  interface Opt {
    si: number;
    s: number;
    tier: number;
    cost: number;
    shape: Shape;
    ax: Axis;
    ay: Axis;
  }
  const options = idx.map((i) => {
    const v = m.slots[i];
    const t = v.territory;
    return streams[i].scales.map((s, si): Opt | null => {
      const sh = streams[i].shape(si);
      const [x0, y0, x1, y1] = sh.bbox;
      const ax: Axis = { k0: Math.ceil(Math.max(t.xMin, -x0) / st - 1e-9), k1: Math.floor(Math.min(t.xMax, W - x1) / st + 1e-9), cost: (k) => sideCost(k * st, t.xMin, t.xMax) ** 2 };
      const ay: Axis = { k0: Math.ceil(Math.max(t.yMin, -y0) / st - 1e-9), k1: Math.floor(Math.min(t.yMax, H - y1) / st + 1e-9), cost: (k) => sideCost(k * st, t.yMin, t.yMax) ** 2 };
      if (ax.k0 > ax.k1 || ay.k0 > ay.k1) return null;
      return { si, s, ...scaleCost(v, s), shape: sh, ax, ay };
    }).filter((o): o is Opt => o !== null);
  });

  /** Best d1 per axis for each relative offset tk (d2 = d1 + tk). */
  const innerAxis = (a: Axis, b: Axis) => {
    const t0 = b.k0 - a.k1;
    const t1 = b.k1 - a.k0;
    const val = new Float64Array(t1 - t0 + 1).fill(Infinity);
    const arg = new Int32Array(t1 - t0 + 1);
    for (let k = a.k0; k <= a.k1; k++) {
      const ca = a.cost(k);
      for (let kb = b.k0; kb <= b.k1; kb++) {
        const c = ca + b.cost(kb);
        const j = kb - k - t0;
        if (c < val[j] - 1e-12 || (Math.abs(c - val[j]) <= 1e-12 && Math.abs(k) < Math.abs(arg[j]))) {
          val[j] = c;
          arg[j] = k;
        }
      }
    }
    return { t0, t1, val, arg };
  };

  let tested = 0;
  const held: { v: { L: number; tier: number; cost: number; placed: Placed[]; tiers: number[] } | null } = { v: null };
  const better = (L: number, tier: number, cost: number) => {
    const b = held.v;
    return !b || L < b.L - 1e-12 || (Math.abs(L - b.L) <= 1e-12 && (tier < b.tier || (tier === b.tier && cost < b.cost - 1e-12)));
  };

  /** Validate a concrete candidate (title for both, then joint hard rules). */
  const tryCandidate = (oa: Opt, ob: Opt, d1: Vec, t: Vec, L: number, cost: number) => {
    const d2 = { x: d1.x + t.x, y: d1.y + t.y };
    const pa = place(m.slots[ia], oa.shape, d1);
    const pb = place(m.slots[ib], ob.shape, d2);
    tested++;
    if (polygonHitsMask(pa.outer, input.titleMask) || polygonHitsMask(pb.outer, input.titleMask)) return false;
    const placed: Placed[] = [];
    placed[ia] = pa;
    placed[ib] = pb;
    if (evaluate(m, placed, input, base, false).failures.length) return false;
    const tiers: number[] = [];
    tiers[ia] = oa.tier;
    tiers[ib] = ob.tier;
    held.v = { L, tier: oa.tier + ob.tier, cost, placed, tiers };
    return true;
  };

  // Scale pairs, with the exact range of the signed hull gap over the
  // t-rectangle: gap(t) = signed distance from t to M = A − B (convex), so
  // its minimum is the rectangle ↔ M distance (≤ 0 when they meet) and its
  // maximum is reached at a corner.
  const pairs: { oa: Opt; ob: Opt; tier: number; cs: number; gmin: number; gmax: number; M: Point[]; rect: [number, number, number, number] }[] = [];
  for (const oa of options[0]) {
    for (const ob of options[1]) {
      const tx0 = (ob.ax.k0 - oa.ax.k1) * st;
      const tx1 = (ob.ax.k1 - oa.ax.k0) * st;
      const ty0 = (ob.ay.k0 - oa.ay.k1) * st;
      const ty1 = (ob.ay.k1 - oa.ay.k0) * st;
      const M = minkowskiDifference(oa.shape.outer0, ob.shape.outer0);
      const R = [
        { x: tx0, y: ty0 },
        { x: tx1, y: ty0 },
        { x: tx1, y: ty1 },
        { x: tx0, y: ty1 },
      ];
      const gmin = convexIntersectionArea(R, M) > EPS || M.some((v) => v.x >= tx0 && v.x <= tx1 && v.y >= ty0 && v.y <= ty1) ? -Infinity : polygonGap(R, M);
      const gmax = Math.max(...R.map((c) => signedDistanceToConvex(c, M)));
      pairs.push({ oa, ob, tier: oa.tier + ob.tier, cs: oa.cost + ob.cost, gmin, gmax, M, rect: [tx0, ty0, tx1, ty1] });
    }
  }
  pairs.sort((p, q) => p.tier - q.tier || p.cs - q.cs || q.oa.s + q.ob.s - (p.oa.s + p.ob.s));

  // 1 — pairs where the deadband is reachable: loss 0, least drift first.
  for (const pr of pairs) {
    if (pr.gmin > bandHi || pr.gmax < bandLo) continue;
    if (held.v && held.v.L === 0 && (pr.tier > held.v.tier || (pr.tier === held.v.tier && pr.cs >= held.v.cost - 1e-12))) break;
    const ix = innerAxis(pr.oa.ax, pr.ob.ax);
    const iy = innerAxis(pr.oa.ay, pr.ob.ay);
    const ts: { kx: number; ky: number; c: number }[] = [];
    for (let kx = ix.t0; kx <= ix.t1; kx++) {
      const vx = ix.val[kx - ix.t0];
      if (!Number.isFinite(vx)) continue;
      for (let ky = iy.t0; ky <= iy.t1; ky++) {
        const vy = iy.val[ky - iy.t0];
        if (Number.isFinite(vy)) ts.push({ kx, ky, c: vx + vy });
      }
    }
    ts.sort((a, b) => a.c - b.c || Math.abs(a.kx) + Math.abs(a.ky) - (Math.abs(b.kx) + Math.abs(b.ky)) || a.ky - b.ky || a.kx - b.kx);
    for (const t of ts) {
      const cost = pr.cs + t.c;
      if (held.v && held.v.L === 0 && (pr.tier > held.v.tier || (pr.tier === held.v.tier && cost >= held.v.cost - 1e-12))) break;
      const tv = { x: t.kx * st, y: t.ky * st };
      if (lossOf(signedDistanceToConvex(tv, pr.M)) > 0) continue;
      const d1 = { x: ix.arg[t.kx - ix.t0] * st, y: iy.arg[t.ky - iy.t0] * st };
      if (better(0, pr.tier, cost) && tryCandidate(pr.oa, pr.ob, d1, tv, 0, cost)) break;
    }
  }

  // 2 — deadband reachable nowhere: smallest loss first. For each pair the
  // continuous bound orders the pairs; its lattice t are then visited by
  // (loss, drift) until a valid candidate exists.
  if (!held.v) {
    const cand = pairs
      .map((pr) => ({ pr, L: pr.gmin > bandHi ? lossOf(pr.gmin) : pr.gmax < bandLo ? lossOf(pr.gmax) : 0 }))
      .sort((a, b) => a.L - b.L || a.pr.tier - b.pr.tier || a.pr.cs - b.pr.cs);
    let bestL = Infinity;
    for (const { pr, L } of cand) {
      if (L > bestL + 1e-12) break;
      const ix = innerAxis(pr.oa.ax, pr.ob.ax);
      const iy = innerAxis(pr.oa.ay, pr.ob.ay);
      const ts: { kx: number; ky: number; L: number; c: number }[] = [];
      for (let kx = ix.t0; kx <= ix.t1; kx++) {
        for (let ky = iy.t0; ky <= iy.t1; ky++) {
          const c = ix.val[kx - ix.t0] + iy.val[ky - iy.t0];
          if (Number.isFinite(c)) ts.push({ kx, ky, c, L: lossOf(signedDistanceToConvex({ x: kx * st, y: ky * st }, pr.M)) });
        }
      }
      ts.sort((a, b) => a.L - b.L || a.c - b.c);
      for (const t of ts) {
        if (!better(t.L, pr.tier, pr.cs + t.c)) break;
        const tv = { x: t.kx * st, y: t.ky * st };
        const d1 = { x: ix.arg[t.kx - ix.t0] * st, y: iy.arg[t.ky - iy.t0] * st };
        if (tryCandidate(pr.oa, pr.ob, d1, tv, t.L, pr.cs + t.c)) {
          bestL = t.L;
          break;
        }
      }
    }
  }

  const b = held.v;
  if (!b) return stopResult(input, "NO_CANDIDATE_WITHIN_TERRITORIES_STOP", tested, { rule: "pair-search", detail: `aucun candidat valide (${tested} candidats testés)` });
  return finish(input, m, base, b.placed, b.tiers, b.cost, tested);
}

// ── Master self-check (before any fixture) ─────────────────────────────

export interface V2SelfCheck {
  state: V2StateId;
  result: "MASTER SELF-CHECK: PASS" | "MANIFEST_REJECTS_OWN_MASTER_STOP";
  failures: string[];
  /** Information: is the exact witness transform itself collision-free? */
  witnessExact: { ok: boolean; failures: string[] };
  /** The runtime solution reproducing the Master grammar (PASS only). */
  solution: { slotId: string; translation: Point; scale: number }[];
  /** Largest visible square per print of that solution (interactivity QA). */
  hitTargets: V2HitTarget[];
}

/**
 * MASTER GRAMMAR SELF-CHECK (QG arbitration "TITLE AUTHORITY FINAL").
 * Master-safe means: with the Master media ratios, the real title mask,
 * the contractual rotations, roles, territories and V2/V2.1 rules, the
 * engine HAS a valid runtime solution — found by the ordinary solver, i.e.
 * the valid candidate closest to the Master. A local translation inside the
 * territory is allowed; the witness is not required to be pixel-immobile.
 * The exact witness transform is still evaluated and reported.
 */
export function masterSelfCheck(state: V2StateId, captions: readonly (string | null)[], measurer: CaptionMeasurer | null, titleMask: GlyphMask): V2SelfCheck {
  const m = A13_V2_MANIFESTS[state];
  const input: V2Input = { state, sources: m.slots.map((s) => ({ width: masterMediaRatio(s) * 1000, height: 1000 })), captions, measurer, titleMask };
  // Information: the exact witness transform.
  const base = masterBaseline(m, captions, measurer);
  const placed = m.slots.map((s, i) => place(s, shapeAt(s, input.sources[i], 1), { x: 0, y: 0 }));
  const exact: string[] = [];
  const W = A13_V2_CONTRACT.canvas.width;
  const H = A13_V2_CONTRACT.canvas.height;
  placed.forEach((p, i) => {
    if (p.outer.some((q) => q.x < -1e-9 || q.y < -1e-9 || q.x > W + 1e-9 || q.y > H + 1e-9)) exact.push(`${m.slots[i].slotId} hors canvas`);
    if (polygonHitsMask(p.outer, titleMask)) exact.push(`${m.slots[i].slotId} glyphes du titre`);
  });
  for (const f of evaluate(m, placed, input, base, true).failures) exact.push(`${f.slotId} ${f.rule} ${f.value.toFixed(3)} < ${f.minimum.toFixed(3)}`);
  // The grammar check proper: the ordinary V2/V2.1 solver.
  const r = solveV2(input);
  const pass = r.status === "PASS";
  return {
    state,
    result: pass ? "MASTER SELF-CHECK: PASS" : "MANIFEST_REJECTS_OWN_MASTER_STOP",
    failures: pass ? [] : [`${r.status} : ${r.stop?.rule ?? ""} ${r.stop?.detail ?? ""}`.trim()],
    witnessExact: { ok: exact.length === 0, failures: exact },
    solution: r.slots.map((s) => ({ slotId: s.slotId, translation: s.translation, scale: s.scale })),
    hitTargets: r.slots.map((s) => s.hitTarget),
  };
}
