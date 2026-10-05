import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME } from "@/config/hero-intemporel-tokens";
import {
  heroMobileDarkPhotoCssTransform,
  projectHeroMobileDarkPhotoPoint,
} from "./hero-mobile-dark-photo-runtime";

describe("Hero Mobile Dark V2 Handoff Runtime V1 homography", () => {
  const runtime = HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME;
  const crop = runtime.normalizedCropRect;
  const sourceCropCorners = [
    [crop.x, crop.y],
    [crop.x + crop.width, crop.y],
    [crop.x + crop.width, crop.y + crop.height],
    [crop.x, crop.y + crop.height],
  ] as const;

  it("projects the contracted crop corners onto the authoritative TL/TR/BR/BL quad", () => {
    sourceCropCorners.forEach(([u, v], index) => {
      const actual = projectHeroMobileDarkPhotoPoint(u, v);
      const [expectedX, expectedY] = runtime.destinationQuadPx[index];
      expect(actual.x).toBeCloseTo(expectedX, 9);
      expect(actual.y).toBeCloseTo(expectedY, 9);
    });
  });

  it("encodes the exact centered 4:5 source trim without stretching", () => {
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(runtime.normalizedSourceSize.width);
    expect(crop.y).toBeCloseTo(0.3159091855091911, 14);
    expect(crop.height).toBeCloseTo(4.368181628981618, 14);
    expect(crop.y / runtime.normalizedSourceSize.height).toBeCloseTo(0.06318183710183822, 14);
    expect((runtime.normalizedSourceSize.height - crop.y - crop.height) / 5).toBeCloseTo(
      0.06318183710183822,
      14,
    );
  });

  it.each([
    [320, 522.03666],
    [375, 611.761711],
    [390, 636.232179],
    [430, 701.486762],
  ])("uniformly scales the complete scene at %ipx", (renderedWidth, expectedHeight) => {
    const scale = renderedWidth / runtime.canvasPx.width;
    expect(runtime.canvasPx.height * scale).toBeCloseTo(expectedHeight, 5);
  });

  it("emits one projective CSS matrix rather than a bbox or rotation approximation", () => {
    const transform = heroMobileDarkPhotoCssTransform();
    expect(transform).toMatch(/^matrix3d\(/);
    expect(transform).not.toMatch(/rotate|matrix\(/);
    const values = transform.slice("matrix3d(".length, -1).split(",").map(Number);
    expect(values).toHaveLength(16);
    expect(values[3]).not.toBe(0);
    expect(values[7]).not.toBe(0);
  });

  it("maps the 400×500 raster's contracted crop corners to the authoritative quad", () => {
    const values = heroMobileDarkPhotoCssTransform()
      .slice("matrix3d(".length, -1)
      .split(",")
      .map(Number);
    const pixelPerNormalizedX = runtime.logicalRasterPx.width / runtime.normalizedSourceSize.width;
    const pixelPerNormalizedY = runtime.logicalRasterPx.height / runtime.normalizedSourceSize.height;

    sourceCropCorners.forEach(([u, v], index) => {
      const x = u * pixelPerNormalizedX;
      const y = v * pixelPerNormalizedY;
      const denominator = values[3] * x + values[7] * y + values[15];
      const actualX = (values[0] * x + values[4] * y + values[12]) / denominator;
      const actualY = (values[1] * x + values[5] * y + values[13]) / denominator;
      const [expectedX, expectedY] = runtime.destinationQuadPx[index];
      expect(actualX).toBeCloseTo(expectedX, 9);
      expect(actualY).toBeCloseTo(expectedY, 9);
    });
  });
});

describe("Hero Mobile Dark V2 authoritative runtime asset", () => {
  const runtime = HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME;
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const assetPath = path.join(repositoryRoot, "public", runtime.overlaySrc.replace(/^\//, ""));
  const bytes = readFileSync(assetPath);

  it("keeps the QG-authorized RGBA overlay byte-for-byte identical", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(runtime.overlaySha256);
  });

  it("keeps the authoritative 982×1602 PNG dimensions", () => {
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(runtime.canvasPx.width);
    expect(bytes.readUInt32BE(20)).toBe(runtime.canvasPx.height);
    expect(bytes[25]).toBe(6); // PNG color type 6 = RGBA.
  });

  it("negative control rejects any altered runtime binary", () => {
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    expect(createHash("sha256").update(changed).digest("hex")).not.toBe(runtime.overlaySha256);
  });
});
