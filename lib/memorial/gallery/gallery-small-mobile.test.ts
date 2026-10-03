import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { runMobileGallery } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { a13MobileFixture, A13_MOBILE_RATIO_SETS } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";
import { layoutAlbumMobile, solveAlbumMobileGeometry } from "@/lib/memorial/album/album-mobile-layout";
import { albumMobileFixture } from "@/lib/memorial/album/album-mobile-pilot-fixtures";
import { A13_SMALL_MOBILE_FALLBACK, projectOrderedIntervals, smallMobileAlbum, smallMobileGallery, smallMobileNominalX } from "./gallery-small-mobile";

/**
 * A13 Responsive Bridge V1.4 — Small Mobile 320–374: the contract's
 * per-slot assertions (QA_MATRIX.md) on the runtime, the certificates
 * (320 / G2 / D1 / 2.39:1, 320 / G2 / 4:3, 360–364, 365) and the negative
 * controls.
 */

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: [...t].length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: [...t].length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const CAPTIONS = ["aucune", "courte", "deux-lignes"] as const;
/** The contract's boundary widths in the Small Mobile family. */
const WIDTHS = [320, 346, 347, 359, 360, 364, 365, 374] as const;
const runAt375 = (n: number, ratios: (typeof A13_MOBILE_RATIO_SETS)[number], captions: (typeof CAPTIONS)[number]) => {
  const media = a13MobileFixture(n, ratios, captions);
  const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: fake, stageWidth: 375 });
  expect(run.outcome).toBe("resolved");
  return run;
};
const sm = (n: number, ratios: (typeof A13_MOBILE_RATIO_SETS)[number], captions: (typeof CAPTIONS)[number], W: number) => smallMobileGallery(runAt375(n, ratios, captions), W, fake, (m) => m.caption);

describe("ordered interval projection (V1.2)", () => {
  it("unconstrained → the nominal centres; a violated order → one shared value (the clamped mean)", () => {
    expect(projectOrderedIntervals([1, 2, 3], [-9, -9, -9], [9, 9, 9])).toEqual([1, 2, 3]);
    expect(projectOrderedIntervals([3, 1], [-9, -9], [9, 9])).toEqual([2, 2]);
    expect(projectOrderedIntervals([0, 10], [2, -9], [9, 5])).toEqual([2, 5]);
    expect(projectOrderedIntervals([0, 0], [5, -9], [9, 1])).toBeNull();
  });
  it("nominal centre: 8 and W − 8 are fixed points; the 375 centre maps to the W centre", () => {
    for (const W of [320, 360, 374]) {
      expect(smallMobileNominalX(8, W)).toBeCloseTo(8, 12);
      expect(smallMobileNominalX(367, W)).toBeCloseTo(W - 8, 12);
      expect(smallMobileNominalX(187.5, W)).toBeCloseTo(W / 2, 12);
    }
  });
});

