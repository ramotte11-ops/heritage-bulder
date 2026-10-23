import { A13_MOBILE_TITLE_BLOCK, resolveByViewport } from "@/config/gallery-a13-mobile-manifest";
import { A13_ALBUM_MOBILE_FRAME } from "@/config/album-a13-mobile-light";

/**
 * Recette Builder V1 (PO, 23/10) — the Full Album title « Galerie de
 * souvenirs », on Mobile and Desktop, Light and Dark.
 *
 * Typography and inks are the Gallery's own (Desktop: the scene title
 * block under the Master's centred sprig; Mobile: the canonical title
 * block, its title line at the same height). No new decor: the Desktop
 * Dark TOP material already carries the Master sprig above the title;
 * Desktop Light and Mobile have no sprig art of their own (no asset is
 * drawn or invented).
 *
 * The composition is never re-solved: when a print would meet the title
 * box (plus its breathing gap), every print is translated down by the
 * smallest amount that clears it — the same Album, lower on the page.
 */

type Point = { x: number; y: number };

/** Title box in the table's own frame (source px): horizontal extent, bottom edge and the gap kept under it. */
export interface AlbumTitleBox {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  gap: number;
}

/** Desktop (1670 frame): the Gallery scene's title block box and size (`A13GalleryScene.module.css`), title line only. */
export const A13_ALBUM_DESKTOP_TITLE = {
  x0: 535,
  x1: 1135,
  top: 104,
  fontSize: 40,
  lineHeight: 1.15,
  /** Breathing kept between the title and the first paper. */
  gapBelow: 32,
} as const;

export function albumDesktopTitleBox(): AlbumTitleBox {
  const t = A13_ALBUM_DESKTOP_TITLE;
  return { x0: t.x0, x1: t.x1, top: t.top, bottom: t.top + t.fontSize * t.lineHeight, gap: t.gapBelow };
}

/**
 * Mobile TOP materials: the corner bouquet (leaves, flowers, wax seal) as
 * measured on the Studio assets — for each 20 source px band from y = 0,
 * the right-most x of the art (1024 frame; colour distance > 90 from the
 * table colour, 3-pixel clusters). Light `a13-album-mobile-light-top-photo-
 * free-v1.png` (SHA-256 802e5964…), Dark `a13-album-mobile-dark-top-v1.png`
 * (SHA-256 5035f992…). Below the last band the corner is free.
 */
export const A13_ALBUM_MOBILE_TOP_BOUQUET: Record<"light" | "dark", readonly number[]> = {
  light: [344, 360, 318, 306, 318, 358, 348, 318, 302, 288, 272, 244, 224, 216, 214, 182, 152, 84, 86, 132, 76],
  dark: [394, 374, 290, 318, 314, 358, 340, 328, 308, 292, 268, 248, 234, 206, 214, 176, 150, 146, 140, 130, 76, 6],
};
const BOUQUET_BAND_PX = 20;
/** Air kept between the bouquet and the title box (source px). */
const BOUQUET_CLEARANCE_PX = 16;

/**
 * Mobile (1024 frame): the Gallery's canonical title line at this stage
 * width (same size, width, line height), in source px. Its top is the
 * Gallery's; when the title box would meet the corner bouquet of the TOP
 * material, the title — still centred — goes down to the first height
 * where it clears it (the art is never covered).
 */
export function albumMobileTitle(stageWidth: number, theme: "light" | "dark" = "light") {
  const tb = A13_MOBILE_TITLE_BLOCK;
  const s = stageWidth / A13_ALBUM_MOBILE_FRAME.width;
  const fontSizeCss = resolveByViewport(tb.title.fontSizeCss, stageWidth);
  const topCss = tb.topCss + resolveByViewport(tb.separator.heightCss, stageWidth) + resolveByViewport(tb.separatorToTitleGapCss, stageWidth);
  const widthCss = resolveByViewport(tb.title.maxWidthCss, stageWidth);
  const x0 = (A13_ALBUM_MOBILE_FRAME.width - widthCss / s) / 2;
  const height = (fontSizeCss * tb.title.lineHeight) / s;
  const bands = A13_ALBUM_MOBILE_TOP_BOUQUET[theme];
  const meets = (top: number) =>
    bands.some((xMax, i) => xMax > x0 - BOUQUET_CLEARANCE_PX && i * BOUQUET_BAND_PX < top + height + BOUQUET_CLEARANCE_PX && (i + 1) * BOUQUET_BAND_PX > top - BOUQUET_CLEARANCE_PX);
  let top = topCss / s;
  while (meets(top)) top += 1;
  const box: AlbumTitleBox = {
    x0,
    x1: (A13_ALBUM_MOBILE_FRAME.width + widthCss / s) / 2,
    top,
    bottom: top + height,
    gap: tb.subtitleToFirstPolaroidGapCssMin / s,
  };
  return { box, fontSize: fontSizeCss / s, maxWidth: widthCss / s };
}

/** The smallest downward translation (≥ 0) after which no paper meets the title box and its gap. */
export function albumTitleOffset(outers: readonly (readonly Point[])[], box: AlbumTitleBox): number {
  let need = 0;
  for (const poly of outers) {
    const xs = poly.map((p) => p.x);
    if (Math.max(...xs) <= box.x0 || Math.min(...xs) >= box.x1) continue;
    need = Math.max(need, box.bottom + box.gap - Math.min(...poly.map((p) => p.y)));
  }
  return need;
}
