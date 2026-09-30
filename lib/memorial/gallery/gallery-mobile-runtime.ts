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
 * A13 Gallery — MOBILE LIGHT runtime (Handoff V1.5), 375–430 px.
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
 *   shifted along the band only to keep their glyphs free) at the Mobile
 *   caption size;
 * - visibility and reachability tests = the shared V2 primitives.
 *
 * Mobile-only (this module): the 941-wide frame, the state's group
 * translation and stage height, `anchorPivot`, `centerTerritory`,
 * `paperOverflowAllowance`, the canonical title block, the caption safe
 * zones and the Signature CTA safe box.
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
 * ## Captions (V1.5)
 *
 * 12 / 14.5 CSS px, centred in the fixed 42 px band with an 8 px inset,
 * never shrunk, never more than two lines (the shared break). When the
 * best two-line break still has a line wider than the useful width (a
 * narrow print), ONLY the bottom band widens, symmetrically, to that line
 * + the two insets — the photo window, the scale and the font are
 * unchanged — within the slot envelope, read as the witness paper width at
 * the same scale (`outerReference.width × s`); beyond it the scale is
 * rejected (`CAPTION_SAFE_ZONE_UNRESOLVED`). The widened band is paper: it
 * counts in every paper test (canvas, title, CTA, covering). The
 * `captionSafeZone` is the union of the laid-out glyph boxes + 6 / 4 CSS
 * px, transformed with the print; no caption → no zone. Where a print
 * painted above meets the centred zone, the shared caption logic moves
 * ONLY the text along the band (2 CSS px steps, ≤ 18 % of the band width,
 * ink kept on the band — V2.1 §2); the zone is where the text ends up.
 *
 * ## Hard rules (reject a candidate) → STOP codes
 *
 * - `CENTER_OUTSIDE_TERRITORY`: never produced by construction (every
 *   candidate centre is in its territory) — checked again on the answer;
 * - `PAPER_OVERFLOW_EXCEEDED`: the rotated outer paper leaves the stage by
 *   more than its per-side allowance (canvasInset 0; shadows excluded);
 * - `TITLE_BLOCK_COLLISION_UNRESOLVED`: the outer paper meets the centred
 *   protected title block (width and bottom per viewport, from y = 0);
 * - `CTA_COLLISION_UNRESOLVED` (Signature 7+): the outer paper meets the
 *   CTA safe box;
 * - `CAPTION_SAFE_ZONE_UNRESOLVED`: a caption cannot fit two lines within
 *   the envelope, or no joint candidate lets the shared caption logic place
 *   every caption with its safe zone free of the paper of every print
 *   painted above it;
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
  | "CAPTION_SAFE_ZONE_UNRESOLVED"
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
    // The shared caption logic: V1.5 size / leading / inset / safe-zone padding; the shared 2 px step and ±18 % band shift.
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

/** The caption of one print at one scale, centred in its band (shift 0). */
interface ShapeCaption {
  text: string;
  layout: CaptionLayout;
  /** Safe zone polygon relative to the paper centre (protected box, rotated). */
  safe0: Point[];
}

interface Shape {
  s: number;
  /** The print; its `band` is the widened band when a narrow print needed it. */
  layout: PolaroidLayout;
  /** Paper centre keeping the pivot (before territory translation). */
  c1: Point;
  /** Polygons relative to the paper centre. */
  outer0: Point[];
  photo0: Point[];
  /** Every paper part: the print, plus the widened band when there is one. */
  papers0: Point[][];
  /** Bounds of every paper part. */
  bbox0: [number, number, number, number];
  area: number;
  caption: ShapeCaption | null;
  /** Widened band width and the envelope it had to fit (source px), or null. */
  widening: { from: number; to: number; envelope: number } | null;
  /** A caption that cannot fit two lines within the envelope at this scale. */
  captionUnresolved: boolean;
}

