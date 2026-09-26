import { describe, expect, it } from "vitest";
import { A13_STATE_SLOTS } from "@/config/gallery-a13-multi-state-manifests";
import { A13_OCCLUSION_CAPS, A13_PROTECTED_TITLE_ZONE, A13_SLOT_CALIBRATION } from "@/config/gallery-a13-calibration-v1-1";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { buildGalleryState } from "@/lib/memorial/gallery/gallery-state";
import {
  calibrateState,
  clipConvex,
  occlusionPercent,
  outerQuad,
  unionCoverArea,
} from "@/lib/memorial/gallery/manifest-calibration";
import { MATRIX_CAPTION_STATES, runCalibrationMatrix } from "@/lib/memorial/gallery/calibration-matrix";

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11, actualBoundingBoxAscent: 18, actualBoundingBoxDescent: 7 }),
  fontAscent: 22,
  fontDescent: 8,
};

const input = (state: "G2" | "G3" | "G4" | "G5", ratios: [number, number][], text: string | null = null) =>
  A13_STATE_SLOTS[state].map((slot, i) => ({ slot, source: { width: ratios[i][0] * 1000, height: ratios[i][1] * 1000 }, captionText: text }));

describe("calibration V1.1 — transcription", () => {
  it("covers exactly the 14 G2–G5 slots with the contract values", () => {
    expect(Object.keys(A13_SLOT_CALIBRATION).sort()).toEqual(
      ["G2", "G3", "G4", "G5"].flatMap((s) => A13_STATE_SLOTS[s as "G2"].map((x) => x.slotId)).sort(),
    );
    expect(A13_PROTECTED_TITLE_ZONE).toEqual({ x: 640, y: 72, width: 430, height: 116 });
    expect(A13_SLOT_CALIBRATION["G3-D3"].protectCaptionOf).toEqual(["G3-D2"]);
    expect(A13_SLOT_CALIBRATION["G5-D5"].protectCaptionOf).toEqual(["G5-D3"]);
    expect(A13_OCCLUSION_CAPS).toHaveLength(8);
    expect(A13_STATE_SLOTS.G5.find((s) => s.slotId === "G5-D5")!.bottomBandOverridePx).toBe(72);
  });
});

describe("polygon union", () => {
  it("clips convex polygons and measures unions by inclusion–exclusion", () => {
    expect(clipConvex(sq(0, 0, 10), sq(5, 5, 10))).toHaveLength(4);
    expect(unionCoverArea(sq(0, 0, 10), [sq(5, 0, 10), sq(0, 5, 10)])).toBeCloseTo(75, 6);
    expect(unionCoverArea(sq(0, 0, 10), [sq(20, 20, 5)])).toBe(0);
  });
});

