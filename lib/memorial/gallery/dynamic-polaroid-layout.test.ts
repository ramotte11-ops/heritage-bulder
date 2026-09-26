import { describe, expect, it } from "vitest";
import {
  A13_PILOT_PAPER,
  A13_PILOT_PHOTO_POLICY,
  A13_PILOT_SLOTS,
  type A13Slot,
} from "@/config/gallery-a13-pilot-manifest";
import {
  assignMediaToSlots,
  layoutDynamicPolaroid,
  resolveExpansionPins,
} from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { measureComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { A13_PILOT_MEDIA, PILOT_CAPTION_MODES } from "@/lib/memorial/gallery/a13-pilot-fixtures";

const slot = (id: A13Slot["slotId"]) => A13_PILOT_SLOTS.find((s) => s.slotId === id)!;
const { min: R_MIN, max: R_MAX } = A13_PILOT_PHOTO_POLICY.adaptiveOuterRatioRange;

describe("A13 manifest transcription", () => {
  it("is a single 1670 frame — no 1672 value anywhere at runtime", () => {
    const json = JSON.stringify(A13_PILOT_SLOTS);
    expect(json).not.toContain("1672");
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
});

describe("assignMediaToSlots — family order is the authority", () => {
  it("never sorts or permutes by ratio", () => {
    const media = ["panorama", "portrait", "square", "narrow", "wide", "landscape"];
    expect(assignMediaToSlots(A13_PILOT_SLOTS, media).map((e) => [e.slot.slotId, e.media])).toEqual([
      ["D1", "panorama"],
      ["D2", "portrait"],
      ["D3", "square"],
      ["D4", "narrow"],
      ["D5", "wide"],
      ["D6", "landscape"],
    ]);
  });

  it("leaves missing media slots empty rather than reflowing", () => {
    const out = assignMediaToSlots(A13_PILOT_SLOTS, ["a", "b"]);
    expect(out.map((e) => e.media)).toEqual(["a", "b", null, null, null, null]);
  });
});

describe("resolveExpansionPins", () => {
  it("resolves the manifest strings as documented", () => {
    expect(A13_PILOT_SLOTS.map((s) => [s.slotId, resolveExpansionPins(s)])).toEqual([
      ["D1", { ax: 0, ay: 1 }],
      ["D2", { ax: 0, ay: 0.5 }],
      ["D3", { ax: 0, ay: 1 }],
      ["D4", { ax: 0.5, ay: 0 }],
      ["D5", { ax: 1, ay: 1 }],
      ["D6", { ax: 1, ay: 1 }],
    ]);
  });
});

describe("layoutDynamicPolaroid", () => {
  const ratios = [3 / 4, 3 / 2, 1, 9 / 16, 16 / 9, 3, 0.4, 5];

  it("never exceeds the envelope and never distorts, for every slot × ratio", () => {
    for (const s of A13_PILOT_SLOTS) {
      for (const r of ratios) {
        for (const focal of [null, { x: 0.9, y: 0.5 }]) {
          const l = layoutDynamicPolaroid(s, { width: 1000 * r, height: 1000, focal });
          expect(l.outer.x).toBeGreaterThanOrEqual(-1e-6);
          expect(l.outer.y).toBeGreaterThanOrEqual(-1e-6);
          expect(l.outer.x + l.outer.width).toBeLessThanOrEqual(s.maxEnvelope.width + 1e-6);
          expect(l.outer.y + l.outer.height).toBeLessThanOrEqual(s.maxEnvelope.height + 1e-6);
          expect(l.photo.width / l.photo.height).toBeCloseTo(r, 6);
          expect(l.outerRatio).toBeGreaterThanOrEqual(R_MIN - 1e-6);
          expect(l.outerRatio).toBeLessThanOrEqual(R_MAX + 1e-6);
          // Paper is constant: same border / band on every tirage.
          expect(l.window.x).toBe(A13_PILOT_PAPER.border);
          expect(l.outer.height - l.window.y - l.window.height).toBeCloseTo(A13_PILOT_PAPER.bottomBand, 6);
        }
      }
    }
  });

  it("portrait → portrait print, landscape → landscape print, square → near-square print", () => {
    expect(layoutDynamicPolaroid(slot("D1"), { width: 1200, height: 1600 }).outerRatio).toBeLessThan(1);
    expect(layoutDynamicPolaroid(slot("D2"), { width: 1800, height: 1200 }).outerRatio).toBeGreaterThan(1);
    const sq = layoutDynamicPolaroid(slot("D3"), { width: 1400, height: 1400 });
    expect(sq.window.width / sq.window.height).toBeCloseTo(1, 6);
  });

  it("shows in-range photos whole (exact mode, 100 % visible)", () => {
    const l = layoutDynamicPolaroid(slot("D5"), { width: 1920, height: 1080 });
    expect(l.mode).toBe("exact");
    expect(l.visibleFraction).toBe(1);
    expect(l.outerBounded).toBe(false);
  });

  it("bounds the outer ratio and uses contain+paper when a crop would be destructive", () => {
    const l = layoutDynamicPolaroid(slot("D6"), { width: 2700, height: 900, focal: { x: 0.9, y: 0.7 } });
    expect(l.outerBounded).toBe(true);
    expect(l.outerRatio).toBeCloseTo(R_MAX, 6);
    expect(l.mode).toBe("contain-paper");
    expect(l.visibleFraction).toBe(1);
    expect(l.photo.x).toBeCloseTo(0, 6);
    expect(l.photo.y).toBeGreaterThan(0);
  });

  it("allows a safe crop only above the thresholds (80 % with focal, 85 % without)", () => {
    // D6 bounded window ratio ≈ 2.346; a 2.8:1 photo keeps ≈ 83.8 % visible.
    const withFocal = layoutDynamicPolaroid(slot("D6"), { width: 2800, height: 1000, focal: { x: 0.95, y: 0.5 } });
    const without = layoutDynamicPolaroid(slot("D6"), { width: 2800, height: 1000 });
    expect(withFocal.mode).toBe("cover-safe-crop");
    expect(withFocal.visibleFraction).toBeGreaterThanOrEqual(0.8);
    expect(without.mode).toBe("contain-paper");
  });

  it("keeps the focal subject inside the visible crop, even at the photo's edge", () => {
    const l = layoutDynamicPolaroid(slot("D6"), { width: 2800, height: 1000, focal: { x: 0.97, y: 0.5 } });
    const fx = l.photo.x + 0.97 * l.photo.width;
    expect(fx).toBeGreaterThan(0);
    expect(fx).toBeLessThan(l.window.width);
    // The crop hugs the right edge, never overshoots it.
    expect(l.photo.x + l.photo.width).toBeCloseTo(l.window.width, 6);
  });

  it("pins a smaller tirage opposite its expansion direction", () => {
    const d1 = layoutDynamicPolaroid(slot("D1"), { width: 1200, height: 1600 });
    expect(d1.outer.x).toBeCloseTo(0, 6); // grows inward (right) from the left edge
    expect(d1.outer.y + d1.outer.height).toBeCloseTo(slot("D1").maxEnvelope.height, 6); // grows up
    const d4 = layoutDynamicPolaroid(slot("D4"), { width: 1080, height: 1920 });
    expect(d4.outer.x * 2 + d4.outer.width).toBeCloseTo(slot("D4").maxEnvelope.width, 6); // horizontal: centred
  });
});

describe("pilot fixtures", () => {
  it("covers the six imposed ratios, in the mission's order", () => {
    expect(A13_PILOT_MEDIA.map((m) => +(m.width / m.height).toFixed(3))).toEqual([0.75, 1.5, 1, 0.563, 1.778, 3]);
  });

  it("keeps every caption within 32 characters", () => {
    for (const m of A13_PILOT_MEDIA) {
      for (const mode of PILOT_CAPTION_MODES) {
        const c = m.captions[mode];
        if (c) expect([...c].length).toBeLessThanOrEqual(32);
      }
    }
  });

  it("produces no unprescribed collision and keeps every tirage in its envelope", () => {
    const entries = assignMediaToSlots(A13_PILOT_SLOTS, A13_PILOT_MEDIA).map(({ slot: s, media }) => ({
      slot: s,
      layout: layoutDynamicPolaroid(s, media!),
    }));
    const qa = measureComposition(entries);
    expect(qa.slots.every((s) => s.insideEnvelope)).toBe(true);
    expect(qa.pairs.filter((p) => p.status === "RED-unprescribed")).toEqual([]);
  });
});
