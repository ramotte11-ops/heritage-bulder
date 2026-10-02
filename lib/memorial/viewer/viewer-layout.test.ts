import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { A13_VIEWER_LANDSCAPE_CAPTION, A13_VIEWER_STOPS } from "@/config/viewer-a13-desktop-v2";
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

/**
 * Greedy stand-in (what the browser does without `balance`): as many lines
 * as the column needs, a word wider than the column overflows its line.
 */
const greedy: ViewerCaptionWrapFn = (text, fs, lh, width) => {
  const w = (t: string) => [...t].length * perChar(fs);
  const rows: string[] = [];
  for (const word of text.split(" ")) {
    const last = rows.at(-1);
    if (last !== undefined && w(`${last} ${word}`) <= width) rows[rows.length - 1] = `${last} ${word}`;
    else rows.push(word);
  }
  let start = 0;
  return {
    lines: rows.map((t, i) => {
      const l = { text: t, start, end: start + t.length, x: (width - w(t)) / 2, y: i * lh, width: w(t), height: lh };
      start += t.length + 1;
      return l;
    }),
  };
};
const fitsGreedy = (text: string, fs: number, width: number) => {
  const ls = greedy(text, fs, 1.05 * fs, width)!.lines;
  return ls.length <= 2 && ls.every((l) => l.x >= -0.5 && l.x + l.width <= width + 0.5);
};

