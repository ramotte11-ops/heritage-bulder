import { describe, expect, it } from "vitest";
import { HERO_CROP_NEUTRAL_ZOOM, type HeroCrop } from "@/types/hero";
import {
  HERO_CROP_MAX_ZOOM,
  HERO_CROP_MIN_ZOOM,
  HERO_CROP_WINDOW_RATIO,
  NEUTRAL_HERO_CROP,
  clampHeroCropZoom,
  panHeroCrop,
  resolveHeroCropGeometry,
  zoomHeroCrop,
  type HeroCropImageSize,
} from "./hero-crop-geometry";

const PORTRAIT: HeroCropImageSize = { naturalWidth: 600, naturalHeight: 1200 };
const LANDSCAPE: HeroCropImageSize = { naturalWidth: 1600, naturalHeight: 900 };
const SQUARE: HeroCropImageSize = { naturalWidth: 800, naturalHeight: 800 };
const TALL_PORTRAIT_NARROWER_THAN_WINDOW: HeroCropImageSize = { naturalWidth: 300, naturalHeight: 1000 };

describe("HERO_CROP_WINDOW_RATIO — the one Mission 034 ratio", () => {
  it("is exactly 4:5 portrait", () => {
    expect(HERO_CROP_WINDOW_RATIO).toBeCloseTo(4 / 5, 10);
    expect(HERO_CROP_WINDOW_RATIO).toBeLessThan(1); // portrait: narrower than tall.
  });

  it("never depends on any viewport/device concept — same constant, no parameters", () => {
    // The type signature itself proves this: a plain numeric constant,
    // not a function of viewport width. Asserting it is a number pins
    // that down at the test level too.
    expect(typeof HERO_CROP_WINDOW_RATIO).toBe("number");
  });
});

describe("NEUTRAL_HERO_CROP — the one neutral state", () => {
  it("is centered, at the neutral zoom, reusing Mission 031's own HERO_CROP_NEUTRAL_ZOOM", () => {
    expect(NEUTRAL_HERO_CROP).toEqual({ focalX: 0.5, focalY: 0.5, zoom: HERO_CROP_NEUTRAL_ZOOM });
  });
});

describe("clampHeroCropZoom", () => {
  it("clamps below the floor up to HERO_CROP_MIN_ZOOM", () => {
    expect(clampHeroCropZoom(0.1)).toBe(HERO_CROP_MIN_ZOOM);
    expect(clampHeroCropZoom(0)).toBe(HERO_CROP_MIN_ZOOM);
    expect(clampHeroCropZoom(-5)).toBe(HERO_CROP_MIN_ZOOM);
  });

  it("clamps above the ceiling down to HERO_CROP_MAX_ZOOM", () => {
    expect(clampHeroCropZoom(999)).toBe(HERO_CROP_MAX_ZOOM);
  });

  it("leaves an in-range zoom untouched", () => {
    expect(clampHeroCropZoom(2)).toBe(2);
  });

  it("fails safe to the floor for non-finite input", () => {
    expect(clampHeroCropZoom(NaN)).toBe(HERO_CROP_MIN_ZOOM);
    expect(clampHeroCropZoom(Infinity)).toBe(HERO_CROP_MIN_ZOOM);
    expect(clampHeroCropZoom(-Infinity)).toBe(HERO_CROP_MIN_ZOOM);
  });

  it("HERO_CROP_MIN_ZOOM equals Mission 031's own HERO_CROP_NEUTRAL_ZOOM — no second neutral value", () => {
    expect(HERO_CROP_MIN_ZOOM).toBe(HERO_CROP_NEUTRAL_ZOOM);
  });

  it("HERO_CROP_MAX_ZOOM is a real, finite ceiling strictly above the floor", () => {
    expect(Number.isFinite(HERO_CROP_MAX_ZOOM)).toBe(true);
    expect(HERO_CROP_MAX_ZOOM).toBeGreaterThan(HERO_CROP_MIN_ZOOM);
  });
});