function shapeFor(m: A13MobileSlot, source: PhotoSource, s: number, metrics: MobileMetrics, text: string | null, measurer: CaptionMeasurer | null): Shape {
  const origin = mobileEngineSlot(m, { x: 0, y: 0 });
  const base = layoutDynamicPolaroid(origin, source, s * s, metrics.paperProfile);
  let layout = base;
  let widening: Shape["widening"] = null;
  let captionUnresolved = false;
  let caption: ShapeCaption | null = null;
  if (text && measurer) {
    // Narrow print: the shared best break at the band's useful width; a line
    // still wider widens ONLY the band, symmetrically, to that line + insets.
    const inset = metrics.captionInsetPx;
    const useful = base.band.width - 2 * inset;
    const needed = Math.max(...breakCaption(text, useful, (t) => measurer.measure(t)).map((l) => measurer.measure(l).width));
    if (needed > useful + 1e-9) {
      const to = needed + 2 * inset;
      const envelope = m.outerReference.width * s;
      widening = { from: base.band.width, to, envelope };
      if (to > envelope + EPS) captionUnresolved = true;
      layout = { ...base, band: { ...base.band, x: (base.outer.width - to) / 2, width: to } };
    }
    const cap = layoutCaption(origin, layout, text, measurer, [], metrics.captionProfile);
    const pb = cap.protectedBox;
    caption = { text, layout: cap, safe0: slotRectToCanvas(origin, { x: layout.outer.x + pb.x, y: layout.outer.y + pb.y, width: pb.width, height: pb.height }) };
  }
  const outer0 = slotRectToCanvas(origin, layout.outer);
  const photo0 = slotRectToCanvas(origin, {
    x: layout.outer.x + layout.window.x + layout.photo.x,
    y: layout.outer.y + layout.window.y + layout.photo.y,
    width: layout.photo.width,
    height: layout.photo.height,
  });
  const papers0 = widening
    ? [outer0, slotRectToCanvas(origin, { x: layout.outer.x + layout.band.x, y: layout.outer.y + layout.band.y, width: layout.band.width, height: layout.band.height })]
    : [outer0];
  const xs = papers0.flat().map((p) => p.x);
  const ys = papers0.flat().map((p) => p.y);
  return {
    s,
    layout,
    c1: pivotCenter(m, layout.outer.width, layout.outer.height),
    outer0,
    photo0,
    papers0,
    bbox0: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    area: layout.outer.width * layout.outer.height,
    caption,
    widening,
    captionUnresolved,
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
  /** Rank in the stream (identity). */
  id: number;
}

type AloneReject = "PAPER_OVERFLOW_EXCEEDED" | "TITLE_BLOCK_COLLISION_UNRESOLVED" | "CTA_COLLISION_UNRESOLVED" | "CAPTION_SAFE_ZONE_UNRESOLVED";

/** Stage-frame items brought into the GROUP frame (y − T). */
interface GroupFrame {
  /** Stage edges: x ∈ [0, 941], y ∈ [top, bottom]. */
  top: number;
  bottom: number;
  title: Point[];
  ctaSafe: Point[] | null;
}

const hits = (papers: Point[][], zone: Point[]) => papers.some((p) => convexIntersectionArea(p, zone) > EPS);

/**
 * Separating-axis test: do two convex polygons overlap by more than `tol`
 * along every edge normal? (`tol` = 1e-3 px: an overlap it reports is a
 * collision for the area rule too.)
 */
function convexOverlap(a: Point[], b: Point[], tol = 1e-3): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < EPS) continue;
      const nx = (q.y - p.y) / len;
      const ny = (p.x - q.x) / len;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const r of a) {
        const d = r.x * nx + r.y * ny;
        a0 = Math.min(a0, d);
        a1 = Math.max(a1, d);
      }
      for (const r of b) {
        const d = r.x * nx + r.y * ny;
        b0 = Math.min(b0, d);
        b1 = Math.max(b1, d);
      }
      if (a1 - b0 <= tol || b1 - a0 <= tol) return false;
    }
  return true;
}

