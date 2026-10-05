// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { A13_VIEWER_CAPTION_MEASUREMENT as M, A13_VIEWER_STOPS } from "@/config/viewer-a13-desktop-v2";
import {
  VIEWER_CAPTION_COPIED_PROPERTIES,
  awaitViewerCaptionFont,
  createViewerCaptionMeasure,
  readViewerCaptionLines,
  viewerCaptionDivergence,
  viewerCaptionFindings,
  viewerCaptionFontStatus,
  viewerCaptionOverflowPx,
} from "@/lib/memorial/viewer/viewer-caption-measure";

/**
 * A13 Viewer Caption Measurement V1 — the pure rendered checks and the
 * contract constants. Layout itself (Range.getClientRects, fonts) is proven
 * in the browser pilot: jsdom has neither, and the primitive must then
 * degrade to "no measurement" without throwing.
 */

const safe = { left: 100, top: 300, right: 324, bottom: 400 };
const line = (text: string, x: number, width: number, y = 10) => ({ text, start: 0, end: text.length, x, y, width, height: 24 });
const base = (rendered: ReturnType<typeof line>[], extra: Partial<Parameters<typeof viewerCaptionFindings>[0]> = {}) =>
  viewerCaptionFindings({
    caption: rendered.map((l) => l.text).join(" "),
    text: rendered.map((l) => l.text).join(" "),
    rendered,
    measured: rendered,
    box: { left: 100, top: 300 },
    safe,
    font: { measured: 20, rendered: 20 },
    fontReady: true,
    ...extra,
  });
const stops = (f: { stop: string }[]) => f.map((x) => x.stop);

describe("A13 Viewer — caption measurement contract", () => {
  it("copies the 14 contractual properties verbatim (plus the other width-affecting ones), with the contract limits and STOP codes", () => {
    expect(M.handoffId).toBe("A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1");
    expect([...M.contractProperties]).toEqual([
      "font-family",
      "font-style",
      "font-weight",
      "font-size",
      "line-height",
      "letter-spacing",
      "font-kerning",
      "font-feature-settings",
      "font-variation-settings",
      "text-transform",
      "white-space",
      "word-break",
      "overflow-wrap",
      "text-align",
    ]);
    for (const p of M.contractProperties) expect(VIEWER_CAPTION_COPIED_PROPERTIES).toContain(p);
    expect(VIEWER_CAPTION_COPIED_PROPERTIES).not.toContain("transform");
    expect(M.limits).toEqual({ maxLines: 2, subpixelToleranceCssPx: 0.5, measurementRenderDeltaMaxCssPx: 0.5 });
    for (const s of ["VIEWER_CAPTION_OVERFLOW_STOP", "VIEWER_CAPTION_LINE_COUNT_STOP", "VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP", "VIEWER_CAPTION_FONT_NOT_READY_STOP"]) expect(A13_VIEWER_STOPS).toContain(s);
  });

  it("overflow out of the paper safe rect: 0.50 px PASS, 0.51 px STOP, on every side, unrounded", () => {
    const ink = { left: 150, top: 320, right: 250, bottom: 344 };
    expect(viewerCaptionOverflowPx(ink, safe)).toBe(0);
    expect(viewerCaptionOverflowPx({ ...ink, right: 324.5 }, safe)).toBeCloseTo(0.5, 12);
    expect(viewerCaptionOverflowPx({ ...ink, left: 99.49 }, safe)).toBeCloseTo(0.51, 12);
    expect(viewerCaptionOverflowPx({ ...ink, top: 299.4 }, safe)).toBeCloseTo(0.6, 12);
    expect(viewerCaptionOverflowPx({ ...ink, bottom: 400.25 }, safe)).toBeCloseTo(0.25, 12);
    // right edge at safe.right + 0.50 → PASS; + 0.51 → STOP
    expect(stops(base([line("Maman et mamie,", 224 - 150 + 0.5, 150)]))).toEqual([]);
    expect(stops(base([line("Maman et mamie,", 224 - 150 + 0.51, 150)]))).toEqual(["VIEWER_CAPTION_OVERFLOW_STOP"]);
    // left edge
    expect(stops(base([line("à Mimizan, 1966.", -0.5, 120)]))).toEqual([]);
    expect(stops(base([line("à Mimizan, 1966.", -0.51, 120)]))).toEqual(["VIEWER_CAPTION_OVERFLOW_STOP"]);
  });

  it("more than two rendered lines → LINE_COUNT; a changed text → OVERFLOW (caption cut)", () => {
    expect(stops(base([line("a", 10, 20, 0), line("b", 10, 20, 24), line("c", 10, 20, 48)]))).toEqual(["VIEWER_CAPTION_LINE_COUNT_STOP"]);
    expect(stops(base([line("Maman", 10, 50)], { text: "Mam…" }))).toEqual(["VIEWER_CAPTION_OVERFLOW_STOP"]);
  });

  it("measurement vs rendering: 0.50 px PASS, 0.51 px STOP; different breaks or font size → STOP", () => {
    const m = [line("Maman et mamie,", 30, 160, 0), line("à Mimizan, 1966.", 35, 150, 21)];
    const r = (dx: number, dw = 0) => [line("Maman et mamie,", 30 + dx, 160 + dw, 0), line("à Mimizan, 1966.", 35, 150, 21)];
    expect(viewerCaptionDivergence(m, r(0.5))).toEqual([]);
    expect(stops(viewerCaptionDivergence(m, r(0.51)))).toEqual(["VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP"]);
    expect(stops(viewerCaptionDivergence(m, r(0, 0.51)))).toEqual(["VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP"]);
    expect(stops(viewerCaptionDivergence(m, [line("Maman et mamie, à", 10, 200, 0), line("Mimizan, 1966.", 40, 130, 21)]))).toEqual(["VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP"]);
    expect(stops(viewerCaptionDivergence(m, m, { measured: 20, rendered: 27 }))).toEqual(["VIEWER_CAPTION_MEASUREMENT_DIVERGENCE_STOP"]);
    // The old method (27 px then ×20/27) was up to 3.2 % narrower than the 20 px rendering: caught.
    const old = m.map((l) => ({ ...l, width: l.width / 1.032 }));
    expect(stops(viewerCaptionDivergence(old, m)).length).toBeGreaterThan(0);
  });

  it("font gate: not confirmed → FONT_NOT_READY; without a FontFaceSet (jsdom) the gate is never 'ready'", async () => {
    expect(stops(base([line("Maman", 10, 50)], { fontReady: false }))).toEqual(["VIEWER_CAPTION_FONT_NOT_READY_STOP"]);
    const el = document.createElement("span");
    el.style.fontFamily = '"La Belle Aurore", cursive';
    document.body.appendChild(el);
    expect(viewerCaptionFontStatus(el, "Maman").ready).toBe(false);
    expect((await awaitViewerCaptionFont(el, "Maman", 10)).ready).toBe(false);
  });

  it("without layout (no Range.getClientRects) the primitive degrades to 'no measurement' — never a guess", () => {
    const src = document.createElement("span");
    const host = document.createElement("div");
    document.body.append(src, host);
    const m = createViewerCaptionMeasure(src, host);
    expect(m.element.parentElement).toBe(host);
    expect(m.wrap("Maman et mamie, à Mimizan, 1966.", 20, 21, 224)).toBeNull();
    expect(readViewerCaptionLines(m.element)).toBeNull();
  });
});
