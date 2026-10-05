import { A13_VIEWER_ASSETS, A13_VIEWER_CAPTION_MEASUREMENT, A13_VIEWER_CAPTION_WIDENING, A13_VIEWER_CONTRACT, VIEWER_EXTREME_RATIO_REVIEW } from "@/config/viewer-a13-desktop-v2";
import type { ViewerCaptionWrapFn } from "@/lib/memorial/viewer/viewer-caption-measure";

/**
 * A13 Viewer Desktop V2 — ONE continuous geometry (pure, theme-free).
 *
 * Handoff §3: photo first, paper around it. No breakpoint, no fixed
 * window, no crop: the media keeps its natural ratio `r` for every
 * viewport and every ratio; intermediate ratios use exactly the same
 * formula. The same function serves the Gallery and the Album, Light and
 * Dark — it has no theme input (THEME_GEOMETRY_PARITY_STOP by
 * construction; guarded by the tests on the import graph).
 *
 * - s = min(1, max(0.72, min(vw/1670, vh/941))), lowered below 0.72 only
 *   when the safe areas / close zone cannot be respected (caption font
 *   never under 20 px) — else VIEWER_VIEWPORT_FIT_STOP;
 * - safe areas max(32, 48s) × max(24, 40s); paper centred in them;
 * - photoMaxW = min(1112s, vw − 2safeX − 2edge),
 *   photoMaxH = min(622s, vh − 2safeY − topEdge − band),
 *   photoW = min(photoMaxW, photoMaxH·r, naturalWidth), photoH = photoW/r;
 * - edge = clamp(14, 40s, 42), top 0.75·edge, band: none `edge + 14s`,
 *   n lines `edge + n·lineHeight + 20s` (never two empty lines reserved);
 * - caption: La Belle Aurore clamp(20, 27s, 27) px, line-height 1.05,
 *   centred on `photoW − 2·max(12, 16s)`, at most two lines, never shrunk,
 *   clipped or ellipsised. Its lines are those the BROWSER breaks at that
 *   displayed size in that usable width (`ViewerInput.wrap`, the shared
 *   primitive of `A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1`): no measure
 *   at 27 px scaled down, the same call for every profile;
 * - a caption that does not fit the canonical paper widens it — symmetric,
 *   minimal, photo untouched — in a confirmed landscape for a portrait or
 *   square photo, or in a confirmed portrait for an extreme portrait photo
 *   (`A13_VIEWER_CAPTION_WIDENING`, `ViewerInput.orientation`).
 */