const overlap = (a: readonly number[], b: readonly number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** A print painted above, as seen by the caption filter of a print below it. */
interface UpperReach {
  slotId: string;
  /** Its outer paper at its smallest scale, centred on each corner of its territory. */
  corners: Point[][];
  region: [number, number, number, number];
}

type Grid = "fine" | "coarse";

class SlotStream {
  readonly shapes: Shape[] = [];
  private readonly order: Cand[] = [];
  private cursor = 0;
  readonly valid: Cand[] = [];
  readonly rejected: Record<AloneReject, number> = { PAPER_OVERFLOW_EXCEEDED: 0, TITLE_BLOCK_COLLISION_UNRESOLVED: 0, CTA_COLLISION_UNRESOLVED: 0, CAPTION_SAFE_ZONE_UNRESOLVED: 0 };
  /** Everything any candidate can cover (papers and caption safe zone), group frame. */
  readonly region: [number, number, number, number];

  constructor(
    readonly m: A13MobileSlot,
    source: PhotoSource,
    metrics: MobileMetrics,
    text: string | null,
    measurer: CaptionMeasurer | null,
    private readonly frame: GroupFrame,
    grid: Grid,
  ) {
    const [lo, hi] = m.scaleRange;
    const t = m.centerTerritory;
    const scales =
      grid === "fine"
        ? Array.from({ length: Math.round(hi / SCALE_STEP) - Math.round(lo / SCALE_STEP) + 1 }, (_, i) => Math.round((Math.round(lo / SCALE_STEP) + i) * SCALE_STEP * 1000) / 1000)
        : [...new Set([lo, (lo + 1) / 2, 1, (1 + hi) / 2, hi].map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
    let region: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of scales) {
      const sh = shapeFor(m, source, s, metrics, text, measurer);
      const si = this.shapes.push(sh) - 1;
      const sc = s >= 1 ? (hi > 1 ? (s - 1) / (hi - 1) : 0) : lo < 1 ? (1 - s) / (1 - lo) : 0;
      // Territory projection of the pivot centre, then the grid through it (fine) or the territory lattice (coarse).
      const start = { x: Math.min(t.x + t.width, Math.max(t.x, sh.c1.x)), y: Math.min(t.y + t.height, Math.max(t.y, sh.c1.y)) };
      const centers: Point[] = [];
      if (grid === "fine") {
        // The 2 px lines through the projection, plus the territory's own edges.
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
      const safe = sh.caption?.safe0 ?? [];
      const xs = [...sh.papers0.flat(), ...safe].map((q) => q.x);
      const ys = [...sh.papers0.flat(), ...safe].map((q) => q.y);
      // A shifted caption stays on its band: widen the safe zone's reach by the band's shift range.
      const reach = sh.caption ? sh.caption.layout.maxShift : 0;
      region = [
        Math.min(region[0], t.x + Math.min(...xs) - reach),
        Math.min(region[1], t.y + Math.min(...ys) - reach),
        Math.max(region[2], t.x + t.width + Math.max(...xs) + reach),
        Math.max(region[3], t.y + t.height + Math.max(...ys) + reach),
      ];
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

  papers(c: Cand) {
    return this.shapes[c.si].papers0.map((p) => shift(p, c.center));
  }

  /**
   * The paper this print covers WHEREVER it is: the intersection of its
   * outer paper over its whole territory at its smallest scale (the
   * rotation is fixed, so it is the rotated rectangle whose edge offsets
   * are the extreme ones over the territory corners), or null.
   */
  core(): Point[] | null {
    const t = this.m.centerTerritory;
    const { width: w, height: h } = this.shapes[0].layout.outer;
    const a = (this.m.rotationDeg * Math.PI) / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const v = { x: -Math.sin(a), y: Math.cos(a) };
    const corners = rectPoly(t);
    const pu = corners.map((c) => u.x * c.x + u.y * c.y);
    const pv = corners.map((c) => v.x * c.x + v.y * c.y);
    const [a0, a1] = [Math.max(...pu) - w / 2, Math.min(...pu) + w / 2];
    const [b0, b1] = [Math.max(...pv) - h / 2, Math.min(...pv) + h / 2];
    if (a1 - a0 <= EPS || b1 - b0 <= EPS) return null;
    return [
      [a0, b0],
      [a1, b0],
      [a1, b1],
      [a0, b1],
    ].map(([A, B]) => ({ x: A * u.x + B * v.x, y: A * u.y + B * v.y }));
  }

  /** The corner papers of `this` at its smallest scale (for the filter of the prints below). */
  cornerPapers(): Point[][] {
    return rectPoly(this.m.centerTerritory).map((c) => shift(this.shapes[0].outer0, c));
  }

  private uppers: UpperReach[] = [];
  private shift: { stepPx: number; factor: number } = { stepPx: 1, factor: 0 };

  /**
   * Caption filter (sound, exact per pair). The rotation of a print is
   * fixed and its paper grows with its scale around its centre, so a print
   * above can keep clear of a convex zone K somewhere in its territory iff
   * it does so at its smallest scale on one of the territory's corners
   * (the centres whose paper meets K form the convex set K ⊕ −paper). A
   * candidate for which NO position of the text on its band (the shared
   * caption shifts) lets EVERY print above keep clear of its safe zone can
   * never be completed — it is rejected alone (`CAPTION_SAFE_ZONE_UNRESOLVED`).
   * It never removes a candidate a complete composition could use.
   */
  setUpperReach(uppers: UpperReach[], profile: CaptionProfile) {
    this.uppers = uppers;
    this.shift = { stepPx: profile.shiftStepPx, factor: profile.maxShiftFactorOfBandWidth };
  }

  private captionFree(sh: Shape, c: Cand): boolean {
    const cap = sh.caption!.layout;
    const band = sh.layout.band;
    const k0 = shift(sh.caption!.safe0, c.center);
    const maxShift = this.shift.factor * band.width;
    const xs = k0.map((q) => q.x);
    const ys = k0.map((q) => q.y);
    const reach: [number, number, number, number] = [Math.min(...xs) - maxShift, Math.min(...ys) - maxShift, Math.max(...xs) + maxShift, Math.max(...ys) + maxShift];
    const rel = this.uppers.filter((u) => overlap(u.region, reach));
    if (!rel.length) return true;
    const a = (this.m.rotationDeg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const dxs = [0];
    for (let d = this.shift.stepPx; d <= maxShift + 1e-9; d += this.shift.stepPx) dxs.push(d, -d);
    for (const dx of dxs) {
      if (dx !== 0 && (cap.ink.x + dx < band.x - 1e-9 || cap.ink.x + cap.ink.width + dx > band.x + band.width + 1e-9)) continue;
      const k = k0.map((q) => ({ x: q.x + dx * ux, y: q.y + dx * uy }));
      if (rel.every((u) => u.corners.some((p) => !convexOverlap(p, k)))) return true;
    }
    return false;
  }

  private aloneReject(c: Cand): AloneReject | null {
    const sh = this.shapes[c.si];
    if (sh.captionUnresolved) return "CAPTION_SAFE_ZONE_UNRESOLVED";
    const a = this.m.paperOverflowAllowance;
    const [x0, y0, x1, y1] = sh.bbox0;
    const { top, bottom } = this.frame;
    if (x0 + c.center.x < -a.left - EPS || y0 + c.center.y < top - a.top - EPS || x1 + c.center.x > A13_MOBILE_CANVAS.width + a.right + EPS || y1 + c.center.y > bottom + a.bottom + EPS)
      return "PAPER_OVERFLOW_EXCEEDED";
    const papers = this.papers(c);
    if (hits(papers, this.frame.title)) return "TITLE_BLOCK_COLLISION_UNRESOLVED";
    if (this.frame.ctaSafe && hits(papers, this.frame.ctaSafe)) return "CTA_COLLISION_UNRESOLVED";
    if (sh.caption && this.uppers.length && !this.captionFree(sh, c)) return "CAPTION_SAFE_ZONE_UNRESOLVED";
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
  rule: "caption-safe-zone" | "dominance" | "visible-photo" | "visible-outer" | "hit-target";
  value: number;
  minimum: number;
}

interface Placed {
  m: A13MobileSlot;
  shape: Shape;
  cand: Cand;
  outer: Point[];
  photo: Point[];
  papers: Point[][];
  /** Caption as placed against the prints above (set by `checkSlot`) and its safe zone. */
  caption: CaptionLayout | null;
  safe: Point[] | null;
  /** Visibility under the prints above (set by `checkSlot`). */
  visiblePhoto: number;
  visibleOuter: number;
}

function place(m: A13MobileSlot, shape: Shape, cand: Cand): Placed {
  const c = cand.center;
  return {
    m,
    shape,
    cand,
    outer: shift(shape.outer0, c),
    photo: shift(shape.photo0, c),
    papers: shape.papers0.map((p) => shift(p, c)),
    caption: shape.caption?.layout ?? null,
    safe: shape.caption ? shift(shape.caption.safe0, c) : null,
    visiblePhoto: NaN,
    visibleOuter: NaN,
  };
}

/** Paper polygons of every print painted above print i. */
function coversOf(placed: Placed[], i: number) {
  return placed.filter((p) => p.m.paintOrder > placed[i].m.paintOrder).flatMap((p) => p.papers);
}

interface CheckContext {
  hitPx: number;
  measurer: CaptionMeasurer | null;
  captionProfile: CaptionProfile;
  /** Slot id of the manifest's dominant slot (G2, G3), or null. */
  dominant: string | null;
  minima: Record<string, { photo: number; outer: number }>;
}

/**
 * Every hard rule of ONE print `p` against the prints painted above it
 * (`upper`) — which is all a print's rules depend on — plus the pairwise
 * dominance test against the prints already placed (`others`). Sets the
 * print's caption placement, safe zone and visibility.
 */
function checkSlot(p: Placed, upper: Placed[], others: Placed[], ctx: CheckContext): MobileJointFailure[] {
  const failures: MobileJointFailure[] = [];
  const id = p.m.slotId;
  // Dominance (G2, G3): the dominant slot keeps the largest outer area.
  for (const o of others) {
    const [dom, other] = id === ctx.dominant ? [p, o] : o.m.slotId === ctx.dominant ? [o, p] : [null, null];
    if (dom && other && dom.shape.area < other.shape.area - EPS) failures.push({ slotId: dom.m.slotId, rule: "dominance", value: dom.shape.area, minimum: other.shape.area });
  }
  if (failures.length) return failures;
  const obstacles: Obstacle[] = upper.flatMap((q) => q.papers.map((polygon) => ({ slotId: q.m.slotId, polygon, box: bboxOf(polygon) })));
  const covers = obstacles.map((o) => o.polygon);
  // captionSafeZone: no paper painted above may meet it (the rest of the band may be covered).
  // Centred first; otherwise the shared caption logic moves the text along the band.
  const sc = p.shape.caption;
  const dx = sc && ctx.measurer ? captionShift(p.m, p.shape, p.cand.center, obstacles, ctx.captionProfile) : 0;
  if (dx === null) return [{ slotId: id, rule: "caption-safe-zone", value: 1, minimum: 0 }];
  if (sc && ctx.measurer && dx !== 0) {
    const slot = mobileEngineSlot(p.m, p.cand.center);
    const cap = layoutCaption(slot, p.shape.layout, sc.text, ctx.measurer, obstacles, ctx.captionProfile);
    if (cap.status !== "placed" || Math.abs(cap.shiftX - dx) > 1e-9) throw new Error(`caption decision mismatch on ${id}: shared ${cap.status} ${cap.shiftX}, runtime ${dx}`);
    const pb = cap.protectedBox;
    p.caption = cap;
    p.safe = slotRectToCanvas(slot, { x: p.shape.layout.outer.x + pb.x, y: p.shape.layout.outer.y + pb.y, width: pb.width, height: pb.height });
  }
  const min = ctx.minima[id];
  p.visiblePhoto = visibleFraction(p.photo, covers);
  p.visibleOuter = visibleFraction(p.outer, covers);
  if (p.visiblePhoto < min.photo - EPS) failures.push({ slotId: id, rule: "visible-photo", value: p.visiblePhoto, minimum: min.photo });
  if (p.visibleOuter < min.outer - EPS) failures.push({ slotId: id, rule: "visible-outer", value: p.visibleOuter, minimum: min.outer });
  if (failures.length) return failures;
  const need = Math.ceil(ctx.hitPx - EPS);
  const h = largestVisibleSquare(p.outer, covers, need);
  if (h.side < need) failures.push({ slotId: id, rule: "hit-target", value: h.side, minimum: need });
  return failures;
}

const bboxOf = (p: Point[]): [number, number, number, number] => {
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

type Obstacle = { slotId: string; polygon: Point[]; box: [number, number, number, number] };

/**
 * The shared caption logic's decision (`layoutCaption`, V2.1 §2) for the
 * centred caption of `sh` with its paper centred on `center`: the local X
 * shift it would choose (0 = centred), or null when no position keeps the
 * safe zone free. Same shift order (0, then 2 px steps alternating, toward
 * the canvas centre first, ≤ the band's maximum shift), same ink-on-band
 * rule, same area test — without re-breaking or re-measuring the text, and
 * skipping obstacles whose bounds cannot meet the zone.
 */
function captionShift(m: A13MobileSlot, sh: Shape, center: Point, obstacles: Obstacle[], profile: CaptionProfile): number | null {
  const cap = sh.caption!.layout;
  const { band, outer } = sh.layout;
  const slot = mobileEngineSlot(m, center);
  const a = (m.rotationDeg * Math.PI) / 180;
  const [c] = slotRectToCanvas(slot, { x: outer.x + cap.ink.x + cap.ink.width / 2, y: outer.y + cap.ink.y + cap.ink.height / 2, width: 0, height: 0 });
  const toward = Math.cos(a) * (profile.canvas.width / 2 - c.x) + Math.sin(a) * (profile.canvas.height / 2 - c.y) >= 0 ? 1 : -1;
  const maxShift = profile.maxShiftFactorOfBandWidth * band.width;
  const pb = cap.protectedBox;
  const tryAt = (dx: number) => {
    if (dx !== 0 && (cap.ink.x + dx < band.x - 1e-9 || cap.ink.x + cap.ink.width + dx > band.x + band.width + 1e-9)) return false;
    const zone = slotRectToCanvas(slot, { x: outer.x + pb.x + dx, y: outer.y + pb.y, width: pb.width, height: pb.height });
    const zb = bboxOf(zone);
    let area = 0;
    for (const o of obstacles) if (overlap(o.box, zb)) area += convexIntersectionArea(zone, o.polygon);
    return area <= 1e-6;
  };
  if (tryAt(0)) return 0;
  for (let d = profile.shiftStepPx; d <= maxShift + 1e-9; d += profile.shiftStepPx) {
    if (tryAt(toward * d)) return toward * d;
    if (tryAt(-toward * d)) return -toward * d;
  }
  return null;
}

/**
 * Forward check of one candidate (a weaker test than `checkSlot`, never a
 * wrong rejection): dominance against the placed prints, and the caption
 * against the paper known to be above it (`obstacles`: placed prints +
 * cores of the others). Allocation-light: it runs on many candidates.
 */
function compatibleLight(m: A13MobileSlot, sh: Shape, c: Cand, prefix: Placed[], obstacles: Obstacle[], ctx: CheckContext): boolean {
  if (ctx.dominant)
    for (const o of prefix) {
      if (m.slotId === ctx.dominant && sh.area < o.shape.area - EPS) return false;
      if (o.m.slotId === ctx.dominant && o.shape.area < sh.area - EPS) return false;
    }
  const cap = sh.caption;
  if (!cap || !ctx.measurer || !obstacles.length) return true;
  const safe = shift(cap.safe0, c.center);
  const sb = bboxOf(safe);
  const near = obstacles.filter((o) => overlap(o.box, sb));
  if (!near.length || !near.some((o) => convexIntersectionArea(safe, o.polygon) > EPS)) return true;
  return captionShift(m, sh, c.center, obstacles, ctx.captionProfile) !== null;
}

/** Witness minima (shared V2 caps): visible photo ≥ min(0.35, witness), paper ≥ min(0.30, witness). */
export function mobileWitnessBaseline(state: A13MobileStateId, metrics: MobileMetrics) {
  const slots = A13_MOBILE_STATE_SLOTS[state];
  const placed: Placed[] = slots.map((m) => place(m, shapeFor(m, { width: witnessMediaRatio(m, metrics) * 1000, height: 1000 }, 1, metrics, null, null), { si: 0, center: m.referenceCenter, cost: 0, id: 0 }));
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
  /** Shared engine slot, GROUP frame: `center` = paper centre, `zIndex` = paint order, anchor `center`. */
  slot: A13Slot;
  mobileSlot: A13MobileSlot;
  /** The print; `band` is wider than `outer` only for a widened narrow print. */
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  media: M;
  mediaIndex: number;
  scale: number;
  center: Point;
  /** Pivot-preserving centre before the territory translation. */
  pivotCenter: Point;
  outer: Point[];
  /** Every paper part (the print, + the widened band), GROUP frame. */
  papers: Point[][];
  /** captionSafeZone, GROUP frame, or null (no caption). */
  safeZone: Point[] | null;
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
   * (its own rules, or a sound relaxation of its caption against the prints
   * above: proven on the solver's candidates); `lattice-exhausted` — the
   * coarse search examined every composition of its lattice; `search-budget`
   * — the search stopped at its budget (not a proof).
   */
  basis?: "per-print" | "lattice-exhausted" | "search-budget";
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
  /** The state's ONE group translation (source px, applied to the group container). */
  translateY: number;
  /** Stage height (source px): 1672 + the state's extension. */
  stageHeight: number;
  /** Metric signals for QA (never a rejection): band widenings. */
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
}

export function runMobileGallery<M extends PhotoSource>(input: MobileRunInput<M>): MobileGalleryRun<M> {
  const metrics = mobileMetrics(input.stageWidth);
  const stateId = selectMobileGalleryState(input.media.length);
  const head = { profile: "mobile" as const, stageWidth: input.stageWidth, metrics, mediaCount: input.media.length };
  const empty = { entries: [], hasCta: false, signals: [], search: { expansions: 0, stage: "fine" as const, aloneRejected: {} } };
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

/** Search node: the prints placed so far (top of the stack first) and the candidate index tried for the next one. */
interface SearchNode {
  prefix: Placed[];
  g: number;
  next: number;
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

/** Group-frame view of the stage items of a state (everything − T). */
function groupFrame(state: A13MobileStateId, metrics: MobileMetrics, hasCta: boolean): GroupFrame {
  const T = A13_MOBILE_GROUP_TRANSLATION[state].translateYSource;
  const up = (r: A13MobileRect) => rectPoly({ ...r, y: r.y - T });
  return {
    top: -T,
    bottom: A13_MOBILE_GROUP_TRANSLATION[state].stageHeightSource - T,
    title: up(metrics.titleBlock),
    ctaSafe: hasCta ? up(A13_MOBILE_CTA.safeBox) : null,
  };
}

interface SearchResult {
  /** Manifest order, or null. */
  placed: Placed[] | null;
  expansions: number;
  exhausted: boolean;
  safeZoneOnly: number;
  failed: Record<string, number>;
}

/** Search node: the prints placed so far (top of the stack first), the candidate index tried for the next one, the admissible cost of the prints after it. */
interface SearchNode {
  prefix: Placed[];
  g: number;
  next: number;
  restH: number;
  f: number;
}

/**
 * Best-first search (A*) for the joint candidate of least Master distance
 * meeting every hard rule. Prints are placed from the top of the stack
 * down: a print's rules depend only on itself and the prints above it, so
 * each partial composition is final for the prints it holds and a failing
 * one is pruned with all its completions. Successors are generated lazily
 * in cost order (the next print's first candidate, and the next candidate
 * of the last print). Heuristic: for every print still to place, the cost
 * of its cheapest candidate — with `forward`, its cheapest candidate still
 * compatible with the prints already placed and the cores of the others
 * (forward check: a print left without one prunes the partial composition
 * at once). Both never overestimate, so the first complete composition
 * popped has the least total distance. `dedupe`: two partial compositions
 * that the remaining prints cannot tell apart (same placed prints
 * overlapping them, same dominance data) are one; the costlier is dropped.
 */
function search(slots: readonly A13MobileSlot[], streams: SlotStream[], ctx: CheckContext, budget: number, opts: { dedupe: boolean; forward: boolean }): SearchResult {
  const n = slots.length;
  const order = slots.map((_, i) => i).sort((a, b) => slots[b].paintOrder - slots[a].paintOrder);
  const indexOf = new Map(slots.map((m, i) => [m, i]));
  const uppersOf = slots.map((m, i) => slots.map((_, j) => j).filter((j) => slots[j].paintOrder > m.paintOrder && overlap(streams[i].region, streams[j].region)));
  const cores = streams.map((st) => st.core());
  const domKey = (prefix: Placed[], remaining: A13MobileSlot[]) => {
    if (!ctx.dominant) return "";
    const dom = prefix.find((q) => q.m.slotId === ctx.dominant);
    if (dom) return `dom:${dom.shape.area}`;
    return remaining.some((j) => j.slotId === ctx.dominant) ? `max:${Math.max(0, ...prefix.map((q) => q.shape.area))}` : "";
  };
  const memo = new Map<string, { cost: number; idx: number } | null>();
  let safeZoneOnly = 0;
  let forwardRejected = 0;
  const failed: Record<string, number> = {};
  const tally = (failures: MobileJointFailure[]) => {
    for (const f of failures) failed[`${f.slotId}:${f.rule}`] = (failed[`${f.slotId}:${f.rule}`] ?? 0) + 1;
    if (failures.every((f) => f.rule === "caption-safe-zone")) safeZoneOnly++;
  };
  /** Cheapest candidate of the print at `level` compatible with `prefix` (+ the cores of its unplaced uppers). */
  const cheapest = (prefix: Placed[], level: number): { cost: number; idx: number } | null => {
    const i = order[level];
    const st = streams[i];
    if (!opts.forward) return { cost: st.at(0)!.cost, idx: 0 };
    const placedUppers = prefix.filter((q) => uppersOf[i].includes(indexOf.get(q.m)!));
    const dk = domKey(prefix, [slots[i]]);
    if (!placedUppers.length && !dk) return { cost: st.at(0)!.cost, idx: 0 };
    const key = `${i}|${placedUppers.map((q) => `${indexOf.get(q.m)}:${q.cand.id}`).join(",")}|${dk}`;
    if (memo.has(key)) return memo.get(key)!;
    const placedIdx = new Set(placedUppers.map((q) => indexOf.get(q.m)!));
    const obstacles = [
      ...placedUppers.flatMap((q) => q.papers.map((polygon) => ({ slotId: q.m.slotId, polygon, box: bboxOf(polygon) }))),
      ...uppersOf[i].filter((j) => !placedIdx.has(j) && cores[j]).map((j) => ({ slotId: slots[j].slotId, polygon: cores[j]!, box: bboxOf(cores[j]!) })),
    ];
    let found: { cost: number; idx: number } | null = null;
    for (let k = 0; ; k++) {
      const c = st.at(k);
      if (!c) break;
      if (compatibleLight(st.m, st.shapes[c.si], c, prefix, obstacles, ctx)) {
        found = { cost: c.cost, idx: k };
        break;
      }
      forwardRejected++;
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
      tally(failures);
      continue;
    }
    const prefix = [...node.prefix, p];
    const g = node.g + cand.cost;
    if (prefix.length === n) return { placed: slots.map((m) => prefix.find((q) => q.m === m)!), expansions, exhausted: false, safeZoneOnly, failed };
    if (opts.dedupe) {
      const key = keyOf(prefix);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const la = lookahead(prefix);
    if (!la) continue;
    pushAt(prefix, g, la.first.idx, la.restH);
  }
  if (forwardRejected) failed["forward-check (caption or dominance)"] = forwardRejected;
  return { placed: null, expansions, exhausted: heap.size === 0, safeZoneOnly: safeZoneOnly + forwardRejected, failed };
}

/**
 * Solver: (1) the exact search on the fine grid (4 px, scale 0.02) within
 * a small budget — the common case, the least Master distance; (2) when it
 * finds nothing (caption safe zones can require a print to reach the far
 * side of its territory or scale range), the exact search on the coarse
 * lattice (territory quarters + the pivot projection, five scales from the
 * range) with duplicate partial compositions dropped — the least distance
 * on that lattice. Every rule is identical in both stages; only the
 * candidate set differs. Nothing found → STOP.
 */
function solveMobileState<M extends PhotoSource>(state: A13MobileStateId, input: MobileRunInput<M>, metrics: MobileMetrics, head: RunHead): MobileGalleryRun<M> {
  const slots = A13_MOBILE_STATE_SLOTS[state];
  const hasCta = state === "G7PLUS";
  const frame = groupFrame(state, metrics, hasCta);
  const measurer = input.measurer ? scaleMeasurer(input.measurer, metrics.captionFontPx / SHARED_MEASURER_FONT_PX) : null;
  // Family order: media[i] → the slot whose mediaIndex is i (Signature shows 0…5).
  const streamsFor = (grid: Grid) => {
    const st = slots.map((m) => {
      const media = input.media[m.mediaIndex];
      return new SlotStream(m, media, metrics, input.captionOf(media, m.mediaIndex), measurer, frame, grid);
    });
    const reach = st.map((y) => ({ slotId: y.m.slotId, corners: y.cornerPapers(), region: y.region }));
    st.forEach((x) =>
      x.setUpperReach(
        st.flatMap((y, j) => (y.m.paintOrder > x.m.paintOrder && overlap(x.region, y.region) ? [reach[j]] : [])),
        metrics.captionProfile,
      ),
    );
    return st;
  };
  const fine = streamsFor("fine");
  let streams = fine;
  const aloneRejected = () => Object.fromEntries(streams.map((s) => [s.m.slotId, { ...s.rejected }]));
  const unresolved = (anomaly: MobileGalleryAnomaly, expansions: number): MobileGalleryRun<M> => ({
    ...head,
    stateId: state,
    outcome: "unresolved",
    status: anomaly.code,
    anomaly,
    entries: [],
    hasCta: false,
    signals: [],
    search: { expansions, stage: "fine", aloneRejected: aloneRejected() },
  });

  // A print with no candidate at all: on the fine grid, then on the coarse lattice (which holds other points).
  let coarse: SlotStream[] | null = null;
  for (const [i, st0] of fine.entries()) {
    if (st0.at(0)) continue;
    coarse ??= streamsFor("coarse");
    if (coarse[i].at(0)) continue;
    const st = st0;
    const r = { ...st0.rejected };
    for (const [k, v] of Object.entries(coarse[i].rejected)) r[k as AloneReject] += v;
    // Checks run in order (canvas, title, CTA, caption): candidates reaching the caption test passed the others.
    const code = r.CAPTION_SAFE_ZONE_UNRESOLVED ? "CAPTION_SAFE_ZONE_UNRESOLVED" : (Object.keys(r) as AloneReject[]).reduce((a, k) => (r[k] > r[a] ? k : a));
    return unresolved(
      {
        code,
        rule: "alone",
        basis: "per-print",
        detail: `${st.m.slotId}: no scale/centre in its territory passes (${JSON.stringify(r)})${r.CAPTION_SAFE_ZONE_UNRESOLVED ? " — caption: for every candidate, no position of the prints above leaves its safe zone free (proven)" : ""}`,
      },
      0,
    );
  }

  const witness = mobileWitnessBaseline(state, metrics);
  const ctx: CheckContext = {
    hitPx: metrics.hitTargetPx,
    measurer,
    captionProfile: metrics.captionProfile,
    dominant: A13_MOBILE_RELATIONS[state].find((r) => r.dominant)?.dominant ?? null,
    minima: Object.fromEntries(slots.map((m, i) => [m.slotId, { photo: witness[i].photo, outer: witness[i].outer }])),
  };

  let stage: "fine" | "coarse" = "fine";
  // The fine stage needs a candidate for every print.
  const fineReady = fine.every((st) => st.at(0));
  let res: SearchResult = fineReady ? search(slots, fine, ctx, FINE_BUDGET, { dedupe: false, forward: false }) : { placed: null, expansions: 0, exhausted: false, safeZoneOnly: 0, failed: {} };
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
        return unresolved({ code: "CENTER_OUTSIDE_TERRITORY", rule: "territory", detail: `${q.m.slotId} at ${c.x},${c.y}` }, expansions);
    }
    const { entries, signals } = finishEntries(res.placed, input);
    if (stage === "coarse") signals.unshift(`solver: coarse lattice stage (the fine stage found no composition within ${FINE_BUDGET} partial compositions)`);
    return { ...head, stateId: state, outcome: "resolved", status: "PASS", anomaly: null, entries, hasCta, signals, search: { expansions, stage, aloneRejected: aloneRejected() } };
  }
  const failed: Record<string, number> = {};
  for (const r of stats) for (const [k, v] of Object.entries(r.failed)) failed[k] = (failed[k] ?? 0) + v;
  const worst = Object.entries(failed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const safeZoneOnly = stats.reduce((a, r) => a + r.safeZoneOnly, 0);
  return {
    ...unresolved(
      {
        code: safeZoneOnly > 0 ? "CAPTION_SAFE_ZONE_UNRESOLVED" : "ITEM_INACCESSIBLE",
        rule: worst.map(([k]) => k).join(",") || "exhausted",
        basis: res.exhausted ? "lattice-exhausted" : "search-budget",
        detail: `no composition (${stats.map((r, i) => `${i || !fineReady ? "coarse" : "fine"}: ${r.expansions} partial compositions, ${r.exhausted ? "space exhausted" : "budget reached"}`).join("; ")}); ${safeZoneOnly} failed only on a caption safe zone; most frequent failures ${JSON.stringify(Object.fromEntries(worst))}`,
      },
      expansions,
    ),
    search: { expansions, stage, aloneRejected: aloneRejected() },
  };
}

/** Entries of the resolved prints (their captions as placed against the prints above). */
function finishEntries<M extends PhotoSource>(placed: Placed[], input: MobileRunInput<M>) {
  const signals: string[] = [];
  const entries = placed.map((p): MobileGalleryEntry<M> => {
    const slot = mobileEngineSlot(p.m, p.cand.center);
    const media = input.media[p.m.mediaIndex];
    const covers = coversOf(placed, placed.indexOf(p));
    const w = p.shape.widening;
    if (w) signals.push(`${p.m.slotId}: caption band widened ${w.from.toFixed(1)} → ${w.to.toFixed(1)} px (envelope ${w.envelope.toFixed(1)})`);
    if (p.caption && p.caption.shiftX !== 0) signals.push(`${p.m.slotId}: caption moved ${p.caption.shiftX.toFixed(1)} px along its band to keep its glyphs free`);
    return {
      slot,
      mobileSlot: p.m,
      layout: p.shape.layout,
      caption: p.caption,
      media,
      mediaIndex: p.m.mediaIndex,
      scale: p.shape.s,
      center: p.cand.center,
      pivotCenter: p.shape.c1,
      outer: p.outer,
      papers: p.papers,
      safeZone: p.safe,
      bandWidening: w,
      visiblePhoto: p.visiblePhoto,
      visibleOuter: p.visibleOuter,
      hitTarget: largestVisibleSquare(p.outer, covers, 0),
    };
  });
  return { entries, signals };
}
