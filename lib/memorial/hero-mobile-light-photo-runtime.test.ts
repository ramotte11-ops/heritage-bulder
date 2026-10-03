import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME } from "@/config/hero-intemporel-tokens";
import {
  heroMobileLightPhotoCssTransform,
  projectHeroMobileLightPhotoPoint,
} from "./hero-mobile-light-photo-runtime";

describe("Hero Mobile Light Handoff V1.2 homography", () => {
  it("projects the normalized 4:5 corners onto the authoritative TL/TR/BR/BL quad", () => {
    const sourceCorners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const;

    sourceCorners.forEach(([u, v], index) => {
      const actual = projectHeroMobileLightPhotoPoint(u, v);
      const [expectedX, expectedY] = HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.destinationQuadPx[index];
      expect(actual.x).toBeCloseTo(expectedX, 9);
      expect(actual.y).toBeCloseTo(expectedY, 9);
    });
  });

  it.each([320, 375, 390, 430])(
    "uniformly scales the scene and quad at the %ipx contractual witness",
    (renderedWidth) => {
      const { width: canvasWidth, height: canvasHeight } =
        HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.canvasPx;
      const scale = renderedWidth / canvasWidth;
      expect(canvasHeight * scale).toBeCloseTo((1672 * renderedWidth) / 941, 9);

      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const) {
        const projected = projectHeroMobileLightPhotoPoint(u, v);
        expect(projected.x * scale).toBeGreaterThanOrEqual(0);
        expect(projected.x * scale).toBeLessThanOrEqual(renderedWidth);
        expect(projected.y * scale).toBeGreaterThanOrEqual(0);
        expect(projected.y * scale).toBeLessThanOrEqual(canvasHeight * scale);
      }
    },
  );

  it("matches the Handoff's exact 320px quad witness within 0.25 CSS px", () => {
    const expected = [
      [87.632765, 74.488519],
      [223.667496, 59.618347],
      [241.617233, 220.771121],
      [103.290351, 236.975313],
    ] as const;
    const sourceCorners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const;
    const scale = 320 / 941;

    sourceCorners.forEach(([u, v], index) => {
      const actual = projectHeroMobileLightPhotoPoint(u, v);
      expect(Math.abs(actual.x * scale - expected[index][0])).toBeLessThanOrEqual(0.25);
      expect(Math.abs(actual.y * scale - expected[index][1])).toBeLessThanOrEqual(0.25);
    });
  });

  it("emits one projective CSS matrix rather than an axis-aligned rectangle or rotate approximation", () => {
    const transform = heroMobileLightPhotoCssTransform();
    expect(transform).toMatch(/^matrix3d\(/);
    expect(transform).not.toMatch(/rotate|matrix\(/);
    const values = transform.slice("matrix3d(".length, -1).split(",").map(Number);
    expect(values).toHaveLength(16);
    expect(values[3]).not.toBe(0); // projective u denominator coefficient
    expect(values[7]).not.toBe(0); // projective v denominator coefficient
  });

  it("the emitted CSS matrix itself maps the 400×500 raster corners to the authoritative quad", () => {
    const values = heroMobileLightPhotoCssTransform()
      .slice("matrix3d(".length, -1)
      .split(",")
      .map(Number);
    const { width, height } = HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.logicalRasterPx;
    const sourceCorners = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ] as const;

    sourceCorners.forEach(([x, y], index) => {
      // CSS matrix3d is column-major.
      const denominator = values[3] * x + values[7] * y + values[15];
      const actualX = (values[0] * x + values[4] * y + values[12]) / denominator;
      const actualY = (values[1] * x + values[5] * y + values[13]) / denominator;
      const [expectedX, expectedY] = HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.destinationQuadPx[index];
      expect(actualX).toBeCloseTo(expectedX, 9);
      expect(actualY).toBeCloseTo(expectedY, 9);
    });
  });
});

describe("Hero Mobile Light Handoff V1.2 runtime asset integrity", () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");

  function assetBytes(publicPath: string): Buffer {
    return readFileSync(path.join(repositoryRoot, "public", publicPath.replace(/^\//, "")));
  }

  function sha256(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  it("keeps the CLEAN plate and bitmap mask byte-for-byte identical to the Handoff", () => {
    const runtime = HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME;
    expect(sha256(assetBytes(runtime.plateSrc))).toBe(runtime.plateSha256);
    expect(sha256(assetBytes(runtime.maskSrc))).toBe(runtime.maskSha256);
  });

  it("negative control: changing one byte fails the asset-integrity assertion", () => {
    const runtime = HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME;
    const changed = Buffer.from(assetBytes(runtime.plateSrc));
    changed[changed.length - 1] ^= 1;
    expect(sha256(changed)).not.toBe(runtime.plateSha256);
  });
});
