import { HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME } from "@/config/hero-intemporel-tokens";

export interface HeroDesktopDarkProjectedPoint {
  x: number;
  y: number;
}

/** Applies the authoritative Desktop Dark homography in normalized 4×5 space. */
export function projectHeroDesktopDarkPhotoPoint(
  u: number,
  v: number,
): HeroDesktopDarkProjectedPoint {
  const [rowX, rowY, rowW] =
    HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME.homographyNormalizedSourceToReference;
  const denominator = rowW[0] * u + rowW[1] * v + rowW[2];

  return {
    x: (rowX[0] * u + rowX[1] * v + rowX[2]) / denominator,
    y: (rowY[0] * u + rowY[1] * v + rowY[2]) / denominator,
  };
}

/** Converts the 4×5 source homography to CSS's column-major matrix3d. */
export function heroDesktopDarkPhotoCssTransform(): string {
  const runtime = HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME;
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

/** Exact SVG polygon that prevents unrelated transparent pixels from revealing the photo. */
export function heroDesktopDarkPhotoClipPoints(): string {
  return HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME.destinationQuadPx
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}
