import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_MOBILE_CANVAS, A13_MOBILE_CTA, A13_MOBILE_STATE_SLOTS, A13_MOBILE_TITLE, type A13MobileStateId } from "@/config/gallery-a13-mobile-manifest";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { maskFromRects, polygonHitsMask } from "@/lib/memorial/gallery/title-glyph-mask";
import { mobileMetrics, pivotCenter, runMobileGallery, selectMobileGalleryState, witnessMediaRatio } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { classifyMediaRatio } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { A13_MOBILE_CAPTION_SETS, A13_MOBILE_RATIO_SETS, a13MobileFixture } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";

/**
 * A13 Mobile Light runtime — engine-level contract (Handoff V1.4). The
 * rendered pass (real fonts, real glyph masks, DOM reachability, 375 / 390
 * / 430 px) runs in the pilot `/pilot/a13-mobile-gallery` (`?matrice=1`).
 */

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};

/** The Handoff's nominal glyph boxes dilated by 8 CSS px — a stand-in for the rendered mask. */
function nominalTitleMask(W: number) {
  const m = mobileMetrics(W).titleMarginPx;
  // Inclusive pixel rows/columns covering exactly the continuous box [x − m, x + w + m) (pixel p covers [p, p + 1)).
  const r = (b: { x: number; y: number; width: number; height: number }) => ({ x0: Math.floor(b.x - m), y0: Math.floor(b.y - m), x1: Math.ceil(b.x + b.width + m) - 1, y1: Math.ceil(b.y + b.height + m) - 1 });
  return maskFromRects([r(A13_MOBILE_TITLE.titleGlyphMaskMax), r(A13_MOBILE_TITLE.subtitleGlyphMaskMax)]);
}

const WIDTHS = [375, 390, 430];
const STATES: [number, A13MobileStateId][] = [
  [2, "G2"],
  [3, "G3"],
  [4, "G4"],
  [5, "G5"],
  [6, "G6"],
  [7, "G7PLUS"],
];
const safe: Point[] = [
  { x: A13_MOBILE_CTA.safeBox.x, y: A13_MOBILE_CTA.safeBox.y },
  { x: A13_MOBILE_CTA.safeBox.x + A13_MOBILE_CTA.safeBox.width, y: A13_MOBILE_CTA.safeBox.y },
  { x: A13_MOBILE_CTA.safeBox.x + A13_MOBILE_CTA.safeBox.width, y: A13_MOBILE_CTA.safeBox.y + A13_MOBILE_CTA.safeBox.height },
  { x: A13_MOBILE_CTA.safeBox.x, y: A13_MOBILE_CTA.safeBox.y + A13_MOBILE_CTA.safeBox.height },
];

describe("state selection (shared) and family order", () => {
  it("0–1 → absent; 2…6 → G2…G6 exact; ≥ 7 → Signature 7+", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 40].map(selectMobileGalleryState)).toEqual([null, null, "G2", "G3", "G4", "G5", "G6", "G7PLUS", "G7PLUS", "G7PLUS"]);
    for (const n of [0, 1]) {
      const run = runMobileGallery({ media: a13MobileFixture(n, "mixte", "aucune"), captionOf: () => null, measurer: null, titleMask: nominalTitleMask(390), stageWidth: 390 });
      expect([run.outcome, run.status, run.entries.length, run.hasCta]).toEqual(["absent", "GALLERY_ABSENT", 0, false]);
    }
  });

  it("G6 exact has no CTA; 7+ shows media[0…5] in the same six slots, with the CTA", () => {
    const six = a13MobileFixture(6, "mixte", "24");
    const twelve = a13MobileFixture(12, "mixte", "24");
    const g6 = runMobileGallery({ media: six, captionOf: (m) => m.caption, measurer: fake, titleMask: nominalTitleMask(390), stageWidth: 390 });
    const g7 = runMobileGallery({ media: twelve, captionOf: (m) => m.caption, measurer: fake, titleMask: nominalTitleMask(390), stageWidth: 390 });
    expect([g6.stateId, g6.status, g6.hasCta]).toEqual(["G6", "PASS", false]);
    expect([g7.stateId, g7.status, g7.hasCta]).toEqual(["G7PLUS", "PASS", true]);
    expect(g7.entries.map((e) => [e.slot.slotId, e.mediaIndex, e.media.mediaId])).toEqual(six.map((m, i) => [A13_MOBILE_STATE_SLOTS.G6[i].slotId, i, m.mediaId]));
    // The CTA safe box is a constraint of 7+ only: the prints clear it.
    for (const e of g7.entries) expect(convexIntersectionArea(e.outer, safe), e.slot.slotId).toBe(0);
  });
});