describe("calibrateState — V1.1 §4", () => {
  it("keeps s = 1 when nothing is violated and picks the largest valid s at 0.001 otherwise", () => {
    const cal = calibrateState("G2", input("G2", [[4, 3], [1, 1]]), null);
    for (const c of cal) {
      expect(c.status).toBe("placed");
      expect(Math.round(c.scale * 1000) / 1000).toBe(c.scale);
      if (c.scale < 1) {
        // One step larger must violate a constraint (largest valid s).
        expect(c.limitedBy.length).toBeGreaterThan(0);
      }
      const slotCal = A13_SLOT_CALIBRATION[c.slot.slotId];
      const q = outerQuad(c.slot, c.layout);
      expect(Math.min(...q.map((p) => p.x))).toBeGreaterThanOrEqual(slotCal.envelope[0] - 1e-9);
      expect(Math.max(...q.map((p) => p.y))).toBeLessThanOrEqual(slotCal.envelope[3] + 1e-9);
    }
  });

  it("scales the whole Polaroid through the engine's target surface, anchor/rotation/ratio kept", () => {
    const [d1] = calibrateState("G2", input("G2", [[4, 3], [1, 1]]), null);
    const full = layoutDynamicPolaroid(d1.slot, { width: 4000, height: 3000 });
    expect(d1.layout.outer.width * d1.layout.outer.height).toBeCloseTo(full.outer.width * full.outer.height * d1.scale ** 2, 3);
    expect(d1.layout.photo.width / d1.layout.photo.height).toBeCloseTo(4 / 3, 9);
    // left-bottom anchor unchanged
    expect(d1.layout.outer.x).toBeCloseTo(full.outer.x, 9);
    expect(d1.layout.outer.y + d1.layout.outer.height).toBeCloseTo(full.outer.y + full.outer.height, 9);
  });

  it("declares MANIFEST_ENVELOPE_UNRESOLVED_STOP when no s ≥ minScale exists (G4-D2 × title zone)", () => {
    const cal = calibrateState("G4", input("G4", [[3, 4], [4, 3], [1, 1], [9, 16]]), null);
    const d2 = cal.find((c) => c.slot.slotId === "G4-D2")!;
    expect(d2.status).toBe("MANIFEST_ENVELOPE_UNRESOLVED_STOP");
    expect(d2.scale).toBe(0.78);
    expect(d2.limitedBy.map((f) => f.id)).toContain("title");
  });

  it("reduces the OCCLUDER to protect a caption, never the protected memory (G3-D3 → G3-D2)", () => {
    const text = "Tous deux sur la colline";
    const without = calibrateState("G3", input("G3", [[3, 4], [4, 3], [1, 1]]), fake);
    const withCap = calibrateState("G3", input("G3", [[3, 4], [4, 3], [1, 1]], text), fake);
    const d2a = without.find((c) => c.slot.slotId === "G3-D2")!;
    const d2b = withCap.find((c) => c.slot.slotId === "G3-D2")!;
    expect(d2b.scale).toBe(d2a.scale); // the memory is untouched by its own caption
    const d3a = without.find((c) => c.slot.slotId === "G3-D3")!;
    const d3b = withCap.find((c) => c.slot.slotId === "G3-D3")!;
    expect(d3b.scale).toBeLessThanOrEqual(d3a.scale);
  });

  it("measures occlusion on the lower photo window", () => {
    const cal = calibrateState("G2", input("G2", [[4, 3], [1, 1]]), null);
    const [d1, d2] = cal;
    const pct = occlusionPercent(d1.slot, d1.layout, [outerQuad(d2.slot, d2.layout)]);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("leaves G6 exact and G6 Signature 7+ uncalibrated", () => {
    const media = Array.from({ length: 7 }, () => ({ width: 4000, height: 3000 }));
    expect(buildGalleryState(media.slice(0, 6), () => null, null)!.entries.every((e) => e.calibration === null)).toBe(true);
    expect(buildGalleryState(media, () => null, null)!.entries.every((e) => e.calibration === null)).toBe(true);
  });
});

describe("runCalibrationMatrix", () => {
  it("runs 4 states × 6 rotations × 5 caption states and never alters family order", () => {
    const runs = runCalibrationMatrix(fake);
    expect(runs).toHaveLength(4 * 6 * MATRIX_CAPTION_STATES.length);
    for (const r of runs) {
      expect(r.slots.map((s) => s.slotId)).toEqual(A13_STATE_SLOTS[r.state].map((s) => s.slotId));
      for (const s of r.slots) {
        expect(s.photoVisible).toBe(1);
        expect(s.distortion).toBeLessThan(1e-9);
        expect(s.anchorDriftPx).toBeLessThan(1e-9);
        expect(s.scale).toBeGreaterThanOrEqual(s.minScale - 1e-9);
      }
    }
  });

  it("pins the V1.1 structural STOP: G4 and G5 fail every rotation (title zone / envelope)", () => {
    const runs = runCalibrationMatrix(null).filter((r) => r.captions === "absente");
    expect(runs.filter((r) => r.state === "G4" && r.pass)).toEqual([]);
    expect(runs.filter((r) => r.state === "G5" && r.pass)).toEqual([]);
    expect(runs.filter((r) => r.state === "G2" && r.pass).map((r) => r.rotation)).toEqual([1, 4]);
    expect(runs.filter((r) => r.state === "G3" && r.pass).map((r) => r.rotation)).toEqual([0]);
  });
});
