import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_MOBILE_CANVAS, A13_MOBILE_CAPTION, A13_MOBILE_CTA, A13_MOBILE_GROUP_TRANSLATION, A13_MOBILE_STATE_SLOTS, A13_MOBILE_STOPS, type A13MobileStateId } from "@/config/gallery-a13-mobile-manifest";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { mobileMetrics, pivotCenter, runMobileGallery, selectMobileGalleryState, witnessMediaRatio, type MobileGalleryRun } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { classifyMediaRatio } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { a13MobileFixture, type A13MobileCaptionSet, type A13MobileRatioSet } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";

/**
 * A13 Mobile Light runtime — engine-level contract (Handoff V1.6). The
 * rendered pass (real La Belle Aurore metrics, rendered title block, DOM
 * reachability, 375 / 390 / 430 px) runs in the pilot
 * `/pilot/a13-mobile-gallery` (`?matrice=1`). Here the caption measurer is
 * a fixed stand-in (11.5 px advance per character at 27 px).
 */

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};

const WIDTHS = [375, 390, 430];
const STATES: [number, A13MobileStateId][] = [
  [2, "G2"],
  [3, "G3"],
  [4, "G4"],
  [5, "G5"],
  [6, "G6"],
  [7, "G7PLUS"],
];
const rect = (r: { x: number; y: number; width: number; height: number }): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/** Every hard rule of a resolved run, re-checked independently of the solver. */
function checkResolved(run: MobileGalleryRun<A13FamilyMedia>, tag: string) {
  const T = A13_MOBILE_GROUP_TRANSLATION[run.stateId!].translateYSource;
  expect([run.translateY, run.stageHeight], tag).toEqual([T, A13_MOBILE_GROUP_TRANSLATION[run.stateId!].stageHeightSource]);
  const k = run.stageWidth / A13_MOBILE_CANVAS.width;
  const m = run.metrics;
  // Stage items in the GROUP frame (− T).
  const title = rect({ ...m.titleBlock, y: m.titleBlock.y - T });
  const cta = rect({ ...A13_MOBILE_CTA.safeBox, y: A13_MOBILE_CTA.safeBox.y - T });
  expect(run.entries.map((e) => e.mediaIndex), tag).toEqual(run.entries.map((_, i) => i));
  for (const e of run.entries) {
    const id = `${tag} ${e.slot.slotId}`;
    const t = e.mobileSlot.centerTerritory;
    const a = e.mobileSlot.paperOverflowAllowance;
    const xs = e.papers.flat().map((p) => p.x);
    const ys = e.papers.flat().map((p) => p.y);
    expect(e.center.x >= t.x - 1e-6 && e.center.x <= t.x + t.width + 1e-6 && e.center.y >= t.y - 1e-6 && e.center.y <= t.y + t.height + 1e-6, `${id} territory`).toBe(true);
    expect(Math.min(...xs) >= -a.left - 1e-6 && Math.max(...xs) <= 941 + a.right + 1e-6 && Math.min(...ys) >= -T - a.top - 1e-6 && Math.max(...ys) <= 1672 + a.bottom + 1e-6, `${id} overflow`).toBe(true);
    for (const p of e.papers) expect(convexIntersectionArea(p, title), `${id} title block`).toBeLessThanOrEqual(1e-6);
    if (run.hasCta) for (const p of e.papers) expect(convexIntersectionArea(p, cta), `${id} CTA`).toBeLessThanOrEqual(1e-6);
    expect(e.hitTarget.side * k, `${id} 44 px`).toBeGreaterThanOrEqual(44);
    expect(e.layout.visibleFraction, id).toBe(1);
    // Fixed 42 px band; widened only for a narrow print, symmetrically, within the envelope.
    expect(e.layout.band.height, id).toBeCloseTo(42 / k, 9);
    expect(e.layout.band.x + e.layout.band.width / 2, id).toBeCloseTo(e.layout.outer.width / 2, 9);
    if (e.bandWidening) expect(e.layout.band.width, id).toBeLessThanOrEqual(e.bandWidening.envelope + 1e-6);
    else expect(e.layout.band.width, id).toBeCloseTo(e.layout.outer.width, 9);
    if (!e.caption) {
      expect(e.captionDiagnostic, id).toBeNull();
      continue;
    }
    // Never a third line, never shrunk (the size is the profile's).
    expect(e.caption.lines.length, id).toBeLessThanOrEqual(A13_MOBILE_CAPTION.maxLines);
    // captionSafeZone (diagnostic) = glyph box + 6 / 4 CSS px, transformed with the print; its covered share is reported.
    const pb = e.caption.protectedBox;
    expect(pb.width - e.caption.ink.width, id).toBeCloseTo(12 / k, 6);
    expect(pb.height - e.caption.ink.height, id).toBeCloseTo(8 / k, 6);
    const zone = slotRectToCanvas(e.slot, { x: e.layout.outer.x + pb.x, y: e.layout.outer.y + pb.y, width: pb.width, height: pb.height });
    zone.forEach((p, i) => {
      expect(p.x, id).toBeCloseTo(e.captionDiagnostic!.safeZone[i].x, 6);
      expect(p.y, id).toBeCloseTo(e.captionDiagnostic!.safeZone[i].y, 6);
    });
    const covered = run.entries.some((q) => q.mobileSlot.paintOrder > e.mobileSlot.paintOrder && q.papers.some((p) => convexIntersectionArea(zone, p) > 1e-6));
    expect(e.captionDiagnostic!.occludedFraction > 0, id).toBe(covered);
  }
}

