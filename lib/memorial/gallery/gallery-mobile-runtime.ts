import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import { selectGalleryState } from "@/config/gallery-a13-multi-state-manifests";
import { A13_V2_CONTRACT } from "@/config/gallery-a13-v2-manifests";
import {
  A13_MOBILE_CANVAS,
  A13_MOBILE_CAPTION,
  A13_MOBILE_CTA,
  A13_MOBILE_GROUP_TRANSLATION,
  A13_MOBILE_INTERACTION,
  A13_MOBILE_PAPER,
  A13_MOBILE_RELATIONS,
  A13_MOBILE_STATE_SLOTS,
  A13_MOBILE_TITLE_BLOCK,
  resolveByViewport,
  resolveCssClamp,
  type A13MobileRect,
  type A13MobileSlot,
  type A13MobileStateId,
} from "@/config/gallery-a13-mobile-manifest";
import { layoutDynamicPolaroid, type PaperProfile, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { breakCaption, DESKTOP_CAPTION_PROFILE, layoutCaption, type CaptionLayout, type CaptionMeasurer, type CaptionProfile } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { unionCoverArea } from "@/lib/memorial/gallery/manifest-calibration";
import { largestVisibleSquare } from "@/lib/memorial/gallery/gallery-v2";

/**
 * A13 Gallery — MOBILE LIGHT runtime (Handoff V1.7), 375–430 px.
 *
 * One entry point from a family media list to a Mobile composition, pure and
 * theme-free, on the SHARED engine:
 * - state selection = `selectGalleryState` (0–1 absent, 2…6 → G2…G6,
 *   ≥ 7 → Signature 7+ showing media[0…5] with the CTA);
 * - `media[i]` → the slot whose `mediaIndex` is i, never permuted or sorted;
 * - each print = `layoutDynamicPolaroid` (ratio classification on the MEDIA
 *   ratio, natural window inside 0.67–1.78, bounded `contain` outside, no
 *   crop, no distortion) with the Mobile paper tokens;
 * - captions = the shared `breakCaption` / `layoutCaption` (centred, and
 *   shifted along the band when that frees their glyphs) at the Mobile
 *   caption size, laid out AFTER the composition;
 * - visibility and reachability tests = the shared V2 primitives.
 *
 * Mobile-only (this module): the 941-wide frame, the state's group
 * translation and stage height, `anchorPivot`, `centerTerritory`,
 * `paperOverflowAllowance`, the canonical title block and the Signature 7+
 * CTA placement.
 *
 * ## Frames
 *
 * Slots are solved in the GROUP frame (the manifest coordinates). The whole
 * group is then translated ONCE by the state's `translateYSource` (the
 * renderer translates the group container, never a slot). The stage frame
 * items — title block, CTA, stage edges — are brought into the group frame
 * by −T: the stage spans y ∈ [−T, 1672] there, the title block
 * y ∈ [−T, bottom − T], the 7+ CTA safe box y − T.
 *
 * ## Per slot (contract `territorySemantics`)
 *
 * The only variables are a linear scale `s` of the whole print
 * (`scaleRange`; outer area = witness area × s²) and the centre `C` of the
 * complete outer paper. For a given media and `s`, the print keeps its
 * normalised `anchorPivot` fixed in the canvas (the pivot point of the
 * witness paper), which gives its nominal centre `C1(s)`; `C` may then move
 * ONLY inside `centerTerritory` (4 px grid, the territory projection of
 * `C1` included). Rotation, paint order, family order and slot are closed.
 * The paper rotates about its own centre (engine anchor `center`).
 *
 * ## Captions (V1.6 — composition first)
 *
 * The composition is solved WITHOUT the captions: a caption never moves,
 * scales or re-orders a print, never changes an overlap, never hides the
 * Gallery and never returns a STOP. Each caption is then laid out on the
 * solved composition: 12 / 14.5 CSS px, centred in the fixed 42 px band
 * with an 8 px inset, never shrunk, never more than two lines (the shared
 * break), moved along its band by the shared caption logic when that frees
 * its glyphs from the prints above (2 CSS px steps, ≤ 18 % of the band
 * width, ink kept on the band). When nothing frees them, the caption stays
 * centred and is partly or strongly covered — an allowed visual state; the
 * Viewer is the full reading authority. Its `captionSafeZone` (glyph box +
 * 6 / 4 CSS px, transformed with the print) is a diagnostic: the run
 * reports how much of it is covered.
 *
 * Narrow print: when the best two-line break still has a line wider than
 * the useful width, ONLY the bottom band may widen, symmetrically, to that
 * line + the two insets, within the slot envelope (the witness paper width
 * at the same scale, `outerReference.width × s`) — and only when the
 * widened band keeps every hard rule of the solved composition (stage,
 * title block, CTA, and the visibility and 44 px target of every print
 * below it). Otherwise the band is not widened and the best two-line
 * caption is drawn as is. Never a feasibility condition.
 *
 * ## Signature 7+ CTA (V1.7)
 *
 * The 7+ photo group is solved and finished exactly as G6 (same slots,
 * same rules, same caption pass — the CTA constrains no print). Then:
 * groupVisualBottomCss = the lowest point of the six final transformed
 * papers (stage frame; a widened caption band is paper; shadows and focus
 * rings excluded); CTA
 * safe box top = ceilToDevicePixel(groupVisualBottomCss + 24); the control
 * keeps the V1.6 inset (23 × W / 941) and is max(44, 77 × W / 941) high;
 * the stage ends at ceilToDevicePixel(max(base stage, safe box bottom +
 * 24)). The photo group never moves for the CTA.
 *
 * ## Hard rules (reject a candidate) → STOP codes
 *
 * - `CENTER_OUTSIDE_TERRITORY`: never produced by construction (every
 *   candidate centre is in its territory) — checked again on the answer;
 * - `PAPER_OVERFLOW_EXCEEDED`: the rotated outer paper leaves the stage by
 *   more than its per-side allowance (canvasInset 0; shadows excluded);
 * - `TITLE_BLOCK_COLLISION_UNRESOLVED`: the outer paper meets the centred
 *   protected title block (width and bottom per viewport, from y = 0);
 * - `CTA_COLLISION_UNRESOLVED` (Signature 7+): a paper meets the resolved
 *   CTA safe box — impossible by construction (24 CSS px below the group),
 *   checked again on the answer;
 * - `ITEM_INACCESSIBLE`: no joint candidate keeps, for every print, an
 *   axis-aligned 44 × 44 CSS px square in its visible paper, the shared
 *   identifiability minima (visible photo ≥ min(0.35, witness), visible
 *   paper ≥ min(0.30, witness)) and, where the manifest declares a
 *   dominant slot (G2, G3), its largest outer area.
 *
 * ## Selection (soft)
 *
 * The answer is the joint candidate of least Master distance — Σ over
 * slots of (Δx / half territory width)² + (Δy / half territory height)²
 * from `C1(s)`, plus ((s − 1) / scale half-range)² — meeting every hard
 * rule, found by an exact best-first search (`solveMobileState`). The
 * witness media ratio reproduces the manifest witness exactly (cost 0).
 */

export type MobileRunStop =
  | "CENTER_OUTSIDE_TERRITORY"
  | "PAPER_OVERFLOW_EXCEEDED"
  | "ITEM_INACCESSIBLE"
  | "TITLE_BLOCK_COLLISION_UNRESOLVED"
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
  /** Caption inset inside the band (8 CSS px) in source px. */
  captionInsetPx: number;
  captionProfile: CaptionProfile;
  /** Protected title block, STAGE frame, source px (centred, from y = 0). */
  titleBlock: A13MobileRect;
  /** 44 CSS px in source px. */
  hitTargetPx: number;
}

