import { describe, expect, it } from "vitest";
import { A13_STATE_SLOTS } from "@/config/gallery-a13-multi-state-manifests";
import { A13_V2_CONTRACT, A13_V2_FIXTURES, A13_V2_MANIFESTS } from "@/config/gallery-a13-v2-manifests";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { slotRectToCanvas } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { fixtureSources, largestVisibleSquare, masterMediaRatio, masterSelfCheck, signedHullGap, solveV2, v2SlotToA13 } from "@/lib/memorial/gallery/gallery-v2";
import { dilateBitmap, maskFromBitmap, maskFromRects, polygonHitsMask } from "@/lib/memorial/gallery/title-glyph-mask";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
/** V2.1 reference ink (heading, microcopy) dilated 3 px, as boxes: a
 * superset of the real glyph mask, so a PASS here is a PASS on glyphs. */
const R = A13_V2_1_TITLE;
const d = R.dilationPx;
const REF_MASK = maskFromRects([
  { x0: R.headingInkReference.xMin - d, y0: R.headingInkReference.yMin - d, x1: R.headingInkReference.xMax + d - 1, y1: R.headingInkReference.yMax + d - 1 },
  { x0: R.microcopyInkReference.xMin - d, y0: R.microcopyInkReference.yMin - d, x1: R.microcopyInkReference.xMax + d - 1, y1: R.microcopyInkReference.yMax + d - 1 },
]);
const STATES = ["G2", "G3", "G4", "G5"] as const;

describe("V2 manifests — transcription", () => {
  it("keeps the V1 witness geometry, order, rotation, anchor and z-order", () => {
    for (const st of STATES) {
      expect(A13_V2_MANIFESTS[st].slots.map((s) => [s.slotId, s.mediaIndex, s.witness.center, s.witness.outerSize, s.witness.outerArea, s.witness.rotationDeg, s.anchor, s.zIndex])).toEqual(
        A13_STATE_SLOTS[st].map((s) => [s.slotId, s.mediaIndex, s.center, s.referenceSize, s.targetOuterArea, s.rotationDeg, s.anchor, s.zIndex]),
      );
    }
    expect(A13_V2_MANIFESTS.G5.slots[4].bottomBandHeightPx).toBe(72);
  });

  it("applies the V2.1 manifest patches (G2-PAIR, G4-D3 ratio semantics)", () => {
    expect(A13_V2_MANIFESTS.G2.relations.map((r) => r.type)).toEqual(["pair-coherence"]);
    const d3 = A13_V2_MANIFESTS.G4.slots[2];
    expect([d3.witnessMediaRatio, d3.witnessPhotoWindowRatio, d3.witnessOuterPolaroidRatio]).toEqual([2.09, 2.09, 1.7095]);
    expect(masterMediaRatio(d3)).toBe(2.09);
    expect(d3.witness.outerSize.width / d3.witness.outerSize.height).toBeCloseTo(1.7095, 4);
    expect(A13_V2_1_TITLE.dilationPx).toBe(3);
    expect("inkBoundsTolerancePx" in A13_V2_1_TITLE).toBe(false); // gate retired (QG)
  });

  it("transcribes the common contract and the 96-case matrix", () => {
    expect(A13_V2_CONTRACT.titleMarginPx).toEqual({ x: 12, y: 8 });
    expect(A13_V2_CONTRACT.occlusion).toEqual({ hardMinimumVisiblePhotoFractionCap: 0.35, hardMinimumVisibleOuterFractionCap: 0.3 });
    expect(A13_V2_CONTRACT.accessibility.minimumConnectedHitTargetCssPx).toEqual([44, 44]);
    expect(A13_V2_FIXTURES.assignments.length * A13_V2_FIXTURES.captions.length * A13_V2_FIXTURES.states.length).toBe(96);
    for (const st of STATES) for (const s of A13_V2_MANIFESTS[st].slots) expect(s.scaleBounds.hard).toEqual([0.8, 1.1]);
  });

  it("derives Master media ratios that reproduce the witness paper (engine range)", () => {
    for (const st of STATES) {
      for (const s of A13_V2_MANIFESTS[st].slots) {
        const r = masterMediaRatio(s);
        const l = layoutDynamicPolaroid(v2SlotToA13(s), { width: r * 1000, height: 1000 }, 1);
        if (s.slotId === "G4-D3") {
          // V2.1: media 2.09 (outside the default adaptive range) keeps its
          // intrinsic ratio — bounded paper + contain, never rewritten.
          expect(l.mediaClass).toBe("above");
          expect(l.photo.width / l.photo.height).toBeCloseTo(2.09, 9);
          continue;
        }
        expect(l.outer.width).toBeCloseTo(s.witness.outerSize.width, 2);
        expect(l.outer.height).toBeCloseTo(s.witness.outerSize.height, 2);
      }
    }
  });
});

