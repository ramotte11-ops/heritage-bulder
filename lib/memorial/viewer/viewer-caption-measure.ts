import { A13_VIEWER_CAPTION_MEASUREMENT as M } from "@/config/viewer-a13-desktop-v2";

/**
 * A13 Viewer — the ONE caption measurement primitive
 * (`A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1`), shared by every profile.
 *
 * The browser is the line-breaking authority. `createViewerCaptionMeasure`
 * keeps an offscreen DOM clone; each `wrap(text, fontSize, lineHeight,
 * width)` copies onto it the computed styles of the visible caption (read
 * live from a style source carrying the caption class), sets the DISPLAYED
 * font size and line height and the paper's real usable width — never a
 * `transform` — and lets the browser break the lines. Every line is then
 * read with `Range.getClientRects()`, in CSS px, unrounded. Mobile and
 * Desktop call the same function with their own computed size: there is no
 * "measure at 27 px then × fontSize/27" any more, and no canvas.
 *
 * `awaitViewerCaptionFont` is the font gate: it waits for the face and
 * `document.fonts.ready`, then confirms that a face of the computed family,
 * style and weight is LOADED (a bare `document.fonts.check()` is true for a
 * family the set does not know). Not confirmed → the Viewer raises
 * `VIEWER_CAPTION_FONT_NOT_READY_STOP` (the caption is still measured with
 * the face actually rendered, so it stays contained, and is measured again
 * when fonts finish loading).
 *
 * `viewerCaptionFindings` is the pure rendered check (thresholds of the
 * contract, compared without integer rounding): overflow of a rendered line
 * out of the paper's caption safe rect > 0.5 px → OVERFLOW; more than two
 * rendered lines → LINE_COUNT; measured vs rendered line rects (or font
 * size) apart by > 0.5 px → MEASUREMENT_DIVERGENCE; font gate → FONT_NOT_READY.
 */

/** One rendered line: text, UTF-16 range in the caption, rect relative to the caption box (CSS px). */
export interface ViewerCaptionLineRect {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewerCaptionWrap {
  lines: ViewerCaptionLineRect[];
}

/** The shared primitive's signature: `null` when the environment has no layout (no measurement possible). */
export type ViewerCaptionWrapFn = (text: string, fontSizePx: number, lineHeightPx: number, widthPx: number) => ViewerCaptionWrap | null;

export interface ViewerCaptionMeasure {
  wrap: ViewerCaptionWrapFn;
  /** The offscreen clone (QA). */
  element: HTMLElement;
}

export interface ViewerCaptionFontGate {
  ready: boolean;
  /** Primary computed family, style, weight and the `FontFaceSet` spec used. */
  family: string;
  style: string;
  weight: string;
  spec: string;
  /** Every face of that family and its status, as proof. */
  faces: string[];
}

export interface ViewerStopFinding {
  stop: string;
  detail: string;
}

export const VIEWER_CAPTION_COPIED_PROPERTIES: readonly string[] = [...M.contractProperties, ...M.additionalProperties];

const hasLayout = () => typeof document !== "undefined" && typeof Range !== "undefined" && typeof Range.prototype.getClientRects === "function";

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");

function weightMatches(face: string, wanted: string) {
  const n = (v: string) => (v === "normal" ? 400 : v === "bold" ? 700 : Number(v));
  const w = n(wanted);
  const parts = face.trim().split(/\s+/).map(n);
  return parts.length === 2 ? w >= parts[0] && w <= parts[1] : parts[0] === w;
}

/** Synchronous font status of the caption face (no waiting). */
export function viewerCaptionFontStatus(styleSource: Element, text: string): ViewerCaptionFontGate {
  const cs = getComputedStyle(styleSource);
  const family = unquote(cs.fontFamily.split(",")[0] ?? "");
  const style = cs.fontStyle || "normal";
  const weight = cs.fontWeight || "400";
  const spec = `${style} ${weight} ${parseFloat(cs.fontSize) || 16}px "${family}"`;
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts || !family) return { ready: false, family, style, weight, spec, faces: [] };
  const faces: string[] = [];
  let loaded = false;
  fonts.forEach((f) => {
    if (unquote(f.family).toLowerCase() !== family.toLowerCase()) return;
    faces.push(`${unquote(f.family)} ${f.style} ${f.weight} · ${f.status}`);
    if (f.status === "loaded" && f.style === style && weightMatches(f.weight, weight)) loaded = true;
  });
  let checked = false;
  try {
    checked = fonts.check(spec, text);
  } catch {
    checked = false;
  }
  return { ready: loaded && checked, family, style, weight, spec, faces };
}