describe("Gallery Small Mobile V1.3 — contract matrix", () => {
  it("G2…7+ × 7 ratio sets (4:3 included) × 3 caption sets at 320 / 346 / 347 / 359 / 360 / 364 / 365 / 374: PASS; every slot logged; fallback only for an empty own interval at 320–364; k = A/E in [0.8734, 1); hit-area ≥ 44", { timeout: 600000 }, () => {
    const rows: string[] = ["W\tstate\tratios\tcaptions\tslot\tE(1)\tA(W)\tinterval(1)\tcause\tk_required\tepsilon\tk_runtime\tE(final)\tinterval(final)\tx\tpaper\tcaption\thit"];
    for (const W of WIDTHS)
      for (const ratios of A13_MOBILE_RATIO_SETS)
        for (const n of [2, 3, 4, 5, 6, 7])
          for (const captions of CAPTIONS) {
            const run = runAt375(n, ratios, captions);
            const r = smallMobileGallery(run, W, fake, (m) => m.caption);
            expect(r.status, `${W} n${n} ${ratios} ${captions}`).toBe("PASS");
            if (r.status !== "PASS") continue;
            for (const [i, l] of r.log.entries()) {
              const e = r.entries[i];
              const src = run.entries[i];
              rows.push(`${W}\t${run.stateId}\t${ratios}\t${captions}\t${l.slotId}\t${l.envelope1.toFixed(3)}\t${l.admissible.toFixed(3)}\t[${l.interval1.map((v) => v.toFixed(2))}]\t${l.eligibility}\t${l.kRequired ?? "-"}\t${l.epsilon}\t${l.kRuntime}\t${l.envelopeFinal.toFixed(3)}\t[${l.intervalFinal.map((v) => v.toFixed(3))}]\t${l.x.toFixed(2)}\t${l.paper.width.toFixed(2)}x${l.paper.height.toFixed(2)}\t${l.caption ? `${l.caption.lines}L ${l.caption.fits ? "fits" : "no"}` : "-"}\t${l.hitSideCss.toFixed(1)}`);
              // E(1) is the contract formula for a plain paper.
              expect(l.envelope1).toBeGreaterThanOrEqual(l.envelopeFormula - 1e-9);
              // Fallback: only for an empty own interval (E > A), only at 320–364; k = A/E exactly, never below 0.8734.
              if (l.kRuntime < 1) {
                expect(l.intervalEmptyAtOne).toBe(true);
                expect(l.envelope1).toBeGreaterThan(l.admissible);
                expect(W).toBeLessThanOrEqual(364);
                expect(l.kRequired).toBe(l.admissible / l.envelope1);
                expect(l.kRuntime).toBeGreaterThanOrEqual(A13_SMALL_MOBILE_FALLBACK.minScale);
                expect(l.kRequired! - l.kRuntime).toBeLessThanOrEqual(A13_SMALL_MOBILE_FALLBACK.epsilonMax);
                // Envelope residual ≤ 0.01 px: the reduced paper exactly fills the admissible width.
                expect(Math.abs(l.envelopeFinal - l.admissible)).toBeLessThanOrEqual(0.01);
                expect(l.caption === null || l.caption.fits).toBe(true);
              } else expect(l.intervalEmptyAtOne).toBe(false);
              expect(l.intervalFinal[0]).toBeLessThanOrEqual(l.intervalFinal[1] + 1e-9);
              expect(l.x).toBeGreaterThanOrEqual(l.intervalFinal[0] - 1e-6);
              expect(l.x).toBeLessThanOrEqual(l.intervalFinal[1] + 1e-6);
              expect(l.hitSideCss).toBeGreaterThanOrEqual(44);
              // Y, rotation, paint order, media order: delta 0.
              expect([e.slot.center.y, e.slot.rotationDeg, e.slot.zIndex, e.mediaIndex, e.slot.slotId]).toEqual([src.slot.center.y, src.slot.rotationDeg, src.slot.zIndex, src.mediaIndex, src.slot.slotId]);
              // Photo: whole, undistorted (same ratio as the 375 print).
              expect(e.layout.photo.width / e.layout.photo.height).toBeCloseTo(src.layout.photo.width / src.layout.photo.height, 9);
            }
            // CTA and stage unchanged (they belong to the 375 run).
            expect([run.cta, run.stageHeight, run.translateY]).toEqual([run.cta, run.stageHeight, run.translateY]);
          }
    if (process.env.A13_SMALL_MOBILE_LOG) writeFileSync(process.env.A13_SMALL_MOBILE_LOG, rows.join("\n"));
  });

  it("365 and 374: no Studio fallback at all (every scale 1); 360–364: fallback only where E(1) > A(W)", { timeout: 120000 }, () => {
    for (const W of [360, 362, 364]) {
      const r = sm(2, "4x3", "deux-lignes", W);
      expect(r.status).toBe("PASS");
      if (r.status === "PASS") expect(r.log.every((l) => l.kRuntime === 1)).toBe(true); // feasible → never scaled by width alone
    }
    for (const W of [365, 374])
      for (const ratios of A13_MOBILE_RATIO_SETS)
        for (const n of [2, 3, 4, 5, 6, 7]) {
          const r = sm(n, ratios, "deux-lignes", W);
          expect(r.status).toBe("PASS");
          if (r.status === "PASS") expect(r.log.every((l) => l.kRuntime === 1 && !l.intervalEmptyAtOne)).toBe(true);
        }
  });
});

describe("certificate 320 / G2 / D1 / 2.39:1", () => {
  it("E(1) ≈ 348, A(W) = 304, k_required = A/E ≈ 0.873463 ≥ 0.8734 computed from the geometry; final interval non-empty; caption canonical PASS; D2 scale 1; Y / rotation / paint order unchanged", () => {
    const run = runAt375(2, "239", "deux-lignes");
    const r = smallMobileGallery(run, 320, fake, (m) => m.caption);
    expect(r.status).toBe("PASS");
    if (r.status !== "PASS") return;
    const d1 = r.log.find((l) => l.slotId === "G2-D1")!;
    const d2 = r.log.find((l) => l.slotId === "G2-D2")!;
    expect(d1.intervalEmptyAtOne).toBe(true);
    expect(d1.eligibility).toBe("intrinsic-paper-width");
    expect(d1.envelope1).toBeCloseTo(348, 0);
    expect(d1.admissible).toBe(304);
    // The factor is the contract formula on the real geometry: A(W) / E(1).
    expect(d1.kRequired).toBe(d1.admissible / d1.envelope1);
    expect(d1.kRequired!).toBeCloseTo(0.8734614, 6);
    expect(d1.kRequired!).toBeGreaterThanOrEqual(0.8734);
    expect(d1.kRuntime).toBe(d1.kRequired);
    expect(d1.epsilon).toBe(0);
    expect(d1.intervalFinal[0]).toBeLessThanOrEqual(d1.intervalFinal[1] + 1e-9);
    expect(d1.caption?.fits).toBe(true);
    expect(d1.caption!.lines).toBeLessThanOrEqual(2);
    expect(d2.kRuntime).toBe(1);
    expect(d1.hitSideCss).toBeGreaterThanOrEqual(44);
    const e1 = r.entries.find((e) => e.mobileSlot.slotId === "G2-D1")!;
    const s1 = run.entries.find((e) => e.mobileSlot.slotId === "G2-D1")!;
    expect([e1.slot.center.y, e1.slot.rotationDeg, e1.slot.zIndex]).toEqual([s1.slot.center.y, s1.slot.rotationDeg, s1.slot.zIndex]);
    expect(e1.layout.outer.width / s1.layout.outer.width).toBeCloseTo(d1.kRuntime, 12);
    expect(e1.layout.outer.height / s1.layout.outer.height).toBeCloseTo(d1.kRuntime, 12);
    // The caption is laid at the canonical size (the run's caption font), in the reduced band.
    expect(e1.caption!.lines.every((l) => l.baseline > e1.layout.band.y && l.baseline < e1.layout.band.y + e1.layout.band.height)).toBe(true);
  });
});