describe("A13 Viewer Mobile — landscape caption (A13_VIEWER_LANDSCAPE_CAPTION, QG: 150 px caps the widening)", () => {
  const LANDSCAPE: [number, number][] = [
    [812, 375],
    [844, 390],
    [932, 430],
  ];
  const PORTRAITISH: Record<string, [number, number]> = { "9:16": [1080, 1920], "2:3": [1200, 1800], "3:4": [1200, 1600], "1:1": [1400, 1400] };
  const c32 = "Maman et mamie, à Mimizan, 1966.";

  it("widens the paper minimally and symmetrically around an untouched photo; typography, height and band unchanged", () => {
    let widened = 0;
    for (const [vw, vh] of LANDSCAPE)
      for (const [id, [w, h]] of Object.entries(PORTRAITISH))
        for (const caption of [c32, CAPTIONS.c32]) {
          const base = { viewportW: vw, viewportH: vh, naturalW: w, naturalH: h, caption, wrap: greedy };
          const n = layoutViewer(base);
          const g = layoutViewer({ ...base, landscapePhone: true });
          const tag = `${vw}×${vh} ${id} ${caption}`;
          expect(g.photo, tag).toEqual(n.photo);
          expect([g.s, g.edge, g.band, g.bandKind, g.caption!.fontSize, g.caption!.lineHeight], tag).toEqual([n.s, n.edge, n.band, n.bandKind, n.caption!.fontSize, n.caption!.lineHeight]);
          expect([g.paper.y, g.paper.h], tag).toEqual([n.paper.y, n.paper.h]);
          if (!g.landscapeCaption) {
            // fits naturally: byte-identical geometry
            expect(viewerGeometrySnapshot(g), tag).toBe(viewerGeometrySnapshot(n));
            expect(fitsGreedy(caption, n.caption!.fontSize, n.caption!.usableWidth), tag).toBe(true);
            continue;
          }
          widened++;
          const L = g.landscapeCaption;
          const W0 = n.paper.w;
          expect(L.naturalPaper, tag).toEqual(n.paper);
          expect(L.fitStop, tag).toBe(false);
          expect(g.codes, tag).toEqual([]);
          expect(fitsGreedy(caption, n.caption!.fontSize, n.caption!.usableWidth), tag).toBe(false);
          // centre invariant, symmetric, capped, half-pixel quantum
          expect(g.paper.x + g.paper.w / 2, tag).toBeCloseTo(n.paper.x + W0 / 2, 9);
          expect(L.widening, tag).toBeCloseTo(g.paper.w - W0, 9);
          expect(L.widening, tag).toBeGreaterThan(0);
          expect(L.widening, tag).toBeLessThanOrEqual(150);
          expect(g.paper.w * 2, tag).toBe(Math.round(g.paper.w * 2));
          expect(g.paper.w, tag).toBeLessThanOrEqual(vw - 2 * g.safeX - 48 + 1e-9);
          // photo centred on the widened paper; caption column keeps its inset from the photo
          expect(g.photoLocal.x, tag).toBeCloseTo(n.edge + L.widening / 2, 9);
          expect(g.photoLocal.x + g.photoLocal.w / 2, tag).toBeCloseTo(g.paper.w / 2, 9);
          const inset = (n.photoLocal.w - n.caption!.usableWidth) / 2;
          expect(g.caption!.usableWidth, tag).toBeCloseTo(g.paper.w - 2 * g.edge - 2 * inset, 9);
          expect(g.caption!.box.x + g.caption!.box.w / 2, tag).toBeCloseTo(g.paper.w / 2, 9);
          // ≤ 2 lines in the column; minimal: half a pixel less does not fit
          expect(g.caption!.lines.length, tag).toBeLessThanOrEqual(2);
          expect(fitsGreedy(caption, g.caption!.fontSize, g.caption!.usableWidth), tag).toBe(true);
          if (g.paper.w - 0.5 > W0) expect(fitsGreedy(caption, g.caption!.fontSize, g.caption!.usableWidth - 0.5), tag).toBe(false);
          expect(g.mask.box.w, tag).toBeCloseTo(g.paper.w + 28 * g.s, 9);
        }
    expect(widened).toBeGreaterThan(0);
  });

  it("the canonical 9:16 + 32-character caption widens at 812, 844 and 932 and stays within two lines", () => {
    for (const [vw, vh] of LANDSCAPE) {
      const g = layoutViewer({ viewportW: vw, viewportH: vh, naturalW: 1080, naturalH: 1920, caption: c32, wrap: greedy, landscapePhone: true });
      expect(g.landscapeCaption?.widening).toBeGreaterThan(0);
      expect(g.caption!.lines).toHaveLength(2);
      expect(g.bandKind).toBe("twoLines");
    }
  });

  it("strictly unchanged: no caption, a caption that fits, horizontal media, no landscape phone", () => {
    const cases: [number, number, number, number, string | null, boolean][] = [];
    for (const [vw, vh] of LANDSCAPE) {
      cases.push([vw, vh, 1080, 1920, null, true], [vw, vh, 1080, 1920, "Été", true], [vw, vh, 1080, 1920, c32, false]);
      for (const [w, h] of [
        [1600, 1200],
        [1920, 1080],
      ])
        cases.push([vw, vh, w, h, c32, true], [vw, vh, w, h, CAPTIONS.c32, true]);
    }
    for (const [vw, vh, w, h, caption, landscapePhone] of cases) {
      const base = { viewportW: vw, viewportH: vh, naturalW: w, naturalH: h, caption, wrap: greedy };
      const g = layoutViewer({ ...base, landscapePhone });
      expect("landscapeCaption" in g, `${vw} ${w}:${h} ${caption}`).toBe(false);
      expect(viewerGeometrySnapshot(g)).toBe(viewerGeometrySnapshot(layoutViewer(base)));
    }
  });

  it("derived, never persisted: portrait → landscape → portrait → landscape gives the canonical portrait and the same width", () => {
    for (const [vw, vh] of LANDSCAPE) {
      const at = (W: number, H: number, landscapePhone: boolean) => layoutViewer({ viewportW: W, viewportH: H, naturalW: 1080, naturalH: 1920, caption: c32, wrap: greedy, landscapePhone });
      const p0 = viewerGeometrySnapshot(at(vh, vw, false));
      const l1 = viewerGeometrySnapshot(at(vw, vh, true));
      expect(viewerGeometrySnapshot(at(vh, vw, false))).toBe(p0);
      expect(viewerGeometrySnapshot(at(vw, vh, true))).toBe(l1);
      expect(viewerGeometrySnapshot(at(vh, vw, false))).toBe(p0);
    }
  });

  it("VIEWER_LANDSCAPE_CAPTION_FIT_STOP only when nothing up to Wmax = max(W0, min(W0 + 150, V − 48)) fits; kept at Wmax, photo unchanged", () => {
    expect(A13_VIEWER_STOPS).toContain("VIEWER_LANDSCAPE_CAPTION_FIT_STOP");
    expect(A13_VIEWER_LANDSCAPE_CAPTION).toMatchObject({ widenMaxCssPx: 150, safeBreathingCssPx: 24, widthQuantumCssPx: 0.5, mediaRatioMax: 1 });
    const three: ViewerCaptionWrapFn = (text, fs, lh, width) => ({ lines: [0, 1, 2].map((i) => ({ text: `l${i}`, start: i, end: i + 1, x: 0, y: i * lh, width: width / 2, height: lh })) });
    // fits only from a given column width (monotone)
    const from = (min: number): ViewerCaptionWrapFn => (text, fs, lh, width) => (width + 1e-9 >= min ? { lines: three(text, fs, lh, width)!.lines.slice(0, 2) } : three(text, fs, lh, width));
    for (const [vw, vh] of LANDSCAPE) {
      const base = { viewportW: vw, viewportH: vh, naturalW: 1080, naturalH: 1920, caption: c32, landscapePhone: true };
      const n = layoutViewer({ ...base, wrap: three, landscapePhone: false });
      const W0 = n.paper.w;
      const Wmax = Math.max(W0, Math.min(W0 + 150, vw - 2 * n.safeX - 48));
      const stop = layoutViewer({ ...base, wrap: three });
      expect(stop.codes).toContain("VIEWER_LANDSCAPE_CAPTION_FIT_STOP");
      expect(stop.landscapeCaption).toMatchObject({ fitStop: true, widthMax: Wmax });
      expect(stop.paper.w).toBeCloseTo(Wmax, 9);
      expect(stop.photo).toEqual(n.photo);
      expect(stop.caption!.fontSize).toBe(n.caption!.fontSize);
      // the widening is capped at +150 px (W0 < V − 48 − 150 here)
      expect(Wmax).toBeCloseTo(W0 + 150, 9);
      // exactly at the cap: fits, no STOP; just past it: STOP
      const col = (W: number) => W - 2 * n.edge - (n.photoLocal.w - n.caption!.usableWidth);
      const edge = layoutViewer({ ...base, wrap: from(col(Wmax)) });
      expect(edge.codes).toEqual([]);
      expect(edge.paper.w).toBeCloseTo(Wmax, 9);
      expect(layoutViewer({ ...base, wrap: from(col(Wmax) + 0.01) }).codes).toContain("VIEWER_LANDSCAPE_CAPTION_FIT_STOP");
      // the search lands on the first conforming half pixel
      const need = W0 + 37.3;
      const mid = layoutViewer({ ...base, wrap: from(col(need)) });
      expect(mid.paper.w).toBe(Math.ceil(need * 2) / 2);
    }
  });
});
