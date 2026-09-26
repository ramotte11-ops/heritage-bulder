import { describe, expect, it } from "vitest";
import { A13_PILOT_CAPTION, A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { breakCaption, layoutCaption, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { slotRectToCanvas } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/** Fake font: 10 px per character, ink = advance ± 1 px, 18/6 ink. */
const fake: CaptionMeasurer = {
  measure: (t) => ({
    width: t.length * 10,
    actualBoundingBoxLeft: 1,
    actualBoundingBoxRight: t.length * 10 + 1,
    actualBoundingBoxAscent: 18,
    actualBoundingBoxDescent: 6,
  }),
  fontAscent: 22,
  fontDescent: 8,
};

const d3 = A13_PILOT_SLOTS.find((s) => s.slotId === "D3")!;
const layout = layoutDynamicPolaroid(d3, { width: 1000, height: 1000 });

describe("breakCaption — V2.1 §2.3", () => {
  it("keeps one line when it fits the useful width", () => {
    expect(breakCaption("Maman", 100, fake.measure)).toEqual(["Maman"]);
  });

  it("breaks at the space minimising the widest line, then the difference", () => {
    // "aaaa"/"bb cccc" (40/70) vs "aaaa bb"/"cccc" (70/40): tie on max and
    // on difference → the first break found wins, deterministically.
    expect(breakCaption("aaaa bb cccc", 80, fake.measure)).toEqual(["aaaa", "bb cccc"]);
    // "ab"/"cd efghij" (20/90) vs "ab cd"/"efghij" (50/60) → smallest max wins.
    expect(breakCaption("ab cd efghij", 80, fake.measure)).toEqual(["ab cd", "efghij"]);
    expect(breakCaption("un deux trois quatre", 150, fake.measure)).toEqual(["un deux", "trois quatre"]);
  });

  it("never produces more than two lines", () => {
    expect(breakCaption("a b c d e f g h i j k l m n o p", 20, fake.measure).length).toBe(2);
  });
});

describe("layoutCaption — V2.1 §2", () => {
  it("centres the block in the bottom band when nothing covers it", () => {
    const c = layoutCaption(d3, layout, "Son chapeau", fake, []);
    expect(c.status).toBe("placed");
    expect(c.shiftX).toBe(0);
    const mid = c.lines[0].x + c.lines[0].metrics.width / 2;
    expect(mid).toBeCloseTo(layout.band.x + layout.band.width / 2, 9);
  });

  it("dilates the ink by the contractual 6/4 px margin", () => {
    const c = layoutCaption(d3, layout, "Son chapeau", fake, []);
    const { x, y } = A13_PILOT_CAPTION.safetyMarginPx;
    expect(c.protectedBox.width).toBeCloseTo(c.ink.width + 2 * x, 9);
    expect(c.protectedBox.height).toBeCloseTo(c.ink.height + 2 * y, 9);
  });

  it("moves only the text, on local X, by 2 px steps, to the smallest safe shift", () => {
    const free = layoutCaption(d3, layout, "Son chapeau", fake, []);
    // An obstacle covering the right half of the protected box.
    const p = free.protectedBox;
    const obstacle = slotRectToCanvas(d3, {
      x: layout.outer.x + p.x + p.width * 0.8,
      y: layout.outer.y + p.y - 20,
      width: 400,
      height: p.height + 40,
    });
    const c = layoutCaption(d3, layout, "Son chapeau", fake, [{ slotId: "DX", polygon: obstacle }]);
    expect(c.status).toBe("placed");
    expect(c.shiftX).toBeLessThan(0);
    expect(Math.abs(c.shiftX) % A13_PILOT_CAPTION.shiftStepPx).toBe(0);
    expect(c.collisionAreaPx2).toBe(0);
    // The previous candidate still collided: the shift is minimal.
    expect(Math.abs(c.shiftX)).toBeGreaterThanOrEqual(p.width * 0.2);
    expect(Math.abs(c.shiftX)).toBeLessThanOrEqual(p.width * 0.2 + A13_PILOT_CAPTION.shiftStepPx);
    // The print itself is untouched.
    expect(layout.outer).toEqual(layoutDynamicPolaroid(d3, { width: 1000, height: 1000 }).outer);
  });

  it("declares CAPTION_COLLISION_UNRESOLVED when no shift protects the glyphs", () => {
    const whole = slotRectToCanvas(d3, { ...layout.outer, x: layout.outer.x - 50, width: layout.outer.width + 100 });
    const c = layoutCaption(d3, layout, "Son chapeau", fake, [{ slotId: "DX", polygon: whole }]);
    expect(c.status).toBe("CAPTION_COLLISION_UNRESOLVED");
    expect(c.collidingWith).toEqual(["DX"]);
    expect(c.collisionAreaPx2).toBeGreaterThan(0);
  });

  it("never shifts beyond ±18 % of the band width", () => {
    const whole = slotRectToCanvas(d3, { ...layout.outer, x: layout.outer.x - 50, width: layout.outer.width + 100 });
    const c = layoutCaption(d3, layout, "Son chapeau", fake, [{ slotId: "DX", polygon: whole }]);
    expect(c.maxShift).toBeCloseTo(0.18 * layout.band.width, 9);
    expect(c.candidatesTried).toBeLessThanOrEqual(1 + 2 * Math.floor(c.maxShift / 2));
  });
});