describe("the witness is reproduced exactly", () => {
  it("with the witness media ratios every print is at scale 1, on its reference centre (375 / 390 / 430)", () => {
    const bounded = new Set<string>();
    for (const W of WIDTHS)
      for (const [n, st] of STATES) {
        const slots = A13_MOBILE_STATE_SLOTS[st];
        const media = Array.from({ length: n }, (_, i) => ({ width: witnessMediaRatio(slots[Math.min(i, 5)], mobileMetrics(W)) * 1000, height: 1000 }));
        const run = runMobileGallery({ media, captionOf: () => null, measurer: null, titleMask: nominalTitleMask(W), stageWidth: W });
        expect(run.status, `${st}@${W}`).toBe("PASS");
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
    // With the Mobile paper tokens (fixed 2-line caption band), the photo window of
    // these two witnesses is wider than the shared adaptive range (1.96 and 2.19 >
    // 1.78): the shared ratio policy bounds the window and shows the photo in
    // `contain` — same area, not the exact witness proportions (Desktop G4-D3 precedent).
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
});

describe("QA matrix (engine level): ratios × captions × widths — hard rules re-checked", () => {
  it("every G2…G6 case resolves; 7+ resolves except the documented all-9:16 CTA STOP", { timeout: 300000 }, () => {
    const stops: string[] = [];
    for (const W of WIDTHS) {
      const mask = nominalTitleMask(W);
      const k = W / A13_MOBILE_CANVAS.width;
      for (const [n] of STATES)
        for (const ratios of A13_MOBILE_RATIO_SETS)
          for (const captions of A13_MOBILE_CAPTION_SETS) {
            if (captions !== "32" && ratios !== "mixte") continue;
            const media = a13MobileFixture(n, ratios, captions);
            const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: fake, titleMask: mask, stageWidth: W });
            const tag = `${run.stateId}:${ratios}:${captions}@${W}`;
            if (run.outcome !== "resolved") {
              stops.push(`${run.stateId}:${ratios}:${run.status}`);
              expect(run.entries, tag).toEqual([]);
              expect(run.hasCta, tag).toBe(false);
              continue;
            }
            expect(run.entries.map((e) => e.mediaIndex), tag).toEqual(run.entries.map((_, i) => i));
            for (const e of run.entries) {
              const t = e.mobileSlot.centerTerritory;
              const a = e.mobileSlot.paperOverflowAllowance;
              const xs = e.outer.map((p) => p.x);
              const ys = e.outer.map((p) => p.y);
              expect(e.center.x >= t.x - 1e-6 && e.center.x <= t.x + t.width + 1e-6 && e.center.y >= t.y - 1e-6 && e.center.y <= t.y + t.height + 1e-6, `${tag} ${e.slot.slotId} territory`).toBe(true);
              expect(Math.min(...xs) >= -a.left - 1e-6 && Math.max(...xs) <= 941 + a.right + 1e-6 && Math.min(...ys) >= -a.top - 1e-6 && Math.max(...ys) <= 1672 + a.bottom + 1e-6, `${tag} ${e.slot.slotId} overflow`).toBe(true);
              expect(polygonHitsMask(e.outer, mask), `${tag} ${e.slot.slotId} title`).toBe(false);
              expect(e.hitTarget.side * k, `${tag} ${e.slot.slotId} 44 px`).toBeGreaterThanOrEqual(44);
              expect(e.layout.visibleFraction, tag).toBe(1);
              expect(e.layout.band.height).toBeCloseTo(mobileMetrics(W).paper.band, 9);
              if (e.caption) expect(e.caption.lines.length, tag).toBeLessThanOrEqual(2);
            }
            if (run.hasCta) for (const e of run.entries) expect(convexIntersectionArea(e.outer, safe), tag).toBe(0);
          }
    }
    // The only unresolved inputs: Signature 7+ with six 9:16 media — G6-D6 at its
    // minimum scale cannot clear the CTA safe box from inside its territory.
    expect([...new Set(stops)]).toEqual(["G7PLUS:9x16:CTA_COLLISION_UNRESOLVED"]);
    expect(stops.length).toBe(WIDTHS.length);
  });

  it("the caption band is fixed: the geometry never changes with the caption", () => {
    for (const W of WIDTHS)
      for (const [n] of STATES) {
        const geo = (captions: "aucune" | "deux-lignes") =>
          runMobileGallery({ media: a13MobileFixture(n, "mixte", captions), captionOf: (m) => m.caption, measurer: fake, titleMask: nominalTitleMask(W), stageWidth: W }).entries.map((e) => [e.slot, e.layout]);
        expect(JSON.stringify(geo("deux-lignes")), `n${n}@${W}`).toBe(JSON.stringify(geo("aucune")));
      }
  });
});

describe("STOP policy", () => {
  it("a title glyph mask no print can clear → TITLE_GLYPH_COLLISION_UNRESOLVED, no entry", () => {
    const run = runMobileGallery({ media: a13MobileFixture(4, "mixte", "aucune"), captionOf: () => null, measurer: null, titleMask: maskFromRects([{ x0: 0, y0: 0, x1: 940, y1: 460 }]), stageWidth: 390 });
    expect([run.outcome, run.status, run.entries.length]).toEqual(["unresolved", "TITLE_GLYPH_COLLISION_UNRESOLVED", 0]);
  });

  it("7+ with six 9:16 media → CTA_COLLISION_UNRESOLVED (G6-D6), no Gallery and no CTA", () => {
    const run = runMobileGallery({ media: a13MobileFixture(7, "9x16", "aucune"), captionOf: () => null, measurer: null, titleMask: nominalTitleMask(390), stageWidth: 390 });
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
    for (const shared of ["lib/memorial/gallery/dynamic-polaroid-layout.ts", "lib/memorial/gallery/caption-layout.ts", "lib/memorial/gallery/title-glyph-mask.ts", "config/gallery-a13-multi-state-manifests.ts"]) expect(g).toContain(shared);
    expect(g.filter((f) => f.startsWith("components/") || f.startsWith("app/") || /dark-material|theme-material|\/legacy\//.test(f))).toEqual([]);
    expect(readFileSync(path.join(ROOT, "lib/memorial/gallery/gallery-mobile-runtime.ts"), "utf8")).not.toMatch(/solveV2\(|buildG6FamilyState|runDesktopGallery/);
  });
});
