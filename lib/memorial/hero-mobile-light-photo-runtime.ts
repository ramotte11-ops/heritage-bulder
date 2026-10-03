import { HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME } from "@/config/hero-intemporel-tokens";

export interface HeroMobileLightProjectedPoint {
  x: number;
  y: number;
}

/** Applies the Handoff V1.2 homography to normalized source coordinates. */
export function projectHeroMobileLightPhotoPoint(
  u: number,
  v: number,
): HeroMobileLightProjectedPoint {
  const [rowX, rowY, rowW] =
    HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.homographyNormalizedSourceToReference;
  const denominator = rowW[0] * u + rowW[1] * v + rowW[2];

  return {
    x: (rowX[0] * u + rowX[1] * v + rowX[2]) / denominator,
    y: (rowY[0] * u + rowY[1] * v + rowY[2]) / denominator,
  };
}

/**
 * Converts the normalized-source homography into CSS's column-major
 * matrix3d form for the fixed 400×500 logical 4:5 raster. The surrounding
 * SVG viewBox then scales the complete 941×1672 reference scene uniformly.
 */
export function heroMobileLightPhotoCssTransform(): string {
  const [rowX, rowY, rowW] =
    HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.homographyNormalizedSourceToReference;
  const { width, height } = HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.logicalRasterPx;

  return `matrix3d(${[
    rowX[0] / width,
    rowY[0] / width,
    0,
    rowW[0] / width,
    rowX[1] / height,
    rowY[1] / height,
    0,
    rowW[1] / height,
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
