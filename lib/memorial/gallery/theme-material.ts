import { A13_DARK_MATERIAL } from "@/config/gallery-a13-dark-material";

/**
 * A13 Desktop Dark — per-print MATERIAL derivations (rendering only).
 *
 * Applied by `DynamicPolaroid` AFTER the Light V2.1 engine has fixed the
 * geometry. Nothing here takes a layout, a media, a photo pixel or a size:
 * the only input is the `slotId` (the package's `variationSeed`), so the
 * paper and its grain are deterministic per slot and never depend on the
 * photo. The outputs are CSS custom-property values — colours and an image
 * painted inside the print's own paper box (the alpha hull is unchanged).
 *
 * Never imported by the solver, the manifests or the layout
 * (`DARK_TOKEN_READ_BY_SOLVER_STOP`, guarded by `theme-parity.test.ts`).
 */

const paper = A13_DARK_MATERIAL.polaroid.paper;

/** FNV-1a 32-bit — deterministic, platform-independent seed of a slotId. */
export function slotSeed(slotId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slotId.length; i++) {
    h ^= slotId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const hex = (rgb: [number, number, number]) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/**
 * Paper colour of one print: the base paper with its HSL lightness moved
 * by v ∈ [−2.5, +2.5] percentage points (`variationLightnessPercent`),
 * v from the slotId seed; hue unchanged (`variationHueDeg: 0`).
 */
export function darkPaperColor(slotId: string): { color: string; lightnessShiftPercent: number } {
  const u = slotSeed(slotId) / 0x100000000;
  const v = (2 * u - 1) * paper.variationLightnessPercent;
  const [h, s, l] = rgbToHsl(hexToRgb(paper.base));
  return { color: hex(hslToRgb([h + paper.variationHueDeg, s, Math.min(1, Math.max(0, l + v / 100))])), lightnessShiftPercent: v };
}

/**
 * Fibre grain of one print: fixed-generator fractal noise (the Light
 * generator's own parameters), seeded by the slotId, coloured with the
 * fibre tone rgb(88,62,39). Per pixel alpha = min(0.16 × noise,
 * `grainOpacityMax` 0.09): the fibre alpha 0.16 of the token, hard-capped
 * at the grain opacity maximum (feColorMatrix ×0.16/0.09 saturating at 1,
 * then ×0.09). Painted as a background layer of the print: under the
 * photo window, inside the paper box.
 */
export function darkGrainImage(slotId: string): string {
  const [, r, g, b, a] = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(paper.fiberColor)!.map(Number) as number[];
  const cap = paper.grainOpacityMax;
  const seed = (slotSeed(slotId) % 997) + 1;
  const f = (v: number) => (v / 255).toFixed(4);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='${seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 ${f(r)}  0 0 0 0 ${f(g)}  0 0 0 0 ${f(b)}  0 0 0 ${(a / cap).toFixed(4)} 0'/>` +
    `<feComponentTransfer><feFuncA type='linear' slope='${cap}'/></feComponentTransfer>` +
    `</filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

/**
 * Paper sheen: the paper's `highlight` at the top edge fading out, its
 * `lowlight` at the bottom edge fading in. Each pole moves the paper's HSL
 * lightness by at most 2 % of the base lightness
 * (`bottomBand.maximumBottomDarkeningPercent`, applied symmetrically to
 * the highlight): alpha = 0.02 × L(base) / |L(pole) − L(base)|.
 */
export function darkPaperSheen(): string {
  const lb = rgbToHsl(hexToRgb(paper.base))[2];
  const max = A13_DARK_MATERIAL.polaroid.bottomBand.maximumBottomDarkeningPercent / 100;
  const pole = (c: string) => {
    const rgb = hexToRgb(c);
    const alpha = (max * lb) / Math.abs(rgbToHsl(rgb)[2] - lb);
    return { rgb: rgb.join(","), alpha: Math.floor(alpha * 1000) / 1000 };
  };
  const hi = pole(paper.highlight);
  const lo = pole(paper.lowlight);
  return `linear-gradient(180deg, rgba(${hi.rgb},${hi.alpha}) 0%, rgba(${hi.rgb},0) 38%, rgba(${lo.rgb},0) 62%, rgba(${lo.rgb},${lo.alpha}) 100%)`;
}

/** CSS custom properties carried by one Dark print (material only). */
export function darkPrintMaterial(slotId: string): Record<`--a13-dark-${string}`, string> {
  return {
    "--a13-dark-paper": darkPaperColor(slotId).color,
    "--a13-dark-grain": darkGrainImage(slotId),
    "--a13-dark-sheen": darkPaperSheen(),
  };
}
