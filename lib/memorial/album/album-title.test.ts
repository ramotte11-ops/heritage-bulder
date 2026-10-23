import { describe, expect, it } from "vitest";
import { A13_MOBILE_TITLE_BLOCK, resolveByViewport } from "@/config/gallery-a13-mobile-manifest";
import { A13_ALBUM_MOBILE_TOP_BOUQUET, albumDesktopTitleBox, albumMobileTitle, albumTitleOffset } from "@/lib/memorial/album/album-title";

/** Recette Builder V1 — the Full Album title « Galerie de souvenirs ». */
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe("albumTitleOffset", () => {
  const box = { x0: 500, x1: 1100, top: 104, bottom: 150, gap: 32 };
  it("is 0 when no paper meets the title box and its gap", () => {
    expect(albumTitleOffset([rect(100, 20, 480, 400), rect(1120, 0, 1500, 300), rect(600, 182, 900, 500)], box)).toBe(0);
  });
  it("is the smallest translation after which the highest paper under the title clears it", () => {
    const offset = albumTitleOffset([rect(600, 90, 900, 500), rect(800, 120, 1000, 400), rect(100, 0, 400, 300)], box);
    expect(offset).toBe(150 + 32 - 90);
    // translated by that offset, nothing under the title starts above bottom + gap
    expect(90 + offset).toBe(box.bottom + box.gap);
  });
  it("a rotated paper counts by its real outline", () => {
    expect(albumTitleOffset([[{ x: 520, y: 170 }, { x: 700, y: 140 }, { x: 720, y: 400 }, { x: 540, y: 430 }]], box)).toBe(42);
  });
});

describe("Desktop title box — the Gallery scene title block (x 535–1135, y 104, 40 × 1.15)", () => {
  it("sits under the Master's centred sprig (y ≤ 81.5 canonical)", () => {
    expect(albumDesktopTitleBox()).toEqual({ x0: 535, x1: 1135, top: 104, bottom: 150, gap: 32 });
  });
});

describe("Mobile title — the Gallery's Mobile title line, centred, never over the corner bouquet", () => {
  for (const theme of ["light", "dark"] as const)
    for (const w of [375, 390, 430]) {
      it(`${theme} ${w}: Gallery size and width, centred, clear of the bouquet`, () => {
        const s = w / 1024;
        const t = albumMobileTitle(w, theme);
        expect(t.fontSize * s).toBeCloseTo(resolveByViewport(A13_MOBILE_TITLE_BLOCK.title.fontSizeCss, w), 9);
        expect(t.maxWidth * s).toBeCloseTo(resolveByViewport(A13_MOBILE_TITLE_BLOCK.title.maxWidthCss, w), 9);
        expect((t.box.x0 + t.box.x1) / 2).toBeCloseTo(512, 9);
        // never above the Gallery's own title line
        const galleryTopCss = resolveByViewport(A13_MOBILE_TITLE_BLOCK.separator.heightCss, w) + resolveByViewport(A13_MOBILE_TITLE_BLOCK.separatorToTitleGapCss, w);
        expect(t.box.top * s).toBeGreaterThanOrEqual(galleryTopCss - 1e-9);
        // every bouquet band beside the title is left of the title box, with 16 source px of air
        A13_ALBUM_MOBILE_TOP_BOUQUET[theme].forEach((xMax, i) => {
          const y0 = i * 20;
          if (y0 < t.box.bottom + 16 && y0 + 20 > t.box.top - 16) expect(xMax, `band ${y0}`).toBeLessThanOrEqual(t.box.x0 - 16);
        });
      });
    }
});