/** The run of the same media without captions: same outcome, same composition (V1.6). */
function expectCaptionIndependent(run: MobileGalleryRun<A13FamilyMedia>, media: readonly A13FamilyMedia[], tag: string) {
  const bare = runMobileGallery({ media, captionOf: () => null, measurer: null, stageWidth: run.stageWidth });
  expect([run.outcome, run.status], tag).toEqual([bare.outcome, bare.status]);
  expect(
    run.entries.map((e) => [e.slot.slotId, e.scale, e.center, e.slot.zIndex, e.slot.rotationDeg, e.layout.outer, e.layout.window]),
    tag,
  ).toEqual(bare.entries.map((e) => [e.slot.slotId, e.scale, e.center, e.slot.zIndex, e.slot.rotationDeg, e.layout.outer, e.layout.window]));
}

/** STOPs of the 390 px engine matrix with the stand-in measurer (regression guard; the rendered matrix is the pilot's). */
const STOPS_390: string[] = ["G7PLUS:9x16:32:CTA_COLLISION_UNRESOLVED:per-print"];

function checkUnresolved(run: MobileGalleryRun<A13FamilyMedia>, tag: string) {
  expect((A13_MOBILE_STOPS as readonly string[]).includes(run.status), `${tag} ${run.status}`).toBe(true);
  expect([run.entries, run.hasCta], tag).toEqual([[], false]);
  expect(run.anomaly?.basis, tag).toBeDefined();
}

