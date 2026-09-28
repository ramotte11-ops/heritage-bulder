import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_V2_1_TITLE, A13_V2_FIXTURES, type V2AssignmentId } from "@/config/gallery-a13-v2-manifests";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import { fixtureSources, solveV2 } from "@/lib/memorial/gallery/gallery-v2";
import { runDesktopGallery } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { buildLegacyV11GalleryStateQa } from "@/lib/memorial/gallery/legacy/gallery-state-v1-1.legacy-qa";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * Dette D7 — STOP policy of the V2 runtime (real solver, no mock).
 *
 * A STOP is forced through the REAL `solveV2` with an adversarial but legal
 * input: a title glyph mask covering the whole canvas, so no candidate can
 * avoid the title (TITLE_COLLISION_STOP). `solveV2` is not modified.
 */

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const R = A13_V2_1_TITLE;
const TITLE = maskFromRects([
  { x0: R.headingInkReference.xMin - 3, y0: R.headingInkReference.yMin - 3, x1: R.headingInkReference.xMax + 2, y1: R.headingInkReference.yMax + 2 },
  { x0: R.microcopyInkReference.xMin - 3, y0: R.microcopyInkReference.yMin - 3, x1: R.microcopyInkReference.xMax + 2, y1: R.microcopyInkReference.yMax + 2 },
]);
/** Adversarial: the whole 1670 × 941 canvas is "title". */
const WALL = maskFromRects([{ x0: 0, y0: 0, x1: 1669, y1: 940 }]);
const C32 = "MAMAN ET MAMIE, À MIMIZAN, 1966.";
const geo = (e: { slot: { slotId: string }; layout: unknown; caption: unknown }) => JSON.stringify([e.slot.slotId, e.layout, e.caption]);
const family = (n: number) => Array.from({ length: n }, (_, i) => A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length]);

describe("D7 — three outcomes, never confused", () => {
  it("0–1 media → absent (no anomaly), distinct from a STOP", () => {
    for (const n of [0, 1]) {
      const run = runDesktopGallery(family(n), () => null, fake, WALL);
      expect(run).toMatchObject({ stateId: null, outcome: "absent", status: "GALLERY_ABSENT", anomaly: null, entries: [], hasCta: false });
    }
  });

  it("G2–G5 real STOP (TITLE_COLLISION_STOP) → unresolved, typed, empty, no CTA, deterministic — never absent, never a composition", { timeout: 240000 }, () => {
    for (const n of [2, 3, 4, 5])
      for (const cap of [null, C32]) {
        const media = family(n);
        const a = runDesktopGallery(media, () => cap, fake, WALL);
        const b = runDesktopGallery(media, () => cap, fake, WALL);
        expect(a.stateId).toBe(["G2", "G3", "G4", "G5"][n - 2]);
        expect(a.outcome).toBe("unresolved");
        expect(a.status).toBe("TITLE_COLLISION_STOP");
        expect(a.anomaly).toMatchObject({ code: "TITLE_COLLISION_STOP", rule: "title" });
        expect(a.anomaly!.detail.length).toBeGreaterThan(0);
        expect(a.entries).toEqual([]);
        expect(a.hasCta).toBe(false);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        // the solver itself agrees (no reinterpretation)
        expect(solveV2({ state: a.stateId as "G2", sources: [...media], captions: media.map(() => cap), measurer: fake, titleMask: WALL }).status).toBe("TITLE_COLLISION_STOP");
        // and nothing resembling the superseded composition leaks out
        const legacy = buildLegacyV11GalleryStateQa(media, () => cap, fake)!;
        expect(legacy.entries.length).toBeGreaterThan(0);
        expect(a.entries.length).toBe(0);
      }
  });

  it("G6 / Signature 7+ are not V2: the same adversarial mask leaves them resolved and unchanged", () => {
    for (const n of [6, 7, 12]) {
      const a = runDesktopGallery(family(n), (m) => m.captions["24"], fake, WALL);
      const b = runDesktopGallery(family(n), (m) => m.captions["24"], fake, TITLE);
      expect(a.outcome).toBe("resolved");
      expect(a.entries.map(geo)).toEqual(b.entries.map(geo));
    }
  });

  it("a V2 success is unchanged: resolved, byte-identical to solveV2, anomaly null", { timeout: 240000 }, () => {
    for (const state of ["G2", "G3", "G4", "G5"] as const)
      for (const a of A13_V2_FIXTURES.assignments.map((x) => x.id as V2AssignmentId))
        for (const cap of [null, C32]) {
          const sources = fixtureSources(state, a);
          const run = runDesktopGallery(sources, () => cap, fake, TITLE);
          const v2 = solveV2({ state, sources, captions: sources.map(() => cap), measurer: fake, titleMask: TITLE });
          expect(v2.status, `${state}:${a}`).toBe("PASS");
          expect(run.outcome).toBe("resolved");
          expect(run.anomaly).toBeNull();
          expect(run.entries.map(geo)).toEqual(v2.slots.map(geo));
        }
  });
});

describe("D7 — no fallback can be wired into the runtime (architecture)", () => {
  const src = readFileSync(path.resolve(import.meta.dirname, "gallery-desktop-runtime.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("imports only its declared engines: V2 for G2–G5, the G6 builder, plus types", () => {
    const specs = [...code.matchAll(/import\s+(type\s+)?\{[^}]*\}\s*from\s*["']([^"']+)["']/g)].map((m) => `${m[1] ? "type " : ""}${m[2]}`).sort();
    expect(specs).toEqual(
      [
        "@/config/gallery-a13-multi-state-manifests",
        "@/lib/memorial/gallery/gallery-state",
        "@/lib/memorial/gallery/gallery-v2",
        "type @/config/gallery-a13-pilot-manifest",
        "type @/lib/memorial/gallery/caption-layout",
        "type @/lib/memorial/gallery/dynamic-polaroid-layout",
        "type @/lib/memorial/gallery/title-glyph-mask",
      ].sort(),
    );
    expect(code).not.toMatch(/legacy|calibrateState|composeSlots|layoutDynamicPolaroid|require\(|import\(/);
  });

  it("the unresolved branch returns no entries and no CTA (a STOP can never render prints)", () => {
    expect(code).toMatch(/outcome:\s*"unresolved"[^}]*entries:\s*\[\][^}]*hasCta:\s*false/);
  });
});
