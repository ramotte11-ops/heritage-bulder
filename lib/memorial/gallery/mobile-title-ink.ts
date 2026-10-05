import { A13_MOBILE_CANVAS } from "@/config/gallery-a13-mobile-manifest";
import type { InkBounds } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * A13 Mobile Light — QA measure of the canonical title block (V1.5).
 *
 * The collision authority is the protected block (`A13_MOBILE_TITLE_BLOCK`,
 * solved by the runtime); this module PROVES, on the rendered scene, that
 * everything the block holds stays inside it: the rendered glyph ink of the
 * title and of the subtitle (rasterised in the 941-wide source frame with
 * their own computed font, case transform and letter-spacing, at the
 * position of their DOM text ranges, fonts loaded; alpha > 0 is ink), the
 * separator's box, and the title's line count and advance width.
 *
 * Browser only (pilot QA).
 */

export interface MobileTitleInkMeasure {
  stageWidth: number;
  /** Ink bounds in source px (stage frame). */
  heading: InkBounds;
  subtitle: InkBounds;
  /** Separator box in source px (stage frame). */
  separator: InkBounds;
  /** Title: rendered line count and advance width (CSS px). */
  titleLines: number;
  titleAdvanceCss: number;
  fontsChecked: boolean;
}

const RASTER_HEIGHT = 480;

export async function measureMobileTitleInk(scene: HTMLElement): Promise<MobileTitleInkMeasure | null> {
  const canvasEl = scene.querySelector<HTMLElement>("[data-a13-mobile-canvas]");
  const heading = scene.querySelector<HTMLElement>("header h2");
  const sub = scene.querySelector<HTMLElement>("header p");
  const sep = scene.querySelector<HTMLElement>("header [data-a13-separator]");
  if (!canvasEl || !heading || !sub || !sep) return null;
  await document.fonts.ready;
  const box = canvasEl.getBoundingClientRect();
  if (!(box.width > 0)) return null;
  const k = box.width / A13_MOBILE_CANVAS.width;
  const W = A13_MOBILE_CANVAS.width;
  const H = RASTER_HEIGHT;
  let fontsChecked = true;

  const raster = async (el: HTMLElement): Promise<InkBounds> => {
    const node = el.firstChild;
    const cs = getComputedStyle(el);
    const raw = node?.textContent ?? "";
    const text = cs.textTransform === "uppercase" ? raw.toUpperCase() : raw;
    const primary = cs.fontFamily.split(",")[0].trim();
    const cssSpec = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${primary}`;
    await document.fonts.load(cssSpec, text);
    fontsChecked = fontsChecked && document.fonts.check(cssSpec, text);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) / k}px ${primary}`;
    ctx.fontVariantCaps = cs.fontVariantCaps === "small-caps" ? "small-caps" : "normal";
    ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : `${parseFloat(cs.letterSpacing) / k}px`;
    ctx.fillStyle = "#000";
    ctx.textBaseline = "alphabetic";
    const range = document.createRange();
    range.selectNodeContents(node!);
    const r = range.getBoundingClientRect();
    // A text range's box is the inline content area: its top + font ascent is the baseline.
    const m = ctx.measureText(text);
    ctx.fillText(text, (r.left - box.left) / k, (r.top - box.top) / k + m.fontBoundingBoxAscent);
    const img = ctx.getImageData(0, 0, W, H).data;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (img[(y * W + x) * 4 + 3] > 0) {
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x + 1);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y + 1);
        }
    return { xMin, xMax, yMin, yMax };
  };

  const titleRange = document.createRange();
  titleRange.selectNodeContents(heading.firstChild!);
  const lineTops = new Set([...titleRange.getClientRects()].map((q) => Math.round(q.top)));
  const s = sep.getBoundingClientRect();
  return {
    stageWidth: box.width,
    heading: await raster(heading),
    subtitle: await raster(sub),
    separator: { xMin: (s.left - box.left) / k, xMax: (s.right - box.left) / k, yMin: (s.top - box.top) / k, yMax: (s.bottom - box.top) / k },
    titleLines: lineTops.size,
    titleAdvanceCss: titleRange.getBoundingClientRect().width,
    fontsChecked,
  };
}
