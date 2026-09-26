import { describe, expect, it } from "vitest";
import { A13_PILOT_SLOTS, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots, paperFor } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import {
  convexIntersectionArea,
  measureComposition,
  pointInConvex,
  resolveComposition,
  slotRectToCanvas,
} from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { A13_PILOT_MEDIA } from "@/lib/memorial/gallery/a13-pilot-fixtures";

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

function referenceSource(s: A13Slot) {
  const { width: W, height: H } = s.referenceSize;
  const { margin, bottomBand } = paperFor(W, H);
  return { width: W - 2 * margin, height: H - margin - bottomBand };
}

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

describe("resolveComposition — V2 §3/§5", () => {
  const fixtures = () =>
    resolveComposition(
      assignMediaToSlots(A13_PILOT_SLOTS, A13_PILOT_MEDIA).map(({ slot, media }) => ({ slot, source: media })),
    );

  it("only ever reduces surfaces, within the hard range, and never moves an anchor", () => {
    const r = fixtures();
    const m = measureComposition(r.entries);
    for (const s of m.slots) {
      expect(s.areaZone).not.toBe("OUT");
      expect(s.areaFactor).toBeLessThanOrEqual(1);
      expect(s.anchorDriftPx).toBeLessThan(1e-9);
    }
  });

  it("reduces D3 first to protect the D2 caption safe zone", () => {
    const r = fixtures();
    const d3 = r.reductions.find((x) => x.slotId === "D3");
    expect(d3?.protects).toContain("D2");
  });

  it("reports what the reduction cannot fix instead of hiding it", () => {
    const r = fixtures();
    for (const h of r.unresolved) {
      const culprit = A13_PILOT_SLOTS.find((s) => s.slotId === h.by)!;
      const f = r.entries.find((e) => e.slot.slotId === h.by)!.layout!.areaFactor;
      expect(f).toBeCloseTo(culprit.hardAreaFactor.min, 6);
    }
  });

  it("D5 covers nothing of its own caption from D6 (D5 above D6)", () => {
    const r = fixtures();
    const m = measureComposition(r.entries);
    expect(m.safeZoneHits.filter((h) => h.covered === "D5" && h.above)).toEqual([]);
  });

  it("documents the contract's reference geometry itself (Master ratios)", () => {
    const r = resolveComposition(A13_PILOT_SLOTS.map((slot) => ({ slot, source: referenceSource(slot) })));
    // Pinned so any change to the reading of the contract is visible in review.
    expect(r.reductions.map((x) => x.slotId).sort()).toEqual(["D2", "D3"]);
    expect(r.unresolved.map((h) => `${h.by}>${h.covered}`).sort()).toEqual(["D2>D1", "D3>D4"]);
  });
});
