import { describe, expect, it } from "vitest";
import { convexIntersectionArea, pointInConvex, slotRectToCanvas } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("dynamic-polaroid-qa geometry", () => {
  it("intersects convex polygons", () => {
    expect(convexIntersectionArea(sq(0, 0, 10), sq(5, 5, 10))).toBeCloseTo(25, 6);
    expect(convexIntersectionArea(sq(0, 0, 10), sq(20, 20, 10))).toBe(0);
  });

  it("tests points in convex polygons", () => {
    expect(pointInConvex({ x: 5, y: 5 }, sq(0, 0, 10))).toBe(true);
    expect(pointInConvex({ x: 15, y: 5 }, sq(0, 0, 10))).toBe(false);
  });

  it("rotates a slot-local rect around the slot anchor", () => {
    const slot = {
      slotId: "D1",
      mediaIndex: 0,
      anchor: { x: 100, y: 100 },
      maxEnvelope: { width: 40, height: 20 },
      rotationDeg: 90,
      zIndex: 1,
      expansion: "inward-and-up",
      caption: { maxChars: 32, maxLines: 2 },
    } as A13Slot;
    const [tl] = slotRectToCanvas(slot, { x: 0, y: 0, width: 40, height: 20 });
    // top-left (-20,-10) rotated 90° → (10,-20) around the anchor
    expect(tl.x).toBeCloseTo(110, 6);
    expect(tl.y).toBeCloseTo(80, 6);
  });
});
