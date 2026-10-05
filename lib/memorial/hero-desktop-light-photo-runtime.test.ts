import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME } from "@/config/hero-intemporel-tokens";
import {
  heroDesktopLightPhotoClipPoints,
  heroDesktopLightPhotoCssTransform,
  projectHeroDesktopLightPhotoPoint,
} from "./hero-desktop-light-photo-runtime";

describe("Hero Desktop Light Handoff Runtime V1 geometry", () => {
  const runtime = HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME;
  const crop = runtime.normalizedCropRect;
  const sourceCropCorners = [
    [crop.x, crop.y],
    [crop.x + crop.width, crop.y],
    [crop.x + crop.width, crop.y + crop.height],
    [crop.x, crop.y + crop.height],
  ] as const;

  it("projects the contracted crop onto the authoritative TL/TR/BR/BL quad", () => {
    sourceCropCorners.forEach(([u, v], index) => {
      const actual = projectHeroDesktopLightPhotoPoint(u, v);
      const [expectedX, expectedY] = runtime.destinationQuadPx[index];
      expect(actual.x).toBeCloseTo(expectedX, 8);
      expect(actual.y).toBeCloseTo(expectedY, 8);
    });
  });

  it("encodes the deterministic centered cover crop without stretching", () => {
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(runtime.normalizedSourceSize.width);
    expect(crop.y).toBeCloseTo(0.05862393342704664, 14);
    expect(crop.height).toBeCloseTo(4.882752133145907, 14);
    expect(runtime.normalizedSourceSize.height - crop.y - crop.height).toBeCloseTo(crop.y, 14);
  });

  it.each([
    [1024, 576.3062200956938],
    [1280, 720.3827751196172],
    [1440, 810.4306220095694],
    [1672, 941],
  ])("uniformly scales the 1672×941 scene at %ipx", (renderedWidth, expectedHeight) => {
    const scale = renderedWidth / runtime.canvasPx.width;
    expect(runtime.canvasPx.height * scale).toBeCloseTo(expectedHeight, 9);
  });

  it("emits a projective CSS matrix, never a rectangular or rotation approximation", () => {
    const transform = heroDesktopLightPhotoCssTransform();
    expect(transform).toMatch(/^matrix3d\(/);
    expect(transform).not.toMatch(/rotate|matrix\(/);
    const values = transform.slice("matrix3d(".length, -1).split(",").map(Number);
    expect(values).toHaveLength(16);
    expect(values[3]).not.toBe(0);
    expect(values[7]).not.toBe(0);
  });

  it("maps the logical raster's cropped corners through the emitted CSS matrix", () => {
    const values = heroDesktopLightPhotoCssTransform()
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
      expect(actualX).toBeCloseTo(expectedX, 8);
      expect(actualY).toBeCloseTo(expectedY, 8);
    });
  });

  it("uses the exact photo quad as an explicit pre-overlay clipping polygon", () => {
    expect(heroDesktopLightPhotoClipPoints()).toBe(
      runtime.destinationQuadPx.map(([x, y]) => `${x},${y}`).join(" "),
    );
  });
});

describe("Hero Desktop Light authoritative runtime asset", () => {
  const runtime = HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME;
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const assetPath = path.join(repositoryRoot, "public", runtime.overlaySrc.replace(/^\//, ""));
  const bytes = readFileSync(assetPath);

  it("keeps the QG-authorized RGBA overlay byte-for-byte identical", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(runtime.overlaySha256);
  });

  it("keeps the authoritative 1672×941 RGBA PNG dimensions", () => {
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(runtime.canvasPx.width);
    expect(bytes.readUInt32BE(20)).toBe(runtime.canvasPx.height);
    expect(bytes[25]).toBe(6);
  });

  it("negative control rejects an altered runtime binary", () => {
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    expect(createHash("sha256").update(changed).digest("hex")).not.toBe(runtime.overlaySha256);
  });
});