describe("state selection (shared) and family order", () => {
  it("0–1 → absent; 2…6 → G2…G6 exact; ≥ 7 → Signature 7+", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 40].map(selectMobileGalleryState)).toEqual([null, null, "G2", "G3", "G4", "G5", "G6", "G7PLUS", "G7PLUS", "G7PLUS"]);
    for (const n of [0, 1]) {
      const run = runMobileGallery({ media: a13MobileFixture(n, "mixte", "aucune"), captionOf: () => null, measurer: null, stageWidth: 390 });
      expect([run.outcome, run.status, run.entries.length, run.hasCta]).toEqual(["absent", "GALLERY_ABSENT", 0, false]);
    }
  });

  it("G6 exact has no CTA; 7+ shows media[0…5] in the same six slots, with the CTA", () => {
    const six = a13MobileFixture(6, "mixte", "courte");
    const twelve = a13MobileFixture(12, "mixte", "courte");
    const g6 = runMobileGallery({ media: six, captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
    const g7 = runMobileGallery({ media: twelve, captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
    expect([g6.stateId, g6.status, g6.hasCta]).toEqual(["G6", "PASS", false]);
    expect([g7.stateId, g7.status, g7.hasCta]).toEqual(["G7PLUS", "PASS", true]);
    expect(g7.entries.map((e) => [e.slot.slotId, e.mediaIndex, e.media.mediaId])).toEqual(six.map((m, i) => [A13_MOBILE_STATE_SLOTS.G6[i].slotId, i, m.mediaId]));
    checkResolved(g6, "G6");
    checkResolved(g7, "7+");
  });
});

describe("the witness is reproduced exactly (inside the V1.5 title block, translation and CTA)", () => {
  it("with the witness media ratios and no caption every print is at scale 1, on its reference centre (375 / 390 / 430)", () => {
    const bounded = new Set<string>();
    for (const W of WIDTHS)
      for (const [n, st] of STATES) {
        const slots = A13_MOBILE_STATE_SLOTS[st];
        const media = Array.from({ length: n }, (_, i) => ({ width: witnessMediaRatio(slots[Math.min(i, 5)], mobileMetrics(W)) * 1000, height: 1000 }));
        const run = runMobileGallery({ media, captionOf: () => null, measurer: null, stageWidth: W });
        expect(run.status, `${st}@${W}`).toBe("PASS");
        expect(run.search.stage, `${st}@${W}`).toBe("fine");
        for (const e of run.entries) {
          const s = e.mobileSlot;
          expect(e.scale, e.slot.slotId).toBe(1);
          expect([e.slot.rotationDeg, e.slot.zIndex]).toEqual([s.rotationDeg, s.paintOrder]);
          // Visual weight = the witness outer area, always.
          expect(e.layout.outer.width * e.layout.outer.height).toBeCloseTo(s.outerReference.width * s.outerReference.height, 3);
          if (classifyMediaRatio(witnessMediaRatio(s, mobileMetrics(W))).mediaClass === "inside") {
            expect(e.center.x, e.slot.slotId).toBeCloseTo(s.referenceCenter.x, 6);
            expect(e.center.y, e.slot.slotId).toBeCloseTo(s.referenceCenter.y, 6);
            expect(e.layout.outer.width).toBeCloseTo(s.outerReference.width, 6);
            expect(e.layout.outer.height).toBeCloseTo(s.outerReference.height, 6);
          } else bounded.add(s.slotId);
        }
      }
    // With the Mobile paper tokens (fixed caption band), the photo window of these
    // two witnesses is wider than the shared adaptive range (> 1.78): the shared
    // ratio policy bounds the window and shows the photo in `contain` — same area.
    expect([...bounded].sort()).toEqual(["G6-D3", "G6-D6"]);
  });

  it("the pivot rule keeps the anchorPivot point fixed when the paper changes shape", () => {
    const s = A13_MOBILE_STATE_SLOTS.G4[3]; // pivot [1, 1]
    const c = pivotCenter(s, 300, 500);
    const a = (s.rotationDeg * Math.PI) / 180;
    const corner = (cx: number, cy: number, w: number, h: number) => ({ x: cx + (w / 2) * Math.cos(a) - (h / 2) * Math.sin(a), y: cy + (w / 2) * Math.sin(a) + (h / 2) * Math.cos(a) });
    const before = corner(s.referenceCenter.x, s.referenceCenter.y, s.outerReference.width, s.outerReference.height);
    const after = corner(c.x, c.y, 300, 500);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("the protected title block is centred from y = 0, per viewport (285 / 285 / 300 × 104 / 106 / 115.05 CSS px)", () => {
    for (const [W, w, h] of [
      [375, 285, 104],
      [390, 285, 106],
      [430, 300, 115.05],
    ]) {
      const k = W / 941;
      const b = mobileMetrics(W).titleBlock;
      expect(b.x + b.width / 2).toBeCloseTo(470.5, 9);
      expect([b.y, b.width * k, b.height * k].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, w, h]);
    }
  });
});

describe("QA matrix (engine level): ratios × captions — every hard rule re-checked", () => {
  it("390 px: the natural mix with every caption kind, and uniform portrait sets with 32 characters", { timeout: 600000 }, () => {
    const stops: string[] = [];
    const cases: [A13MobileRatioSet, A13MobileCaptionSet][] = [
      ["mixte", "aucune"],
      ["mixte", "courte"],
      ["mixte", "32"],
      ["mixte", "etroit-fr"],
      ["3x4", "32"],
      ["9x16", "32"],
    ];
    for (const [n] of STATES)
      for (const [ratios, captions] of cases) {
        const media = a13MobileFixture(n, ratios, captions);
        const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
        const tag = `${run.stateId}:${ratios}:${captions}`;
        expectCaptionIndependent(run, media, tag);
        if (run.outcome === "resolved") checkResolved(run, tag);
        else {
          checkUnresolved(run, tag);
          stops.push(`${tag}:${run.status}:${run.anomaly?.basis}`);
        }
      }
    expect(stops).toEqual(STOPS_390);
  });

  it("375 and 430 px: the natural mix with 32-character captions", { timeout: 300000 }, () => {
    for (const W of [375, 430])
      for (const [n] of STATES) {
        const run = runMobileGallery({ media: a13MobileFixture(n, "mixte", "32"), captionOf: (m) => m.caption, measurer: fake, stageWidth: W });
        const tag = `${run.stateId}@${W}`;
        if (run.outcome === "resolved") checkResolved(run, tag);
        else checkUnresolved(run, tag);
      }
  });
});

describe("captions (V1.6 — composition first)", () => {
  it("the band is 42 CSS px whether the caption is absent, one line or two lines; no caption → no diagnostic", () => {
    for (const captions of ["aucune", "courte", "32"] as const) {
      const run = runMobileGallery({ media: a13MobileFixture(4, "mixte", captions), captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
      expect(run.status, captions).toBe("PASS");
      for (const e of run.entries) {
        expect(e.layout.band.height * (390 / 941)).toBeCloseTo(42, 9);
        expect(e.captionDiagnostic === null, `${captions} ${e.slot.slotId}`).toBe(e.caption === null);
      }
    }
  });

  it("a narrow print widens ONLY its band (photo window, scale and font unchanged) — never past its envelope", () => {
    // Wide glyphs: the best two-line break no longer fits the useful width of a 9:16 print.
    const wide: CaptionMeasurer = { ...fake, measure: (t) => ({ ...fake.measure(t), width: t.length * 15, actualBoundingBoxRight: t.length * 15 }) };
    const run = runMobileGallery({ media: a13MobileFixture(4, "9x16", "32"), captionOf: (m) => m.caption, measurer: wide, stageWidth: 390 });
    expect(run.status).toBe("PASS");
    const widened = run.entries.filter((e) => e.bandWidening);
    expect(widened.length).toBeGreaterThan(0);
    for (const e of widened) {
      const plain = runMobileGallery({ media: a13MobileFixture(4, "9x16", "aucune"), captionOf: () => null, measurer: null, stageWidth: 390 });
      expect(e.layout.window.width / e.layout.window.height).toBeCloseTo(plain.entries[0].layout.window.width / plain.entries[0].layout.window.height, 9);
      expect(e.layout.band.width).toBeGreaterThan(e.layout.outer.width);
      expect(e.layout.band.width).toBeLessThanOrEqual(e.bandWidening!.envelope + 1e-6);
      expect(run.signals.some((s) => s.startsWith(`${e.slot.slotId}: caption band widened`))).toBe(true);
    }
    checkResolved(run, "narrow");
  });

  it("a caption no band of its envelope can hold: the Gallery stays, same composition, best two-line caption, no widening", () => {
    const huge: CaptionMeasurer = { ...fake, measure: (t) => ({ ...fake.measure(t), width: t.length * 60, actualBoundingBoxRight: t.length * 60 }) };
    const media = a13MobileFixture(3, "mixte", "32");
    const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: huge, stageWidth: 390 });
    expect([run.outcome, run.status, run.entries.length]).toEqual(["resolved", "PASS", 3]);
    expectCaptionIndependent(run, media, "huge");
    for (const e of run.entries) {
      expect(e.caption!.lines.length).toBe(2);
      expect(e.caption!.exceedsUsefulWidth).toBe(true);
      expect(e.bandWidening).toBeNull();
      expect(run.signals.some((s) => s.startsWith(`${e.slot.slotId}: caption band not widened`))).toBe(true);
    }
    checkResolved(run, "huge");
  });

  it("a caption under a print above is an allowed state: reported, never a STOP, never a move", () => {
    let seen = 0;
    for (const [n, ratios] of [
      [7, "3x4"],
      [2, "9x16"],
      [6, "9x16"],
      [3, "mixte"],
    ] as const) {
      const media = a13MobileFixture(n, ratios, "32");
      const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
      expectCaptionIndependent(run, media, `${n}:${ratios}`);
      if (run.outcome !== "resolved") continue;
      for (const e of run.entries)
        if (e.captionDiagnostic && e.captionDiagnostic.occludedFraction > 0) {
          seen++;
          expect(e.caption!.status).toBe("CAPTION_COLLISION_UNRESOLVED");
          expect(run.signals.some((s) => s.startsWith(`${e.slot.slotId}: caption`) && s.includes("covered"))).toBe(true);
        }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("STOP policy", () => {
  it("7+ with six 9:16 media → CTA_COLLISION_UNRESOLVED (G6-D6), no Gallery and no CTA", () => {
    const run = runMobileGallery({ media: a13MobileFixture(7, "9x16", "aucune"), captionOf: () => null, measurer: null, stageWidth: 390 });
    expect([run.stateId, run.outcome, run.status, run.entries.length, run.hasCta]).toEqual(["G7PLUS", "unresolved", "CTA_COLLISION_UNRESOLVED", 0, false]);
    expect(run.anomaly?.detail).toMatch(/^G6-D6:/);
  });
});

describe("architecture guards", () => {
  const ROOT = path.resolve(import.meta.dirname, "../../..");
  function resolve(from: string, spec: string): string | null {
    const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const f of [base, `${base}.ts`, `${base}.tsx`]) if (existsSync(f) && statSync(f).isFile()) return f;
    return null;
  }
  function graph(entry: string) {
    const seen = new Set<string>();
    const todo = [path.join(ROOT, entry)];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const m of readFileSync(f, "utf8").matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']/g)) {
        const r = resolve(f, m[1]);
        if (r) todo.push(r);
      }
    }
    return [...seen].map((f) => path.relative(ROOT, f));
  }

  it("the Mobile runtime reuses the shared engine and reaches no component, Dark material, legacy builder or Desktop solver entry", () => {
    const g = graph("lib/memorial/gallery/gallery-mobile-runtime.ts");
    for (const shared of ["lib/memorial/gallery/dynamic-polaroid-layout.ts", "lib/memorial/gallery/caption-layout.ts", "lib/memorial/gallery/gallery-v2.ts", "config/gallery-a13-multi-state-manifests.ts"]) expect(g).toContain(shared);
    expect(g.filter((f) => f.startsWith("components/") || f.startsWith("app/") || /dark-material|theme-material|\/legacy\//.test(f))).toEqual([]);
    expect(readFileSync(path.join(ROOT, "lib/memorial/gallery/gallery-mobile-runtime.ts"), "utf8")).not.toMatch(/solveV2\(|buildG6FamilyState|runDesktopGallery/);
  });
});
