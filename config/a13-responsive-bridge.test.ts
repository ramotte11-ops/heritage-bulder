import { describe, expect, it } from "vitest";
import { a13MobileProfileActive } from "@/config/gallery-a13-mobile-manifest";
import { A13_RESPONSIVE_BELOW_320_STOP, A13_RESPONSIVE_BRIDGE, a13MobileAuthorityFrame, selectA13ResponsiveFamily } from "./a13-responsive-bridge";

/**
 * A13 Responsive Bridge V1 — the transcription of
 * `contract/a13-responsive-bridge.v1.json` and `qa/boundary-witnesses.json`.
 */

describe("A13 Responsive Bridge V1 — families", () => {
  it("breakpoints and source frames are the contract's", () => {
    expect(A13_RESPONSIVE_BRIDGE.tablet).toEqual({ min: 431, max: 1023, sourceWidthCssPx: 430 });
    expect(A13_RESPONSIVE_BRIDGE.horizontal).toEqual({ min: 1024, max: 1199, sourceWidthCssPx: 1200 });
    expect(A13_RESPONSIVE_BRIDGE.mobile).toEqual({ min: 375, max: 430 });
    expect(A13_RESPONSIVE_BRIDGE.small).toEqual({ min: 320, max: 374, sourceWidthCssPx: 375 });
    expect(A13_RESPONSIVE_BRIDGE.desktop.min).toBe(1200);
  });

  it("the seven boundary witnesses: family, source width and scale (qa/boundary-witnesses.json)", () => {
    const witnesses: [number, string, number, number][] = [
      [320, "small", 375, 1.0],
      [360, "small", 375, 1.0],
      [374, "small", 375, 1.0],
      [375, "mobile", 375, 1.0],
      [430, "mobile", 430, 1.0],
      [431, "tablet", 430, 1.0023255814],
      [768, "tablet", 430, 1.7860465116],
      [1023, "tablet", 430, 2.3790697674],
      [1024, "horizontal", 1200, 0.8533333333],
      [1199, "horizontal", 1200, 0.9991666667],
      [1200, "desktop", 1200, 1.0],
    ];
    for (const [w, family, source, scale] of witnesses) {
      const s = selectA13ResponsiveFamily(w);
      if (s.family === null) throw new Error(String(w));
      expect([s.family, s.sourceWidth], String(w)).toEqual([family, source]);
      expect(s.scale, String(w)).toBeCloseTo(scale, 9);
    }
  });

  it("coverage from 320 has no gap and no overlap (fractional widths included); Mobile is exactly the CLOSED 375–430 profile", () => {
    let previous: string | null = null;
    const switches: [number, string][] = [];
    for (let w = 320; w <= 2000; w += 0.25) {
      const s = selectA13ResponsiveFamily(w);
      expect(s.family, String(w)).not.toBeNull();
      expect(s.family === "mobile", String(w)).toBe(a13MobileProfileActive(w));
      if (s.family !== previous) switches.push([w, s.family!]);
      previous = s.family;
    }
    expect(switches).toEqual([
      [320, "small"],
      [375, "mobile"],
      [430.25, "tablet"],
      [1024, "horizontal"],
      [1200, "desktop"],
    ]);
  });

  it("below 320: out of the V1 contract — the STOP, never a family", () => {
    for (const w of [0, 280, 319, 319.99]) expect(selectA13ResponsiveFamily(w)).toEqual({ family: null, width: w, stop: A13_RESPONSIVE_BELOW_320_STOP });
    expect(A13_RESPONSIVE_BELOW_320_STOP).toBe("STOP_RESPONSIVE_BELOW_320_OUT_OF_SCOPE");
  });

  it("the Mobile authority frame: itself at 375–430, the 430 frame × W / 430 at 431–1023 (bridged hosts only), nothing else", () => {
    expect(a13MobileAuthorityFrame(390, false)).toEqual({ family: "mobile", sourceWidth: 390, remap: 1 });
    expect(a13MobileAuthorityFrame(390, true)).toEqual({ family: "mobile", sourceWidth: 390, remap: 1 });
    expect(a13MobileAuthorityFrame(768, false)).toBeNull();
    expect(a13MobileAuthorityFrame(768, true)).toEqual({ family: "tablet", sourceWidth: 430, remap: 768 / 430 });
    expect(a13MobileAuthorityFrame(360, true)).toEqual({ family: "small", sourceWidth: 375, remap: 1 });
    expect(a13MobileAuthorityFrame(360, false)).toBeNull();
    for (const w of [319, 1024, 1199, 1200, 1670]) expect(a13MobileAuthorityFrame(w, true), String(w)).toBeNull();
  });
});
