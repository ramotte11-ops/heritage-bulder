import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import { selectGalleryState } from "@/config/gallery-a13-multi-state-manifests";
import { A13_V2_CONTRACT } from "@/config/gallery-a13-v2-manifests";
import {
  A13_MOBILE_CANVAS,
  A13_MOBILE_CAPTION,
  A13_MOBILE_CTA,
  A13_MOBILE_INTERACTION,
  A13_MOBILE_PAPER,
  A13_MOBILE_RELATIONS,
  A13_MOBILE_STATE_SLOTS,
  A13_MOBILE_TITLE,
  resolveCssClamp,
  type A13MobileRect,
  type A13MobileSlot,
  type A13MobileStateId,
} from "@/config/gallery-a13-mobile-manifest";
import { layoutDynamicPolaroid, type PaperProfile, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer, type CaptionProfile } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { unionCoverArea } from "@/lib/memorial/gallery/manifest-calibration";
import { largestVisibleSquare } from "@/lib/memorial/gallery/gallery-v2";
import { polygonHitsMask, type GlyphMask } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * A13 Gallery — MOBILE LIGHT runtime (Handoff V1.4), 375–430 px.
 *
 * One entry point from a family media list to a Mobile composition, pure and
 * theme-free, on the SHARED engine:
 * - state selection = `selectGalleryState` (0–1 absent, 2…6 → G2…G6,
 *   ≥ 7 → Signature 7+ showing media[0…5] with the CTA);
 * - `media[i]` → the slot whose `mediaIndex` is i, never permuted or sorted;
 * - each print = `layoutDynamicPolaroid` (ratio classification on the MEDIA
 *   ratio, natural window inside 0.67–1.78, bounded `contain` outside, no
 *   crop, no distortion) with the Mobile paper tokens;
 * - captions = `layoutCaption` (unchanged logic) at the Mobile caption size;
 * - visibility, reachability and title tests = the shared V2 primitives.
 *
 * Mobile-only (this module): the 941 × 1672 frame, `anchorPivot`,
 * `centerTerritory`, `paperOverflowAllowance`, the glyph-mask title margin
 * in CSS px and the Signature CTA safe box.
 *
 * ## Per slot (contract `territorySemantics`)
 *
 * The only variables are a linear scale `s` of the whole print
 * (`scaleRange`; outer area = witness area × s²) and the centre `C` of the
 * complete outer paper. For a given media and `s`, the print keeps its
 * normalised `anchorPivot` fixed in the canvas (the pivot point of the
 * witness paper), which gives its nominal centre `C1(s)`; `C` may then move
 * ONLY inside `centerTerritory` (2 px grid, the territory projection of
 * `C1` included). Rotation, paint order, family order and slot are closed.
 * The paper rotates about its own centre (engine anchor `center`).
 *
 * ## Hard rules (reject a candidate) → STOP codes
 *
 * - `CENTER_OUTSIDE_TERRITORY`: never produced by construction (every
 *   candidate centre is in its territory) — checked again on the answer;
 * - `PAPER_OVERFLOW_EXCEEDED`: the rotated outer paper leaves the canvas
 *   by more than its per-side allowance (canvasInset 0; shadows excluded);
 * - `TITLE_GLYPH_COLLISION_UNRESOLVED`: the outer paper meets the RENDERED
 *   title/subtitle glyph mask, dilated by 8 CSS px (the caller's mask);
 * - `CTA_COLLISION_UNRESOLVED` (Signature 7+): the outer paper meets the
 *   CTA safe box;
 * - `ITEM_INACCESSIBLE`: no joint candidate keeps, for every print, an
 *   axis-aligned 44 × 44 CSS px square in its visible paper, the shared
 *   identifiability minima (visible photo ≥ min(0.35, witness), visible
 *   paper ≥ min(0.30, witness)) and, where the manifest declares a
 *   dominant slot (G2, G3), its largest outer area.
 *
 * ## Selection (soft)
 *
 * Candidates are visited in increasing Master distance — Σ over slots of
 * (Δx / half territory width)² + (Δy / half territory height)² from `C1(s)`,
 * plus ((s − 1) / scale half-range)² — best first over the joint space; the
 * first joint candidate meeting every hard rule is returned. The witness
 * media ratio reproduces the manifest witness exactly (cost 0).
 *
 * Captions are laid out last and never move a print: a caption partly
 * covered by a higher print is allowed (`partialOcclusionAllowed`), the
 * Viewer being the full reading authority; it is reported, not a STOP.
 */

export type MobileRunStop =
  | "CENTER_OUTSIDE_TERRITORY"
  | "PAPER_OVERFLOW_EXCEEDED"
  | "ITEM_INACCESSIBLE"
  | "TITLE_GLYPH_COLLISION_UNRESOLVED"
  | "CTA_COLLISION_UNRESOLVED";

/** Font size the shared caption measurer measures at (`createCaptionMeasurer`, Desktop 27 px). */
export const SHARED_MEASURER_FONT_PX = 27;

// ── Per-viewport metrics ───────────────────────────────────────────────

export interface MobileMetrics {
  stageWidth: number;
  /** CSS px per source px (`--k`). */
  scale: number;
  /** Paper tokens in source px. */
  paper: { side: number; top: number; band: number };
  paperProfile: PaperProfile;
  captionFontCssPx: number;
  captionFontPx: number;
  captionProfile: CaptionProfile;
  /** Title collision margin (8 CSS px) in source px. */
  titleMarginPx: number;
  /** 44 CSS px in source px. */
  hitTargetPx: number;
}

export function mobileMetrics(stageWidth: number): MobileMetrics {
  const scale = stageWidth / A13_MOBILE_CANVAS.width;
  const px = (css: number) => css / scale;
  const side = px(resolveCssClamp(A13_MOBILE_PAPER.sideBorderCss, stageWidth));
  const top = px(resolveCssClamp(A13_MOBILE_PAPER.topBorderCss, stageWidth));
  const band = px(resolveCssClamp(A13_MOBILE_PAPER.captionBandCss, stageWidth));
  if (Math.abs(side - top) > 1e-9) throw new Error("mobileMetrics: the shared paper rule needs top border = side border");
  const captionFontCssPx = resolveCssClamp(A13_MOBILE_CAPTION.fontSizeCss, stageWidth);
  const captionFontPx = px(captionFontCssPx);
  return {
    stageWidth,
    scale,
    paper: { side, top, band },
    // Fixed tokens through the shared paper rule: proportional parts 0, min = max.
    paperProfile: { photoSidePadding: { percent: 0, minPx: side, maxPx: side }, bottomBand: { heightFactor: 0, minPx: band, maxPx: band } },
    captionFontCssPx,
    captionFontPx,
    // The shared caption logic with the Desktop CSS-px margins/step (6/4 px, 2 px) at this scale.
    captionProfile: {
      fontSizePx: captionFontPx,
      lineHeight: A13_MOBILE_CAPTION.lineHeight,
      safetyMarginPx: { x: px(6), y: px(4) },
      shiftStepPx: px(2),
      maxShiftFactorOfBandWidth: 0.18,
      canvas: A13_MOBILE_CANVAS,
    },
    titleMarginPx: px(A13_MOBILE_TITLE.collisionMarginCssPx),
    hitTargetPx: px(A13_MOBILE_INTERACTION.minTargetCssPx),
  };
}

/** The shared 27 px measurer, scaled linearly to the Mobile caption size. */
export function scaleMeasurer(m: CaptionMeasurer, factor: number): CaptionMeasurer {
  return {
    measure: (t) => {
      const r = m.measure(t);
      return {
        width: r.width * factor,
        actualBoundingBoxLeft: r.actualBoundingBoxLeft * factor,
        actualBoundingBoxRight: r.actualBoundingBoxRight * factor,
        actualBoundingBoxAscent: r.actualBoundingBoxAscent * factor,
        actualBoundingBoxDescent: r.actualBoundingBoxDescent * factor,
      };
    },
    fontAscent: m.fontAscent * factor,
    fontDescent: m.fontDescent * factor,
  };
}

// ── Geometry of one slot ───────────────────────────────────────────────

const EPS = 1e-6;
const POSITION_STEP = 2;
const SCALE_STEP = 0.01;
const MAX_JOINT = 3000;

const rectPoly = (r: A13MobileRect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];
const rot = (deg: number, v: Point): Point => {
  const a = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
};
const shift = (p: Point[], c: Point) => p.map((q) => ({ x: q.x + c.x, y: q.y + c.y }));

/** The shared engine's slot for a Mobile slot whose paper is centred on `center`. */
export function mobileEngineSlot(m: A13MobileSlot, center: Point = m.referenceCenter): A13Slot {
  const [lo, hi] = m.scaleRange;
  return {
    slotId: m.slotId,
    mediaIndex: m.mediaIndex,
    center,
    referenceSize: m.outerReference,
    targetOuterArea: m.outerReference.width * m.outerReference.height,
    comfortableAreaFactor: { min: lo * lo, max: hi * hi },
    hardAreaFactor: { min: lo * lo, max: hi * hi },
    rotationDeg: m.rotationDeg,
    anchor: "center",
    expansion: [],
    zIndex: m.paintOrder,
  };
}

/** Media ratio of the witness print: its outer paper minus the Mobile paper tokens. */
export function witnessMediaRatio(m: A13MobileSlot, metrics: MobileMetrics): number {
  const { side, top, band } = metrics.paper;
  return (m.outerReference.width - 2 * side) / (m.outerReference.height - top - band);
}

/** Canvas point of the witness paper's `anchorPivot`. */
export function pivotPoint(m: A13MobileSlot): Point {
  const [u, v] = m.anchorPivot;
  const d = rot(m.rotationDeg, { x: (u - 0.5) * m.outerReference.width, y: (v - 0.5) * m.outerReference.height });
  return { x: m.referenceCenter.x + d.x, y: m.referenceCenter.y + d.y };
}

/** Paper centre keeping the witness pivot fixed for a W × H paper. */
export function pivotCenter(m: A13MobileSlot, width: number, height: number): Point {
  const [u, v] = m.anchorPivot;
  const p = pivotPoint(m);
  const d = rot(m.rotationDeg, { x: (u - 0.5) * width, y: (v - 0.5) * height });
  return { x: p.x - d.x, y: p.y - d.y };
}

interface Shape {
  s: number;
  layout: PolaroidLayout;
  /** Paper centre keeping the pivot (before territory translation). */
  c1: Point;
  /** Polygons relative to the paper centre. */
  outer0: Point[];
  photo0: Point[];
  bbox0: [number, number, number, number];
  area: number;
}

function shapeFor(m: A13MobileSlot, source: PhotoSource, s: number, metrics: MobileMetrics): Shape {
  const origin = mobileEngineSlot(m, { x: 0, y: 0 });
  const layout = layoutDynamicPolaroid(origin, source, s * s, metrics.paperProfile);
  const outer0 = slotRectToCanvas(origin, layout.outer);
  const photo0 = slotRectToCanvas(origin, {
    x: layout.outer.x + layout.window.x + layout.photo.x,
    y: layout.outer.y + layout.window.y + layout.photo.y,
    width: layout.photo.width,
    height: layout.photo.height,
  });
  const xs = outer0.map((p) => p.x);
  const ys = outer0.map((p) => p.y);
  return {
    s,
    layout,
    c1: pivotCenter(m, layout.outer.width, layout.outer.height),
    outer0,
    photo0,
    bbox0: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    area: layout.outer.width * layout.outer.height,
  };
}

function polyArea(p: Point[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return Math.abs(a) / 2;
}

function visibleFraction(target: Point[], covers: Point[][]) {
  const a = polyArea(target);
  if (a <= EPS) return 0;
  const rel = covers.filter((c) => convexIntersectionArea(target, c) > EPS);
  return Math.max(0, 1 - unionCoverArea(target, rel) / a);
}

// ── Candidates ─────────────────────────────────────────────────────────

interface Cand {
  si: number;
  center: Point;
  cost: number;
}

type AloneReject = "PAPER_OVERFLOW_EXCEEDED" | "TITLE_GLYPH_COLLISION_UNRESOLVED" | "CTA_COLLISION_UNRESOLVED";

class SlotStream {
  readonly shapes: Shape[] = [];
  private readonly order: Cand[] = [];
  private cursor = 0;
  readonly valid: Cand[] = [];
  readonly rejected: Record<AloneReject, number> = { PAPER_OVERFLOW_EXCEEDED: 0, TITLE_GLYPH_COLLISION_UNRESOLVED: 0, CTA_COLLISION_UNRESOLVED: 0 };

  constructor(
    readonly m: A13MobileSlot,
    source: PhotoSource,
    metrics: MobileMetrics,
    private readonly titleMask: GlyphMask,
    private readonly ctaSafe: Point[] | null,
  ) {
    const [lo, hi] = m.scaleRange;
    const t = m.centerTerritory;
    for (let k = Math.round(lo / SCALE_STEP); k <= Math.round(hi / SCALE_STEP); k++) {
      const s = Math.round(k * SCALE_STEP * 1000) / 1000;
      const sh = shapeFor(m, source, s, metrics);
      const si = this.shapes.push(sh) - 1;
      const sc = s >= 1 ? (hi > 1 ? (s - 1) / (hi - 1) : 0) : lo < 1 ? (1 - s) / (1 - lo) : 0;
      // Grid through the territory projection of the pivot centre.
      const start = { x: Math.min(t.x + t.width, Math.max(t.x, sh.c1.x)), y: Math.min(t.y + t.height, Math.max(t.y, sh.c1.y)) };
      const i0 = Math.ceil((t.x - start.x) / POSITION_STEP - EPS);
      const i1 = Math.floor((t.x + t.width - start.x) / POSITION_STEP + EPS);
      const j0 = Math.ceil((t.y - start.y) / POSITION_STEP - EPS);
      const j1 = Math.floor((t.y + t.height - start.y) / POSITION_STEP + EPS);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const center = { x: start.x + i * POSITION_STEP, y: start.y + j * POSITION_STEP };
          const dx = (center.x - sh.c1.x) / (t.width / 2);
          const dy = (center.y - sh.c1.y) / (t.height / 2);
          this.order.push({ si, center, cost: dx * dx + dy * dy + sc * sc });
        }
    }
    const shapes = this.shapes;
    this.order.sort(
      (a, b) =>
        a.cost - b.cost ||
        shapes[b.si].s - shapes[a.si].s ||
        Math.hypot(a.center.x - shapes[a.si].c1.x, a.center.y - shapes[a.si].c1.y) - Math.hypot(b.center.x - shapes[b.si].c1.x, b.center.y - shapes[b.si].c1.y) ||
        a.center.y - b.center.y ||
        a.center.x - b.center.x,
    );
  }

  outer(c: Cand) {
    return shift(this.shapes[c.si].outer0, c.center);
  }

  private aloneReject(c: Cand): AloneReject | null {
    const sh = this.shapes[c.si];
    const a = this.m.paperOverflowAllowance;
    const [x0, y0, x1, y1] = sh.bbox0;
    const { width: W, height: H } = A13_MOBILE_CANVAS;
    if (x0 + c.center.x < -a.left - EPS || y0 + c.center.y < -a.top - EPS || x1 + c.center.x > W + a.right + EPS || y1 + c.center.y > H + a.bottom + EPS) return "PAPER_OVERFLOW_EXCEEDED";
    const poly = this.outer(c);
    if (polygonHitsMask(poly, this.titleMask)) return "TITLE_GLYPH_COLLISION_UNRESOLVED";
    if (this.ctaSafe && convexIntersectionArea(poly, this.ctaSafe) > EPS) return "CTA_COLLISION_UNRESOLVED";
    return null;
  }

  /** Valid-alone candidate #k (extends lazily), or null. */
  at(k: number): Cand | null {
    while (this.valid.length <= k && this.cursor < this.order.length) {
      const c = this.order[this.cursor++];
      const r = this.aloneReject(c);
      if (r) this.rejected[r]++;
      else this.valid.push(c);
    }
    return this.valid[k] ?? null;
  }

  get exhausted() {
    return this.cursor >= this.order.length;
  }
}

// ── Joint evaluation ───────────────────────────────────────────────────

export interface MobileJointFailure {
  slotId: string;
  rule: "dominance" | "visible-photo" | "visible-outer" | "hit-target";
  value: number;
  minimum: number;
}

interface Placed {
  m: A13MobileSlot;
  shape: Shape;
  cand: Cand;
  outer: Point[];
  photo: Point[];
}

interface JointEval {
  failures: MobileJointFailure[];
  photo: number[];
  outer: number[];
  hit: { side: number; center: Point }[];
}

function coversOf(placed: Placed[], i: number) {
  return placed.filter((p) => p.m.paintOrder > placed[i].m.paintOrder).map((p) => p.outer);
}

function dominantIndex(state: A13MobileStateId, slots: readonly A13MobileSlot[]) {
  const id = A13_MOBILE_RELATIONS[state].find((r) => r.dominant)?.dominant;
  return id ? slots.findIndex((s) => s.slotId === id) : -1;
}

function evaluate(state: A13MobileStateId, placed: Placed[], minima: { photo: number; outer: number }[], hitPx: number, full: boolean): JointEval {
  const failures: MobileJointFailure[] = [];
  const dom = dominantIndex(state, placed.map((p) => p.m));
  if (dom >= 0) {
    const maxOther = Math.max(...placed.filter((_, j) => j !== dom).map((p) => p.shape.area));
    if (placed[dom].shape.area < maxOther - EPS) failures.push({ slotId: placed[dom].m.slotId, rule: "dominance", value: placed[dom].shape.area, minimum: maxOther });
  }
  const photo: number[] = [];
  const outer: number[] = [];
  const hit: { side: number; center: Point }[] = [];
  const need = Math.ceil(hitPx - EPS);
  for (let i = 0; i < placed.length; i++) {
    const covers = coversOf(placed, i);
    const id = placed[i].m.slotId;
    photo[i] = visibleFraction(placed[i].photo, covers);
    outer[i] = visibleFraction(placed[i].outer, covers);
    if (photo[i] < minima[i].photo - EPS) failures.push({ slotId: id, rule: "visible-photo", value: photo[i], minimum: minima[i].photo });
    if (outer[i] < minima[i].outer - EPS) failures.push({ slotId: id, rule: "visible-outer", value: outer[i], minimum: minima[i].outer });
    if (!failures.length || full) {
      const h = largestVisibleSquare(placed[i].outer, covers, full ? 0 : need);
      hit[i] = h;
      if (h.side < need) failures.push({ slotId: id, rule: "hit-target", value: h.side, minimum: need });
    } else hit[i] = { side: NaN, center: { x: NaN, y: NaN } };
  }
  return { failures, photo, outer, hit };
}

/** Witness minima (shared V2 caps): visible photo ≥ min(0.35, witness), paper ≥ min(0.30, witness). */
export function mobileWitnessBaseline(state: A13MobileStateId, metrics: MobileMetrics) {
  const slots = A13_MOBILE_STATE_SLOTS[state];
  const shapes = slots.map((m) => shapeFor(m, { width: witnessMediaRatio(m, metrics) * 1000, height: 1000 }, 1, metrics));
  const placed: Placed[] = slots.map((m, i) => {
    const cand = { si: 0, center: m.referenceCenter, cost: 0 };
    return { m, shape: shapes[i], cand, outer: shift(shapes[i].outer0, m.referenceCenter), photo: shift(shapes[i].photo0, m.referenceCenter) };
  });
  const o = A13_V2_CONTRACT.occlusion;
  return placed.map((_, i) => {
    const covers = coversOf(placed, i);
    const vp = visibleFraction(placed[i].photo, covers);
    const vo = visibleFraction(placed[i].outer, covers);
    return { visiblePhoto: vp, visibleOuter: vo, photo: Math.min(o.hardMinimumVisiblePhotoFractionCap, vp), outer: Math.min(o.hardMinimumVisibleOuterFractionCap, vo) };
  });
}

// ── Run ────────────────────────────────────────────────────────────────

/** A13 Signature state id → Mobile manifest id (selection is shared). */
export function selectMobileGalleryState(mediaCount: number): A13MobileStateId | null {
  const s = selectGalleryState(mediaCount);
  if (!s) return null;
  return s === "G6_SIGNATURE_7PLUS" ? "G7PLUS" : s;
}

export interface MobileGalleryEntry<M> {
  /** Shared engine slot: `center` = paper centre, `zIndex` = paint order, anchor `center`. */
  slot: A13Slot;
  mobileSlot: A13MobileSlot;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  media: M;
  mediaIndex: number;
  scale: number;
  center: Point;
  /** Pivot-preserving centre before the territory translation. */
  pivotCenter: Point;
  outer: Point[];
  visiblePhoto: number;
  visibleOuter: number;
  /** Largest axis-aligned square in the visible paper (source px) and its centre. */
  hitTarget: { side: number; center: Point };
}

export interface MobileGalleryAnomaly {
  code: MobileRunStop | "MOBILE_SOLVER_EXCEPTION";
  rule: string;
  detail: string;
}

export interface MobileGalleryRun<M> {
  profile: "mobile";
  stageWidth: number;
  metrics: MobileMetrics;
  stateId: A13MobileStateId | null;
  outcome: "absent" | "resolved" | "unresolved";
  /** "PASS", "GALLERY_ABSENT", or a STOP code (unresolved). */
  status: string;
  anomaly: MobileGalleryAnomaly | null;
  mediaCount: number;
  entries: MobileGalleryEntry<M>[];
  hasCta: boolean;
  /** Metric signals for QA (never a rejection): caption collisions, caption widths. */
  signals: string[];
  search: { jointEvaluations: number; aloneRejected: Record<string, Record<AloneReject, number>> };
}

export interface MobileRunInput<M extends PhotoSource> {
  media: readonly M[];
  captionOf: (m: M, index: number) => string | null;
  /** The shared caption measurer (measuring at `SHARED_MEASURER_FONT_PX`), or null. */
  measurer: CaptionMeasurer | null;
  /** Rendered title + subtitle glyph mask in source px, ALREADY dilated by 8 CSS px. */
  titleMask: GlyphMask;
  /** Width of the Mobile stage in CSS px (375–430). */
  stageWidth: number;
}

export function runMobileGallery<M extends PhotoSource>(input: MobileRunInput<M>): MobileGalleryRun<M> {
  const metrics = mobileMetrics(input.stageWidth);
  const stateId = selectMobileGalleryState(input.media.length);
  const head = { profile: "mobile" as const, stageWidth: input.stageWidth, metrics, mediaCount: input.media.length };
  if (!stateId) return { ...head, stateId: null, outcome: "absent", status: "GALLERY_ABSENT", anomaly: null, entries: [], hasCta: false, signals: [], search: { jointEvaluations: 0, aloneRejected: {} } };
  try {
    return solveMobileState(stateId, input, metrics, head);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ...head, stateId, outcome: "unresolved", status: "MOBILE_SOLVER_EXCEPTION", anomaly: { code: "MOBILE_SOLVER_EXCEPTION", rule: "exception", detail }, entries: [], hasCta: false, signals: [], search: { jointEvaluations: 0, aloneRejected: {} } };
  }
}

