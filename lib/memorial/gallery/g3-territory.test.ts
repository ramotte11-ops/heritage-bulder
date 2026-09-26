import { describe, expect, it } from "vitest";
import { A13_STATE_SLOTS } from "@/config/gallery-a13-multi-state-manifests";
import { G3_RELATIONS, G3_TERRITORY_SLOTS } from "@/config/gallery-a13-g3-territory";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexDistance, solveG3Territory } from "@/lib/memorial/gallery/g3-territory";

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const TITLE = { x0: 638, y0: 102, x1: 1031, y1: 193 };
const G3 = A13_STATE_SLOTS.G3;
const src = (w: number, h: number) => ({ width: w * 1000, height: h * 1000 });

describe("G3 territory — transcription", () => {
  it("keeps the manifest identity: order, rotations, z-index, anchors", () => {
    expect(G3.map((s) => [s.slotId, s.mediaIndex, s.rotationDeg, s.zIndex, s.anchor])).toEqual([
      ["G3-D1", 0, -10.5, 30, "left-bottom"],
      ["G3-D2", 1, 9.7, 40, "right-top"],
      ["G3-D3", 2, 12.7, 50, "right-bottom"],
    ]);
    expect(G3_TERRITORY_SLOTS.map((t) => [t.witnessCenter, t.absoluteMinimumLinearScale])).toEqual([
      [{ x: 511.4, y: 470 }, 0.82],
      [{ x: 1199.6, y: 379 }, 0.84],
      [{ x: 1087.7, y: 690 }, 0.82],
    ]);
    G3.forEach((s, i) => expect(s.center).toEqual(G3_TERRITORY_SLOTS[i].witnessCenter));
  });

  it("measures polygon distances", () => {
    const sq = (x: number) => [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }];
    expect(convexDistance(sq(0), sq(15))).toBeCloseTo(5, 9);
    expect(convexDistance(sq(0), sq(5))).toBe(0);
  });
});

describe("solveG3Territory", () => {
  const res = solveG3Territory({
    slots: G3,
    sources: [src(3, 4), src(4, 3), src(1, 1)],
    captions: ["Maman", "Tous les deux", "Son chapeau"],
    measurer: fake,
    title: TITLE,
  });

  it("solves the reference case in phase A, every centre inside its territory", () => {
    expect(res.status).toBe("solved");
    expect(res.phase).toBe("A");
    res.slots.forEach((s, i) => {
      const t = G3_TERRITORY_SLOTS[i].centerTerritory;
      expect(s.center.x).toBeGreaterThanOrEqual(t.xMin);
      expect(s.center.x).toBeLessThanOrEqual(t.xMax);
      expect(s.center.y).toBeGreaterThanOrEqual(t.yMin);
      expect(s.center.y).toBeLessThanOrEqual(t.yMax);
      expect(s.scale).toBeGreaterThanOrEqual(G3_TERRITORY_SLOTS[i].absoluteMinimumLinearScale);
      // Rotation / z / anchor untouched; only the centre moved.
      expect({ ...s.slot, center: G3[i].center }).toEqual(G3[i]);
    });
  });

  it("meets every protection of the contract", () => {
    const m = res.metrics!;
    expect(Math.max(...m.titleIntersectionPx2)).toBeLessThanOrEqual(1e-6);
    expect(m.d2PhotoOcclusionPercent).toBeLessThanOrEqual(G3_RELATIONS.maximumD2PhotoOcclusionPercent + 1e-9);
    expect(m.d2d3GapPx).toBeLessThanOrEqual(G3_RELATIONS.maximumContourGapPx + 1e-9);
    expect(m.d1RightWindowGapPx).toBeGreaterThanOrEqual(G3_RELATIONS.minimumPhotoWindowGapPx - 1e-9);
    expect(Math.max(...m.captionCollisionPx2)).toBe(0);
    expect(m.d1Dominant).toBe(true);
    expect(res.slots[1].center.y).toBeLessThan(res.slots[2].center.y);
  });

  it("returns G3_SLOT_TERRITORY_UNRESOLVED_STOP instead of improvising", () => {
    const blocked = solveG3Territory({
      slots: G3,
      sources: [src(3, 4), src(4, 3), src(1, 1)],
      captions: [null, null, null],
      measurer: null,
      title: { x0: 0, y0: 0, x1: 1670, y1: 941 },
    });
    expect(blocked.status).toBe("G3_SLOT_TERRITORY_UNRESOLVED_STOP");
    expect(blocked.slots).toEqual([]);
  });
});
