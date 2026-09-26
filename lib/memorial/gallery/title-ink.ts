import { A13_PILOT_CANVAS } from "@/config/gallery-a13-pilot-manifest";
import { G3_TITLE_PROTECTION } from "@/config/gallery-a13-g3-territory";
import type { TitleZone } from "@/lib/memorial/gallery/g3-territory";

/**
 * Browser-only — G3 territory study §2: the title protection is the UNION
 * of the rendered ink of the title and the microcopy, measured after the
 * fonts are confirmed loaded, plus 18 px (x) / 12 px (y) source.
 *
 * Each text element is measured with canvas `measureText` using its own
 * computed font (family, style, weight, size, small-caps, letter-spacing),
 * positioned from the DOM Range of its text: the ink box is
 * [left − actualBoundingBoxLeft, left + actualBoundingBoxRight] ×
 * [baseline − actualBoundingBoxAscent, baseline + actualBoundingBoxDescent],
 * baseline = range top + font ascent. `advanceDriftPx` compares the canvas
 * advance with the DOM range width as a proof the two engines agree.
 */

export interface TitleInk {
  ink: TitleZone;
  zone: TitleZone;
  advanceDriftPx: number;
  fontsChecked: boolean;
}

export async function measureTitleZone(scene: HTMLElement): Promise<TitleInk | null> {
  const canvasEl = scene.querySelector<HTMLElement>("[data-testid=a13-pilot-scene]") ?? scene;
  const texts = [...scene.querySelectorAll<HTMLElement>("header h2, header p")];
  if (!texts.length) return null;
  await document.fonts.ready;
  const box = canvasEl.getBoundingClientRect();
  const k = box.width / A13_PILOT_CANVAS.width;
  const ctx = document.createElement("canvas").getContext("2d")!;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let drift = 0;
  let fontsChecked = true;
  for (const el of texts) {
    const node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const cs = getComputedStyle(el);
    const primary = cs.fontFamily.split(",")[0].trim();
    const spec = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${primary}`;
    await document.fonts.load(spec, node.textContent ?? "");
    fontsChecked = fontsChecked && document.fonts.check(spec, node.textContent ?? "");
    ctx.font = spec;
    ctx.fontVariantCaps = cs.fontVariantCaps === "small-caps" ? "small-caps" : "normal";
    ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    const m = ctx.measureText(node.textContent ?? "");
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    drift = Math.max(drift, Math.abs(m.width - r.width));
    const baseline = r.top + m.fontBoundingBoxAscent;
    x0 = Math.min(x0, r.left - m.actualBoundingBoxLeft);
    x1 = Math.max(x1, r.left + m.actualBoundingBoxRight);
    y0 = Math.min(y0, baseline - m.actualBoundingBoxAscent);
    y1 = Math.max(y1, baseline + m.actualBoundingBoxDescent);
  }
  const toSrc = (x: number, y: number) => ({ x: (x - box.left) / k, y: (y - box.top) / k });
  const a = toSrc(x0, y0);
  const b = toSrc(x1, y1);
  const { x: mx, y: my } = G3_TITLE_PROTECTION.marginPx;
  return {
    ink: { x0: a.x, y0: a.y, x1: b.x, y1: b.y },
    zone: { x0: a.x - mx, y0: a.y - my, x1: b.x + mx, y1: b.y + my },
    advanceDriftPx: drift / k,
    fontsChecked,
  };
}