type RunHead = Pick<MobileGalleryRun<unknown>, "profile" | "stageWidth" | "metrics" | "mediaCount">;

/** Binary min-heap on the joint Master distance. */
class JointHeap {
  private a: { t: number[]; cost: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(v: { t: number[]; cost: number }) {
    const a = this.a;
    a.push(v);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function solveMobileState<M extends PhotoSource>(state: A13MobileStateId, input: MobileRunInput<M>, metrics: MobileMetrics, head: RunHead): MobileGalleryRun<M> {
  const slots = A13_MOBILE_STATE_SLOTS[state];
  const hasCta = state === "G7PLUS";
  const ctaSafe = hasCta ? rectPoly(A13_MOBILE_CTA.safeBox) : null;
  // Family order: media[i] → the slot whose mediaIndex is i (Signature shows 0…5).
  const streams = slots.map((m) => new SlotStream(m, input.media[m.mediaIndex], metrics, input.titleMask, ctaSafe));
  const aloneRejected = () => Object.fromEntries(streams.map((s) => [s.m.slotId, { ...s.rejected }]));
  const unresolved = (anomaly: MobileGalleryAnomaly, jointEvaluations: number): MobileGalleryRun<M> => ({
    ...head,
    stateId: state,
    outcome: "unresolved",
    status: anomaly.code,
    anomaly,
    entries: [],
    hasCta: false,
    signals: [],
    search: { jointEvaluations, aloneRejected: aloneRejected() },
  });

  for (const st of streams) {
    if (st.at(0)) continue;
    const r = st.rejected;
    const code = (Object.keys(r) as AloneReject[]).reduce((a, k) => (r[k] > r[a] ? k : a));
    return unresolved({ code, rule: "alone", detail: `${st.m.slotId}: no scale/centre in its territory passes (${JSON.stringify(r)})` }, 0);
  }

  const minima = mobileWitnessBaseline(state, metrics).map((w) => ({ photo: w.photo, outer: w.outer }));
  const heap = new JointHeap();
  const seen = new Set<string>();
  const push = (t: number[]) => {
    const k = t.join(",");
    if (seen.has(k)) return;
    seen.add(k);
    const cs = t.map((i, s) => streams[s].at(i));
    if (cs.some((c) => !c)) return;
    heap.push({ t, cost: cs.reduce((a, c) => a + c!.cost, 0) });
  };
  push(new Array(slots.length).fill(0));
  let evals = 0;
  let best: MobileJointFailure[] | null = null;
  while (heap.size && evals < MAX_JOINT) {
    const { t } = heap.pop();
    evals++;
    const placed: Placed[] = t.map((k, i) => {
      const c = streams[i].at(k)!;
      const sh = streams[i].shapes[c.si];
      return { m: slots[i], shape: sh, cand: c, outer: shift(sh.outer0, c.center), photo: shift(sh.photo0, c.center) };
    });
    const fast = evaluate(state, placed, minima, metrics.hitTargetPx, false);
    if (!fast.failures.length) {
      for (const p of placed) {
        const tr = p.m.centerTerritory;
        const c = p.cand.center;
        if (c.x < tr.x - EPS || c.x > tr.x + tr.width + EPS || c.y < tr.y - EPS || c.y > tr.y + tr.height + EPS)
          return unresolved({ code: "CENTER_OUTSIDE_TERRITORY", rule: "territory", detail: `${p.m.slotId} at ${c.x},${c.y}` }, evals);
      }
      const ev = evaluate(state, placed, minima, metrics.hitTargetPx, true);
      const { entries, signals } = finishEntries(placed, ev, input, metrics);
      return { ...head, stateId: state, outcome: "resolved", status: "PASS", anomaly: null, entries, hasCta, signals, search: { jointEvaluations: evals, aloneRejected: aloneRejected() } };
    }
    if (!best || fast.failures.length < best.length) best = fast.failures;
    for (let i = 0; i < slots.length; i++) {
      const nt = t.slice();
      nt[i]++;
      push(nt);
    }
  }
  const f = best ?? [];
  return unresolved(
    { code: "ITEM_INACCESSIBLE", rule: f.map((x) => `${x.slotId}:${x.rule}`).join(",") || "exhausted", detail: `no joint candidate after ${evals} evaluations: ${JSON.stringify(f)}` },
    evals,
  );
}

/** Captions last, on the resolved prints (they never move a print). */
function finishEntries<M extends PhotoSource>(placed: Placed[], ev: JointEval, input: MobileRunInput<M>, metrics: MobileMetrics) {
  const scaled = input.measurer ? scaleMeasurer(input.measurer, metrics.captionFontPx / SHARED_MEASURER_FONT_PX) : null;
  const signals: string[] = [];
  const entries = placed.map((p, i): MobileGalleryEntry<M> => {
    const slot = mobileEngineSlot(p.m, p.cand.center);
    const media = input.media[p.m.mediaIndex];
    const text = input.captionOf(media, p.m.mediaIndex);
    const obstacles = placed.filter((q) => q.m.paintOrder > p.m.paintOrder).map((q) => ({ slotId: q.m.slotId, polygon: q.outer }));
    const caption = scaled && text ? layoutCaption(slot, p.shape.layout, text, scaled, obstacles, metrics.captionProfile) : null;
    if (caption?.status === "CAPTION_COLLISION_UNRESOLVED") signals.push(`${p.m.slotId}: caption partly covered by ${caption.collidingWith.join("+")} (allowed; the Viewer reads it)`);
    if (caption?.exceedsUsefulWidth) signals.push(`${p.m.slotId}: caption line wider than the photo window`);
    return {
      slot,
      mobileSlot: p.m,
      layout: p.shape.layout,
      caption,
      media,
      mediaIndex: p.m.mediaIndex,
      scale: p.shape.s,
      center: p.cand.center,
      pivotCenter: p.shape.c1,
      outer: p.outer,
      visiblePhoto: ev.photo[i],
      visibleOuter: ev.outer[i],
      hitTarget: ev.hit[i],
    };
  });
  return { entries, signals };
}
