import { A13_PILOT_CANVAS } from "@/config/gallery-a13-pilot-manifest";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import type { Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/**
 * A13 G2–G5 — TITLE AUTHORITY: the REAL RENDERED GLYPH MASK (QG
 * arbitration after V2.1; no theoretical box is used as a gate).
 *
 * The protected title is the union of the REAL glyph contours of the
 * heading and of the microcopy (each line rasterised separately at canvas
 * scale 1 with its own computed font, after the font is loaded), dilated
 * isotropically by 3 px (disk). No union rectangle: the empty space inside
 * a line box and between the two lines is not protected.
 *
 * Representation: a pixel mask as per-row sorted pixel intervals
 * [x0, x1] (inclusive; pixel x covers [x, x + 1]).
 */

export interface GlyphMask {
  y0: number;
  rows: [number, number][][];
  /** Pixel bounds of the mask (inclusive). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export interface InkBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Build a mask from a boolean bitmap (row-major, width × height, offset). */
export function maskFromBitmap(bits: Uint8Array, width: number, height: number, ox = 0, oy = 0): GlyphMask {
  const rows: [number, number][][] = [];
  let bx0 = Infinity;
  let bx1 = -Infinity;
  let by0 = Infinity;
  let by1 = -Infinity;
  for (let y = 0; y < height; y++) {
    const iv: [number, number][] = [];
    let open = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && bits[y * width + x] === 1;
      if (on && open < 0) open = x;
      if (!on && open >= 0) {
        iv.push([open + ox, x - 1 + ox]);
        open = -1;
      }
    }
    rows.push(iv);
    if (iv.length) {
      by0 = Math.min(by0, y + oy);
      by1 = Math.max(by1, y + oy);
      bx0 = Math.min(bx0, iv[0][0]);
      bx1 = Math.max(bx1, iv[iv.length - 1][1]);
    }
  }
  return { y0: oy, rows, bounds: { x0: bx0, y0: by0, x1: bx1, y1: by1 } };
}

/** Isotropic dilation by a disk of radius r px (integer offsets, dx² + dy² ≤ r²). */
export function dilateBitmap(bits: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const offs: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!bits[y * width + x]) continue;
      for (const [dx, dy] of offs) {
        const u = x + dx;
        const v = y + dy;
        if (u >= 0 && v >= 0 && u < width && v < height) out[v * width + u] = 1;
      }
    }
  }
  return out;
}

/** Test helper: a mask made of axis-aligned pixel rectangles (inclusive). */
export function maskFromRects(rects: { x0: number; y0: number; x1: number; y1: number }[]): GlyphMask {
  const X0 = Math.min(...rects.map((r) => r.x0));
  const Y0 = Math.min(...rects.map((r) => r.y0));
  const X1 = Math.max(...rects.map((r) => r.x1));
  const Y1 = Math.max(...rects.map((r) => r.y1));
  const w = X1 - X0 + 1;
  const h = Y1 - Y0 + 1;
  const bits = new Uint8Array(w * h);
  for (const r of rects) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) bits[(y - Y0) * w + (x - X0)] = 1;
  return maskFromBitmap(bits, w, h, X0, Y0);
}