/** Font gate: load the face for this text, wait for `document.fonts.ready`, then confirm it. */
export async function awaitViewerCaptionFont(styleSource: Element, text: string, timeoutMs: number = M.fontGateTimeoutMs): Promise<ViewerCaptionFontGate> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (fonts) {
    const { spec } = viewerCaptionFontStatus(styleSource, text);
    const timeout = () => new Promise((r) => setTimeout(r, timeoutMs));
    await Promise.race([fonts.load(spec, text).catch(() => undefined), timeout()]);
    await Promise.race([fonts.ready, timeout()]);
  }
  return viewerCaptionFontStatus(styleSource, text);
}

/**
 * The rendered lines of a caption element holding ONE text node, read with
 * `Range.getClientRects()`: characters are grouped by line box (a new line
 * starts when a glyph's rect top moves down by half a line), each line's
 * rect is the union of its range's client rects, relative to the element.
 */
export function readViewerCaptionLines(el: HTMLElement): ViewerCaptionLineRect[] | null {
  if (!hasLayout()) return null;
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return [];
  const data = (node as Text).data;
  const box = el.getBoundingClientRect();
  const half = (parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) || 16) / 2;
  const range = document.createRange();
  const groups: { top: number; start: number; end: number }[] = [];
  for (let i = 0; i < data.length; ) {
    const len = (data.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    if (!/\s/.test(data[i])) {
      range.setStart(node, i);
      range.setEnd(node, i + len);
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
      const cur = groups[groups.length - 1];
      if (!cur || r.top >= cur.top + half) groups.push({ top: r.top, start: i, end: i + len });
      else cur.end = i + len;
    }
    i += len;
  }
  return groups.map((g) => {
    range.setStart(node, g.start);
    range.setEnd(node, g.end);
    let l = Infinity;
    let t = Infinity;
    let rr = -Infinity;
    let b = -Infinity;
    for (const r of range.getClientRects()) {
      if (r.width === 0 && r.height === 0) continue;
      l = Math.min(l, r.left);
      t = Math.min(t, r.top);
      rr = Math.max(rr, r.right);
      b = Math.max(b, r.bottom);
    }
    return { text: data.slice(g.start, g.end), start: g.start, end: g.end, x: l - box.left, y: t - box.top, width: rr - l, height: b - t };
  });
}

/**
 * The shared primitive. `styleSource` carries the visible caption's class
 * (same cascade, same font); `host` is an offscreen container (no transform).
 */
export function createViewerCaptionMeasure(styleSource: HTMLElement, host: HTMLElement): ViewerCaptionMeasure {
  const clone = document.createElement("div");
  clone.setAttribute("data-viewer-caption-measure", "");
  clone.setAttribute("aria-hidden", "true");
  host.appendChild(clone);
  const wrap: ViewerCaptionWrapFn = (text, fontSizePx, lineHeightPx, widthPx) => {
    if (!hasLayout()) return null;
    const cs = getComputedStyle(styleSource);
    for (const p of VIEWER_CAPTION_COPIED_PROPERTIES) {
      const v = cs.getPropertyValue(p);
      if (v) clone.style.setProperty(p, v);
    }
    // The displayed size and the paper's usable width — the visible caption gets the same values.
    clone.style.fontSize = `${fontSizePx}px`;
    clone.style.lineHeight = `${lineHeightPx}px`;
    clone.style.width = `${widthPx}px`;
    clone.style.display = "block";
    clone.style.margin = "0";
    clone.style.padding = "0";
    clone.style.border = "0";
    clone.style.transform = "none";
    clone.textContent = text;
    const lines = readViewerCaptionLines(clone);
    return lines ? { lines } : null;
  };
  return { wrap, element: clone };
}

