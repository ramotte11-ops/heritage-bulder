import { describe, expect, it } from "vitest";
import {
  A13_CTA_7PLUS,
  A13_GALLERY_STATES,
  A13_STATE_SLOTS,
  selectGalleryState,
} from "@/config/gallery-a13-multi-state-manifests";
import { A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { translate } from "@/lib/i18n/translate";
import { buildG6FamilyState } from "@/lib/memorial/gallery/gallery-state";
import { buildLegacyV11GalleryStateQa } from "@/lib/memorial/gallery/legacy/gallery-state-v1-1.legacy-qa";
import { measureComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";

const noCaption = () => null;

describe("multi-state manifests — transcription", () => {
  it("has one closed manifest per state with the package's slot counts", () => {
    expect(Object.fromEntries(A13_GALLERY_STATES.map((s) => [s, A13_STATE_SLOTS[s].length]))).toEqual({
      G2: 2,
      G3: 3,
      G4: 4,
      G5: 5,
      G6: 6,
      G6_SIGNATURE_7PLUS: 6,
    });
  });

  it("uses the V2.1 GREEN manifest itself for G6 exact — never a copy or a recalibration", () => {
    expect(A13_STATE_SLOTS.G6).toBe(A13_PILOT_SLOTS);
  });

  it("maps media[i] → slot[i] in every state, never 1672 values", () => {
    for (const s of A13_GALLERY_STATES) {
      expect(A13_STATE_SLOTS[s].map((x) => x.mediaIndex)).toEqual(A13_STATE_SLOTS[s].map((_, i) => i));
      expect(JSON.stringify(A13_STATE_SLOTS[s])).not.toContain("1672");
    }
  });

  it("keeps the package's z-order, rotations and the G7-D5 fixed band", () => {
    const z = (s: (typeof A13_GALLERY_STATES)[number]) =>
      [...A13_STATE_SLOTS[s]].sort((a, b) => a.zIndex - b.zIndex).map((x) => x.slotId);
    expect(z("G5")).toEqual(["G5-D1", "G5-D4", "G5-D2", "G5-D3", "G5-D5"]);
    expect(z("G6_SIGNATURE_7PLUS")).toEqual(["G7-D1", "G7-D6", "G7-D2", "G7-D4", "G7-D3", "G7-D5"]);
    expect(A13_STATE_SLOTS.G6_SIGNATURE_7PLUS.find((x) => x.slotId === "G7-D6")!.rotationDeg).toBe(-5);
    expect(A13_STATE_SLOTS.G6_SIGNATURE_7PLUS.filter((x) => x.bottomBandOverridePx).map((x) => x.slotId)).toEqual(["G7-D5"]);
    for (const s of ["G2", "G3", "G4", "G5", "G6_SIGNATURE_7PLUS"] as const) {
      for (const x of A13_STATE_SLOTS[s]) {
        expect(x.comfortableAreaFactor).toEqual({ min: 0.94, max: 1.06 });
        expect(x.hardAreaFactor).toEqual({ min: 0.9, max: 1.1 });
      }
    }
  });
});

describe("selectGalleryState — product mapping", () => {
  it("0–1 → absent, 2…6 → G2…G6, ≥ 7 → Signature 7+", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 42].map(selectGalleryState)).toEqual([
      null,
      null,
      "G2",
      "G3",
      "G4",
      "G5",
      "G6",
      "G6_SIGNATURE_7PLUS",
      "G6_SIGNATURE_7PLUS",
      "G6_SIGNATURE_7PLUS",
    ]);
  });
});

describe("buildG6FamilyState — G6 exact and Signature 7+ only (runtime)", () => {
  it("refuses 0–5 media: it can never produce a G2–G5 layout", () => {
    for (let n = 0; n <= 5; n++) expect(() => buildG6FamilyState(A13_PILOT_MEDIA_POOL.slice(0, n), noCaption, null)).toThrow(/runDesktopGallery/);
  });

  it("composes G6 exact (6) and Signature 7+ (≥ 7, first six media, CTA) at target surface, whole photos", () => {
    for (const n of [6, 7, 14]) {
      const media = Array.from({ length: n }, (_, i) => A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length]);
      const st = buildG6FamilyState(media, noCaption, null);
      expect(st.stateId).toBe(n === 6 ? "G6" : "G6_SIGNATURE_7PLUS");
      expect(st.hasCta).toBe(n >= 7);
      expect(st.entries.map((e) => e.media)).toEqual(media.slice(0, 6));
      for (const { slot, layout, media: m } of st.entries) {
        expect(layout.outer.width * layout.outer.height).toBeCloseTo(slot.targetOuterArea, 3);
        expect(layout.visibleFraction).toBe(1);
        expect(layout.photo.width / layout.photo.height).toBeCloseTo(m.width / m.height, 9);
      }
    }
  });
});

