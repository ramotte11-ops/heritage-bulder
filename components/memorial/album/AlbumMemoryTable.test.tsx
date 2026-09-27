// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { layoutAlbum } from "@/lib/memorial/album/album-layout";
import { albumFixture } from "@/lib/memorial/album/album-pilot-fixtures";
import { A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

const { AlbumMemoryTable } = await import("./AlbumMemoryTable");
const { DynamicPolaroid } = await import("@/components/memorial/gallery/DynamicPolaroid");

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11, actualBoundingBoxAscent: 18, actualBoundingBoxDescent: 6 }),
  fontAscent: 22,
  fontDescent: 8,
};

afterEach(cleanup);

function setup(n: number) {
  const fx = albumFixture(n, "natural-mix", "mixed");
  const layout = layoutAlbum(fx.map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption })), fake);
  const media = fx.map((m, i) => ({ mediaId: m.mediaId, src: `/p${i}.jpg`, alt: `Photo ${i + 1}` }));
  const onActivate = vi.fn();
  const view = render(<AlbumMemoryTable layout={layout} media={media} onActivate={onActivate} />);
  return { layout, onActivate, view, fx };
}

describe("A13 Album — memory table render contracts", () => {
  it("renders every memory once, in strict family order (DOM = keyboard order)", () => {
    const { view, fx } = setup(11);
    const idx = [...view.container.querySelectorAll("[data-media-index]")].map((e) => Number(e.getAttribute("data-media-index")));
    expect(idx).toEqual(fx.map((_, i) => i));
    const groups = [...view.container.querySelectorAll("[data-album-group]")].map((g) => `${g.getAttribute("data-album-grammar")}${g.getAttribute("data-album-size")}`);
    expect(groups).toEqual(["A5", "C44", "C22"]);
  });

  it("makes each whole print a keyboard control resolving the right mediaId", () => {
    const { view, onActivate, layout } = setup(7);
    const controls = view.getAllByRole("button");
    expect(controls.length).toBe(7);
    controls.forEach((c, i) => {
      expect(c.getAttribute("tabindex")).toBe("0");
      const p = layout.prints[i];
      const name = p.caption?.lines.length ? p.caption.lines.map((l) => l.text).join(" ") : `Souvenir ${i + 1} sur 7`;
      expect(c.getAttribute("aria-label")).toBe(name);
    });
    fireEvent.click(controls[3]);
    fireEvent.keyDown(controls[5], { key: "Enter" });
    fireEvent.keyDown(controls[6], { key: " " });
    expect(onActivate.mock.calls).toEqual([
      ["mem-004", 3],
      ["mem-006", 5],
      ["mem-007", 6],
    ]);
  });

  it("loads the first group eagerly and every later group lazily, with reserved space", () => {
    const { view, layout } = setup(20);
    const imgs = [...view.container.querySelectorAll("img")];
    expect(imgs.length).toBe(20);
    imgs.forEach((img, i) => {
      expect(img.getAttribute("loading")).toBe(layout.prints[i].groupIndex === 0 ? "eager" : "lazy");
      expect(img.getAttribute("decoding")).toBe("async");
      // print box fully sized before decoding
      expect(img.style.width).toMatch(/calc\(/);
      expect(img.style.height).toMatch(/calc\(/);
    });
    const canvas = view.container.querySelector("[data-album-height]") as HTMLElement;
    expect(canvas.style.height).toBe(`calc(${layout.height} * var(--k))`);
  });

  it("draws no separator, no group box and no theme attribute (Light only)", () => {
    const { view } = setup(20);
    expect(view.container.querySelector("[data-a13-theme]")).toBeNull();
    expect(view.container.querySelectorAll("hr").length).toBe(0);
  });

  it("Gallery prints stay byte-identical: no loading attribute without imageLoading", () => {
    const slot = A13_PILOT_SLOTS[0];
    const view = render(<DynamicPolaroid slot={slot} layout={layoutDynamicPolaroid(slot, { width: 1200, height: 1600 })} src="/x.jpg" alt="x" caption={null} />);
    const img = view.container.querySelector("img")!;
    expect(img.hasAttribute("loading")).toBe(false);
    expect(img.hasAttribute("decoding")).toBe(false);
    expect(img.getAttributeNames().sort()).toEqual(["alt", "class", "draggable", "src", "style"]);
  });
  it("Dark renders the SAME geometry DOM as Light (material only) and never processes a photo", () => {
    const fx = albumFixture(20, "natural-mix", "mixed");
    const layout = layoutAlbum(fx.map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption })), fake);
    const media = fx.map((m, i) => ({ mediaId: m.mediaId, src: `/p${i}.jpg`, alt: `Photo ${i + 1}` }));
    const geometry = (root: HTMLElement) =>
      [...root.querySelectorAll<HTMLElement>("[data-slot-id]")].map((slot) => {
        const clean = (el: Element) => [...(el as HTMLElement).style].filter((p) => !p.startsWith("--a13-dark-")).map((p) => `${p}:${(el as HTMLElement).style.getPropertyValue(p)}`).join(";");
        return [slot.dataset.slotId, slot.dataset.mediaIndex, clean(slot), ...[...slot.querySelectorAll("*")].map((e) => `${e.tagName}|${clean(e)}|${e.getAttribute("role") ?? ""}|${e.getAttribute("aria-label") ?? ""}|${e.getAttribute("tabindex") ?? ""}`)].join("\n");
      });
    const light = render(<AlbumMemoryTable layout={layout} media={media} theme="light" />).container;
    const lightGeometry = geometry(light);
    const lightRoot = light.querySelector("[data-testid=album-memory-table]")!;
    expect(lightRoot.hasAttribute("data-a13-theme")).toBe(false);
    expect(lightRoot.getAttribute("style")).toBeNull();
    cleanup();
    const dark = render(<AlbumMemoryTable layout={layout} media={media} theme="dark" />).container;
    const darkRoot = dark.querySelector<HTMLElement>("[data-testid=album-memory-table]")!;
    expect(darkRoot.getAttribute("data-a13-theme")).toBe("dark");
    expect(darkRoot.style.getPropertyValue("--a13-dark-album-top")).toContain("a13-album-desktop-dark-top-photo-free-v1.png");
    expect(geometry(dark)).toEqual(lightGeometry);
    for (const img of dark.querySelectorAll("img")) {
      expect(img.style.filter).toBe("");
      expect(img.style.opacity).toBe("");
      expect(img.style.mixBlendMode).toBe("");
    }
  });
});
