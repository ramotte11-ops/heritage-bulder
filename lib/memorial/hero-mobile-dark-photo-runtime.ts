import { HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME } from "@/config/hero-intemporel-tokens";

export interface HeroMobileDarkProjectedPoint {
  x: number;
  y: number;
}

/** Applies the authoritative Dark V2 homography in normalized 4×5 space. */
export function projectHeroMobileDarkPhotoPoint(
  u: number,
  v: number,
): HeroMobileDarkProjectedPoint {
  const [rowX, rowY, rowW] =
    HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME.homographyNormalizedSourceToReference;
  const denominator = rowW[0] * u + rowW[1] * v + rowW[2];

  return {
    x: (rowX[0] * u + rowX[1] * v + rowX[2]) / denominator,
    y: (rowY[0] * u + rowY[1] * v + rowY[2]) / denominator,
  };
}

/**
 * Converts the normalized 4×5 homography into CSS's column-major
 * matrix3d form for the fixed 400×500 logical raster. The surrounding
 * 982×1602 SVG viewBox uniformly scales the complete Dark composition.
 */
export function heroMobileDarkPhotoCssTransform(): string {
  const runtime = HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME;
  const [rowX, rowY, rowW] = runtime.homographyNormalizedSourceToReference;
  const sourceUnitsPerPixelX = runtime.normalizedSourceSize.width / runtime.logicalRasterPx.width;
  const sourceUnitsPerPixelY = runtime.normalizedSourceSize.height / runtime.logicalRasterPx.height;

  return `matrix3d(${[
    rowX[0] * sourceUnitsPerPixelX,
    rowY[0] * sourceUnitsPerPixelX,
    0,
    rowW[0] * sourceUnitsPerPixelX,
    rowX[1] * sourceUnitsPerPixelY,
    rowY[1] * sourceUnitsPerPixelY,
    0,
    rowW[1] * sourceUnitsPerPixelY,
    0,
    0,
    1,
    0,
    rowX[2],
    rowY[2],
    0,
    rowW[2],
  ].join(",")})`;
}