export function mobileMetrics(stageWidth: number): MobileMetrics {
  const scale = stageWidth / A13_MOBILE_CANVAS.width;
  const px = (css: number) => css / scale;
  const side = px(resolveCssClamp(A13_MOBILE_PAPER.sideBorderCss, stageWidth));
  const top = px(resolveCssClamp(A13_MOBILE_PAPER.topBorderCss, stageWidth));
  const band = px(A13_MOBILE_PAPER.captionBandCss);
  if (Math.abs(side - top) > 1e-9) throw new Error("mobileMetrics: the shared paper rule needs top border = side border");
  const captionFontCssPx = A13_MOBILE_CAPTION.fontSizeCss;
  const captionFontPx = px(captionFontCssPx);
  const captionInsetPx = px(A13_MOBILE_CAPTION.horizontalInsetCss);
  const blockWidth = px(resolveByViewport(A13_MOBILE_TITLE_BLOCK.protectedBlockWidthCss, stageWidth));
  const blockBottom = px(resolveByViewport(A13_MOBILE_TITLE_BLOCK.protectedBlockBottomCss, stageWidth));
  return {
    stageWidth,
    scale,
    paper: { side, top, band },
    // Fixed tokens through the shared paper rule: proportional parts 0, min = max.
    paperProfile: { photoSidePadding: { percent: 0, minPx: side, maxPx: side }, bottomBand: { heightFactor: 0, minPx: band, maxPx: band } },
    captionFontCssPx,
    captionFontPx,
    captionInsetPx,
    // The shared caption logic: Mobile size / leading / inset / diagnostic safe-zone padding; the shared 2 px step and ±18 % band shift.
    captionProfile: {
      fontSizePx: captionFontPx,
      lineHeight: A13_MOBILE_CAPTION.lineHeightCss / A13_MOBILE_CAPTION.fontSizeCss,
      safetyMarginPx: { x: px(A13_MOBILE_CAPTION.safeZonePaddingCss.x), y: px(A13_MOBILE_CAPTION.safeZonePaddingCss.y) },
      shiftStepPx: px(DESKTOP_CAPTION_PROFILE.shiftStepPx),
      maxShiftFactorOfBandWidth: DESKTOP_CAPTION_PROFILE.maxShiftFactorOfBandWidth,
      canvas: A13_MOBILE_CANVAS,
      bandInsetPx: captionInsetPx,
    },
    titleBlock: { x: (A13_MOBILE_CANVAS.width - blockWidth) / 2, y: px(A13_MOBILE_TITLE_BLOCK.topCss), width: blockWidth, height: blockBottom },
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
/** Fine grid: 4 source px (≤ 1.6 CSS px), scale 0.02, + the territory edges. */
const POSITION_STEP = 4;
const SCALE_STEP = 0.02;
/** Coarse lattice (second stage): territory quarters, five scales. */
const COARSE_DIVISIONS = 4;
/** Search budgets (partial compositions examined) of the fine and coarse stages. */
const FINE_BUDGET = 2000;
const COARSE_BUDGET = 20000;

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

type Box = [number, number, number, number];
const bboxOf = (p: Point[]): Box => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of p) {
    if (q.x < x0) x0 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.x > x1) x1 = q.x;
    if (q.y > y1) y1 = q.y;
  }
  return [x0, y0, x1, y1];
};
const overlap = (a: readonly number[], b: readonly number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

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

/** One print at one scale — caption-free (captions never shape the composition). */
interface Shape {
  s: number;
  layout: PolaroidLayout;
  /** Paper centre keeping the pivot (before territory translation). */
  c1: Point;
  /** Polygons relative to the paper centre. */
  outer0: Point[];
  photo0: Point[];
  bbox0: Box;
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
  return {
    s,
    layout,
    c1: pivotCenter(m, layout.outer.width, layout.outer.height),
    outer0,
    photo0,
    bbox0: bboxOf(outer0),
    area: layout.outer.width * layout.outer.height,
  };
}

function polyArea(p: Point[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return Math.abs(a) / 2;
}

function coveredFraction(target: Point[], covers: Point[][]) {
  const a = polyArea(target);
  if (a <= EPS) return 0;
  const tb = bboxOf(target);
  const rel = covers.filter((c) => overlap(bboxOf(c), tb) && convexIntersectionArea(target, c) > EPS);
  return Math.min(1, unionCoverArea(target, rel) / a);
}

function visibleFraction(target: Point[], covers: Point[][]) {
  return polyArea(target) <= EPS ? 0 : Math.max(0, 1 - coveredFraction(target, covers));
}

// ── Candidates ─────────────────────────────────────────────────────────

interface Cand {
  si: number;
  center: Point;
  cost: number;
  /** Rank in the stream (identity). */
  id: number;
}

type AloneReject = "PAPER_OVERFLOW_EXCEEDED" | "TITLE_BLOCK_COLLISION_UNRESOLVED";

/** Stage-frame items brought into the GROUP frame (y − T). */
interface GroupFrame {
  /** Stage edges: x ∈ [0, 941], y ∈ [top, bottom]. */
  top: number;
  bottom: number;
  title: Point[];
}

const hits = (paper: Point[], zone: Point[]) => convexIntersectionArea(paper, zone) > EPS;

/** A paper (print or widened band) against the stage rules of its slot: canvas allowance, title block (the 7+ CTA comes after the group). */
function stageReject(m: A13MobileSlot, paper: Point[], frame: GroupFrame): AloneReject | null {
  const a = m.paperOverflowAllowance;
  const [x0, y0, x1, y1] = bboxOf(paper);
  if (x0 < -a.left - EPS || y0 < frame.top - a.top - EPS || x1 > A13_MOBILE_CANVAS.width + a.right + EPS || y1 > frame.bottom + a.bottom + EPS) return "PAPER_OVERFLOW_EXCEEDED";
  if (hits(paper, frame.title)) return "TITLE_BLOCK_COLLISION_UNRESOLVED";
  return null;
}

type Grid = "fine" | "coarse";

class SlotStream {
  readonly shapes: Shape[] = [];
  private readonly order: Cand[] = [];
  private cursor = 0;
  readonly valid: Cand[] = [];
  readonly rejected: Record<AloneReject, number> = { PAPER_OVERFLOW_EXCEEDED: 0, TITLE_BLOCK_COLLISION_UNRESOLVED: 0 };
  /** Everything any candidate's paper can cover, group frame. */
  readonly region: Box;

  constructor(
    readonly m: A13MobileSlot,
    source: PhotoSource,
    metrics: MobileMetrics,
    private readonly frame: GroupFrame,
    grid: Grid,
  ) {
    const [lo, hi] = m.scaleRange;
    const t = m.centerTerritory;
    const scales =
      grid === "fine"
        ? Array.from({ length: Math.round(hi / SCALE_STEP) - Math.round(lo / SCALE_STEP) + 1 }, (_, i) => Math.round((Math.round(lo / SCALE_STEP) + i) * SCALE_STEP * 1000) / 1000)
        : [...new Set([lo, (lo + 1) / 2, 1, (1 + hi) / 2, hi].map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
    let region: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of scales) {
      const sh = shapeFor(m, source, s, metrics);
      const si = this.shapes.push(sh) - 1;
      const sc = s >= 1 ? (hi > 1 ? (s - 1) / (hi - 1) : 0) : lo < 1 ? (1 - s) / (1 - lo) : 0;
      // Territory projection of the pivot centre, then the grid through it (fine) or the territory lattice (coarse).
      const start = { x: Math.min(t.x + t.width, Math.max(t.x, sh.c1.x)), y: Math.min(t.y + t.height, Math.max(t.y, sh.c1.y)) };
      const centers: Point[] = [];
      if (grid === "fine") {
        // The 4 px lines through the projection, plus the territory's own edges.
        const line = (s0: number, lo0: number, len: number) => {
          const v: number[] = [];
          for (let i = Math.ceil((lo0 - s0) / POSITION_STEP - EPS); i <= Math.floor((lo0 + len - s0) / POSITION_STEP + EPS); i++) v.push(s0 + i * POSITION_STEP);
          for (const e of [lo0, lo0 + len]) if (v.every((q) => Math.abs(q - e) > EPS)) v.push(e);
          return v;
        };
        for (const x of line(start.x, t.x, t.width)) for (const y of line(start.y, t.y, t.height)) centers.push({ x, y });
      } else {
        centers.push(start);
        for (let i = 0; i <= COARSE_DIVISIONS; i++)
          for (let j = 0; j <= COARSE_DIVISIONS; j++) {
            const c = { x: t.x + (t.width * i) / COARSE_DIVISIONS, y: t.y + (t.height * j) / COARSE_DIVISIONS };
            if (Math.abs(c.x - start.x) > EPS || Math.abs(c.y - start.y) > EPS) centers.push(c);
          }
      }
      for (const center of centers) {
        const dx = (center.x - sh.c1.x) / (t.width / 2);
        const dy = (center.y - sh.c1.y) / (t.height / 2);
        this.order.push({ si, center, cost: dx * dx + dy * dy + sc * sc, id: -1 });
      }
      const [x0, y0, x1, y1] = sh.bbox0;
      region = [Math.min(region[0], t.x + x0), Math.min(region[1], t.y + y0), Math.max(region[2], t.x + t.width + x1), Math.max(region[3], t.y + t.height + y1)];
    }
    this.region = region;
    const shapes = this.shapes;
    this.order.sort(
      (a, b) =>
        a.cost - b.cost ||
        shapes[b.si].s - shapes[a.si].s ||
        Math.hypot(a.center.x - shapes[a.si].c1.x, a.center.y - shapes[a.si].c1.y) - Math.hypot(b.center.x - shapes[b.si].c1.x, b.center.y - shapes[b.si].c1.y) ||
        a.center.y - b.center.y ||
        a.center.x - b.center.x,
    );
    this.order.forEach((c, i) => (c.id = i));
  }

  private aloneReject(c: Cand): AloneReject | null {
    return stageReject(this.m, shift(this.shapes[c.si].outer0, c.center), this.frame);
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

function place(m: A13MobileSlot, shape: Shape, cand: Cand): Placed {
  return { m, shape, cand, outer: shift(shape.outer0, cand.center), photo: shift(shape.photo0, cand.center) };
}

interface CheckContext {
  hitPx: number;
  /** Slot id of the manifest's dominant slot (G2, G3), or null. */
  dominant: string | null;
  minima: Record<string, { photo: number; outer: number }>;
}

/** Visibility and 44 px reachability of one print under the papers above it. */
function reachRules(m: A13MobileSlot, outer: Point[], photo: Point[], covers: Point[][], ctx: CheckContext): MobileJointFailure[] {
  const failures: MobileJointFailure[] = [];
  const id = m.slotId;
  const min = ctx.minima[id];
  const vp = visibleFraction(photo, covers);
  const vo = visibleFraction(outer, covers);
  if (vp < min.photo - EPS) failures.push({ slotId: id, rule: "visible-photo", value: vp, minimum: min.photo });
  if (vo < min.outer - EPS) failures.push({ slotId: id, rule: "visible-outer", value: vo, minimum: min.outer });
  if (failures.length) return failures;
  const need = Math.ceil(ctx.hitPx - EPS);
  const h = largestVisibleSquare(outer, covers, need);
  if (h.side < need) failures.push({ slotId: id, rule: "hit-target", value: h.side, minimum: need });
  return failures;
}

/** Pairwise dominance (G2, G3): the dominant slot keeps the largest outer area. */
function dominanceRule(p: { m: A13MobileSlot; area: number }, others: Placed[], ctx: CheckContext): MobileJointFailure[] {
  if (!ctx.dominant) return [];
  for (const o of others) {
    const [domId, domArea, otherArea] = p.m.slotId === ctx.dominant ? [p.m.slotId, p.area, o.shape.area] : o.m.slotId === ctx.dominant ? [o.m.slotId, o.shape.area, p.area] : [null, 0, 0];
    if (domId && domArea < otherArea - EPS) return [{ slotId: domId, rule: "dominance", value: domArea, minimum: otherArea }];
  }
  return [];
}

/**
 * Every hard rule of ONE print `p` against the prints painted above it
 * (`upper`) — which is all a print's rules depend on — plus the pairwise
 * dominance test against the prints already placed (`others`).
 */
function checkSlot(p: Placed, upper: Placed[], others: Placed[], ctx: CheckContext): MobileJointFailure[] {
  const dom = dominanceRule({ m: p.m, area: p.shape.area }, others, ctx);
  if (dom.length) return dom;
  return reachRules(p.m, p.outer, p.photo, upper.map((q) => q.outer), ctx);
}

/** Witness minima (shared V2 caps): visible photo ≥ min(0.35, witness), paper ≥ min(0.30, witness). */
export function mobileWitnessBaseline(state: A13MobileStateId, metrics: MobileMetrics) {
  const slots = A13_MOBILE_STATE_SLOTS[state];
  const placed: Placed[] = slots.map((m) => place(m, shapeFor(m, { width: witnessMediaRatio(m, metrics) * 1000, height: 1000 }, 1, metrics), { si: 0, center: m.referenceCenter, cost: 0, id: 0 }));
  const o = A13_V2_CONTRACT.occlusion;
  return placed.map((p) => {
    const covers = placed.filter((q) => q.m.paintOrder > p.m.paintOrder).map((q) => q.outer);
    const vp = visibleFraction(p.photo, covers);
    const vo = visibleFraction(p.outer, covers);
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

/** Caption readability diagnostic (V1.6: never a rule). */
export interface MobileCaptionDiagnostic {
  /** captionSafeZone (glyph box + 6 / 4 CSS px, transformed with the print), GROUP frame. */
  safeZone: Point[];
  /** Share of the safe zone under the paper of prints painted above (0 = free). */
  occludedFraction: number;
  /** Prints painted above meeting the safe zone. */
  coveredBy: string[];
}

export interface MobileGalleryEntry<M> {
  /** Shared engine slot, GROUP frame: `center` = paper centre, `zIndex` = paint order, anchor `center`. */
  slot: A13Slot;
  mobileSlot: A13MobileSlot;
  /** The print; `band` is wider than `outer` only for a widened narrow print. */
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  /** Caption readability diagnostic, or null (no caption). */
  captionDiagnostic: MobileCaptionDiagnostic | null;
  media: M;
  mediaIndex: number;
  scale: number;
  center: Point;
  /** Pivot-preserving centre before the territory translation. */
  pivotCenter: Point;
  outer: Point[];
  /** Every paper part (the print, + the widened band), GROUP frame. */
  papers: Point[][];
  bandWidening: { from: number; to: number; envelope: number } | null;
  visiblePhoto: number;
  visibleOuter: number;
  /** Largest axis-aligned square in the visible paper (source px) and its centre. */
  hitTarget: { side: number; center: Point };
}

export interface MobileGalleryAnomaly {
  code: MobileRunStop | "MOBILE_SOLVER_EXCEPTION";
  rule: string;
  detail: string;
  /**
   * What the STOP rests on: `per-print` — one print has no candidate at all
   * (its own stage rules: canvas, title block, CTA); `lattice-exhausted` —
   * the coarse search examined every composition of its lattice;
   * `search-budget` — the search stopped at its budget (not a proof).
   */
  basis?: "per-print" | "lattice-exhausted" | "search-budget";
}

/** The resolved Signature 7+ CTA (V1.7), STAGE frame. */
export interface MobileCtaLayout {
  /** Lowest point of the six resolved outer papers (CSS px from the stage top). */
  groupVisualBottomCss: number;
  safeBoxTopCss: number;
  safeBoxHeightCss: number;
  boxTopCss: number;
  boxHeightCss: number;
  stageHeightCss: number;
  /** Safe box top − group bottom, and stage bottom − safe box bottom (CSS px, ≥ 24). */
  gapBeforeCss: number;
  gapAfterCss: number;
  /** Source px, stage frame. */
  safeBox: A13MobileRect;
  box: A13MobileRect;
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
  /** The resolved 7+ CTA, or null. */
  cta: MobileCtaLayout | null;
  /** The state's ONE group translation (source px, applied to the group container). */
  translateY: number;
  /** Stage height (source px): 1672 + the state's extension; 7+: resolved after the CTA. */
  stageHeight: number;
  /** QA observations (never a rejection): solver stage, caption shifts, covered captions, band widenings. */
  signals: string[];
  search: { expansions: number; stage: "fine" | "coarse"; aloneRejected: Record<string, Record<AloneReject, number>> };
}

export interface MobileRunInput<M extends PhotoSource> {
  media: readonly M[];
  captionOf: (m: M, index: number) => string | null;
  /** The shared caption measurer (measuring at `SHARED_MEASURER_FONT_PX`), or null. */
  measurer: CaptionMeasurer | null;
  /** Width of the Mobile stage in CSS px (375–430). */
  stageWidth: number;
  /** Device pixel ratio for `ceilToDevicePixel` (default 1). */
  devicePixelRatio?: number;
}

export function runMobileGallery<M extends PhotoSource>(input: MobileRunInput<M>): MobileGalleryRun<M> {
  const metrics = mobileMetrics(input.stageWidth);
  const stateId = selectMobileGalleryState(input.media.length);
  const head = { profile: "mobile" as const, stageWidth: input.stageWidth, metrics, mediaCount: input.media.length };
  const empty = { entries: [], hasCta: false, cta: null, signals: [], search: { expansions: 0, stage: "fine" as const, aloneRejected: {} } };
  if (!stateId) return { ...head, ...empty, stateId: null, outcome: "absent", status: "GALLERY_ABSENT", anomaly: null, translateY: 0, stageHeight: 0 };
  const tr = A13_MOBILE_GROUP_TRANSLATION[stateId];
  const frame = { translateY: tr.translateYSource, stageHeight: tr.stageHeightSource };
  try {
    return solveMobileState(stateId, input, metrics, { ...head, ...frame });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ...head, ...frame, ...empty, stateId, outcome: "unresolved", status: "MOBILE_SOLVER_EXCEPTION", anomaly: { code: "MOBILE_SOLVER_EXCEPTION", rule: "exception", detail } };
  }
}

type RunHead = Pick<MobileGalleryRun<unknown>, "profile" | "stageWidth" | "metrics" | "mediaCount" | "translateY" | "stageHeight">;

/** Search node: the prints placed so far (top of the stack first), the candidate index tried for the next one, the admissible cost of the prints after it. */
interface SearchNode {
  prefix: Placed[];
  g: number;
  next: number;
  restH: number;
  f: number;
}

/** Binary min-heap on f = Master distance so far + the admissible rest. */
class NodeHeap {
  private a: SearchNode[] = [];
  get size() {
    return this.a.length;
  }
  push(v: SearchNode) {
    const a = this.a;
    a.push(v);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
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
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Group-frame view of the stage items of a state (everything − T); the 7+ CTA is placed after the group (`resolveMobileCta`). */
function groupFrame(state: A13MobileStateId, metrics: MobileMetrics): GroupFrame {
  const T = A13_MOBILE_GROUP_TRANSLATION[state].translateYSource;
  return {
    top: -T,
    bottom: A13_MOBILE_GROUP_TRANSLATION[state].stageHeightSource - T,
    title: rectPoly({ ...metrics.titleBlock, y: metrics.titleBlock.y - T }),
  };
}

/**
 * The Signature 7+ CTA and stage height after the resolved photo group
 * (`geometry/g7plus.json` `cta.verticalPlacementCss`): 24 CSS px below the
 * lowest point of the final paper polygons (group frame — outer papers and
 * any widened caption band, shadows excluded), the V1.6 inset and sizes,
 * 24 CSS px of breathing after the safe box, rounded up to the device pixel.
 */
export function resolveMobileCta(papers: Point[][], T: number, metrics: MobileMetrics, dpr = 1): MobileCtaLayout {
  const S = metrics.scale;
  const v = A13_MOBILE_CTA.vertical;
  const h = A13_MOBILE_CTA.horizontal;
  const ceilDP = (x: number) => Math.ceil(x * dpr - 1e-6) / dpr;
  const groupVisualBottomCss = (Math.max(...papers.flatMap((p) => p.map((q) => q.y))) + T) * S;
  const safeBoxTopCss = ceilDP(groupVisualBottomCss + v.gapGroupToSafeBoxCss);
  const safeBoxHeightCss = v.safeBoxHeightSource * S;
  const boxTopCss = safeBoxTopCss + v.boxTopInsetSource * S;
  const boxHeightCss = Math.max(v.boxMinHeightCss, v.boxHeightSource * S);
  const stageHeightCss = ceilDP(Math.max(v.baseStageHeightSource * S, safeBoxTopCss + safeBoxHeightCss + v.bottomBreathingCss));
  return {
    groupVisualBottomCss,
    safeBoxTopCss,
    safeBoxHeightCss,
    boxTopCss,
    boxHeightCss,
    stageHeightCss,
    gapBeforeCss: safeBoxTopCss - groupVisualBottomCss,
    gapAfterCss: stageHeightCss - (safeBoxTopCss + safeBoxHeightCss),
    safeBox: { x: h.safeBoxX, y: safeBoxTopCss / S, width: h.safeBoxWidth, height: v.safeBoxHeightSource },
    box: { x: h.boxX, y: boxTopCss / S, width: h.boxWidth, height: boxHeightCss / S },
  };
}

interface SearchResult {
  /** Manifest order, or null. */
  placed: Placed[] | null;
  expansions: number;
  exhausted: boolean;
  failed: Record<string, number>;
}

/**
 * Best-first search (A*) for the joint candidate of least Master distance
 * meeting every hard rule. Prints are placed from the top of the stack
 * down: a print's rules depend only on itself and the prints above it, so
 * each partial composition is final for the prints it holds and a failing
 * one is pruned with all its completions. Successors are generated lazily
 * in cost order (the next print's first candidate, and the next candidate
 * of the last print). Heuristic: for every print still to place, the cost
 * of its cheapest valid-alone candidate — with `forward`, its cheapest
 * candidate still meeting the dominance rule against the prints placed (a
 * print left without one prunes the partial composition at once). Both
 * never overestimate, so the first complete composition popped has the
 * least total distance. `dedupe`: two partial compositions that the
 * remaining prints cannot tell apart (same placed prints overlapping them,
 * same dominance data) are one; the costlier is dropped.
 */
function search(slots: readonly A13MobileSlot[], streams: SlotStream[], ctx: CheckContext, budget: number, opts: { dedupe: boolean; forward: boolean }): SearchResult {
  const n = slots.length;
  const order = slots.map((_, i) => i).sort((a, b) => slots[b].paintOrder - slots[a].paintOrder);
  const indexOf = new Map(slots.map((m, i) => [m, i]));
  const uppersOf = slots.map((m, i) => slots.map((_, j) => j).filter((j) => slots[j].paintOrder > m.paintOrder && overlap(streams[i].region, streams[j].region)));
  const domKey = (prefix: Placed[], remaining: A13MobileSlot[]) => {
    if (!ctx.dominant) return "";
    const dom = prefix.find((q) => q.m.slotId === ctx.dominant);
    if (dom) return `dom:${dom.shape.area}`;
    return remaining.some((j) => j.slotId === ctx.dominant) ? `max:${Math.max(0, ...prefix.map((q) => q.shape.area))}` : "";
  };
  const memo = new Map<string, { cost: number; idx: number } | null>();
  /** Cheapest candidate of the print at `level` meeting the dominance rule against `prefix`. */
  const cheapest = (prefix: Placed[], level: number): { cost: number; idx: number } | null => {
    const st = streams[order[level]];
    const dk = opts.forward ? domKey(prefix, [slots[order[level]]]) : "";
    if (!dk) return { cost: st.at(0)!.cost, idx: 0 };
    const key = `${order[level]}|${dk}`;
    if (memo.has(key)) return memo.get(key)!;
    let found: { cost: number; idx: number } | null = null;
    for (let k = 0; ; k++) {
      const c = st.at(k);
      if (!c) break;
      if (!dominanceRule({ m: st.m, area: st.shapes[c.si].area }, prefix, ctx).length) {
        found = { cost: c.cost, idx: k };
        break;
      }
    }
    memo.set(key, found);
    return found;
  };
  /** Heuristic data for the prints after `prefix`: first index and cost of the next one, sum of the others. */
  const lookahead = (prefix: Placed[]) => {
    const l0 = prefix.length;
    let restH = 0;
    let first: { cost: number; idx: number } | null = null;
    for (let l = l0; l < n; l++) {
      const c = cheapest(prefix, l);
      if (!c) return null;
      if (l === l0) first = c;
      else restH += c.cost;
    }
    return { first: first!, restH };
  };
  const streamOf = (level: number) => streams[order[level]];
  const seen = new Set<string>();
  const keyOf = (prefix: Placed[]) => {
    const remaining = order.slice(prefix.length).map((i) => slots[i]);
    const parts = prefix.filter((q) => remaining.some((j) => uppersOf[indexOf.get(j)!].includes(indexOf.get(q.m)!))).map((q) => `${q.m.slotId}:${q.cand.id}`);
    return `${prefix.length}|${parts.join(";")}|${domKey(prefix, remaining)}`;
  };
  const failed: Record<string, number> = {};
  const heap = new NodeHeap();
  const pushAt = (prefix: Placed[], g: number, next: number, restH: number) => {
    const c = streamOf(prefix.length).at(next);
    if (c) heap.push({ prefix, g, next, restH, f: g + c.cost + restH });
  };
  let expansions = 0;
  const root = lookahead([]);
  if (root) pushAt([], 0, root.first.idx, root.restH);
  while (heap.size && expansions < budget) {
    const node = heap.pop();
    expansions++;
    const level = node.prefix.length;
    const st = streamOf(level);
    const cand = st.at(node.next)!;
    // The next candidate of this print, whatever this one gives.
    pushAt(node.prefix, node.g, node.next + 1, node.restH);
    const p = place(st.m, st.shapes[cand.si], cand);
    const failures = checkSlot(p, node.prefix, node.prefix, ctx);
    if (failures.length) {
      for (const f of failures) failed[`${f.slotId}:${f.rule}`] = (failed[`${f.slotId}:${f.rule}`] ?? 0) + 1;
      continue;
    }
    const prefix = [...node.prefix, p];
    const g = node.g + cand.cost;
    if (prefix.length === n) return { placed: slots.map((m) => prefix.find((q) => q.m === m)!), expansions, exhausted: false, failed };
    if (opts.dedupe) {
      const key = keyOf(prefix);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const la = lookahead(prefix);
    if (!la) continue;
    pushAt(prefix, g, la.first.idx, la.restH);
  }
  return { placed: null, expansions, exhausted: heap.size === 0, failed };
}

/**
 * Solver: (1) the exact search on the fine grid (4 px, scale 0.02) within
 * a small budget — the common case, the least Master distance; (2) when it
 * finds nothing, the exact search on the coarse lattice (territory quarters
 * + the pivot projection, five scales from the range) with duplicate
 * partial compositions dropped — the least distance on that lattice. Every
 * rule is identical in both stages; only the candidate set differs.
 * Nothing found → STOP. Captions play no part (V1.6): they are laid out
 * afterwards (`finishEntries`).
 */
function solveMobileState<M extends PhotoSource>(state: A13MobileStateId, input: MobileRunInput<M>, metrics: MobileMetrics, head: RunHead): MobileGalleryRun<M> {
  const slots = A13_MOBILE_STATE_SLOTS[state];
  const hasCta = state === "G7PLUS";
  // 7+ is solved exactly as G6: the CTA constrains no print (V1.7).
  const frame = groupFrame(state, metrics);
  // Family order: media[i] → the slot whose mediaIndex is i (Signature shows 0…5).
  const streamsFor = (grid: Grid) => slots.map((m) => new SlotStream(m, input.media[m.mediaIndex], metrics, frame, grid));
  const fine = streamsFor("fine");
  let streams = fine;
  const aloneRejected = () => Object.fromEntries(streams.map((s) => [s.m.slotId, { ...s.rejected }]));
  const unresolved = (anomaly: MobileGalleryAnomaly, expansions: number, stage: "fine" | "coarse"): MobileGalleryRun<M> => ({
    ...head,
    stateId: state,
    outcome: "unresolved",
    status: anomaly.code,
    anomaly,
    entries: [],
    hasCta: false,
    cta: null,
    signals: [],
    search: { expansions, stage, aloneRejected: aloneRejected() },
  });

  // A print with no candidate at all: on the fine grid, then on the coarse lattice (which holds other points).
  let coarse: SlotStream[] | null = null;
  for (const [i, st] of fine.entries()) {
    if (st.at(0)) continue;
    coarse ??= streamsFor("coarse");
    if (coarse[i].at(0)) continue;
    const r = { ...st.rejected };
    for (const [k, v] of Object.entries(coarse[i].rejected)) r[k as AloneReject] += v;
    const code = (Object.keys(r) as AloneReject[]).reduce((a, k) => (r[k] > r[a] ? k : a));
    return unresolved({ code, rule: "alone", basis: "per-print", detail: `${st.m.slotId}: no scale/centre in its territory passes (${JSON.stringify(r)})` }, 0, "fine");
  }

  const witness = mobileWitnessBaseline(state, metrics);
  const ctx: CheckContext = {
    hitPx: metrics.hitTargetPx,
    dominant: A13_MOBILE_RELATIONS[state].find((r) => r.dominant)?.dominant ?? null,
    minima: Object.fromEntries(slots.map((m, i) => [m.slotId, { photo: witness[i].photo, outer: witness[i].outer }])),
  };

  let stage: "fine" | "coarse" = "fine";
  // The fine stage needs a candidate for every print.
  const fineReady = fine.every((st) => st.at(0));
  let res: SearchResult = fineReady ? search(slots, fine, ctx, FINE_BUDGET, { dedupe: false, forward: false }) : { placed: null, expansions: 0, exhausted: false, failed: {} };
  let expansions = res.expansions;
  const stats = fineReady ? [res] : [];
  if (!res.placed && !(fineReady && res.exhausted)) {
    coarse ??= streamsFor("coarse");
    if (coarse.every((st) => st.at(0))) {
      stage = "coarse";
      streams = coarse;
      res = search(slots, coarse, ctx, COARSE_BUDGET, { dedupe: true, forward: true });
      expansions += res.expansions;
      stats.push(res);
    }
  }
  if (res.placed) {
    for (const q of res.placed) {
      const tr = q.m.centerTerritory;
      const c = q.cand.center;
      if (c.x < tr.x - EPS || c.x > tr.x + tr.width + EPS || c.y < tr.y - EPS || c.y > tr.y + tr.height + EPS)
        return unresolved({ code: "CENTER_OUTSIDE_TERRITORY", rule: "territory", detail: `${q.m.slotId} at ${c.x},${c.y}` }, expansions, stage);
    }
    const T = A13_MOBILE_GROUP_TRANSLATION[state].translateYSource;
    // 7+ is finished exactly as G6, then its CTA is placed after the final papers.
    const { entries, signals } = finishEntries(res.placed, input, metrics, frame, ctx);
    const cta = hasCta ? resolveMobileCta(entries.flatMap((e) => e.papers), T, metrics, input.devicePixelRatio ?? 1) : null;
    if (cta) {
      const safe = rectPoly({ ...cta.safeBox, y: cta.safeBox.y - T });
      const hit = entries.find((e) => e.papers.some((p) => convexIntersectionArea(p, safe) > EPS));
      if (hit) return unresolved({ code: "CTA_COLLISION_UNRESOLVED", rule: "cta", basis: "per-print", detail: `${hit.slot.slotId} meets the resolved CTA safe box` }, expansions, stage);
      signals.push(`cta: group bottom ${cta.groupVisualBottomCss.toFixed(2)} px, safe box top ${cta.safeBoxTopCss.toFixed(2)} px, stage ${cta.stageHeightCss.toFixed(2)} px (gaps ${cta.gapBeforeCss.toFixed(2)} / ${cta.gapAfterCss.toFixed(2)})`);
    }
    if (stage === "coarse") signals.unshift(`solver: coarse lattice stage (the fine stage found no composition within ${FINE_BUDGET} partial compositions)`);
    return {
      ...head,
      stageHeight: cta ? cta.stageHeightCss / metrics.scale : head.stageHeight,
      stateId: state,
      outcome: "resolved",
      status: "PASS",
      anomaly: null,
      entries,
      hasCta,
      cta,
      signals,
      search: { expansions, stage, aloneRejected: aloneRejected() },
    };
  }
  const failed: Record<string, number> = {};
  for (const r of stats) for (const [k, v] of Object.entries(r.failed)) failed[k] = (failed[k] ?? 0) + v;
  const worst = Object.entries(failed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return unresolved(
    {
      code: "ITEM_INACCESSIBLE",
      rule: worst.map(([k]) => k).join(",") || "exhausted",
      basis: res.exhausted ? "lattice-exhausted" : "search-budget",
      detail: `no composition (${stats.map((r, i) => `${i || !fineReady ? "coarse" : "fine"}: ${r.expansions} partial compositions, ${r.exhausted ? "space exhausted" : "budget reached"}`).join("; ")}); most frequent failures ${JSON.stringify(Object.fromEntries(worst))}`,
    },
    expansions,
    stage,
  );
}

// ── Captions on the solved composition (V1.6) ──────────────────────────

/**
 * The solved composition, unchanged, then its captions:
 *
 * 1. narrow prints, from the top of the stack down: when the best two-line
 *    break still overflows the useful width, the bottom band widens (only
 *    the band, symmetrically, within the envelope) IF the widened band
 *    keeps the stage rules of its slot (canvas, title block, CTA) and every
 *    print below it keeps its visibility minima and 44 px target —
 *    otherwise the band stays as is;
 * 2. each caption laid out by the shared logic against the paper of the
 *    prints above it (centred, moved along the band when that frees its
 *    glyphs); a caption still covered is an allowed state, reported with
 *    the covered share of its safe zone.
 */
function finishEntries<M extends PhotoSource>(placed: Placed[], input: MobileRunInput<M>, metrics: MobileMetrics, frame: GroupFrame, ctx: CheckContext) {
  const signals: string[] = [];
  const measurer = input.measurer ? scaleMeasurer(input.measurer, metrics.captionFontPx / SHARED_MEASURER_FONT_PX) : null;
  const texts = placed.map((p) => input.captionOf(input.media[p.m.mediaIndex], p.m.mediaIndex));
  const layouts = placed.map((p) => p.shape.layout);
  const papers = placed.map((p) => [p.outer]);
  const widenings: MobileGalleryEntry<M>["bandWidening"][] = placed.map(() => null);
  const below = (i: number) => placed.map((_, j) => j).filter((j) => placed[j].m.paintOrder < placed[i].m.paintOrder);
  const coversOf = (j: number) => placed.flatMap((q, k) => (q.m.paintOrder > placed[j].m.paintOrder ? papers[k] : []));
  const topFirst = placed.map((_, i) => i).sort((a, b) => placed[b].m.paintOrder - placed[a].m.paintOrder);

  if (measurer)
    for (const i of topFirst) {
      const p = placed[i];
      const text = texts[i];
      if (!text) continue;
      const base = p.shape.layout;
      const inset = metrics.captionInsetPx;
      const useful = base.band.width - 2 * inset;
      const needed = Math.max(...breakCaption(text, useful, (t) => measurer.measure(t)).map((l) => measurer.measure(l).width));
      if (needed <= useful + 1e-9) continue;
      const to = needed + 2 * inset;
      const envelope = p.m.outerReference.width * p.shape.s;
      const id = p.m.slotId;
      if (to > envelope + EPS) {
        signals.push(`${id}: caption band not widened (${to.toFixed(1)} px needed > envelope ${envelope.toFixed(1)}) — best two-line caption drawn`);
        continue;
      }
      const layout = { ...base, band: { ...base.band, x: (base.outer.width - to) / 2, width: to } };
      const wing = slotRectToCanvas(mobileEngineSlot(p.m, p.cand.center), { x: layout.outer.x + layout.band.x, y: layout.outer.y + layout.band.y, width: layout.band.width, height: layout.band.height });
      const stageRule = stageReject(p.m, wing, frame);
      const prev = papers[i];
      papers[i] = [p.outer, wing];
      const broken = stageRule ? [] : below(i).flatMap((j) => reachRules(placed[j].m, placed[j].outer, placed[j].photo, coversOf(j), ctx));
      if (stageRule || broken.length) {
        papers[i] = prev;
        signals.push(`${id}: caption band not widened (${stageRule ?? broken.map((f) => `${f.slotId}:${f.rule}`).join(",")}) — best two-line caption drawn`);
        continue;
      }
      layouts[i] = layout;
      widenings[i] = { from: base.band.width, to, envelope };
      signals.push(`${id}: caption band widened ${base.band.width.toFixed(1)} → ${to.toFixed(1)} px (envelope ${envelope.toFixed(1)})`);
    }

  const entries = placed.map((p, i): MobileGalleryEntry<M> => {
    const slot = mobileEngineSlot(p.m, p.cand.center);
    const media = input.media[p.m.mediaIndex];
    const covers = coversOf(i);
    const obstacles = placed.flatMap((q, k) => (q.m.paintOrder > p.m.paintOrder ? papers[k].map((polygon) => ({ slotId: q.m.slotId, polygon })) : []));
    const text = texts[i];
    const caption = measurer && text ? layoutCaption(slot, layouts[i], text, measurer, obstacles, metrics.captionProfile) : null;
    let captionDiagnostic: MobileCaptionDiagnostic | null = null;
    if (caption) {
      const pb = caption.protectedBox;
      const safeZone = slotRectToCanvas(slot, { x: layouts[i].outer.x + pb.x, y: layouts[i].outer.y + pb.y, width: pb.width, height: pb.height });
      const occludedFraction = coveredFraction(safeZone, covers);
      const coveredBy = [...new Set(obstacles.filter((o) => convexIntersectionArea(safeZone, o.polygon) > EPS).map((o) => o.slotId))];
      captionDiagnostic = { safeZone, occludedFraction, coveredBy };
      if (caption.shiftX !== 0) signals.push(`${p.m.slotId}: caption moved ${caption.shiftX.toFixed(1)} px along its band to keep its glyphs free`);
      if (occludedFraction > 0) signals.push(`${p.m.slotId}: caption ${Math.round(occludedFraction * 100)} % covered by ${coveredBy.join("+")} (allowed; the Viewer reads it)`);
    }
    return {
      slot,
      mobileSlot: p.m,
      layout: layouts[i],
      caption,
      captionDiagnostic,
      media,
      mediaIndex: p.m.mediaIndex,
      scale: p.shape.s,
      center: p.cand.center,
      pivotCenter: p.shape.c1,
      outer: p.outer,
      papers: papers[i],
      bandWidening: widenings[i],
      visiblePhoto: visibleFraction(p.photo, covers),
      visibleOuter: visibleFraction(p.outer, covers),
      hitTarget: largestVisibleSquare(p.outer, covers, 0),
    };
  });
  return { entries, signals };
}