/** x-extent of a convex polygon over the horizontal strip [y, y + 1]. */
function stripExtent(poly: Point[], y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const take = (x: number) => {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  };
  for (const v of poly) if (v.y >= y && v.y <= y + 1) take(v.x);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (const yy of [y, y + 1]) {
      if ((a.y <= yy && b.y >= yy) || (b.y <= yy && a.y >= yy)) {
        if (a.y === b.y) {
          take(a.x);
          take(b.x);
        } else take(a.x + ((yy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Does the convex polygon overlap (positive area) any mask pixel? */
export function polygonHitsMask(poly: Point[], mask: GlyphMask): boolean {
  const ys = poly.map((p) => p.y);
  const xs = poly.map((p) => p.x);
  const b = mask.bounds;
  if (Math.max(...xs) <= b.x0 || Math.min(...xs) >= b.x1 + 1 || Math.max(...ys) <= b.y0 || Math.min(...ys) >= b.y1 + 1) return false;
  const yA = Math.max(b.y0, Math.floor(Math.min(...ys)));
  const yB = Math.min(b.y1, Math.ceil(Math.max(...ys)) - 1);
  for (let y = yA; y <= yB; y++) {
    const row = mask.rows[y - mask.y0];
    if (!row || !row.length) continue;
    const e = stripExtent(poly, y);
    if (!e || e[1] - e[0] <= 1e-9) continue;
    for (const [x0, x1] of row) if (e[0] < x1 + 1 - 1e-9 && e[1] > x0 + 1e-9) return true;
  }
  return false;
}

/** Mask pixels as rectangles (one per row interval) — QA overlay only. */
export function maskRects(mask: GlyphMask) {
  const out: { x: number; y: number; width: number; height: number }[] = [];
  mask.rows.forEach((row, i) => row.forEach(([a, b]) => out.push({ x: a, y: mask.y0 + i, width: b - a + 1, height: 1 })));
  return out;
}

export interface TitleGlyphMeasure {
  heading: InkBounds;
  microcopy: InkBounds;
  /** Information only: deviation from the retired V2.1 reference ink (px). */
  deviationPx: { heading: number; microcopy: number };
  /** Dilated (3 px) union of both glyph masks. */
  mask: GlyphMask;
  fontsChecked: boolean;
}

function deviation(a: InkBounds, r: InkBounds) {
  return Math.max(Math.abs(a.xMin - r.xMin), Math.abs(a.xMax - r.xMax), Math.abs(a.yMin - r.yMin), Math.abs(a.yMax - r.yMax));
}

/**
 * Browser only. Rasterises the heading and the microcopy of a rendered
 * scene (1670 px wide, scale 1) with canvas `fillText`, each with its own
 * computed font (family, style, weight, size, small-caps, letter-spacing),
 * at the position of its DOM text range; alpha > 0 is ink.
 */
export async function measureTitleGlyphMask(scene: HTMLElement): Promise<TitleGlyphMeasure | null> {
  const canvasEl = scene.querySelector<HTMLElement>("[data-testid=a13-pilot-scene]") ?? scene;
  const heading = scene.querySelector<HTMLElement>("header h2");
  const micro = scene.querySelector<HTMLElement>("header p");
  if (!heading || !micro) return null;
  await document.fonts.ready;
  const box = canvasEl.getBoundingClientRect();
  const k = box.width / A13_PILOT_CANVAS.width;
  if (Math.abs(k - 1) > 1e-6) throw new Error("measureTitleGlyphMask: the scene must be rendered at 1670 px (scale 1)");
  const W = A13_PILOT_CANVAS.width;
  const H = A13_PILOT_CANVAS.height;
  let fontsChecked = true;

  const raster = async (el: HTMLElement) => {
    const node = el.firstChild;
    const text = node?.textContent ?? "";
    const cs = getComputedStyle(el);
    const primary = cs.fontFamily.split(",")[0].trim();
    const spec = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${primary}`;
    await document.fonts.load(spec, text);
    fontsChecked = fontsChecked && document.fonts.check(spec, text);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.font = spec;
    ctx.fontVariantCaps = cs.fontVariantCaps === "small-caps" ? "small-caps" : "normal";
    ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    ctx.fillStyle = "#000";
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(text);
    const range = document.createRange();
    range.selectNodeContents(node!);
    const r = range.getBoundingClientRect();
    ctx.fillText(text, r.left - box.left, r.top - box.top + m.fontBoundingBoxAscent);
    const img = ctx.getImageData(0, 0, W, H).data;
    const bits = new Uint8Array(W * H);
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (img[(y * W + x) * 4 + 3] > 0) {
          bits[y * W + x] = 1;
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x + 1);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y + 1);
        }
      }
    }
    return { bits, ink: { xMin, xMax, yMin, yMax } };
  };

  const h = await raster(heading);
  const mc = await raster(micro);
  const union = new Uint8Array(W * H);
  for (let i = 0; i < union.length; i++) union[i] = h.bits[i] | mc.bits[i];
  const mask = maskFromBitmap(dilateBitmap(union, W, H, A13_V2_1_TITLE.dilationPx), W, H);
  const dev = { heading: deviation(h.ink, A13_V2_1_TITLE.headingInkReference), microcopy: deviation(mc.ink, A13_V2_1_TITLE.microcopyInkReference) };
  return {
    heading: h.ink,
    microcopy: mc.ink,
    deviationPx: dev,
    mask,
    fontsChecked,
  };
}
