import { A13_VIEWER_ASSETS, A13_VIEWER_CONTRACT, VIEWER_EXTREME_RATIO_REVIEW } from "@/config/viewer-a13-desktop-v2";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";

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
 *   clipped or ellipsised.
 */

const C = A13_VIEWER_CONTRACT;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewerCaptionLine {
  text: string;
  /** Advance width at the rendered font size (measured). */
  width: number;
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
    fontSize: number;
    lineHeight: number;
    usableWidth: number;
    box: Rect;
    lines: { text: string; width: number; box: Rect }[];
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
    viewportFitStop: boolean;
  };
  codes: string[];
}

export interface ViewerInput {
  viewportW: number;
  viewportH: number;
  naturalW: number;
  naturalH: number;
  caption: string | null;
  /** Caption measurer at 27 px (Gallery V2.1 measurer, font confirmed). */
  measurer: CaptionMeasurer | null;
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

/**
 * Line breaking (the Gallery V2.1 rule, contract §4): one centred line if
 * it fits the usable width; otherwise the break at a space giving the
 * smallest maximum line width, then the smallest difference. No shrink.
 */
export function breakViewerCaption(text: string, measurer: CaptionMeasurer, fontSize: number, usableWidth: number): ViewerCaptionLine[] {
  const k = fontSize / 27;
  const w = (t: string) => measurer.measure(t).width * k;
  const one = w(text);
  if (one <= usableWidth) return [{ text, width: one }];
  const words = text.split(" ");
  let best: ViewerCaptionLine[] | null = null;
  let bestKey: [number, number] | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const wa = w(a);
    const wb = w(b);
    const key: [number, number] = [Math.max(wa, wb), Math.abs(wa - wb)];
    if (!bestKey || key[0] < bestKey[0] - 1e-9 || (Math.abs(key[0] - bestKey[0]) <= 1e-9 && key[1] < bestKey[1])) {
      bestKey = key;
      best = [
        { text: a, width: wa },
        { text: b, width: wb },
      ];
    }
  }
  return best ?? [{ text, width: one }];
}

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

  // Caption line count: the smallest n whose photo width holds the text
  // in n lines (monotone: more lines → taller band → narrower photo).
  const solve = (s: number) => {
    if (!text || !inp.measurer) {
      const g = atScale(inp, s, sNominal, text, text ? 1 : 0);
      return { g, lines: [] as ViewerCaptionLine[] };
    }
    const g1 = atScale(inp, s, sNominal, text, 1);
    const l1 = breakViewerCaption(text, inp.measurer, g1.fontSize, g1.usableWidth);
    if (l1.length === 1) return { g: g1, lines: l1 };
    const g2 = atScale(inp, s, sNominal, text, 2);
    return { g: g2, lines: breakViewerCaption(text, inp.measurer, g2.fontSize, g2.usableWidth) };
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

  const captionOverflow = lines.some((l) => l.width > g.usableWidth + 0.5) || lines.length > C.caption.maxLines;
  if (captionOverflow) codes.push("VIEWER_CAPTION_OVERFLOW_STOP");

  const photoLocal = { x: g.edge, y: g.topEdge, w: g.photoW, h: g.photoH };
  const blockTop = g.topEdge + g.photoH + C.paper.bandTextExtraPerS * g.s;
  const capBox = { x: g.edge + g.inset, y: blockTop, w: g.usableWidth, h: lines.length * g.lineHeight };
  const mask = nineSlice(g.paper.w, g.paper.h, g.s);
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
    paper: g.paper,
    photo: { x: g.paper.x + photoLocal.x, y: g.paper.y + photoLocal.y, w: g.photoW, h: g.photoH },
    photoLocal,
    caption:
      text && lines.length
        ? {
            fontSize: g.fontSize,
            lineHeight: g.lineHeight,
            usableWidth: g.usableWidth,
            box: capBox,
            lines: lines.map((l, i) => ({ text: l.text, width: l.width, box: { x: capBox.x, y: blockTop + i * g.lineHeight, w: capBox.w, h: g.lineHeight } })),
          }
        : null,
    close: { target: g.target, zone: g.zone, clearance: g.clearance, offset: g.offset },
    mask: { ...mask, px: g.s },
    paperTextureSize: A13_VIEWER_ASSETS.paperTileSize * g.s,
    motion: {
      open: { durationMs: C.motion.open.durationMs, easing: C.motion.open.easing, fromTranslateY: C.motion.open.from.translateYPerS * g.s, fromScale: C.motion.open.from.scale, fromOpacity: C.motion.open.from.opacity },
      close: { durationMs: C.motion.close.durationMs, easing: C.motion.close.easing, toTranslateY: C.motion.close.to.translateYPerS * g.s, toScale: C.motion.close.to.scale, toOpacity: C.motion.close.to.opacity },
    },
    flags: { extremeRatio, upscaleCapped: g.upscaleCapped, fitReduced: g.s < sNominal, captionOverflow, viewportFitStop },
    codes,
  };
}

/** Byte-comparable engine snapshot (every length rounded to 1/1000 px). */
export function viewerGeometrySnapshot(g: ViewerGeometry): string {
  return JSON.stringify(g, (_k, v) => (typeof v === "number" ? r3(v) : v));
}
