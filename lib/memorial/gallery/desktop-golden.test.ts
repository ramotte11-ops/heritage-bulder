import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { A13_DESKTOP_G6_SLOTS } from "@/config/gallery-a13-desktop-manifest";
import { A13_STATE_SLOTS, A13_GALLERY_STATES } from "@/config/gallery-a13-multi-state-manifests";
import { A13_V2_1_TITLE, A13_V2_FIXTURES } from "@/config/gallery-a13-v2-manifests";
import { layoutDynamicPolaroid, paperFor } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import { fixtureSources } from "@/lib/memorial/gallery/gallery-v2";
import { runDesktopGallery } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * A13 Mobile Light — Desktop non-regression guard.
 *
 * The Mobile profile reuses the shared engine (`layoutDynamicPolaroid`,
 * `paperFor`, `layoutCaption`) through OPTIONAL profile parameters whose
 * defaults are the Desktop constants. This test pins, byte for byte, the
 * Desktop outputs of those functions and of the functional Desktop entry
 * point (`runDesktopGallery`, G2…G5 V2 + G6 / Signature 7+) as they were on
 * `e3cf8ec`, BEFORE the Mobile profile existed. Any Desktop drift changes
 * a digest (DESKTOP_REGRESSION).
 */

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0.5, actualBoundingBoxRight: t.length * 11.5 - 0.25, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const R = A13_V2_1_TITLE;
const MASK = maskFromRects([
  { x0: R.headingInkReference.xMin - 3, y0: R.headingInkReference.yMin - 3, x1: R.headingInkReference.xMax + 2, y1: R.headingInkReference.yMax + 2 },
  { x0: R.microcopyInkReference.xMin - 3, y0: R.microcopyInkReference.yMin - 3, x1: R.microcopyInkReference.xMax + 2, y1: R.microcopyInkReference.yMax + 2 },
]);
const RATIOS = [0.5625, 0.66, 0.75, 1, 4 / 3, 1.5, 16 / 9, 1.8, 2.39, 3];
const CAPTIONS = [null, "Maman", "Maman, un soir à Gordes.", "MAMAN ET MAMIE, À MIMIZAN, 1966."];

describe("Desktop golden — shared engine outputs are unchanged by the Mobile profile", () => {
  it("paperFor and layoutDynamicPolaroid (every Desktop slot × ratio × area factor)", () => {
    const slots = [...A13_DESKTOP_G6_SLOTS, ...A13_GALLERY_STATES.flatMap((s) => A13_STATE_SLOTS[s])];
    const out = slots.flatMap((slot) =>
      RATIOS.flatMap((r) => [0.81, 1, 1.21].map((f) => layoutDynamicPolaroid(slot, { width: r * 1000, height: 1000 }, f))),
    );
    const papers = [200, 300, 425, 600].flatMap((w) => [200, 330, 500].map((h) => [paperFor(w, h), paperFor(w, h, 72)]));
    expect(sha({ out, papers })).toBe(GOLDEN.layout);
  });

  it("layoutCaption (every G6 / 7+ slot × ratio × caption, with and without obstacles)", () => {
    const out = [...A13_DESKTOP_G6_SLOTS, ...A13_STATE_SLOTS.G6_SIGNATURE_7PLUS].flatMap((slot) =>
      RATIOS.slice(0, 6).flatMap((r) => {
        const layout = layoutDynamicPolaroid(slot, { width: r * 1000, height: 1000 });
        const obstacle = [{ slotId: "X", polygon: [{ x: slot.center.x - 40, y: slot.center.y }, { x: slot.center.x + 400, y: slot.center.y }, { x: slot.center.x + 400, y: slot.center.y + 400 }, { x: slot.center.x - 40, y: slot.center.y + 400 }] }];
        return CAPTIONS.filter((c): c is string => c !== null).flatMap((c) => [layoutCaption(slot, layout, c, fake, []), layoutCaption(slot, layout, c, fake, obstacle)]);
      }),
    );
    expect(sha(out)).toBe(GOLDEN.caption);
  });

  it("runDesktopGallery G2…G5 (V2 runtime) on the Master-like and mixed fixtures", { timeout: 240000 }, () => {
    const out = (["G2", "G3", "G4", "G5"] as const).flatMap((state) =>
      (["master-like", "mixed-natural"] as const).flatMap((a) =>
        [null, CAPTIONS[3]].map((cap) => {
          const run = runDesktopGallery(fixtureSources(state, a), () => cap, fake, MASK);
          return [state, a, cap, run.stateId, run.outcome, run.status, run.entries.map((e) => [e.slot, e.layout, e.caption, e.mediaIndex])];
        }),
      ),
    );
    expect(A13_V2_FIXTURES.states).toEqual(["G2", "G3", "G4", "G5"]);
    expect(sha(out)).toBe(GOLDEN.v2);
  });

  it("runDesktopGallery 0–1, G6 exact and Signature 7+ (closed V2.1 composition)", () => {
    const out = [0, 1, 6, 7, 8, 14].flatMap((n) =>
      [0, 1, 2, 3].map((c) => {
        const media = Array.from({ length: n }, (_, i) => A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length]);
        const run = runDesktopGallery(media, () => CAPTIONS[c], c % 2 ? fake : null, MASK);
        return [n, c, run.stateId, run.outcome, run.status, run.hasCta, run.entries.map((e) => [e.slot, e.layout, e.caption, e.mediaIndex])];
      }),
    );
    expect(sha(out)).toBe(GOLDEN.g6);
  });
});

/** Digests computed on `e3cf8ec` (A13 Desktop tip), before any Mobile change. */
const GOLDEN = {
  layout: "b0e0af5ea48713925649280114fb8df72ff0287d67a4c70bdb1cdb5a066fc63b",
  caption: "976747ac72916e6f672b7d0c3859745eb1b92e07d920528d251057e3229ce94f",
  v2: "181dc86769e604e06d9dc5b612063f0a8ce0a7090c2aad72ff435dac443602df",
  g6: "a718635487a040d40578df8dbd52d3582808f853b610863d471994667716c642",
};