describe("resolveHeroCropGeometry — no gap, ever, on any shape (mission brief section 17)", () => {
  for (const [label, image] of [
    ["portrait", PORTRAIT],
    ["landscape", LANDSCAPE],
    ["square", SQUARE],
    ["narrow portrait", TALL_PORTRAIT_NARROWER_THAN_WINDOW],
  ] as const) {
    it(`${label}: at neutral zoom, the image fully covers the 4:5 window with no artificial band`, () => {
      const geometry = resolveHeroCropGeometry(image, NEUTRAL_HERO_CROP);
      expect(geometry.widthPercent).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(geometry.heightPercent).toBeGreaterThanOrEqual(100 - 1e-9);
      // At the neutral zoom, exactly one axis touches 100 (the tight
      // "cover" fit) — never smaller than the window on either axis.
      expect(Math.min(geometry.widthPercent, geometry.heightPercent)).toBeCloseTo(100, 6);
    });

    it(`${label}: never distorts the image's own aspect ratio`, () => {
      const geometry = resolveHeroCropGeometry(image, NEUTRAL_HERO_CROP);
      const displayedRatio =
        (geometry.widthPercent / 100 / (geometry.heightPercent / 100)) * HERO_CROP_WINDOW_RATIO;
      const imageRatio = image.naturalWidth / image.naturalHeight;
      expect(displayedRatio).toBeCloseTo(imageRatio, 6);
    });

    it(`${label}: the image always at least covers the window at every valid zoom`, () => {
      for (const zoom of [HERO_CROP_MIN_ZOOM, 1.5, 2, HERO_CROP_MAX_ZOOM]) {
        const crop: HeroCrop = { focalX: 0.2, focalY: 0.8, zoom };
        const geometry = resolveHeroCropGeometry(image, crop);
        expect(geometry.widthPercent).toBeGreaterThanOrEqual(100 - 1e-9);
        expect(geometry.heightPercent).toBeGreaterThanOrEqual(100 - 1e-9);
        expect(geometry.leftPercent).toBeLessThanOrEqual(1e-9);
        expect(geometry.leftPercent).toBeGreaterThanOrEqual(100 - geometry.widthPercent - 1e-9);
        expect(geometry.topPercent).toBeLessThanOrEqual(1e-9);
        expect(geometry.topPercent).toBeGreaterThanOrEqual(100 - geometry.heightPercent - 1e-9);
      }
    });

    it(`${label}: an extreme focal point (a corner) is clamped, never leaving a gap`, () => {
      const corner: HeroCrop = { focalX: 0, focalY: 1, zoom: HERO_CROP_MIN_ZOOM };
      const geometry = resolveHeroCropGeometry(image, corner);
      expect(geometry.leftPercent).toBeLessThanOrEqual(0);
      expect(geometry.leftPercent + geometry.widthPercent).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(geometry.topPercent).toBeLessThanOrEqual(0);
      expect(geometry.topPercent + geometry.heightPercent).toBeGreaterThanOrEqual(100 - 1e-9);
    });
  }

  it("is a pure function: identical inputs produce identical output", () => {
    const crop: HeroCrop = { focalX: 0.3, focalY: 0.7, zoom: 1.8 };
    expect(resolveHeroCropGeometry(LANDSCAPE, crop)).toEqual(resolveHeroCropGeometry(LANDSCAPE, crop));
  });

  it("falls back to a square aspect ratio when the image's dimensions are not yet known, without crashing", () => {
    const unresolved: HeroCropImageSize = { naturalWidth: 0, naturalHeight: 0 };
    const geometry = resolveHeroCropGeometry(unresolved, NEUTRAL_HERO_CROP);
    expect(Number.isFinite(geometry.widthPercent)).toBe(true);
    expect(Number.isFinite(geometry.heightPercent)).toBe(true);
  });
});

