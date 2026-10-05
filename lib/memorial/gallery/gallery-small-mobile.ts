import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import { A13_RESPONSIVE_BRIDGE } from "@/config/a13-responsive-bridge";
import { A13_MOBILE_CANVAS } from "@/config/gallery-a13-mobile-manifest";
import { A13_ALBUM_MOBILE_FRAME } from "@/config/album-a13-mobile-light";
import { breakCaption, layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import type { PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { largestVisibleSquare } from "@/lib/memorial/gallery/gallery-v2";
import { scaleMeasurer, SHARED_MEASURER_FONT_PX, type MobileGalleryEntry, type MobileGalleryRun } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import type { AlbumMobileCaptionedPrint, AlbumMobileLayout } from "@/lib/memorial/album/album-mobile-layout";

/**
 * A13 Responsive Bridge V1.4.1 — SMALL MOBILE (320–374 px), the runtime of
 * `A13_RESPONSIVE_BRIDGE_HANDOFF_V1_4_1` (SHA-256 3b8d862c…0982;
 * GALLERY_CONTRACT.md, CAPTION_ON_SCALED_PAPER_CONTRACT.md,
 * FULL_ALBUM_CONTRACT.md).
 *
 * The source is the Mobile CLOSED snapshot resolved at 375 (run, solver,
 * captions, CTA), painted at 375 scale: every object keeps its 375 size.
 * The stage is W wide; the 375 canvas is centred in it (offset
 * `(W − 375) / 2`, its material cropped). Only horizontal implantation
 * changes — never Y, rotation, paintOrder, z-rank, media order, CTA or type.
 *
 * Gallery, in the contract's canonical order:
 *  1. nominal centres `n_i = 8 + (x375_i − 8)(W − 16)/359` (stage frame, CSS px);
 *  2. rotated envelope `E_i(1) = |p cos θ| + |q sin θ|` of the paper (its
 *     real parts — the outer paper, and the band wing of a widened print —
 *     which is exactly that formula for a plain paper), the admissible width
 *     `A_i(W) = W − 16 + tL_i + tR_i` (tolerances = the manifest's declared
 *     paper overflow) and the centre interval
 *     `I_i = [8 + E_i/2 − tL_i, W − 8 − E_i/2 + tR_i]`, empty iff E_i > A_i;
 *  3. a slot whose OWN interval is empty at scale 1 is, for 320 ≤ W ≤ 364
 *     only, reduced uniformly about its centre by
 *     `k_required = A_i(W) / E_i(1)`: ≥ 1 → scale 1; 0.8734 ≤ k < 1 → scale
 *     k (an ε guard `min(0.0001, max(0, (k − 0.8734)/2))` only if the
 *     resulting interval is not numerically non-empty); < 0.8734 →
 *     `SMALL_MOBILE_INTRINSIC_PAPER_SCALE_STOP`, never clamped; at W ≥ 365 an
 *     empty interval is `SMALL_MOBILE_SLOT_INTERVAL_EMPTY_STOP`. The scale
 *     covers paper, photo window, margins and band geometry — never the
 *     caption type nor the hit-area. No rule names a state, slot or ratio;
 *  4. the ordered interval projection V1.2: minimise Σ(x_i − n_i)² with
 *     x_i ∈ I_i and the 375 left-to-right order kept (no minimum distance) —
 *     exact, by enumeration of the contiguous equal-value blocks;
 *  5. captions re-laid with the CLOSED caption logic at their canonical size
 *     (12 / 14.5 CSS px) in the final band; a scaled print whose caption no
 *     longer fits (≤ 2 lines, useful width, band height) is
 *     `SMALL_MOBILE_SCALED_PAPER_CAPTION_STOP`.
 * No second fallback. Everything is a function of the run and W: Light and
 * Dark share it.
 *
 * Album (FULL_ALBUM_CONTRACT V1.1, unchanged by V1.2/V1.3): centres
 * compressed by the same formula, then one minimal X translation per group
 * to keep its papers in [8, W − 8]; a group wider than W − 16 keeps its
 * centring and must stay on the stage, else `SMALL_MOBILE_HORIZONTAL_FIT_STOP`.
 * No scaling, no Studio fallback.
 */

const SRC = A13_RESPONSIVE_BRIDGE.small.sourceWidthCssPx;
const INSET = 8;
export const A13_SMALL_MOBILE_FALLBACK = { maxWidthCssPx: 364, minScale: 0.8734, epsilonMax: 0.0001 } as const;

export type SmallMobileStop =
  | "SMALL_MOBILE_SLOT_INTERVAL_EMPTY_STOP"
  | "SMALL_MOBILE_INTRINSIC_PAPER_SCALE_STOP"
  | "SMALL_MOBILE_SCALED_PAPER_CAPTION_STOP"
  | "SMALL_MOBILE_ORDER_INFEASIBLE_STOP"
  | "SMALL_MOBILE_HORIZONTAL_FIT_STOP";

type Pt = { x: number; y: number };

/** Nominal Small Mobile centre (stage frame, CSS px) of a 375 x. */
export const smallMobileNominalX = (x375: number, W: number) => INSET + ((x375 - INSET) * (W - 2 * INSET)) / (SRC - 2 * INSET);

/**
 * Ordered interval projection (V1.2): argmin Σ(x_i − n_i)² subject to
 * lo_i ≤ x_i ≤ hi_i and x_0 ≤ x_1 ≤ … (inputs already in order). The optimum
 * is a sequence of contiguous blocks sharing one value, each the clamp of
 * its targets' mean into its common interval — every partition is
 * enumerated (n ≤ 6 → 32), the best feasible one is unique.
 */
export function projectOrderedIntervals(n: readonly number[], lo: readonly number[], hi: readonly number[]): number[] | null {
  const N = n.length;
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (let mask = 0; mask < 1 << Math.max(0, N - 1); mask++) {
    const x: number[] = [];
    let ok = true;
    let start = 0;
    for (let i = 0; i < N && ok; i++) {
      if (i === N - 1 || (mask >> i) & 1) {
        const idx = Array.from({ length: i - start + 1 }, (_, j) => start + j);
        const L = Math.max(...idx.map((j) => lo[j]));
        const H = Math.min(...idx.map((j) => hi[j]));
        if (L > H + 1e-9) ok = false;
        const mean = idx.reduce((a, j) => a + n[j], 0) / idx.length;
        const v = Math.min(H, Math.max(L, mean));
        x.push(...idx.map(() => v));
        start = i + 1;
      }
    }
    if (!ok) continue;
    if (x.some((v, i) => i > 0 && v < x[i - 1] - 1e-9)) continue;
    const cost = x.reduce((a, v, i) => a + (v - n[i]) ** 2, 0);
    if (cost < bestCost - 1e-12) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

const scaleRect = (r: { x: number; y: number; width: number; height: number }, k: number) => ({ x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k });

/** The print reduced uniformly by `k` about its centre: paper, window, photo and band (relative rects scale too). */
export function scalePolaroidLayout(l: PolaroidLayout, k: number): PolaroidLayout {
  if (k === 1) return l;
  return { ...l, outer: scaleRect(l.outer, k), window: scaleRect(l.window, k), photo: scaleRect(l.photo, k), band: scaleRect(l.band, k), margin: l.margin * k, bottomBand: l.bottomBand * k };
}

export interface SmallMobileSlotLog {
  slotId: string;
  mediaIndex: number;
  x375: number;
  nominal: number;
  /** E(1): rotated envelope of the paper at scale 1 (real parts), CSS px. */
  envelope1: number;
  /** |p cos θ| + |q sin θ| of the outer paper — equal to `envelope1` for a plain paper. */
  envelopeFormula: number;
  /** A(W) = W − 16 + tL + tR, CSS px. */
  admissible: number;
  tolerance: { left: number; right: number };
  interval1: [number, number];
  intervalEmptyAtOne: boolean;
  eligibility: "not-needed" | "intrinsic-paper-width";
  /** A(W) / E(1), computed only for an empty interval. */
  kRequired: number | null;
  kRuntime: number;
  epsilon: number;
  envelopeFinal: number;
  intervalFinal: [number, number];
  x: number;
  paper: { width: number; height: number };
  caption: { lines: number; fits: boolean; exceedsUsefulWidth: boolean; fitsBandHeight: boolean } | null;
  hitSideCss: number;
}

export type SmallMobileGallery<M> =
  | { status: "PASS"; width: number; offset: number; entries: (MobileGalleryEntry<M> & { smallScale: number })[]; log: SmallMobileSlotLog[]; fallbackCount: number }
  | { status: SmallMobileStop; width: number; detail: string; log: SmallMobileSlotLog[] };

/**
 * The Small Mobile Gallery of a Mobile CLOSED run resolved at 375. Entries
 * are returned in the 375 CANVAS frame (source px) of the centred canvas:
 * `slot.center.x` moved, `layout` scaled for a fallback print, `caption`
 * re-laid; everything else is the run's own.
 */
export function smallMobileGallery<M>(run: MobileGalleryRun<M>, W: number, measurer: CaptionMeasurer | null, captionOf: (m: M, index: number) => string | null): SmallMobileGallery<M> {
  const k375 = SRC / A13_MOBILE_CANVAS.width;
  const offset = (W - SRC) / 2;
  const fallbackAllowed = W >= A13_RESPONSIVE_BRIDGE.small.min && W <= A13_SMALL_MOBILE_FALLBACK.maxWidthCssPx;
  const items = run.entries.map((e) => {
    const cx = e.slot.center.x * k375;
    const E1 = 2 * Math.max(...e.papers.flat().map((p) => Math.abs(p.x * k375 - cx)));
    const th = (e.slot.rotationDeg * Math.PI) / 180;
    const Ef = Math.abs(e.layout.outer.width * k375 * Math.cos(th)) + Math.abs(e.layout.outer.height * k375 * Math.sin(th));
    const a = e.mobileSlot.paperOverflowAllowance;
    const tL = a.left * k375;
    const tR = a.right * k375;
    return { e, cx, E1, Ef, tL, tR, A: W - 2 * INSET + tL + tR, nominal: smallMobileNominalX(cx, W) };
  });
  const log: SmallMobileSlotLog[] = [];
  const scales: number[] = [];
  let stop: { code: SmallMobileStop; detail: string } | null = null;
  const interval = (it: (typeof items)[number], k: number): [number, number] => [INSET + (k * it.E1) / 2 - it.tL, W - INSET - (k * it.E1) / 2 + it.tR];
  for (const it of items) {
    const [lo1, hi1] = interval(it, 1);
    const empty = it.E1 > it.A; // the interval is empty iff E(1) > A(W): the cause is the paper's own envelope
    let k = 1;
    let kRequired: number | null = null;
    let e = 0;
    if (empty) {
      kRequired = it.A / it.E1;
      const min = A13_SMALL_MOBILE_FALLBACK.minScale;
      if (!fallbackAllowed) stop ??= { code: "SMALL_MOBILE_SLOT_INTERVAL_EMPTY_STOP", detail: `${it.e.mobileSlot.slotId} at ${W} px: E(1) ${it.E1} > A(W) ${it.A}, fallback only at 320–364` };
      else if (kRequired < min) stop ??= { code: "SMALL_MOBILE_INTRINSIC_PAPER_SCALE_STOP", detail: `${it.e.mobileSlot.slotId} at ${W} px: k_required ${kRequired} < ${min}` };
      else {
        // The exact quotient; the bounded ε guard only if double precision leaves the interval numerically empty.
        k = kRequired;
        const [lo, hi] = interval(it, k);
        if (lo > hi + 1e-9) {
          e = Math.min(A13_SMALL_MOBILE_FALLBACK.epsilonMax, Math.max(0, (kRequired - min) / 2));
          k = kRequired - e;
        }
      }
    }
    scales.push(k);
    log.push({
      slotId: it.e.mobileSlot.slotId,
      mediaIndex: it.e.mediaIndex,
      x375: it.cx,
      nominal: it.nominal,
      envelope1: it.E1,
      envelopeFormula: it.Ef,
      admissible: it.A,
      tolerance: { left: it.tL, right: it.tR },
      interval1: [lo1, hi1],
      intervalEmptyAtOne: empty,
      eligibility: empty ? "intrinsic-paper-width" : "not-needed",
      kRequired,
      kRuntime: k,
      epsilon: e,
      envelopeFinal: k * it.E1,
      intervalFinal: interval(it, k),
      x: NaN,
      paper: { width: it.e.layout.outer.width * k * k375, height: it.e.layout.outer.height * k * k375 },
      caption: null,
      hitSideCss: NaN,
    });
  }
  if (stop) return { status: stop.code, width: W, detail: stop.detail, log };

  // V1.2 ordered projection (x375 order, slotId tie-break), with the final intervals.
  const order = items.map((_, i) => i).sort((a, b) => items[a].cx - items[b].cx || items[a].e.mobileSlot.slotId.localeCompare(items[b].e.mobileSlot.slotId));
  const proj = projectOrderedIntervals(
    order.map((i) => items[i].nominal),
    order.map((i) => log[i].intervalFinal[0]),
    order.map((i) => log[i].intervalFinal[1]),
  );
  if (!proj) return { status: "SMALL_MOBILE_ORDER_INFEASIBLE_STOP", width: W, detail: `no ordered projection at ${W} px`, log };
  const xs: number[] = [];
  order.forEach((i, j) => (xs[i] = proj[j]));

  // Final papers (canvas frame, source px) and slots.
  const toCanvas = (stageX: number) => (stageX - offset) / k375;
  const placed = items.map((it, i) => {
    const k = scales[i];
    const c = it.e.slot.center;
    const nc = { x: toCanvas(xs[i]), y: c.y };
    const move = (p: Pt) => ({ x: nc.x + k * (p.x - c.x), y: nc.y + k * (p.y - c.y) });
    const slot: A13Slot = { ...it.e.slot, center: nc };
    return { k, slot, layout: scalePolaroidLayout(it.e.layout, k), outer: it.e.outer.map(move), papers: it.e.papers.map((poly) => poly.map(move)) };
  });

  // Captions re-laid at the canonical size in the final bands (never scaled), the run's own logic.
  const m = measurer ? scaleMeasurer(measurer, run.metrics.captionFontPx / SHARED_MEASURER_FONT_PX) : null;
  const entries = run.entries.map((e, i) => {
    const p = placed[i];
    const text = captionOf(e.media, e.mediaIndex);
    const obstacles = placed.flatMap((q, j) => (run.entries[j].slot.zIndex > e.slot.zIndex ? q.papers.map((polygon) => ({ slotId: run.entries[j].mobileSlot.slotId, polygon })) : []));
    let caption: CaptionLayout | null = e.caption;
    if (m && text) caption = layoutCaption(p.slot, p.layout, text, m, obstacles, run.metrics.captionProfile);
    const covers = placed.flatMap((q, j) => (run.entries[j].slot.zIndex > e.slot.zIndex ? q.papers : []));
    const hit = largestVisibleSquare(p.outer, covers, 0);
    log[i].x = xs[i];
    log[i].hitSideCss = hit.side * k375;
    if (caption && m && text) {
      const lines = breakCaption(text, p.layout.band.width - 2 * run.metrics.captionInsetPx, (t) => m.measure(t)).length;
      const fits = lines <= 2 && !caption.exceedsUsefulWidth && caption.fitsBandHeight;
      log[i].caption = { lines, fits, exceedsUsefulWidth: caption.exceedsUsefulWidth, fitsBandHeight: caption.fitsBandHeight };
    }
    return { ...e, slot: p.slot, layout: p.layout, caption, outer: p.outer, papers: p.papers, hitTarget: hit, smallScale: p.k };
  });
  const badCaption = log.find((l) => l.kRuntime < 1 && l.caption && !l.caption.fits);
  if (badCaption) return { status: "SMALL_MOBILE_SCALED_PAPER_CAPTION_STOP", width: W, detail: `${badCaption.slotId} at ${W} px: caption no longer fits the reduced band`, log };
  return { status: "PASS", width: W, offset, entries, log, fallbackCount: log.filter((l) => l.kRuntime < 1).length };
}

export interface SmallMobileAlbumGroupLog {
  index: number;
  width: number;
  shift: number;
  bounds: [number, number];
}

export type SmallMobileAlbum =
  | { status: "PASS"; width: number; offset: number; layout: AlbumMobileLayout; groups: SmallMobileAlbumGroupLog[] }
  | { status: "SMALL_MOBILE_HORIZONTAL_FIT_STOP"; width: number; detail: string; groups: SmallMobileAlbumGroupLog[] };

/** The Small Mobile Album of a Mobile CLOSED layout resolved at 375 (canvas frame of the centred 375 table). */
export function smallMobileAlbum(layout: AlbumMobileLayout, W: number): SmallMobileAlbum {
  const s = SRC / A13_ALBUM_MOBILE_FRAME.width;
  const offset = (W - SRC) / 2;
  const groups: SmallMobileAlbumGroupLog[] = [];
  const shifted: AlbumMobileCaptionedPrint[] = [];
  for (const g of layout.geometry.groups) {
    const prints = layout.prints.filter((p) => p.groupIndex === g.index);
    const d = prints.map((p) => {
      const cx = p.slot.center.x * s;
      return smallMobileNominalX(cx, W) - cx;
    });
    const xs = prints.flatMap((p, i) => p.drawnOuter.map((q) => q.x * s + d[i]));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    let shift = 0;
    if (x1 - x0 <= W - 2 * INSET) shift = x0 < INSET ? INSET - x0 : x1 > W - INSET ? W - INSET - x1 : 0;
    groups.push({ index: g.index, width: x1 - x0, shift, bounds: [x0 + shift, x1 + shift] });
    if (x0 + shift < -1e-9 || x1 + shift > W + 1e-9) return { status: "SMALL_MOBILE_HORIZONTAL_FIT_STOP", width: W, detail: `album group ${g.index} at ${W} px: [${x0 + shift}, ${x1 + shift}]`, groups };
    prints.forEach((p, i) => {
      const dx = (d[i] + shift - offset) / s; // stage → centred canvas frame, source px
      const move = (q: Pt) => ({ x: q.x + dx, y: q.y });
      shifted.push({ ...p, slot: { ...p.slot, center: move(p.slot.center) }, outer: p.outer.map(move), photo: p.photo.map(move), drawnOuter: p.drawnOuter.map(move) });
    });
  }
  const byIndex = new Map(shifted.map((p) => [p.mediaIndex, p]));
  return { status: "PASS", width: W, offset, layout: { ...layout, prints: layout.prints.map((p) => byIndex.get(p.mediaIndex)!) }, groups };
}
