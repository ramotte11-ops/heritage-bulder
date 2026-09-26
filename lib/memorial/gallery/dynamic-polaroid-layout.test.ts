import { describe, expect, it } from "vitest";
import { A13_PILOT_PHOTO_POLICY, A13_PILOT_SLOTS, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import {
  assignMediaToSlots,
  layoutDynamicPolaroid,
  paperFor,
  placeAtAnchor,
} from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { A13_PILOT_MEDIA, PILOT_CAPTION_MODES } from "@/lib/memorial/gallery/a13-pilot-fixtures";

const slot = (id: A13Slot["slotId"]) => A13_PILOT_SLOTS.find((s) => s.slotId === id)!;
const { min: R_MIN, max: R_MAX } = A13_PILOT_PHOTO_POLICY.adaptiveOuterRatio;

/** A source whose window ratio reproduces the slot's reference box. */
function referenceSource(s: A13Slot) {
  const { width: W, height: H } = s.referenceSize;
  const { margin, bottomBand } = paperFor(W, H);
  return { width: W - 2 * margin, height: H - margin - bottomBand };
}

describe("A13 manifest V2 transcription", () => {
  it("is a single 1670 frame — no 1672 value anywhere at runtime", () => {
    expect(JSON.stringify(A13_PILOT_SLOTS)).not.toContain("1672");
  });

  it("maps mediaIndex i to slot D(i+1), strictly", () => {
    expect(A13_PILOT_SLOTS.map((s) => [s.slotId, s.mediaIndex])).toEqual([
      ["D1", 0],
      ["D2", 1],
      ["D3", 2],
      ["D4", 3],
      ["D5", 4],
      ["D6", 5],
    ]);
  });

  it("carries the V2 corrections: D6 at −5°, contractual depth order, D5 in front of D6", () => {
    expect(slot("D6").rotationDeg).toBe(-5);
    const order = [...A13_PILOT_SLOTS].sort((a, b) => a.zIndex - b.zIndex).map((s) => s.slotId);
    expect(order).toEqual(["D1", "D6", "D2", "D4", "D3", "D5"]);
    expect(slot("D5").zIndex).toBeGreaterThan(slot("D6").zIndex);
  });

  it("keeps target area = reference width × height", () => {
    for (const s of A13_PILOT_SLOTS) expect(s.targetOuterArea).toBe(s.referenceSize.width * s.referenceSize.height);
  });
});

describe("assignMediaToSlots — family order is the authority", () => {
  it("never sorts or permutes by ratio", () => {
    const media = ["panorama", "portrait", "square", "narrow", "wide", "landscape"];
    expect(assignMediaToSlots(A13_PILOT_SLOTS, media).map((e) => e.media)).toEqual(media);
  });

  it("leaves missing media slots empty rather than reflowing", () => {
    expect(assignMediaToSlots(A13_PILOT_SLOTS, ["a", "b"]).map((e) => e.media)).toEqual(["a", "b", null, null, null, null]);
  });
});

describe("paperFor — contract V2 §6", () => {
  it("clamps the side margin 4 % → 12–17 px and the band 18 % → 58–82 px", () => {
    expect(paperFor(200, 200)).toEqual({ margin: 12, bottomBand: 58 });
    expect(paperFor(350, 400)).toEqual({ margin: 14, bottomBand: 72 });
    expect(paperFor(600, 600)).toEqual({ margin: 17, bottomBand: 82 });
  });
});

describe("layoutDynamicPolaroid — V2", () => {
  it("reproduces the Master reference box exactly for a reference-ratio photo", () => {
    for (const s of A13_PILOT_SLOTS) {
      const l = layoutDynamicPolaroid(s, referenceSource(s));
      expect(l.mode).toBe("exact");
      expect(l.outer.width).toBeCloseTo(s.referenceSize.width, 6);
      expect(l.outer.height).toBeCloseTo(s.referenceSize.height, 6);
      expect(l.outer.x).toBeCloseTo(-s.referenceSize.width / 2, 6);
      expect(l.outer.y).toBeCloseTo(-s.referenceSize.height / 2, 6);
    }
  });

  it("sizes from the target surface — never from an envelope — for every slot × ratio", () => {
    for (const s of A13_PILOT_SLOTS) {
      for (const r of [3 / 4, 3 / 2, 1, 9 / 16, 16 / 9, 3, 0.4, 5]) {
        const l = layoutDynamicPolaroid(s, { width: 1000 * r, height: 1000 });
        expect(l.outer.width * l.outer.height).toBeCloseTo(s.targetOuterArea, 3);
        expect(l.photo.width / l.photo.height).toBeCloseTo(r, 6); // never a stretch
        expect(l.outerRatio).toBeGreaterThanOrEqual(R_MIN - 1e-9);
        expect(l.outerRatio).toBeLessThanOrEqual(R_MAX + 1e-9);
        expect(l.visibleFraction).toBe(1); // never a crop
        // photo always inside its window
        expect(l.photo.x).toBeGreaterThanOrEqual(-1e-9);
        expect(l.photo.y).toBeGreaterThanOrEqual(-1e-9);
        expect(l.photo.x + l.photo.width).toBeLessThanOrEqual(l.window.width + 1e-9);
        expect(l.photo.y + l.photo.height).toBeLessThanOrEqual(l.window.height + 1e-9);
        // V2 paper
        const p = paperFor(l.outer.width, l.outer.height);
        expect(l.margin).toBeCloseTo(p.margin, 9);
        expect(l.bottomBand).toBeCloseTo(p.bottomBand, 9);
      }
    }
  });

  it("uses exact mode (window = photo ratio) inside 0.67–1.78, bounded + contain outside", () => {
    const d5 = layoutDynamicPolaroid(slot("D5"), { width: 1920, height: 1080 });
    expect(d5.mode).toBe("exact");
    expect(d5.window.width / d5.window.height).toBeCloseTo(16 / 9, 6);
    const d4 = layoutDynamicPolaroid(slot("D4"), { width: 1080, height: 1920 });
    expect(d4.mode).toBe("contain-paper");
    expect(d4.outerRatio).toBeCloseTo(R_MIN, 9);
    expect(d4.photo.x).toBeGreaterThan(0); // residual paper breathing, on purpose
    const d6 = layoutDynamicPolaroid(slot("D6"), { width: 2700, height: 900 });
    expect(d6.mode).toBe("contain-paper");
    expect(d6.outerRatio).toBeCloseTo(R_MAX, 9);
  });

  it("keeps each slot's anchor point fixed when the ratio changes", () => {
    const anchorOf = (s: A13Slot, b: { x: number; y: number; width: number; height: number }) => ({
      x: s.anchor.startsWith("left") ? b.x : s.anchor.startsWith("right") ? b.x + b.width : b.x + b.width / 2,
      y: s.anchor.includes("bottom") ? b.y + b.height : b.y,
    });
    for (const s of A13_PILOT_SLOTS) {
      const ref = { ...placeAtAnchor(s.anchor, s.referenceSize, s.referenceSize.width, s.referenceSize.height), ...s.referenceSize };
      const want = anchorOf(s, ref);
      for (const r of [0.5625, 1, 3]) {
        const got = anchorOf(s, layoutDynamicPolaroid(s, { width: 1000 * r, height: 1000 }).outer);
        expect(got.x).toBeCloseTo(want.x, 9);
        expect(got.y).toBeCloseTo(want.y, 9);
      }
    }
  });

  it("portrait → portrait print, landscape → landscape print, square → square window", () => {
    expect(layoutDynamicPolaroid(slot("D1"), { width: 1200, height: 1600 }).outerRatio).toBeLessThan(1);
    expect(layoutDynamicPolaroid(slot("D2"), { width: 1800, height: 1200 }).outerRatio).toBeGreaterThan(1);
    const sq = layoutDynamicPolaroid(slot("D3"), { width: 1400, height: 1400 });
    expect(sq.window.width / sq.window.height).toBeCloseTo(1, 6);
  });

  it("scales the area by the factor it is given (collision reduction)", () => {
    const l = layoutDynamicPolaroid(slot("D3"), { width: 1400, height: 1400 }, 0.9);
    expect(l.outer.width * l.outer.height).toBeCloseTo(slot("D3").targetOuterArea * 0.9, 3);
  });
});

describe("pilot fixtures", () => {
  it("covers the six imposed ratios, in the mission's order", () => {
    expect(A13_PILOT_MEDIA.map((m) => +(m.width / m.height).toFixed(3))).toEqual([0.75, 1.5, 1, 0.563, 1.778, 3]);
  });

  it("follows the V2 caption test plan: 20–24 characters, exactly 32, absent", () => {
    expect(PILOT_CAPTION_MODES).toEqual(["courte", "longue", "aucune"]);
    for (const m of A13_PILOT_MEDIA) {
      const short = [...m.captions.courte!].length;
      expect(short).toBeGreaterThanOrEqual(20);
      expect(short).toBeLessThanOrEqual(24);
      expect([...m.captions.longue!].length).toBe(32);
      expect(m.captions.aucune).toBeNull();
    }
  });
});
