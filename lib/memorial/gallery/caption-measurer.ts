import { A13_PILOT_CAPTION } from "@/config/gallery-a13-pilot-manifest";
import type { CaptionMeasurer, LineMetrics } from "@/lib/memorial/gallery/caption-layout";

/**
 * Browser-only: builds the V2.1 caption measurer AFTER La Belle Aurore is
 * confirmed loaded (contract §2.2 "Après chargement confirmé"). The font
 * family string is read from a probe element styled with
 * `--heritage-caption-hand`, so the canvas measures exactly the face the
 * SVG captions render with.
 */

export interface MeasurerReady {
  measurer: CaptionMeasurer;
  /** Resolved primary CSS font family (next/font generated). */
  fontFamily: string;
  /** `document.fonts.check()` for the measured spec, after load. */
  fontCheck: boolean;
  /** Every La Belle Aurore FontFace and its status, as proof. */
  faces: string[];
}

export async function createCaptionMeasurer(probe: HTMLElement): Promise<MeasurerReady> {
  const fontFamily = getComputedStyle(probe).fontFamily;
  // Only the PRIMARY family is loaded, checked and measured: it is the face
  // the captions render with. next/font also declares a metric-adjusted
  // "… Fallback" face on `local()` sources; when that local font is absent
  // the face errors and `document.fonts.load()` of the whole list rejects.
  const primary = fontFamily.split(",")[0].trim();
  const { weight, fontSizePx } = A13_PILOT_CAPTION;
  const spec = `${weight} ${fontSizePx}px ${primary}`;
  await document.fonts.load(spec, "Maman, un soir");
  await document.fonts.ready;
  const fontCheck = document.fonts.check(spec, "Maman, un soir");
  const faces: string[] = [];
  document.fonts.forEach((f) => {
    if (/belle aurore/i.test(f.family)) faces.push(`${f.family.replace(/["']/g, "")} · ${f.status}`);
  });

  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = spec;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const probeMetrics = ctx.measureText("Hg");
  const measure = (text: string): LineMetrics => {
    const r = ctx.measureText(text);
    return {
      width: r.width,
      actualBoundingBoxLeft: r.actualBoundingBoxLeft,
      actualBoundingBoxRight: r.actualBoundingBoxRight,
      actualBoundingBoxAscent: r.actualBoundingBoxAscent,
      actualBoundingBoxDescent: r.actualBoundingBoxDescent,
    };
  };
  return {
    measurer: { measure, fontAscent: probeMetrics.fontBoundingBoxAscent, fontDescent: probeMetrics.fontBoundingBoxDescent },
    fontFamily: primary,
    fontCheck,
    faces,
  };
}