export interface ViewerCaptionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Contract overflow of one rendered line out of the safe rect (≥ 0, CSS px, unrounded). */
export const viewerCaptionOverflowPx = (ink: ViewerCaptionRect, safe: ViewerCaptionRect) =>
  Math.max(safe.left - ink.left, ink.right - safe.right, safe.top - ink.top, ink.bottom - safe.bottom, 0);

/** Above a limit, never at it: comparisons are made on floats; 1e-6 only absorbs binary noise. */
const above = (v: number, limit: number) => v > limit + 1e-6;
const f3 = (v: number) => v.toFixed(3);

/** Measured (offscreen) vs rendered (visible) lines, relative to their own caption box. */
export function viewerCaptionDivergence(
  measured: readonly Pick<ViewerCaptionLineRect, "text" | "x" | "y" | "width">[],
  rendered: readonly Pick<ViewerCaptionLineRect, "text" | "x" | "y" | "width">[],
  font?: { measured: number; rendered: number },
): ViewerStopFinding[] {
  const out: ViewerStopFinding[] = [];
  const tol = M.limits.measurementRenderDeltaMaxCssPx;
  if (font && above(Math.abs(font.rendered - font.measured), 0.01)) out.push({ stop: "VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP", detail: `font ${f3(font.rendered)}px rendered vs ${f3(font.measured)}px measured` });
  if (measured.length !== rendered.length || measured.some((m, i) => m.text !== rendered[i].text)) {
    out.push({ stop: "VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP", detail: `breaks: measured [${measured.map((m) => m.text).join(" | ")}] vs rendered [${rendered.map((r) => r.text).join(" | ")}]` });
    return out;
  }
  measured.forEach((m, i) => {
    const r = rendered[i];
    const d = Math.max(Math.abs(r.x - m.x), Math.abs(r.x + r.width - (m.x + m.width)), Math.abs(r.y - m.y));
    if (above(d, tol)) out.push({ stop: "VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP", detail: `line ${i} "${r.text}": Δ ${f3(d)} px (measured x ${f3(m.x)} w ${f3(m.width)} · rendered x ${f3(r.x)} w ${f3(r.width)})` });
  });
  return out;
}

/**
 * Pure rendered caption check. `rendered` and `measured` are relative to
 * their caption box; `box` places the rendered box on the page, `safe` is
 * the paper's caption safe rect on the page.
 */
export function viewerCaptionFindings(input: {
  caption: string;
  /** The visible caption's text content. */
  text: string;
  rendered: readonly ViewerCaptionLineRect[];
  measured: readonly Pick<ViewerCaptionLineRect, "text" | "x" | "y" | "width">[];
  box: { left: number; top: number };
  safe: ViewerCaptionRect;
  font: { measured: number; rendered: number };
  fontReady: boolean | null;
}): ViewerStopFinding[] {
  const out: ViewerStopFinding[] = [];
  const tol = M.limits.subpixelToleranceCssPx;
  if (input.fontReady === false) out.push({ stop: "VIEWER_CAPTION_FONT_NOT_READY_STOP", detail: "caption face not confirmed loaded before measurement" });
  if (input.rendered.length > M.limits.maxLines) out.push({ stop: "VIEWER_CAPTION_LINE_COUNT_STOP", detail: `${input.rendered.length} rendered lines > ${M.limits.maxLines}` });
  if (input.text !== input.caption) out.push({ stop: "VIEWER_CAPTION_OVERFLOW_STOP", detail: `rendered text "${input.text}" ≠ caption` });
  input.rendered.forEach((l, i) => {
    const ink = { left: input.box.left + l.x, top: input.box.top + l.y, right: input.box.left + l.x + l.width, bottom: input.box.top + l.y + l.height };
    const o = viewerCaptionOverflowPx(ink, input.safe);
    if (above(o, tol)) out.push({ stop: "VIEWER_CAPTION_OVERFLOW_STOP", detail: `line ${i} "${l.text}" ${f3(o)} px out of the paper safe rect` });
  });
  out.push(...viewerCaptionDivergence(input.measured, input.rendered, input.font));
  return out;
}