describe("panHeroCrop — drag/touch moves the focal point, never the zoom", () => {
  it("moving right/down shifts the focal point, staying within [0, 1]", () => {
    const start: HeroCrop = { focalX: 0.5, focalY: 0.5, zoom: 2 };
    const next = panHeroCrop(LANDSCAPE, start, 10, 10);
    expect(next.zoom).toBe(start.zoom);
    expect(next.focalX).toBeGreaterThanOrEqual(0);
    expect(next.focalX).toBeLessThanOrEqual(1);
    expect(next.focalY).toBeGreaterThanOrEqual(0);
    expect(next.focalY).toBeLessThanOrEqual(1);
  });

  it("a huge delta clamps to a valid corner rather than an out-of-range focal point", () => {
    const start: HeroCrop = { focalX: 0.5, focalY: 0.5, zoom: 2 };
    // A large POSITIVE delta drags the image maximally right/down, which
    // pins its top-left edge at the window's own top-left (0, 0) — the
    // furthest the image can move that way without opening a gap.
    const next = panHeroCrop(PORTRAIT, start, 10_000, 10_000);
    expect(next.focalX).toBeGreaterThanOrEqual(0);
    expect(next.focalX).toBeLessThanOrEqual(1);
    expect(next.focalY).toBeGreaterThanOrEqual(0);
    expect(next.focalY).toBeLessThanOrEqual(1);
    const geometry = resolveHeroCropGeometry(PORTRAIT, next);
    expect(geometry.leftPercent).toBeCloseTo(0, 6);
    expect(geometry.topPercent).toBeCloseTo(0, 6);

    // The opposite direction pins the opposite corner: the image's
    // trailing edge sits exactly at the window's far edge.
    const opposite = panHeroCrop(PORTRAIT, start, -10_000, -10_000);
    const oppositeGeometry = resolveHeroCropGeometry(PORTRAIT, opposite);
    expect(oppositeGeometry.leftPercent + oppositeGeometry.widthPercent).toBeCloseTo(100, 6);
    expect(oppositeGeometry.topPercent + oppositeGeometry.heightPercent).toBeCloseTo(100, 6);
  });

  it("panning at the neutral zoom on the tight axis is a no-op (there is no room to move)", () => {
    // A landscape image at zoom 1 exactly covers the window's height —
    // no vertical room to pan at all.
    const start: HeroCrop = NEUTRAL_HERO_CROP;
    const next = panHeroCrop(LANDSCAPE, start, 0, 50);
    expect(next.focalY).toBeCloseTo(0.5, 6);
  });
});

describe("zoomHeroCrop — the slider control", () => {
  it("clamps the requested zoom into range", () => {
    expect(zoomHeroCrop(SQUARE, NEUTRAL_HERO_CROP, 100).zoom).toBe(HERO_CROP_MAX_ZOOM);
    expect(zoomHeroCrop(SQUARE, NEUTRAL_HERO_CROP, -3).zoom).toBe(HERO_CROP_MIN_ZOOM);
  });

  it("keeps the resulting geometry gap-free after zooming out toward the floor", () => {
    const zoomedIn: HeroCrop = { focalX: 0.1, focalY: 0.9, zoom: HERO_CROP_MAX_ZOOM };
    const next = zoomHeroCrop(PORTRAIT, zoomedIn, HERO_CROP_MIN_ZOOM);
    const geometry = resolveHeroCropGeometry(PORTRAIT, next);
    expect(geometry.widthPercent).toBeGreaterThanOrEqual(100 - 1e-9);
    expect(geometry.heightPercent).toBeGreaterThanOrEqual(100 - 1e-9);
  });

  it("zooming back to the neutral value from a panned-corner crop re-centers within bounds, never out of [0, 1]", () => {
    const cornered: HeroCrop = { focalX: 0, focalY: 0, zoom: HERO_CROP_MAX_ZOOM };
    const next = zoomHeroCrop(LANDSCAPE, cornered, HERO_CROP_MIN_ZOOM);
    expect(next.focalX).toBeGreaterThanOrEqual(0);
    expect(next.focalX).toBeLessThanOrEqual(1);
    expect(next.focalY).toBeGreaterThanOrEqual(0);
    expect(next.focalY).toBeLessThanOrEqual(1);
  });

  it("is idempotent: applying the same zoom twice is a no-op the second time", () => {
    const crop: HeroCrop = { focalX: 0.4, focalY: 0.6, zoom: 1.5 };
    const once = zoomHeroCrop(PORTRAIT, crop, 2);
    const twice = zoomHeroCrop(PORTRAIT, once, 2);
    expect(twice).toEqual(once);
  });
});