const C = A13_VIEWER_CONTRACT;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One caption line as the browser broke it (measured offscreen, displayed size). */
export interface ViewerCaptionLine {
  text: string;
  /** UTF-16 range in the caption. */
  start: number;
  end: number;
  /** Measured text rect, relative to the caption box (CSS px, unrounded). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NineSlice {
  /** Source rect in the 512 mask. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rect, paper-local CSS px (may extend outside the paper box). */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export interface ViewerGeometry {
  viewport: { w: number; h: number };
  ratio: number;
  s: number;
  /** `s` before any fit reduction. */
  sNominal: number;
  safeX: number;
  safeY: number;
  edge: number;
  topEdge: number;
  band: number;
  bandKind: "none" | "oneLine" | "twoLines";
  /** Viewport-absolute boxes. */
  paper: Rect;
  photo: Rect;
  /** Paper-local: photo, caption box and line boxes. */
  photoLocal: Rect;
  caption: {
    /** The normalised caption, as rendered (one text node). */
    text: string;
    fontSize: number;
    lineHeight: number;
    usableWidth: number;
    box: Rect;
    /** Measured lines (offscreen clone) and their line slots. */
    lines: (ViewerCaptionLine & { box: Rect })[];
  } | null;
  close: { target: Rect; zone: Rect; clearance: Rect; offset: number };
  mask: { box: Rect; slices: NineSlice[]; px: number };
  paperTextureSize: number;
  motion: {
    open: { durationMs: number; easing: string; fromTranslateY: number; fromScale: number; fromOpacity: number };
    close: { durationMs: number; easing: string; toTranslateY: number; toScale: number; toOpacity: number };
  };
  flags: {
    extremeRatio: boolean;
    upscaleCapped: boolean;
    fitReduced: boolean;
    captionOverflow: boolean;
    captionLineCount: boolean;
    /** Caption font gate (`null`: no caption or no measurement). */
    captionFontReady: boolean | null;
    viewportFitStop: boolean;
  };
  codes: string[];
  /**
   * Caption widening (`A13_VIEWER_CAPTION_WIDENING`) — present only when an
   * eligible profile failed naturally at `W0`; absent, the geometry is the
   * canonical one.
   */
  captionWidening?: {
    profile: "landscape" | "portraitExtreme";
    /** The canonical paper (`W0`), before widening. */
    naturalPaper: Rect;
    /** `WsafeMax = V − 48` (and the CLOSED close clearance). */
    safeMax: number;
    /** `paper.w − W0`, half on each side (0 on a STOP). */
    widening: number;
    /** `VIEWER_CAPTION_SAFE_WIDTH_STOP`: no compliant 0.5 px quantum in `[W0, WsafeMax]` — the paper stays `W0`. */
    stop: boolean;
    /** Telemetry only: the widening exceeds the former 150 px cap. */
    beyondFormerCap: boolean;
  };
}

export interface ViewerInput {
  viewportW: number;
  viewportH: number;
  naturalW: number;
  naturalH: number;
  caption: string | null;
  /** The shared caption measurement (`createViewerCaptionMeasure(…).wrap`); `null` → no caption lines. */
  wrap: ViewerCaptionWrapFn | null;
  /** Font gate result (`awaitViewerCaptionFont`): `false` → VIEWER_CAPTION_FONT_NOT_READY_STOP. */
  captionFontReady?: boolean | null;
  /**
   * The real orientation, confirmed by both the window (`innerWidth` vs
   * `innerHeight`) and the orientation media query; `null`/absent → not
   * confirmed (never widened).
   */
  orientation?: "landscape" | "portrait" | null;
}

/** Renderer normalisation: whitespace runs → one space, trimmed; empty → null. */
export function normalizeViewerCaption(text: string | null | undefined): string | null {
  if (text == null) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/** Builder validation: 32 characters, spaces included (code points). */
export function validateViewerCaption(text: string | null | undefined): { ok: true; text: string | null } | { ok: false; reason: "VIEWER_CAPTION_TOO_LONG"; length: number } {
  const t = normalizeViewerCaption(text);
  const length = t ? [...t].length : 0;
  return length > C.caption.maxCharacters ? { ok: false, reason: "VIEWER_CAPTION_TOO_LONG", length } : { ok: true, text: t };
}

export const viewerScale = (vw: number, vh: number) =>
  Math.min(C.scale.max, Math.max(C.scale.min, Math.min(vw / C.referenceCanvas.width, vh / C.referenceCanvas.height)));

export const viewerFontSize = (s: number) => Math.min(C.caption.fontSizeMax, Math.max(C.caption.fontSizeMin, C.caption.fontSizePerS * s));

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function nineSlice(paperW: number, paperH: number, s: number): { box: Rect; slices: NineSlice[] } {
  const { size, slice, medianContour } = A13_VIEWER_ASSETS.edgeMask;
  const m = medianContour * s;
  const box = { x: -m, y: -m, w: paperW + 2 * m, h: paperH + 2 * m };
  const c = Math.min(slice * s, box.w / 2, box.h / 2);
  const band = size - 2 * slice;
  const out: NineSlice[] = [];
  const midW = box.w - 2 * c;
  const midH = box.h - 2 * c;
  const nx = Math.max(1, Math.round(midW / (band * s)));
  const ny = Math.max(1, Math.round(midH / (band * s)));
  const X = [box.x, box.x + c, box.x + box.w - c];
  const Y = [box.y, box.y + c, box.y + box.h - c];
  const S = [0, slice, size - slice];
  // corners (fixed)
  for (const [i, j] of [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ]) {
    out.push({ sx: S[i], sy: S[j], sw: slice, sh: slice, dx: X[i], dy: Y[j], dw: c, dh: c });
  }
  // top / bottom bands (round)
  for (let t = 0; t < nx; t++) {
    const dx = box.x + c + (t * midW) / nx;
    out.push({ sx: slice, sy: 0, sw: band, sh: slice, dx, dy: Y[0], dw: midW / nx, dh: c });
    out.push({ sx: slice, sy: size - slice, sw: band, sh: slice, dx, dy: Y[2], dw: midW / nx, dh: c });
  }
  // left / right bands (round)
  for (let t = 0; t < ny; t++) {
    const dy = box.y + c + (t * midH) / ny;
    out.push({ sx: 0, sy: slice, sw: slice, sh: band, dx: X[0], dy, dw: c, dh: midH / ny });
    out.push({ sx: size - slice, sy: slice, sw: slice, sh: band, dx: X[2], dy, dw: c, dh: midH / ny });
  }
  // centre (opaque)
  out.push({ sx: slice, sy: slice, sw: band, sh: band, dx: X[1], dy: Y[1], dw: midW, dh: midH });
  return { box, slices: out };
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function atScale(inp: ViewerInput, s: number, sNominal: number, text: string | null, lines: 0 | 1 | 2) {
  const { viewportW: vw, viewportH: vh } = inp;
  const r = inp.naturalW / inp.naturalH;
  const safeX = Math.max(C.safeArea.xMin, C.safeArea.xPerS * s);
  const safeY = Math.max(C.safeArea.yMin, C.safeArea.yPerS * s);
  const edge = Math.min(C.paper.edgeMax, Math.max(C.paper.edgeMin, C.paper.edgePerS * s));
  const topEdge = C.paper.topEdgeFactor * edge;
  const fontSize = viewerFontSize(s);
  const lineHeight = C.caption.lineHeight * fontSize;
  const band = lines === 0 ? edge + C.paper.bandNoneExtraPerS * s : edge + lines * lineHeight + C.paper.bandTextExtraPerS * s;
  const photoMaxW = Math.min(C.photo.maxW * s, vw - 2 * safeX - 2 * edge);
  const photoMaxH = Math.min(C.photo.maxH * s, vh - 2 * safeY - topEdge - band);
  const photoW = Math.max(0, Math.min(photoMaxW, photoMaxH * r, inp.naturalW));
  const photoH = photoW / r;
  const paperW = photoW + 2 * edge;
  const paperH = photoH + topEdge + band;
  const paper = { x: (vw - paperW) / 2, y: (vh - paperH) / 2, w: paperW, h: paperH };
  const offset = Math.max(C.close.offsetMin, C.close.offsetPerS * s);
  const t = C.close.targetMinPx;
  const target = { x: vw - offset - t, y: offset, w: t, h: t };
  const z = C.safeArea.closeReservedPx;
  const zone = { x: target.x + t / 2 - z / 2, y: target.y + t / 2 - z / 2, w: z, h: z };
  const cl = C.safeArea.closeExtraClearancePx;
  const clearance = { x: zone.x - cl, y: zone.y - cl, w: zone.w + 2 * cl, h: zone.h + 2 * cl };
  const inset = Math.max(C.caption.usableInsetMin, C.caption.usableInsetPerS * s);
  const usableWidth = photoW - 2 * inset;
  const fits =
    photoW > 0 &&
    paperW <= vw - 2 * safeX + 1e-6 &&
    paperH <= vh - 2 * safeY + 1e-6 &&
    !intersects(paper, clearance);
  return { s, sNominal, r, safeX, safeY, edge, topEdge, fontSize, lineHeight, band, photoW, photoH, paper, target, zone, clearance, offset, inset, usableWidth, fits, text, lines, upscaleCapped: photoW === inp.naturalW && inp.naturalW < Math.min(photoMaxW, photoMaxH * r) };
}

/** The Viewer geometry for one viewport, media and caption. */
export function layoutViewer(inp: ViewerInput): ViewerGeometry {
  const text = normalizeViewerCaption(inp.caption);
  const sNominal = viewerScale(inp.viewportW, inp.viewportH);
  const codes: string[] = [];
  const r = inp.naturalW / inp.naturalH;
  const [rMin, rMax] = C.photo.guaranteedRatioRange;
  const extremeRatio = r < rMin || r > rMax;
  if (extremeRatio) codes.push(VIEWER_EXTREME_RATIO_REVIEW);

  // Caption line count: one line if the browser keeps the caption on one
  // line in the one-line geometry's usable width; otherwise the two-line
  // geometry (taller band → never a wider photo) and the browser's lines
  // there. Each measure runs at that geometry's displayed size.
  const solve = (s: number) => {
    if (!text || !inp.wrap) return { g: atScale(inp, s, sNominal, text, text ? 1 : 0), lines: [] as ViewerCaptionLine[] };
    const g1 = atScale(inp, s, sNominal, text, 1);
    const m1 = inp.wrap(text, g1.fontSize, g1.lineHeight, g1.usableWidth);
    if (!m1 || m1.lines.length <= 1) return { g: g1, lines: m1?.lines ?? [] };
    const g2 = atScale(inp, s, sNominal, text, 2);
    return { g: g2, lines: inp.wrap(text, g2.fontSize, g2.lineHeight, g2.usableWidth)?.lines ?? [] };
  };

  let s = sNominal;
  let { g, lines } = solve(s);
  let viewportFitStop = false;
  while (!g.fits) {
    s = Math.round((s - 0.01) * 1000) / 1000;
    if (s < 0.3) {
      viewportFitStop = true;
      break;
    }
    ({ g, lines } = solve(s));
  }
  if (viewportFitStop) codes.push("VIEWER_VIEWPORT_FIT_STOP");

  const tol = A13_VIEWER_CAPTION_MEASUREMENT.limits.subpixelToleranceCssPx + 1e-6;
  const overflows = (ls: ViewerCaptionLine[], width: number) => ls.some((l) => l.x < -tol || l.x + l.width > width + tol);
  const fitsColumn = (ls: ViewerCaptionLine[], width: number) => ls.length <= C.caption.maxLines && !overflows(ls, width);

  // Caption widening (A13_VIEWER_CAPTION_FINAL_HANDOFF_V1): only for a
  // caption, a confirmed face, an eligible orientation × ratio profile, and
  // a NATURAL failure at the canonical paper `W0` (its CLOSED column). The
  // paper widens, symmetrically, to the first 0.5 px quantum ≥ W0 whose
  // caption column `W − 24` (12 px from each side of the paper, QG/PO
  // arbitration A) the browser keeps within two lines and 0.5 px.
  // Recomputed from `W0` every time; never persisted.
  let paper = g.paper;
  let usableWidth = g.usableWidth;
  let captionWidening: ViewerGeometry["captionWidening"];
  const Wd = A13_VIEWER_CAPTION_WIDENING;
  const profile =
    !text || !inp.wrap || inp.captionFontReady !== true
      ? null
      : inp.orientation === "landscape" && r <= Wd.landscapeMediaRatioMax
        ? "landscape"
        : inp.orientation === "portrait" && r <= Wd.portraitExtremeMediaRatioMax
          ? "portraitExtreme"
          : null;
  if (profile && text && inp.wrap && !fitsColumn(lines, g.usableWidth)) {
    const wrap = inp.wrap;
    const W0 = g.paper.w;
    // WsafeMax = V − 2B, V the content safe rect (viewport − 2·safeX); the former 150 px cap is gone.
    let safeMax = inp.viewportW - 2 * g.safeX - 2 * Wd.safeBreathingCssPx;
    // CLOSED invariant kept: the close clearance zone never meets the paper.
    if (g.clearance.y < g.paper.y + g.paper.h && g.paper.y < g.clearance.y + g.clearance.h) safeMax = Math.min(safeMax, 2 * (g.clearance.x - (g.paper.x + W0 / 2)));
    const column = (w: number) => w - 2 * Wd.captionInsetEachSideCssPx;
    const measure = (w: number) => wrap(text, g.fontSize, g.lineHeight, column(w))?.lines ?? null;
    const fitsAt = (w: number, ls: ViewerCaptionLine[] | null): ls is ViewerCaptionLine[] => ls !== null && fitsColumn(ls, column(w));
    // Monotone search on the 0.5 px grid within [W0, WsafeMax]: index `lo` is below the domain
    // (< W0), `hi` (≤ WsafeMax) the candidate; the result is the first compliant quantum ≥ W0,
    // measured at that exact width.
    const q = Wd.widthQuantumCssPx;
    let lo = Math.ceil(W0 / q - 1e-9) - 1;
    let hi = Math.floor(safeMax / q);
    let width = W0;
    let widthLines: ViewerCaptionLine[] = lines;
    let stop = safeMax < W0 || hi <= lo;
    if (!stop) {
      const top = measure(hi * q);
      if (!fitsAt(hi * q, top)) stop = true;
      else {
        width = hi * q;
        widthLines = top;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          const m = measure(mid * q);
          if (fitsAt(mid * q, m)) {
            hi = mid;
            width = mid * q;
            widthLines = m;
          } else lo = mid;
        }
      }
    }
    const widening = width - W0;
    paper = { x: g.paper.x - widening / 2, y: g.paper.y, w: width, h: g.paper.h };
    // On a STOP nothing is derived: the CLOSED column and its lines stay.
    if (!stop) {
      usableWidth = column(width);
      lines = widthLines;
    }
    captionWidening = { profile, naturalPaper: g.paper, safeMax, widening, stop, beyondFormerCap: widening > Wd.formerWidenCapTelemetryCssPx };
  }

  const captionOverflow = overflows(lines, usableWidth);
  if (captionOverflow) codes.push("VIEWER_CAPTION_OVERFLOW_STOP");
  const captionLineCount = lines.length > C.caption.maxLines;
  if (captionLineCount) codes.push("VIEWER_CAPTION_LINE_COUNT_STOP");
  const captionFontReady = text && inp.wrap ? (inp.captionFontReady ?? null) : null;
  if (captionFontReady === false) codes.push("VIEWER_CAPTION_FONT_NOT_READY_STOP");
  if (captionWidening?.stop) codes.push("VIEWER_CAPTION_SAFE_WIDTH_STOP");
  // The common centre never moves (data tolerance 0 px; 1e-9 absorbs binary noise only).
  if (captionWidening && Math.abs(paper.x + paper.w / 2 - (g.paper.x + g.paper.w / 2)) > 1e-9) codes.push("VIEWER_CAPTION_SYMMETRY_STOP");

  // Widened paper: the photo keeps its viewport rect (the paper grew around it).
  const photoLocal = { x: g.edge + (captionWidening?.widening ?? 0) / 2, y: g.topEdge, w: g.photoW, h: g.photoH };
  const blockTop = g.topEdge + g.photoH + C.paper.bandTextExtraPerS * g.s;
  // Derived column: centred on the paper (12 px from each side); else the CLOSED column.
  const capX = captionWidening && !captionWidening.stop ? (paper.w - usableWidth) / 2 : g.edge + g.inset;
  const capBox = { x: capX, y: blockTop, w: usableWidth, h: lines.length * g.lineHeight };
  const mask = nineSlice(paper.w, paper.h, g.s);
  const bandKind = g.lines === 0 ? "none" : g.lines === 1 ? "oneLine" : "twoLines";

  return {
    viewport: { w: inp.viewportW, h: inp.viewportH },
    ratio: r,
    s: g.s,
    sNominal,
    safeX: g.safeX,
    safeY: g.safeY,
    edge: g.edge,
    topEdge: g.topEdge,
    band: g.band,
    bandKind,
    paper,
    photo: { x: g.paper.x + g.edge, y: g.paper.y + g.topEdge, w: g.photoW, h: g.photoH },
    photoLocal,
    caption:
      text && lines.length
        ? {
            text,
            fontSize: g.fontSize,
            lineHeight: g.lineHeight,
            usableWidth,
            box: capBox,
            lines: lines.map((l, i) => ({ ...l, box: { x: capBox.x, y: blockTop + i * g.lineHeight, w: capBox.w, h: g.lineHeight } })),
          }
        : null,
    close: { target: g.target, zone: g.zone, clearance: g.clearance, offset: g.offset },
    mask: { ...mask, px: g.s },
    paperTextureSize: A13_VIEWER_ASSETS.paperTileSize * g.s,
    motion: {
      open: { durationMs: C.motion.open.durationMs, easing: C.motion.open.easing, fromTranslateY: C.motion.open.from.translateYPerS * g.s, fromScale: C.motion.open.from.scale, fromOpacity: C.motion.open.from.opacity },
      close: { durationMs: C.motion.close.durationMs, easing: C.motion.close.easing, toTranslateY: C.motion.close.to.translateYPerS * g.s, toScale: C.motion.close.to.scale, toOpacity: C.motion.close.to.opacity },
    },
    flags: { extremeRatio, upscaleCapped: g.upscaleCapped, fitReduced: g.s < sNominal, captionOverflow, captionLineCount, captionFontReady, viewportFitStop },
    codes,
    ...(captionWidening ? { captionWidening } : {}),
  };
}

/** Byte-comparable engine snapshot (every length rounded to 1/1000 px). */
export function viewerGeometrySnapshot(g: ViewerGeometry): string {
  return JSON.stringify(g, (_k, v) => (typeof v === "number" ? r3(v) : v));
}
