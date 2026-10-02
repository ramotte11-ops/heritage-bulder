import { a13MobileProfileActive } from "@/config/gallery-a13-mobile-manifest";

/**
 * A13 — RESPONSIVE BRIDGE V1 — runtime authority.
 *
 * Transcribed from package `A13_RESPONSIVE_BRIDGE_HANDOFF_V1`
 * (`contract/a13-responsive-bridge.v1.json`, QG-verified SHA-256
 * d505ccd1…4223, checkpoint 88a3530). It closes `STOP_RESPONSIVE_431_1199`
 * and creates NO Master, manifest, solver, media state or Dark geometry:
 * the two intermediate families are a uniform change of frame of an
 * existing CLOSED authority, never a new composition.
 *
 * | CSS width  | family                  | geometric authority                      |
 * |-----------:|-------------------------|------------------------------------------|
 * | 375–430    | Mobile CLOSED           | unchanged                                |
 * | 431–1023   | Tablet vertical         | Mobile CLOSED at 430, × W / 430          |
 * | 1024–1199  | Horizontal intermediate | Desktop CLOSED at 1200, × W / 1200       |
 * | ≥ 1200     | Desktop CLOSED          | unchanged                                |
 * | < 375      | out of the V1 contract  | `STOP_RESPONSIVE_BELOW_375_OUT_OF_SCOPE` |
 *
 * W is the width of the A13 container (the available width), never a
 * device class. Boundaries:
 *  - 430 → 431: normalized geometric continuity (same Mobile authority);
 *  - 1023 → 1024: the intentional, atomic family switch (Mobile-derived →
 *    Desktop-derived) — same content, same family order, no slot
 *    interpolation, no hybrid composition;
 *  - 1199 → 1200: normalized geometric continuity into the Desktop.
 *
 * ## How each family is realised (no CLOSED authority is modified)
 *
 * - Tablet: the Mobile runtimes (Gallery `runMobileGallery`, Album
 *   `layoutAlbumMobile`) are run at their canonical 430 frame — the
 *   composition, solver decisions, partition and captions are exactly the
 *   430 ones — and painted on a stage that IS W wide: every source-px
 *   length is `N × --k` of the W stage, and every length the Mobile scene
 *   attaches in CSS px (title block, separator, title / subtitle type,
 *   CTA type, bottom-continuation seam) is the 430 value × `remap`
 *   (W / 430). Never a 430 px canvas centred or CSS-transformed.
 * - Horizontal: the Desktop sections already paint their one canonical
 *   1670 canvas uniformly (`--k = W / 1670`, every geometric length
 *   `N × --k`), so at W ∈ [1024, 1199] they ARE the 1200 rendering × W /
 *   1200; nothing is added to them.
 *
 * Light and Dark consume the same geometry: the theme never enters a
 * family, a frame or a remap.
 */

export const A13_RESPONSIVE_BRIDGE_HANDOFF_ID = "A13_RESPONSIVE_BRIDGE_HANDOFF_V1" as const;

/** `breakpoints` (CSS px, inclusive), `families.*.sourceWidthCssPx`. */
export const A13_RESPONSIVE_BRIDGE = {
  mobile: { min: 375, max: 430 },
  tablet: { min: 431, max: 1023, sourceWidthCssPx: 430 },
  horizontal: { min: 1024, max: 1199, sourceWidthCssPx: 1200 },
  desktop: { min: 1200, max: null },
} as const;

export type A13ResponsiveFamily = "mobile" | "tablet" | "horizontal" | "desktop";

export const A13_RESPONSIVE_BELOW_375_STOP = "STOP_RESPONSIVE_BELOW_375_OUT_OF_SCOPE" as const;

export type A13ResponsiveSelection =
  | {
      family: A13ResponsiveFamily;
      width: number;
      /** Width of the frame the geometry is resolved in (the CLOSED authority's). */
      sourceWidth: number;
      /** W / sourceWidth: 1 for the two CLOSED families. */
      scale: number;
    }
  | { family: null; width: number; stop: typeof A13_RESPONSIVE_BELOW_375_STOP };

/**
 * The family of an A13 container of width `width` (CSS px). Contiguous
 * over [375, ∞) — a fractional width belongs to exactly one family
 * (430.5 is Tablet, 1023.5 Tablet, 1199.5 Horizontal): no gap, no overlap.
 * Mobile is exactly `a13MobileProfileActive` (375–430).
 */
export function selectA13ResponsiveFamily(width: number): A13ResponsiveSelection {
  const B = A13_RESPONSIVE_BRIDGE;
  if (!(width >= B.mobile.min)) return { family: null, width, stop: A13_RESPONSIVE_BELOW_375_STOP };
  if (a13MobileProfileActive(width)) return { family: "mobile", width, sourceWidth: width, scale: 1 };
  if (width < B.horizontal.min) return { family: "tablet", width, sourceWidth: B.tablet.sourceWidthCssPx, scale: width / B.tablet.sourceWidthCssPx };
  if (width < B.desktop.min) return { family: "horizontal", width, sourceWidth: B.horizontal.sourceWidthCssPx, scale: width / B.horizontal.sourceWidthCssPx };
  return { family: "desktop", width, sourceWidth: width, scale: 1 };
}

/** The Mobile authority's frame for a Mobile-derived family (Mobile CLOSED or Tablet). */
export interface A13MobileAuthorityFrame {
  family: "mobile" | "tablet";
  /** Stage width the Mobile runtime is run at: W itself (Mobile) or 430 (Tablet). */
  sourceWidth: number;
  /** CSS px of the rendered stage per CSS px of the source frame: 1 (Mobile) or W / 430 (Tablet). */
  remap: number;
}

/**
 * The Mobile authority's frame at width `width`: Mobile CLOSED (375–430,
 * itself), Tablet (431–1023, the 430 frame remapped) when the host opts
 * into the bridge, otherwise `null` (not a Mobile-derived width).
 */
export function a13MobileAuthorityFrame(width: number, bridge: boolean): A13MobileAuthorityFrame | null {
  if (a13MobileProfileActive(width)) return { family: "mobile", sourceWidth: width, remap: 1 };
  if (!bridge) return null;
  const s = selectA13ResponsiveFamily(width);
  return s.family === "tablet" ? { family: "tablet", sourceWidth: s.sourceWidth, remap: s.scale } : null;
}
