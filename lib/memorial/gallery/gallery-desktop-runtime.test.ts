import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import { parityFixtures, runLightEngine, supplementaryParityFixtures } from "@/lib/memorial/gallery/theme-parity";
import { runDesktopGallery } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const R = A13_V2_1_TITLE;
const d = R.dilationPx;
const MASK = maskFromRects([
  { x0: R.headingInkReference.xMin - d, y0: R.headingInkReference.yMin - d, x1: R.headingInkReference.xMax + d - 1, y1: R.headingInkReference.yMax + d - 1 },
  { x0: R.microcopyInkReference.xMin - d, y0: R.microcopyInkReference.yMin - d, x1: R.microcopyInkReference.xMax + d - 1, y1: R.microcopyInkReference.yMax + d - 1 },
]);

const geo = (e: { slot: { slotId: string }; layout: unknown; caption: unknown }) => JSON.stringify([e.slot.slotId, e.layout, e.caption]);

describe("A13 Gallery Desktop runtime — one entry point, the GREEN engine calls", () => {
  it("is byte-identical to the Light/Dark parity gate engine on its 36 + 4 fixtures (no geometry divergence)", { timeout: 240000 }, () => {
    for (const fx of [...parityFixtures(), ...supplementaryParityFixtures()]) {
      const gate = runLightEngine(fx, fake, MASK);
      const run = runDesktopGallery(fx.media, (_m, i) => fx.captionTexts[i], fake, MASK);
      expect(run.stateId, fx.id).toBe(gate.stateId);
      expect(run.status, fx.id).toBe(gate.status);
      expect(run.hasCta, fx.id).toBe(gate.hasCta);
      expect(run.entries.map(geo), fx.id).toEqual(gate.entries.map(geo));
      expect(run.entries.map((e) => e.media), fx.id).toEqual(gate.entries.map((e) => e.media));
    }
  });

  it("maps the media count to the product states, keeps family order, never loses or duplicates a media", { timeout: 240000 }, () => {
    const family = (n: number) => Array.from({ length: n }, (_, i) => ({ ...A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length], id: `fam-${i}` }));
    const expected: Record<number, string | null> = { 0: null, 1: null, 2: "G2", 3: "G3", 4: "G4", 5: "G5", 6: "G6", 7: "G6_SIGNATURE_7PLUS", 8: "G6_SIGNATURE_7PLUS", 12: "G6_SIGNATURE_7PLUS", 40: "G6_SIGNATURE_7PLUS" };
    for (const [ns, state] of Object.entries(expected)) {
      const n = Number(ns);
      const media = family(n);
      const run = runDesktopGallery(media, (m) => m.captions["24"], fake, MASK);
      expect(run.stateId, `n=${n}`).toBe(state);
      expect(run.hasCta, `n=${n}`).toBe(n >= 7);
      if (!state) {
        expect(run.status).toBe("GALLERY_ABSENT");
        expect(run.entries).toEqual([]);
        continue;
      }
      expect(run.status, `n=${n}`).toBe("PASS");
      const visible = Math.min(n, 6);
      expect(run.entries.map((e) => e.mediaIndex), `n=${n}`).toEqual(Array.from({ length: visible }, (_, i) => i));
      expect(run.entries.map((e) => e.media.id), `n=${n}`).toEqual(media.slice(0, visible).map((m) => m.id));
      expect(new Set(run.entries.map((e) => e.slot.slotId)).size).toBe(visible);
    }
  });

  it("is theme-free (no Dark token, no theme input)", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "gallery-desktop-runtime.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/dark-material|theme-material|A13Theme|ViewerTheme|AlbumTheme|data-a13-theme/);
    expect(runDesktopGallery.length).toBe(4);
  });
});