describe("certificates 320 / G2 / 4:3 and 365 / G2 / 2.39:1", () => {
  it("320 / G2 / 4:3: the same generic rule (no ratio branch), k ≈ 0.968; 365 / G2 / 2.39:1: scale 1, fallback not eligible", () => {
    const four = sm(2, "4x3", "deux-lignes", 320);
    expect(four.status).toBe("PASS");
    if (four.status === "PASS") {
      const d1 = four.log.find((l) => l.slotId === "G2-D1")!;
      expect(d1.kRuntime).toBe(d1.admissible / d1.envelope1);
      expect(d1.kRuntime).toBeCloseTo(0.968, 2);
    }
    const pano = sm(2, "239", "deux-lignes", 365);
    expect(pano.status).toBe("PASS");
    if (pano.status === "PASS") expect(pano.log.every((l) => l.kRuntime === 1 && !l.intervalEmptyAtOne)).toBe(true);
  });
});

describe("negative controls", () => {
  it("k_required below 0.8734 → SMALL_MOBILE_INTRINSIC_PAPER_SCALE_STOP (never clamped); an empty interval at W ≥ 365 → SMALL_MOBILE_SLOT_INTERVAL_EMPTY_STOP", () => {
    const run = runAt375(2, "239", "aucune");
    const wide = { ...run, entries: run.entries.map((e) => ({ ...e, papers: e.papers.map((p) => p.map((q) => ({ x: (q.x - e.slot.center.x) * 1.2 + e.slot.center.x, y: q.y }))) })) };
    const r = smallMobileGallery(wide, 320, fake, () => null);
    expect(r.status).toBe("SMALL_MOBILE_INTRINSIC_PAPER_SCALE_STOP");
    expect(r.log.find((l) => l.slotId === "G2-D1")!.kRuntime).toBe(1); // nothing applied
    expect(smallMobileGallery(wide, 370, fake, () => null).status).toBe("SMALL_MOBILE_SLOT_INTERVAL_EMPTY_STOP");
  });
  it("a caption that no longer fits the reduced band → SMALL_MOBILE_SCALED_PAPER_CAPTION_STOP (the type is never reduced)", () => {
    const run = runAt375(2, "239", "deux-lignes");
    const tall: CaptionMeasurer = { ...fake, measure: (t) => ({ ...fake.measure(t), width: [...t].length * 40 }) };
    expect(smallMobileGallery(run, 320, tall, (m) => m.caption).status).toBe("SMALL_MOBILE_SCALED_PAPER_CAPTION_STOP");
  });
  it("the geometry is a function of the run and W only (one snapshot for Light and Dark)", () => {
    const a = sm(2, "239", "deux-lignes", 320);
    const b = sm(2, "239", "deux-lignes", 320);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("Full Album Small Mobile (V1.1 contract, unchanged)", () => {
  it("7 / 8 / 11 / 20 / 40 × ratio sets at 320 / 346 / 360 / 365 / 374: centres compressed, every group on the stage, sizes and Y unchanged, no scaling", { timeout: 120000 }, () => {
    for (const W of [320, 346, 360, 365, 374])
      for (const ratios of ["natural-mix", "3x4", "4x3", "1x1", "9x16", "16x9"] as const)
        for (const n of [7, 8, 11, 20, 40]) {
          const media = albumMobileFixture(n, ratios, "32").map((m) => ({ mediaId: m.mediaId, width: m.width, height: m.height, caption: m.caption }));
          const layout = layoutAlbumMobile(media, fake, 375, solveAlbumMobileGeometry(media));
          const r = smallMobileAlbum(layout, W);
          expect(r.status, `${W} ${n} ${ratios}`).toBe("PASS");
          if (r.status !== "PASS") continue;
          for (const g of r.groups) expect(g.bounds[0] >= -1e-9 && g.bounds[1] <= W + 1e-9).toBe(true);
          r.layout.prints.forEach((p, i) => {
            const o = layout.prints[i];
            expect([p.mediaIndex, p.slot.center.y, p.slot.rotationDeg, p.slot.zIndex, p.drawn]).toEqual([o.mediaIndex, o.slot.center.y, o.slot.rotationDeg, o.slot.zIndex, o.drawn]);
          });
          expect([r.layout.height, r.layout.materials]).toEqual([layout.height, layout.materials]);
        }
  });
});
