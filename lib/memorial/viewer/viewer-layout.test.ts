import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ViewerCaptionWrapFn } from "@/lib/memorial/viewer/viewer-caption-measure";
import { layoutViewer, normalizeViewerCaption, validateViewerCaption, viewerFontSize, viewerGeometrySnapshot, viewerScale } from "@/lib/memorial/viewer/viewer-layout";

/**
 * Deterministic stand-in for the shared browser primitive: 11.5 px per
 * character at 27 px, linear in the requested size; one line if it fits,
 * else the balanced break (what `text-wrap: balance` does). The real
 * primitive is proven in the browser pilot.
 */
const perChar = (fs: number) => (11.5 * fs) / 27;
const wrap: ViewerCaptionWrapFn = (text, fs, lh, width) => {
  const w = (t: string) => [...t].length * perChar(fs);
  const line = (t: string, start: number, i: number) => ({ text: t, start, end: start + t.length, x: (width - w(t)) / 2, y: i * lh, width: w(t), height: lh });
  if (w(text) <= width) return { lines: [line(text, 0, 0)] };
  const words = text.split(" ");
  let best: [string, string] | null = null;
  let key = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const k = Math.max(w(a), w(b)) + Math.abs(w(a) - w(b)) * 1e-6;
    if (k < key) [key, best] = [k, [a, b]];
  }
  return best ? { lines: [line(best[0], 0, 0), line(best[1], best[0].length + 1, 1)] } : { lines: [line(text, 0, 0)] };
};

const RATIOS: Record<string, [number, number]> = { "3:2": [1800, 1200], "2:3": [1200, 1800], "1:1": [1400, 1400], "2.39:1": [2390, 1000], "9:16": [1080, 1920], "4:3": [1600, 1200] };
const CAPTIONS = { none: null, short: "Notre belle famille", c32: "MAMAN ET MAMIE, À MIMIZAN, 1966." };
const VIEWPORTS: [number, number][] = [
  [1024, 768],
  [1200, 800],
  [1440, 900],
  [1670, 941],
  [1920, 1080],
  [1440, 768],
  [1920, 941],
];