describe("V2 geometry helpers", () => {
  it("finds the largest visible axis-aligned square", () => {
    const sq = (x0: number, y0: number, s: number) => [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }];
    expect(largestVisibleSquare(sq(0, 0, 100), []).side).toBe(100);
    // A cover over the right 70 px leaves a 30 × 100 strip.
    expect(largestVisibleSquare(sq(0, 0, 100), [sq(30, -10, 200)]).side).toBe(30);
    expect(largestVisibleSquare(sq(0, 0, 100), [sq(30, -10, 200)], 44).side).toBe(0);
  });

  it("dilates glyph masks isotropically and tests polygons against them", () => {
    const bits = new Uint8Array(11 * 11);
    bits[5 * 11 + 5] = 1;
    const m = maskFromBitmap(dilateBitmap(bits, 11, 11, 3), 11, 11);
    expect(m.bounds).toEqual({ x0: 2, y0: 2, x1: 8, y1: 8 });
    expect(m.rows[2]).toEqual([[5, 5]]); // disk, not a square
    const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
    expect(polygonHitsMask(sq(8.5, 4.5, 3), m)).toBe(true);
    expect(polygonHitsMask(sq(9, 0, 3), m)).toBe(false);
    // Empty space inside a line box is not protected.
    const two = maskFromRects([{ x0: 0, y0: 0, x1: 9, y1: 1 }, { x0: 0, y0: 8, x1: 9, y1: 9 }]);
    expect(polygonHitsMask(sq(2, 3, 3), two)).toBe(false);
  });

  it("measures a signed outer hull gap", () => {
    const sq = (x: number) => [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }];
    expect(signedHullGap(sq(0), sq(15))).toBeCloseTo(5, 9);
    expect(signedHullGap(sq(0), sq(10))).toBeCloseTo(0, 9);
    expect(signedHullGap(sq(0), sq(7))).toBeCloseTo(-3, 9);
  });
});

describe("Master grammar self-check", () => {
  it("every Master grammar has a valid runtime solution, even against the conservative reference boxes", () => {
    for (const st of STATES) {
      const r = masterSelfCheck(st, A13_V2_MANIFESTS[st].slots.map(() => "Maman"), fake, REF_MASK);
      expect(r.result).toBe("MASTER SELF-CHECK: PASS");
      r.solution.forEach((x, i) => {
        const t = A13_V2_MANIFESTS[st].slots[i].territory;
        expect(x.translation.x).toBeGreaterThanOrEqual(t.xMin);
        expect(x.translation.x).toBeLessThanOrEqual(t.xMax);
        expect(x.translation.y).toBeGreaterThanOrEqual(t.yMin);
        expect(x.translation.y).toBeLessThanOrEqual(t.yMax);
      });
    }
  }, 120000);

  it("keeps the exact witness when it is already valid, and reports it", () => {
    const far = maskFromRects([{ x0: 0, y0: 0, x1: 1, y1: 1 }]);
    for (const st of STATES) {
      const r = masterSelfCheck(st, A13_V2_MANIFESTS[st].slots.map(() => null), fake, far);
      expect(r.witnessExact.ok).toBe(true);
      expect(r.solution.every((x) => x.translation.x === 0 && x.translation.y === 0 && x.scale === 1)).toBe(true);
    }
  }, 120000);
});

describe("solveV2", () => {
  const input = { state: "G2" as const, sources: fixtureSources("G2", "mixed-natural"), captions: ["Maman, un soir à Gordes.", "Tous deux sur la colline"], measurer: fake, titleMask: REF_MASK };

  it("returns the Master witness itself when it is valid (master-like, G2)", () => {
    const r = solveV2({ ...input, sources: fixtureSources("G2", "master-like") });
    expect(r.status).toBe("PASS");
    expect(r.masterCost).toBe(0);
    expect(r.slots.map((s) => [s.scale, s.translation])).toEqual([
      [1, { x: 0, y: 0 }],
      [1, { x: 0, y: 0 }],
    ]);
  });

  it("G2-PAIR: ranks the pair relation before individual drift (never rejects)", () => {
    const r = solveV2(input);
    expect(r.status).toBe("PASS");
    const pair = r.relations!.pair[0];
    expect(pair.relationId).toBe("G2-PAIR");
    // The witness transform with these media leaves a large void; the V2.1
    // ranking closes it as far as the territories and scale bounds allow.
    const witness = solveV2({ ...input, sources: fixtureSources("G2", "master-like") });
    expect(witness.relations!.pair[0].loss).toBe(0);
    const d1 = r.slots[0];
    const d2 = r.slots[1];
    expect(d1.translation.x).toBeGreaterThan(0);
    expect(d2.translation.x).toBeLessThan(0);
    expect(pair.gapPx).toBeLessThan(170);
  }, 60000);

  it("meets every hard rule, keeps order/rotation/z, and is deterministic", { timeout: 60000 }, () => {
    const a = solveV2(input);
    const b = solveV2(input);
    expect(a.status).toBe("PASS");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    a.slots.forEach((s, i) => {
      const v = A13_V2_MANIFESTS.G2.slots[i];
      expect(s.slot.rotationDeg).toBe(v.witness.rotationDeg);
      expect(s.slot.zIndex).toBe(v.zIndex);
      expect(s.slot.mediaIndex).toBe(i);
      expect(s.translation.x).toBeGreaterThanOrEqual(v.territory.xMin);
      expect(s.translation.x).toBeLessThanOrEqual(v.territory.xMax);
      expect(s.scale).toBeGreaterThanOrEqual(0.8);
      expect(s.scale).toBeLessThanOrEqual(1.1);
      expect(s.visiblePhoto).toBeGreaterThanOrEqual(s.minima.photo - 1e-9);
      expect(s.visibleOuter).toBeGreaterThanOrEqual(s.minima.outer - 1e-9);
      expect(s.hitTarget.side).toBeGreaterThanOrEqual(44);
      expect(s.layout.visibleFraction).toBe(1);
      expect(polygonHitsMask(slotRectToCanvas(s.slot, s.layout.outer), REF_MASK)).toBe(false);
    });
  });
});
