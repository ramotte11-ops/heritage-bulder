import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import type { V2Slot } from "@/config/gallery-a13-v2-manifests";
import { A13_ALBUM_CANVAS, A13_ALBUM_HARD, A13_ALBUM_TOP_ZONE, type AlbumGrammar } from "@/config/album-a13-grammars";
import { A13_ALBUM_MASTER_PRINTS } from "@/config/album-a13-master-measurements";
import { layoutDynamicPolaroid, type PaperProfile, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { unionCoverArea } from "@/lib/memorial/gallery/manifest-calibration";
import { largestVisibleSquare, v2SlotToA13 } from "@/lib/memorial/gallery/gallery-v2";

/**
 * A13 Album — LOCAL group solver (Handoff §1, §6, JSON `localSolve`).
 *
 * One group = 2…5 media and one closed grammar. The solver never sees the
 * other media of the Album, their count, or the theme: its cost is bounded
 * by the group alone. The Polaroid is the GREEN DynamicPolaroid engine
 * (`layoutDynamicPolaroid`, unchanged): natural ratio, bounded format +
 * contain outside 0.67–1.78, no crop, no distortion.
 *
 * Variables per slot (the V2 architecture): a translation of the slot frame
 * inside its territory and a linear scale s (outer area = witness × s²).
 * Rotation, anchor, depth and the strict media → slot order are closed.
 *
 * HARD (reject): photo integrity (engine); slot territory and hard scale;
 * V1.1 canvas safe X 48…1622; first group only: page top and the Master top
 * ornament zone; identifiable — visible photo ≥ min(0.35, witness) and
 * visible paper ≥ min(0.30, witness); a 44 × 44 CSS px square in the
 * visible paper (connected hit target).
 * SOFT (rank only): witness drift (Master proximity) with one tier per slot
 * outside its preferred scale, then larger scale, then smaller
 * displacement. Captions are NOT an input: a caption never moves a tirage.
 *
 * Search: the V2 best-first on per-slot candidate streams (translation
 * step 2 px, scale step 0.005), candidates yielded in rank order, bounded
 * by `MAX_JOINT` joint evaluations per group. V1.1 scale 0.995 … 1.000:
 * the Master position first, then local translations, then scale.
 *
 * PROFILES (shared engine, one solver): the frame-dependent values — paper
 * tokens, canvas safe X, first-group top rules, hit target, minima and an
 * optional per-slot size rule — come from an `AlbumSolverProfile`. The
 * default is the Desktop Light profile, value for value the constants
 * used before profiles existed (Desktop geometry unchanged). A session may
 * also receive a CONTEXT: the already placed prints of the preceding group
 * (Mobile "local to the current group plus the preceding seam"), which
 * must stay identifiable and reachable under the incoming group.
 */

export const ALBUM_TRANSLATION_STEP = 2;
export const ALBUM_SCALE_STEP = 0.005;
export const ALBUM_MAX_JOINT = 20000;
const REPAIR_BUDGET = 30000;
const EPS = 1e-6;
const TIER = 1000;

export interface GroupShape {
  s: number;
  layout: PolaroidLayout;
  slot: A13Slot;
  outer0: Point[];
  photo0: Point[];
  bbox: [number, number, number, number];
  area: number;
}

export interface GroupPlacement {
  slotIndex: number;
  shape: GroupShape;
  d: Point;
  /** Polygons in the group frame (Master page frame, 1670). */
  outer: Point[];
  photo: Point[];
  tier: number;
  cost: number;
}

export interface GroupCandidate {
  rank: number;
  placements: GroupPlacement[];
  cost: number;
  visualTop: number;
  visualBottom: number;
}

export interface GroupFailure {
  slotId: string;
  rule: "visible-photo" | "visible-outer" | "visible-area" | "hit-target";
  value: number;
  minimum: number;
}

export const add = (p: Point[], d: Point) => p.map((q) => ({ x: q.x + d.x, y: q.y + d.y }));

/** Frame-dependent values of the shared local solver. */
export interface AlbumSolverProfile {
  id: string;
  /** DynamicPolaroid paper (frame px); undefined = the Desktop V2.1 paper. */
  paper?: PaperProfile;
  /** Every outer paper stays inside x ∈ [safeX[0], safeX[1]] (frame px). */
  safeX: readonly [number, number];
  /** First group only: lowest allowed paper y, and a protected zone (or null). */
  firstGroupMinY: number;
  firstGroupZone: Point[] | null;
  /** Side of the connected visible square required in every print (frame px). */
  hitTargetPx: number;
  /** Optional: minimum visible paper AREA of every covered print (frame px²). */
  minVisibleOuterArea?: number;
  /** Per-slot minima (visible photo / visible paper fraction). */
  minima(slots: readonly V2Slot[]): { photo: number; outer: number }[];
  /** Optional per-slot shape rule for a candidate alone (true = allowed). */
  shapeAllowed?: (slotIndex: number, shape: GroupShape) => boolean;
}

function polyArea(p: Point[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Visible fraction of `target` under the union of `covers` (exact, convex). */
export function visibleFraction(target: Point[], covers: Point[][]) {
  const a = polyArea(target);
  if (a <= EPS) return 0;
  const rel = covers.filter((c) => convexIntersectionArea(target, c) > EPS);
  return Math.max(0, 1 - unionCoverArea(target, rel) / a);
}

export function shapeAt(v: V2Slot, source: PhotoSource, s: number, paper?: PaperProfile): GroupShape {
  const slot = v2SlotToA13(v);
  const layout = paper ? layoutDynamicPolaroid(slot, source, s * s, paper) : layoutDynamicPolaroid(slot, source, s * s);
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

/** Master media ratio of a slot = its measured photo-window ratio. */
export function witnessMediaRatio(v: V2Slot) {
  const id = v.slotId.split("-").pop();
  const p = A13_ALBUM_MASTER_PRINTS.find((x) => x.id === id);
  return p ? p.windowSize.width / p.windowSize.height : v.witness.outerSize.width / v.witness.outerSize.height;
}

/** Witness minima per slot: min(cap, witness visible fraction) in-group. */
export function groupMinima(g: Pick<AlbumGrammar, "slots">) {
  const shapes = g.slots.map((v) => shapeAt(v, { width: witnessMediaRatio(v) * 1000, height: 1000 }, 1));
  const coversOf = (i: number) => g.slots.map((v, j) => (v.zIndex > g.slots[i].zIndex ? shapes[j].outer0 : null)).filter((p): p is Point[] => !!p);
  return shapes.map((sh, i) => ({
    photo: Math.min(A13_ALBUM_HARD.hardMinimumVisiblePhotoFractionCap, visibleFraction(sh.photo0, coversOf(i))),
    outer: Math.min(A13_ALBUM_HARD.hardMinimumVisibleOuterFractionCap, visibleFraction(sh.outer0, coversOf(i))),
  }));
}

// ── Per-slot candidate stream (lazy merge of scale × translation lists) ──

interface Cand {
  si: number;
  d: Point;
  cost: number;
  tier: number;
}

function sideCost(v: number, lo: number, hi: number) {
  return v >= 0 ? (hi > 0 ? v / hi : 0) : lo < 0 ? v / -lo : 0;
}

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

export class MinHeap<T> {
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

const TOP_ZONE: Point[] = [
  { x: A13_ALBUM_TOP_ZONE.x0, y: A13_ALBUM_TOP_ZONE.y0 },
  { x: A13_ALBUM_TOP_ZONE.x1, y: A13_ALBUM_TOP_ZONE.y0 },
  { x: A13_ALBUM_TOP_ZONE.x1, y: A13_ALBUM_TOP_ZONE.y1 },
  { x: A13_ALBUM_TOP_ZONE.x0, y: A13_ALBUM_TOP_ZONE.y1 },
];

/** Desktop Light: the constants of the solver before profiles (unchanged). */
export const DESKTOP_ALBUM_SOLVER_PROFILE: AlbumSolverProfile = {
  id: "desktop-light",
  safeX: A13_ALBUM_CANVAS.safeX,
  firstGroupMinY: 0,
  firstGroupZone: TOP_ZONE,
  hitTargetPx: A13_ALBUM_HARD.minimumConnectedHitTargetCssPx,
  minima: (slots) => groupMinima({ slots }),
};

class SlotStream {
  readonly scales: number[];
  private readonly shapes = new Map<number, GroupShape>();
  private readonly sOrder: { si: number; tier: number; cost: number }[];
  private readonly tList: { d: Point; cost: number }[];
  private readonly heap: MinHeap<{ a: number; b: number; c: Cand }>;
  private readonly seen = new Set<number>();
  readonly valid: Cand[] = [];
  exhausted = false;
  rejected = { canvas: 0, topZone: 0, size: 0 };

  constructor(
    readonly v: V2Slot,
    readonly source: PhotoSource,
    readonly first: boolean,
    readonly profile: AlbumSolverProfile = DESKTOP_ALBUM_SOLVER_PROFILE,
    readonly index = 0,
  ) {
    const [h0, h1] = v.scaleBounds.hard;
    const [p0, p1] = v.scaleBounds.preferred;
    this.scales = [];
    for (let k = Math.round(h0 / ALBUM_SCALE_STEP); k * ALBUM_SCALE_STEP <= h1 + 1e-9; k++) this.scales.push(Math.round(k * ALBUM_SCALE_STEP * 1000) / 1000);
    this.sOrder = this.scales
      .map((s, si) => {
        const tier = s < p0 - 1e-9 || s > p1 + 1e-9 ? 1 : 0;
        // Distance to the preferred range, normalised by the hard span on
        // that side (V1.1: preferred = 1.000 only → 0.995 is tier 1).
        const c = s > p1 ? (s - p1) / (h1 - p1 || 1) : s < p0 ? (p0 - s) / (p0 - h0 || 1) : 0;
        return { si, tier, cost: c * c };
      })
      .sort((x, y) => x.tier * TIER + x.cost - (y.tier * TIER + y.cost) || this.scales[y.si] - this.scales[x.si]);
    const t = v.territory;
    const st = ALBUM_TRANSLATION_STEP;
    this.tList = [];
    for (let kx = Math.ceil(t.xMin / st); kx * st <= t.xMax; kx++) {
      for (let ky = Math.ceil(t.yMin / st); ky * st <= t.yMax; ky++) {
        const d = { x: kx * st, y: ky * st };
        this.tList.push({ d, cost: sideCost(d.x, t.xMin, t.xMax) ** 2 + sideCost(d.y, t.yMin, t.yMax) ** 2 });
      }
    }
    this.tList.sort((a, b) => a.cost - b.cost || Math.abs(a.d.x) + Math.abs(a.d.y) - (Math.abs(b.d.x) + Math.abs(b.d.y)) || a.d.y - b.d.y || a.d.x - b.d.x);
    this.heap = new MinHeap((x, y) => keyLess(x.c, y.c, this.scales));
    this.pushPair(0, 0);
  }

  shape(si: number) {
    let sh = this.shapes.get(si);
    if (!sh) {
      sh = shapeAt(this.v, this.source, this.scales[si], this.profile.paper);
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

  private aloneOk(c: Cand) {
    const sh = this.shape(c.si);
    const [x0, y0, x1] = sh.bbox;
    const pr = this.profile;
    const [sx0, sx1] = pr.safeX;
    if (x0 + c.d.x < sx0 - 1e-9 || x1 + c.d.x > sx1 + 1e-9 || (this.first && y0 + c.d.y < pr.firstGroupMinY - 1e-9)) {
      this.rejected.canvas++;
      return false;
    }
    if (this.first && pr.firstGroupZone && convexIntersectionArea(add(sh.outer0, c.d), pr.firstGroupZone) > EPS) {
      this.rejected.topZone++;
      return false;
    }
    if (pr.shapeAllowed && !pr.shapeAllowed(this.index, sh)) {
      this.rejected.size++;
      return false;
    }
    return true;
  }

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

// ── Hard rules on a set of placed prints ────────────────────────────────

export interface HardPrint {
  id: string;
  z: number;
  outer: Point[];
  photo: Point[];
  minima: { photo: number; outer: number };
}

/**
 * Hard failures of `targets` under every higher print of `all` (targets ⊆
 * all). `stopAtFirst`: stop at the first failure (search).
 */
export function hardFailures(targets: HardPrint[], all: HardPrint[], stopAtFirst: boolean, profile: AlbumSolverProfile = DESKTOP_ALBUM_SOLVER_PROFILE): GroupFailure[] {
  const out: GroupFailure[] = [];
  const need = profile.hitTargetPx;
  for (const t of targets) {
    const covers = all.filter((o) => o.z > t.z && convexIntersectionArea(t.outer, o.outer) > EPS).map((o) => o.outer);
    if (!covers.length) continue;
    const vp = visibleFraction(t.photo, covers);
    if (vp < t.minima.photo - EPS) out.push({ slotId: t.id, rule: "visible-photo", value: vp, minimum: t.minima.photo });
    const vo = visibleFraction(t.outer, covers);
    if (vo < t.minima.outer - EPS) out.push({ slotId: t.id, rule: "visible-outer", value: vo, minimum: t.minima.outer });
    if (profile.minVisibleOuterArea !== undefined) {
      const va = vo * polyArea(t.outer);
      if (va < profile.minVisibleOuterArea - EPS) out.push({ slotId: t.id, rule: "visible-area", value: va, minimum: profile.minVisibleOuterArea });
    }
    if (!out.length || !stopAtFirst) {
      const h = largestVisibleSquare(t.outer, covers, need);
      if (h.side < need) out.push({ slotId: t.id, rule: "hit-target", value: h.side, minimum: need });
    }
    if (out.length && stopAtFirst) break;
  }
  return out;
}

// ── Group session: valid joint candidates in rank order ─────────────────

export interface GroupSessionOptions {
  profile?: AlbumSolverProfile;
  /** Already placed prints of the preceding group (below the incoming one). */
  context?: HardPrint[];
}

export class GroupSession<G extends Pick<AlbumGrammar, "slots"> = AlbumGrammar> {
  private readonly streams: SlotStream[];
  readonly profile: AlbumSolverProfile;
  readonly context: HardPrint[];
  readonly minima: { photo: number; outer: number }[];
  private readonly heap: MinHeap<{ ix: number[]; key: number; tie: number; id: string }>;
  private readonly seen = new Set<string>();
  private readonly found: GroupCandidate[] = [];
  evaluated = 0;
  repairEvaluated = 0;
  repaired = false;
  exhausted = false;
  bestFailure: GroupFailure[] | null = null;
  private bestDeficit = Infinity;
  structuralStop: string | null = null;
  /** The structural STOP is a canvas one (no position inside 48 … 1622). */
  structuralCanvas = false;

  constructor(
    readonly grammar: G,
    readonly sources: readonly PhotoSource[],
    readonly first: boolean,
    options: GroupSessionOptions = {},
  ) {
    this.profile = options.profile ?? DESKTOP_ALBUM_SOLVER_PROFILE;
    this.context = options.context ?? [];
    this.minima = this.profile.minima(grammar.slots);
    this.streams = grammar.slots.map((v, i) => new SlotStream(v, sources[i], first, this.profile, i));
    this.heap = new MinHeap((a, b) => (a.key !== b.key ? a.key < b.key : a.tie !== b.tie ? a.tie < b.tie : a.id < b.id));
    for (let i = 0; i < this.streams.length; i++) {
      if (!this.streams[i].at(0)) {
        const r = this.streams[i].rejected;
        this.structuralStop = `${grammar.slots[i].slotId} : aucune position valide seule (canvas ${r.canvas}, zone haute ${r.topZone}${r.size ? `, taille ${r.size}` : ""})`;
        this.structuralCanvas = r.canvas > 0 && r.topZone === 0;
        this.exhausted = true;
        return;
      }
    }
    this.push(grammar.slots.map(() => 0));
  }

  private push(ix: number[]) {
    if (ix.some((k, i) => !this.streams[i].at(k))) return;
    const id = ix.join(",");
    if (this.seen.has(id)) return;
    this.seen.add(id);
    const key = ix.reduce((s, k, i) => {
      const c = this.streams[i].at(k)!;
      return s + c.tier * TIER + c.cost;
    }, 0);
    const tie = ix.reduce((s, k, i) => s - this.streams[i].scales[this.streams[i].at(k)!.si], 0);
    this.heap.push({ ix, key, tie, id: ix.map((k) => String(k).padStart(7, "0")).join(",") });
  }

  private placements(ix: number[]): GroupPlacement[] {
    return ix.map((k, i) => {
      const c = this.streams[i].at(k)!;
      const shape = this.streams[i].shape(c.si);
      return { slotIndex: i, shape, d: c.d, outer: add(shape.outer0, c.d), photo: add(shape.photo0, c.d), tier: c.tier, cost: c.cost };
    });
  }

  hardPrints(pl: GroupPlacement[]): HardPrint[] {
    return pl.map((p, i) => ({ id: this.grammar.slots[i].slotId, z: this.grammar.slots[i].zIndex, outer: p.outer, photo: p.photo, minima: this.minima[i] }));
  }

  /** The preceding group's prints first (targets too), then the group's. */
  private withContext(hp: HardPrint[]) {
    return this.context.length ? [...this.context, ...hp] : hp;
  }

  private accept(pl: GroupPlacement[]) {
    const ys = pl.flatMap((p) => p.outer.map((q) => q.y));
    this.found.push({ rank: this.found.length, placements: pl, cost: pl.reduce((s, p) => s + p.cost, 0), visualTop: Math.min(...ys), visualBottom: Math.max(...ys) });
  }

  /**
   * The V2 local repair, after the joint budget and only if no candidate was
   * found: every other slot stays at its closest valid candidate; the
   * failing slot and the slots above it move — one at a time, then two at a
   * time — in increasing witness distance. Same hard rules, same ranking
   * (V1.1: the seam never asks for another local solution — README §4.4-6).
   */
  private localRepair() {
    if (!this.bestFailure) return;
    const slots = this.grammar.slots;
    const failing = [...new Set(this.bestFailure.map((f) => slots.findIndex((s) => s.slotId === f.slotId)))].filter((i) => i >= 0);
    const movers = new Set<number>();
    // A context print (preceding group) failing: any incoming print may be the cover.
    if (this.bestFailure.some((f) => !slots.some((s) => s.slotId === f.slotId))) slots.forEach((_, j) => movers.add(j));
    for (const i of failing) {
      movers.add(i);
      slots.forEach((s, j) => {
        if (s.zIndex > slots[i].zIndex) movers.add(j);
      });
    }
    const list = [...movers].sort((a, b) => a - b);
    const zero = slots.map(() => 0);
    const costOf = (ix: number[]) => ix.reduce((s, k, i) => s + this.streams[i].at(k)!.tier * TIER + this.streams[i].at(k)!.cost, 0);
    const valid = (ix: number[]) => {
      this.repairEvaluated++;
      const hp = this.withContext(this.hardPrints(this.placements(ix)));
      return hardFailures(hp, hp, true, this.profile).length === 0;
    };
    // The V2 repair, verbatim: first valid per mover (cheapest), pruned by
    // the best cost found so far; the single cheapest composition wins.
    let best: { cost: number; ix: number[] } | null = null;
    for (const i of list) {
      for (let k = 1; k < REPAIR_BUDGET && this.streams[i].at(k); k++) {
        const ix = [...zero];
        ix[i] = k;
        const c = costOf(ix);
        if (best && c >= best.cost - 1e-12) break;
        if (valid(ix)) {
          best = { cost: c, ix };
          break;
        }
      }
    }
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const [i, j] = [list[a], list[b]];
        const heap = new MinHeap<{ ki: number; kj: number; c: number }>((x, y) => (x.c !== y.c ? x.c < y.c : x.ki !== y.ki ? x.ki < y.ki : x.kj < y.kj));
        const seen = new Set<number>();
        const push = (ki: number, kj: number) => {
          if (!this.streams[i].at(ki) || !this.streams[j].at(kj)) return;
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
            best = { cost: t.c, ix };
            break;
          }
          push(t.ki + 1, t.kj);
          push(t.ki, t.kj + 1);
        }
      }
    }
    if (best) {
      this.repaired = true;
      this.accept(this.placements(best.ix));
    }
  }

  /** Valid candidate #k in rank order (computed lazily), or null. */
  candidate(k: number): GroupCandidate | null {
    while (this.found.length <= k && !this.exhausted) {
      const top = this.heap.pop();
      if (!top || this.evaluated >= ALBUM_MAX_JOINT) {
        this.exhausted = true;
        if (top && !this.found.length) this.localRepair();
        break;
      }
      this.evaluated++;
      for (let i = 0; i < top.ix.length; i++) {
        const nx = [...top.ix];
        nx[i]++;
        this.push(nx);
      }
      const pl = this.placements(top.ix);
      const hp = this.withContext(this.hardPrints(pl));
      const f = hardFailures(hp, hp, true, this.profile);
      if (f.length) {
        const def = f.reduce((a, x) => a + Math.max(0, (x.minimum - x.value) / (x.minimum || 1)), 0);
        if (!this.bestFailure || def < this.bestDeficit) {
          this.bestFailure = f;
          this.bestDeficit = def;
        }
        continue;
      }
      this.accept(pl);
    }
    return this.found[k] ?? null;
  }

  /** Witness-order fallback for QA rendering of a STOP (never a solution). */
  fallback(): GroupCandidate {
    const pl = this.grammar.slots.map((v, i): GroupPlacement => {
      const shape = shapeAt(v, this.sources[i], 1, this.profile.paper);
      return { slotIndex: i, shape, d: { x: 0, y: 0 }, outer: shape.outer0, photo: shape.photo0, tier: 0, cost: 0 };
    });
    const ys = pl.flatMap((p) => p.outer.map((q) => q.y));
    return { rank: -1, placements: pl, cost: pl.reduce((s, p) => s + p.cost, 0), visualTop: Math.min(...ys), visualBottom: Math.max(...ys) };
  }
}