describe("A13 Viewer Desktop V2 — continuous geometry", () => {
  it("reproduces the GREEN Master (1670×941, 1112×622 photo, one caption line) within the Handoff tolerances", () => {
    const g = layoutViewer({ viewportW: 1670, viewportH: 941, naturalW: 2224, naturalH: 1244, caption: "Été 2010 · Cabourg", wrap });
    expect(g.s).toBe(1);
    expect(g.bandKind).toBe("oneLine");
    // Master: paper x≈240 y≈99 w≈1195 h≈741 (±4); photo x≈281 y≈130 w≈1112 h≈622 (±2).
    expect(Math.abs(g.paper.x - 240)).toBeLessThanOrEqual(4);
    expect(Math.abs(g.paper.y - 99)).toBeLessThanOrEqual(4);
    expect(Math.abs(g.paper.w - 1195)).toBeLessThanOrEqual(4);
    expect(Math.abs(g.paper.h - 741)).toBeLessThanOrEqual(4);
    expect(Math.abs(g.photo.x - 281)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.photo.y - 130)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.photo.w - 1112)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.photo.h - 622)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.band - 88)).toBeLessThanOrEqual(1);
    // close: centre ≈ (1617, 52), target 48×48
    expect(g.close.target.x + 24).toBeCloseTo(1618, 0);
    expect(g.close.target.y + 24).toBeCloseTo(52, 0);
  });

  it("keeps the natural ratio, the whole photo, the viewport and the close zone for every ratio × caption × viewport", () => {
    for (const [vw, vh] of VIEWPORTS)
      for (const [id, [w, h]] of Object.entries(RATIOS))
        for (const [cid, caption] of Object.entries(CAPTIONS)) {
          const g = layoutViewer({ viewportW: vw, viewportH: vh, naturalW: w, naturalH: h, caption, wrap });
          const tag = `${vw}×${vh} ${id} ${cid}`;
          expect(g.photo.w / g.photo.h, tag).toBeCloseTo(w / h, 9);
          expect(g.codes, tag).toEqual([]);
          expect(g.paper.x, tag).toBeGreaterThanOrEqual(g.safeX - 1e-6);
          expect(g.paper.y, tag).toBeGreaterThanOrEqual(g.safeY - 1e-6);
          expect(g.paper.x + g.paper.w, tag).toBeLessThanOrEqual(vw - g.safeX + 1e-6);
          expect(g.paper.y + g.paper.h, tag).toBeLessThanOrEqual(vh - g.safeY + 1e-6);
          const c = g.close.clearance;
          const hit = g.paper.x < c.x + c.w && c.x < g.paper.x + g.paper.w && g.paper.y < c.y + c.h && c.y < g.paper.y + g.paper.h;
          expect(hit, tag).toBe(false);
          expect(g.caption?.fontSize ?? 20, tag).toBeGreaterThanOrEqual(20);
          for (const l of g.caption?.lines ?? []) expect(l.width, tag).toBeLessThanOrEqual(g.caption!.usableWidth + 0.5);
        }
  });

  it("builds the band from the caption: none < one line < two lines, never two empty lines", () => {
    const base = { viewportW: 1670, viewportH: 941, naturalW: 1080, naturalH: 1920, wrap };
    const none = layoutViewer({ ...base, caption: null });
    const one = layoutViewer({ ...base, caption: "Le village" });
    const two = layoutViewer({ ...base, caption: CAPTIONS.c32 });
    expect(none.bandKind).toBe("none");
    expect(none.band).toBeCloseTo(40 + 14, 6);
    expect(one.bandKind).toBe("oneLine");
    expect(two.bandKind).toBe("twoLines");
    expect(two.caption!.lines).toHaveLength(2);
    expect(none.band).toBeLessThan(one.band);
    expect(one.band).toBeLessThan(two.band);
    // a caption that fits on one line never reserves the second line
    const wide = layoutViewer({ ...base, naturalW: 1800, naturalH: 1200, caption: CAPTIONS.c32 });
    expect(wide.bandKind).toBe("oneLine");
  });

  it("caps the print at its 1670 geometry on 1920 (the outer space grows, not the print)", () => {
    const a = layoutViewer({ viewportW: 1670, viewportH: 941, naturalW: 1800, naturalH: 1200, caption: null, wrap });
    const b = layoutViewer({ viewportW: 1920, viewportH: 1080, naturalW: 1800, naturalH: 1200, caption: null, wrap });
    expect(viewerScale(1920, 1080)).toBe(1);
    expect(b.paper.w).toBeCloseTo(a.paper.w, 9);
    expect(b.paper.h).toBeCloseTo(a.paper.h, 9);
  });

  it("never upscales past the source and flags extreme ratios (review, no crop)", () => {
    const small = layoutViewer({ viewportW: 1670, viewportH: 941, naturalW: 600, naturalH: 400, caption: null, wrap });
    expect(small.photo.w).toBe(600);
    expect(small.flags.upscaleCapped).toBe(true);
    for (const [w, h] of [
      [2700, 540],
      [768, 1920],
    ]) {
      const g = layoutViewer({ viewportW: 1440, viewportH: 900, naturalW: w, naturalH: h, caption: CAPTIONS.short, wrap });
      expect(g.codes).toContain("VIEWER_EXTREME_RATIO_REVIEW");
      expect(g.photo.w / g.photo.h).toBeCloseTo(w / h, 9);
      expect(g.paper.x + g.paper.w).toBeLessThanOrEqual(1440 - g.safeX + 1e-6);
    }
  });

  it("lays the 9-slice mask with fixed corners and round bands that tile the mask box exactly", () => {
    const g = layoutViewer({ viewportW: 1440, viewportH: 900, naturalW: 2390, naturalH: 1000, caption: CAPTIONS.c32, wrap });
    const { box, slices } = g.mask;
    const area = slices.reduce((a, q) => a + q.dw * q.dh, 0);
    expect(area).toBeCloseTo(box.w * box.h, 3);
    const corners = slices.filter((q) => q.sw === 96 && q.sh === 96 && (q.sx === 0 || q.sx === 416) && (q.sy === 0 || q.sy === 416));
    expect(corners).toHaveLength(4);
    for (const q of corners) expect(q.dw).toBeCloseTo(96 * g.s, 9);
    // median contour on the paper box: mask laid 14s outside it
    expect(box.x).toBeCloseTo(-14 * g.s, 9);
    expect(box.w).toBeCloseTo(g.paper.w + 28 * g.s, 9);
  });

  it("caption rules: whitespace normalised, 33rd character rejected, lines never shrunk", () => {
    expect(normalizeViewerCaption("  Été \n\n 2010   ·  Cabourg ")).toBe("Été 2010 · Cabourg");
    expect(normalizeViewerCaption("   ")).toBeNull();
    expect(validateViewerCaption("MAMAN ET MAMIE, À MIMIZAN, 1966.").ok).toBe(true);
    const r = validateViewerCaption("MAMAN ET MAMIE, À MIMIZAN, 1966.!");
    expect(r).toEqual({ ok: false, reason: "VIEWER_CAPTION_TOO_LONG", length: 33 });
  });

  it("Caption Measurement V1: the shared primitive is called at the DISPLAYED size in the usable width — Mobile 20 px, Desktop 27 px, never 27 then ×20/27", () => {
    for (const [vw, vh] of [
      [375, 812],
      [390, 844],
      [430, 932],
      [1024, 768],
      [1440, 900],
      [1670, 941],
    ] as const) {
      const spy = vi.fn(wrap);
      const g = layoutViewer({ viewportW: vw, viewportH: vh, naturalW: 1080, naturalH: 1920, caption: CAPTIONS.c32, wrap: spy });
      expect(spy).toHaveBeenCalled();
      for (const [, fs, lh] of spy.mock.calls) {
        expect(fs).toBe(viewerFontSize(g.s));
        expect(lh).toBeCloseTo(1.05 * fs, 9);
      }
      const last = spy.mock.calls.at(-1)!;
      expect(last[3]).toBeCloseTo(g.caption!.usableWidth, 9);
      expect(g.caption!.fontSize).toBe(last[1]);
      if (vw <= 430) expect(g.caption!.fontSize).toBe(20);
      if (vw >= 1670) expect(g.caption!.fontSize).toBe(27);
      expect(g.caption!.text).toBe(CAPTIONS.c32);
      expect(g.caption!.lines.map((l) => l.text).join(" ")).toBe(CAPTIONS.c32);
    }
    // The engine source no longer scales a 27 px measure.
    const src = readFileSync(path.resolve(__dirname, "viewer-layout.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/fontSize\s*\/\s*27|\/\s*27\b|measurer/);
  });

  it("Caption Measurement V1: codes — overflow > 0.5 px, more than two lines, font not ready; 0.5 px is still PASS", () => {
    const base = { viewportW: 375, viewportH: 812, naturalW: 1080, naturalH: 1920, caption: "Notre belle famille" };
    const at = (dx: number): ViewerCaptionWrapFn => (text, fs, lh, width) => ({ lines: [{ text, start: 0, end: text.length, x: 0, y: 0, width: width + dx, height: lh }] });
    expect(layoutViewer({ ...base, wrap: at(0.5) }).codes).not.toContain("VIEWER_CAPTION_OVERFLOW_STOP");
    expect(layoutViewer({ ...base, wrap: at(0.51) }).codes).toContain("VIEWER_CAPTION_OVERFLOW_STOP");
    const three: ViewerCaptionWrapFn = (text, fs, lh, width) => ({ lines: [0, 1, 2].map((i) => ({ text: `l${i}`, start: i, end: i + 1, x: 0, y: i * lh, width: width / 2, height: lh })) });
    const g3 = layoutViewer({ ...base, wrap: three });
    expect(g3.codes).toContain("VIEWER_CAPTION_LINE_COUNT_STOP");
    expect(g3.bandKind).toBe("twoLines");
    expect(layoutViewer({ ...base, wrap, captionFontReady: false }).codes).toContain("VIEWER_CAPTION_FONT_NOT_READY_STOP");
    expect(layoutViewer({ ...base, wrap, captionFontReady: true }).codes).toEqual([]);
    // No measurement possible (no layout): the band is reserved, no lines, no false STOP.
    const none = layoutViewer({ ...base, wrap: null, captionFontReady: false });
    expect(none.caption).toBeNull();
    expect(none.codes).toEqual([]);
  });

  it("is theme-free: the geometry module reads no theme, no material and no asset colour", () => {
    const src = readFileSync(path.resolve(__dirname, "viewer-layout.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/A13_VIEWER_MATERIAL|ViewerTheme|theme|dark|light/i);
    const a = layoutViewer({ viewportW: 1200, viewportH: 800, naturalW: 1080, naturalH: 1920, caption: CAPTIONS.c32, wrap });
    const b = layoutViewer({ viewportW: 1200, viewportH: 800, naturalW: 1080, naturalH: 1920, caption: CAPTIONS.c32, wrap });
    expect(viewerGeometrySnapshot(a)).toBe(viewerGeometrySnapshot(b));
  });
});
