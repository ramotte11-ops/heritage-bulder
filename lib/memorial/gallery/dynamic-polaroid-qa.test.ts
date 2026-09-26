import { describe, expect, it } from "vitest";
import { A13_PILOT_D1_LEFT_EXTENT, A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import {
  composeSlots,
  convexIntersectionArea,
  measureComposition,
  obstaclesAbove,
  pointInConvex,
  slotRectToCanvas,
} from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { A13_PILOT_MEDIA } from "@/lib/memorial/gallery/a13-pilot-fixtures";

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

const fixtures = () =>
  composeSlots(assignMediaToSlots(A13_PILOT_SLOTS, A13_PILOT_MEDIA).map(({ slot, media }) => ({ slot, source: media })));

describe("polygon helpers", () => {
  it("intersects convex polygons", () => {
    expect(convexIntersectionArea(sq(0, 0, 10), sq(5, 5, 10))).toBeCloseTo(25, 6);
    expect(convexIntersectionArea(sq(0, 0, 10), sq(20, 20, 10))).toBe(0);
  });

  it("tests points in convex polygons", () => {
    expect(pointInConvex({ x: 5, y: 5 }, sq(0, 0, 10))).toBe(true);
    expect(pointInConvex({ x: 15, y: 5 }, sq(0, 0, 10))).toBe(false);
  });

  it("rotates slot-local rects around the reference centre (CSS clockwise sign)", () => {
    const s = { ...A13_PILOT_SLOTS[0], center: { x: 100, y: 100 }, rotationDeg: 90 };
    const [tl] = slotRectToCanvas(s, { x: -20, y: -10, width: 40, height: 20 });
    expect(tl.x).toBeCloseTo(110, 6);
    expect(tl.y).toBeCloseTo(80, 6);
  });
});

describe("composeSlots — V2.1 §3: no tirage is ever reduced", () => {
  it("keeps every slot at its target surface with a fixed anchor", () => {
    const m = measureComposition(fixtures());
    for (const s of m.slots) {
      expect(s.areaFactor).toBe(1);
      expect(s.anchorDriftPx).toBeLessThan(1e-9);
    }
  });

  it("measures D1's rotated bounding box minX (contract: −12 ± 3 px)", () => {
    // Pinned measurement, reported to QG: with the 3:4 test photo the D1
    // tirage (target area, left-bottom anchor, −9.5°) reaches −16.4 px,
    // 1.4 px beyond the tolerance. V2.1 forbids recentring or any other
    // lever, so the value is reported, never corrected.
    const d1 = measureComposition(fixtures()).slots.find((s) => s.slotId === "D1")!;
    expect(d1.extents.minX).toBeCloseTo(-16.375, 2);
    expect(d1.extents.minX).toBeLessThan(0); // always partly outside, never +12
    expect(A13_PILOT_D1_LEFT_EXTENT).toEqual({ minX: -12, tolerance: 3 });
  });

  it("lists only higher-z tirages as caption obstacles (D5 above D6)", () => {
    const entries = fixtures();
    const d5 = A13_PILOT_SLOTS.find((s) => s.slotId === "D5")!;
    const d6 = A13_PILOT_SLOTS.find((s) => s.slotId === "D6")!;
    expect(obstaclesAbove(entries, d5)).toEqual([]);
    expect(obstaclesAbove(entries, d6).map((o) => o.slotId).sort()).toEqual(["D2", "D3", "D4", "D5"]);
  });
});
