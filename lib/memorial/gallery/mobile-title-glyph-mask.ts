import { A13_MOBILE_CANVAS, A13_MOBILE_TITLE } from "@/config/gallery-a13-mobile-manifest";
import { dilateBitmap, maskFromBitmap, type GlyphMask, type InkBounds } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * A13 Mobile Light — title authority: the RENDERED glyph masks of the title
 * and of the subtitle, dilated by 8 CSS px (contract `title.collisionAuthority`:
 * "rendered glyph masks only, not layoutBox"; margin converted per viewport,
 * `8 / (W / 941)` source px). Shared mask primitives (`title-glyph-mask.ts`).
 *
 * Browser only. Each line is rasterised separately in the 941-wide source
 * frame with its own computed font (family, style, weight, small-caps,
 * letter-spacing — CSS px converted to source px) at the position of its
 * DOM text range in the rendered Mobile stage, after the fonts are loaded;
 * alpha > 0 is ink. The dilation is a disk (no union rectangle).
 */

export interface MobileTitleGlyphMeasure {
  stageWidth: number;
  /** Ink bounds in source px. */
  heading: InkBounds;
  subtitle: InkBounds;
  marginPx: number;
  /** Union of both glyph masks, dilated by the margin (the collision authority). */
  mask: GlyphMask;
  fontsChecked: boolean;
}

/** Only the top of the stage can hold the title (layout box + margin). */
const RASTER_HEIGHT = 480;

export async function measureMobileTitleGlyphMask(scene: HTMLElement): Promise<MobileTitleGlyphMeasure | null> {
  const canvasEl = scene.querySelector<HTMLElement>("[data-a13-mobile-canvas]");
  const heading = scene.querySelector<HTMLElement>("header h2");
  const sub = scene.querySelector<HTMLElement>("header p");
  if (!canvasEl || !heading || !sub) return null;
  await document.fonts.ready;
  const box = canvasEl.getBoundingClientRect();
  if (!(box.width > 0)) return null;
  const k = box.width / A13_MOBILE_CANVAS.width;
  const W = A13_MOBILE_CANVAS.width;
  const H = RASTER_HEIGHT;
  if (A13_MOBILE_TITLE.layoutBox.y + A13_MOBILE_TITLE.layoutBox.height > H) throw new Error("measureMobileTitleGlyphMask: raster too short");
  let fontsChecked = true;

  const raster = async (el: HTMLElement) => {
    const node = el.firstChild;
    const text = node?.textContent ?? "";
    const cs = getComputedStyle(el);
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
    const m = ctx.measureText(text);
    const range = document.createRange();
    range.selectNodeContents(node!);
    const r = range.getBoundingClientRect();
    ctx.fillText(text, (r.left - box.left) / k, (r.top - box.top) / k + m.fontBoundingBoxAscent);
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
  const s = await raster(sub);
  const union = new Uint8Array(W * H);
  for (let i = 0; i < union.length; i++) union[i] = h.bits[i] | s.bits[i];
  const marginPx = A13_MOBILE_TITLE.collisionMarginCssPx / k;
  const mask = maskFromBitmap(dilateBitmap(union, W, H, Math.ceil(marginPx)), W, H);
  return { stageWidth: box.width, heading: h.ink, subtitle: s.ink, marginPx, mask, fontsChecked };
}