describe("LEGACY V1.1 QA builder (superseded G2–G5 path, historical harnesses only)", () => {
  it("returns no gallery for 0 and 1 media", () => {
    expect(buildLegacyV11GalleryStateQa([], noCaption, null)).toBeNull();
    expect(buildLegacyV11GalleryStateQa(A13_PILOT_MEDIA_POOL.slice(0, 1), noCaption, null)).toBeNull();
  });

  it("fills each state strictly in family order and shows exactly six memories for ≥ 7", () => {
    for (let n = 2; n <= A13_PILOT_MEDIA_POOL.length; n++) {
      const media = A13_PILOT_MEDIA_POOL.slice(0, n);
      const st = buildLegacyV11GalleryStateQa(media, noCaption, null)!;
      expect(st.entries.map((e) => e.media)).toEqual(media.slice(0, Math.min(n, 6)));
      expect(st.hasCta).toBe(n >= 7);
    }
    // More media than the pool: still the first six, still the CTA.
    const many = [...A13_PILOT_MEDIA_POOL, ...A13_PILOT_MEDIA_POOL];
    const st = buildLegacyV11GalleryStateQa(many, noCaption, null)!;
    expect(st.stateId).toBe("G6_SIGNATURE_7PLUS");
    expect(st.entries.map((e) => e.media)).toEqual(many.slice(0, 6));
  });

  it("lays every state out at target surface, fixed anchors, whole photos, no distortion", () => {
    for (let n = 2; n <= A13_PILOT_MEDIA_POOL.length; n++) {
      const st = buildLegacyV11GalleryStateQa(A13_PILOT_MEDIA_POOL.slice(0, n), noCaption, null)!;
      const m = measureComposition(st.entries.map(({ slot, layout }) => ({ slot, layout })));
      for (const s of m.slots) {
        // areaFactor = s² for calibrated G2–G5 (V1.1), 1 for G6 / 7+.
        const cal = st.entries.find((e) => e.slot.slotId === s.slotId)!.calibration;
        expect(s.areaFactor).toBeCloseTo(cal ? cal.scale ** 2 : 1, 12);
        expect(s.anchorDriftPx).toBeLessThan(1e-9);
      }
      for (const { slot, layout, media, calibration } of st.entries) {
        // G2–G5: V1.1 surface × s² (s = calibration.scale); G6/7+: s = 1.
        const s = calibration ? calibration.scale : 1;
        expect(layout.outer.width * layout.outer.height).toBeCloseTo(slot.targetOuterArea * s * s, 3);
        expect(layout.visibleFraction).toBe(1);
        expect(layout.photo.width / layout.photo.height).toBeCloseTo(media.width / media.height, 9);
      }
    }
  });
});

describe("CTA_7PLUS_V1", () => {
  it("transcribes the contract geometry and typography", () => {
    expect(A13_CTA_7PLUS.geometry).toEqual({ x: 616, y: 848, width: 440, height: 74, contentInset: { x: 24, y: 10 } });
    expect(A13_CTA_7PLUS.maxRenderedWidthPx).toBe(A13_CTA_7PLUS.geometry.width - 2 * A13_CTA_7PLUS.geometry.contentInset.x);
    expect(A13_CTA_7PLUS.zIndex).toBe(80);
  });

  it("has its label for FR, EN and ES in the i18n authority (dette D5) — no label left in the manifest", () => {
    expect(translate("fr", "gallery.seeMoreMemories")).toBe("Voir plus de souvenirs");
    expect(translate("en", "gallery.seeMoreMemories")).toBe("See more memories");
    expect(translate("es", "gallery.seeMoreMemories")).toBe("Ver más recuerdos");
    expect(JSON.stringify(A13_CTA_7PLUS)).not.toMatch(/souvenirs|memories|recuerdos/i);
  });
});
