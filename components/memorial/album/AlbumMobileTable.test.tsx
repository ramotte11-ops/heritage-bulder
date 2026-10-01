// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { A13_ALBUM_MOBILE_MATERIALS as MAT } from "@/config/album-a13-mobile-light";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { layoutAlbumMobile } from "@/lib/memorial/album/album-mobile-layout";
import { albumMobileFixture } from "@/lib/memorial/album/album-mobile-pilot-fixtures";

/**
 * A13 Full Album Mobile Light — render contracts only (materials, family
 * order, depth, controls, lazy loading). Pixels, seams and reachability are
 * proven in the browser pilot (`/pilot/a13-album-mobile-light`).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

const { AlbumMobileTable } = await import("./AlbumMobileTable");

afterEach(cleanup);

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};

function tableFor(n: number, captions: "aucune" | "32" = "32") {
  const fx = albumMobileFixture(n, "natural-mix", captions);
  const layout = layoutAlbumMobile(fx, fake, 390);
  const media = fx.map((m, i) => ({ mediaId: m.mediaId, src: `/p/${i}.jpg`, alt: `Souvenir ${i + 1}` }));
  return { layout, media };
}

describe("AlbumMobileTable", () => {
  it("materials: the TOP once at 0, then BODY tiles faded in over 112 then 64 source px; the Master is never drawn", () => {
    const { layout, media } = tableFor(40);
    const { container } = render(<AlbumMobileTable layout={layout} media={media} language="fr" />);
    const tiles = [...container.querySelectorAll<HTMLImageElement>("[data-material]")];
    expect(tiles.map((t) => t.dataset.material)).toEqual(["top", ...Array(tiles.length - 1).fill("body")]);
    expect(tiles[0].getAttribute("src")).toBe(MAT.top.src);
    expect(tiles.slice(1).every((t) => t.getAttribute("src") === MAT.body.src)).toBe(true);
    expect(tiles.map((t) => Number(t.dataset.materialFade))).toEqual([0, 112, ...Array(tiles.length - 2).fill(64)]);
    expect(tiles[0].style.top).toBe("calc(0 * var(--k))");
    expect(tiles[1].style.top).toBe(`calc(${1536 - 112} * var(--k))`);
    expect(tiles.every((t) => t.style.height === "calc(1536 * var(--k))")).toBe(true);
    expect(tiles[0].style.maskImage).toBe("");
    expect(tiles[1].style.maskImage).toBe("linear-gradient(to bottom, transparent 0, #000 calc(112 * var(--k)))");
    expect(container.innerHTML).not.toMatch(/MASTER/i);
    const canvas = container.querySelector<HTMLElement>("[data-album-mobile-canvas]")!;
    expect(canvas.style.height).toBe(`calc(${layout.height} * var(--k))`);
  });

  it("every memory once, in family order, as a button opening its own memory; depth = z-index only; later groups lazy", () => {
    const { layout, media } = tableFor(11);
    const onActivate = vi.fn();
    const { container } = render(<AlbumMobileTable layout={layout} media={media} language="fr" onActivate={onActivate} />);
    const slots = [...container.querySelectorAll<HTMLElement>("[data-slot-id]")];
    expect(slots.map((s) => Number(s.dataset.mediaIndex))).toEqual(layout.prints.map((_, i) => i));
    slots.forEach((s, i) => expect(s.style.zIndex).toBe(String(layout.prints[i].slot.zIndex)));
    const buttons = [...container.querySelectorAll<HTMLElement>("[data-print][role=button]")];
    expect(buttons).toHaveLength(11);
    fireEvent.click(buttons[4]);
    fireEvent.keyDown(buttons[7], { key: "Enter" });
    fireEvent.keyDown(buttons[9], { key: " " });
    expect(onActivate.mock.calls).toEqual([
      [media[4].mediaId, 4],
      [media[7].mediaId, 7],
      [media[9].mediaId, 9],
    ]);
    const photos = [...container.querySelectorAll<HTMLImageElement>("[data-print] img")];
    expect(photos.slice(0, 3).every((p) => p.getAttribute("loading") === "eager")).toBe(true);
    expect(photos.slice(3).every((p) => p.getAttribute("loading") === "lazy")).toBe(true);
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("Album de souvenirs");
    expect([...container.querySelectorAll("[data-album-group]")].map((g) => g.getAttribute("data-album-grammar"))).toEqual(["TOP3", "PAIR_A", "PAIR_B", "PAIR_A", "PAIR_B"]);
  });

  it("the caption band is drawn grown downward (window untouched); a print without caption is named by its position", () => {
    const withCap = tableFor(7, "32");
    const without = tableFor(7, "aucune");
    const a = render(<AlbumMobileTable layout={withCap.layout} media={withCap.media} language="en" onActivate={() => {}} />);
    const b = render(<AlbumMobileTable layout={without.layout} media={without.media} language="en" onActivate={() => {}} />);
    const win = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-print] > div:last-of-type")].map((d) => d.getAttribute("style"));
    expect(win(a.container)).toEqual(win(b.container));
    expect(b.container.querySelector("[data-print]")!.getAttribute("aria-label")).toBe("Memory 1 of 7");
    expect(a.container.querySelectorAll("[data-testid^=caption-]").length).toBe(7);
  });
});
