// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: [...t].length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: [...t].length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const R = A13_V2_1_TITLE;
const MASK = maskFromRects([
  { x0: R.headingInkReference.xMin - 3, y0: R.headingInkReference.yMin - 3, x1: R.headingInkReference.xMax + 2, y1: R.headingInkReference.yMax + 2 },
  { x0: R.microcopyInkReference.xMin - 3, y0: R.microcopyInkReference.yMin - 3, x1: R.microcopyInkReference.xMax + 2, y1: R.microcopyInkReference.yMax + 2 },
]);
vi.mock("@/lib/memorial/gallery/use-caption-measurer", () => ({
  useCaptionMeasurer: () => ({ measurer: fake, fontFamily: "La Belle Aurore", fontCheck: true, faces: [] }),
}));
vi.mock("@/lib/memorial/gallery/caption-measurer", () => ({
  createCaptionMeasurer: async () => ({ measurer: fake, fontFamily: "La Belle Aurore", fontCheck: true, faces: [] }),
}));
vi.mock("@/lib/memorial/gallery/title-glyph-mask", async (orig) => ({
  ...(await orig<typeof import("@/lib/memorial/gallery/title-glyph-mask")>()),
  measureTitleGlyphMask: async () => ({ mask: MASK, heading: R.headingInkReference, microcopy: R.microcopyInkReference, fontsChecked: true, deviationPx: { heading: 0, microcopy: 0 } }),
}));

const { A13DesktopGallery } = await import("./A13DesktopGallery");
const { A13DesktopFullAlbum } = await import("@/components/memorial/album/A13DesktopFullAlbum");
const { a13FamilyFixture } = await import("@/lib/memorial/a13-desktop-flow-fixtures");

beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", { value: 1670, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 941, configurable: true });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function gallery(n: number) {
  const onSeeMore = vi.fn();
  const view = render(<A13DesktopGallery media={a13FamilyFixture(n, "mixte")} theme="dark" title="Souvenirs de famille" subtitle="Les instants" language="fr" onSeeMore={onSeeMore} />);
  const root = view.container.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!;
  return { root, onSeeMore };
}
const visibleScene = (root: HTMLElement) => root.querySelector<HTMLElement>(":scope > [data-testid=a13-pilot-scene]");

describe("A13 Desktop — Gallery section interactions (zero debt)", () => {
  it("0–1 media: no Gallery scene", async () => {
    for (const n of [0, 1]) {
      const { root } = gallery(n);
      await waitFor(() => expect(root.dataset.galleryStatus).toBe("GALLERY_ABSENT"));
      expect(visibleScene(root)).toBeNull();
      cleanup();
    }
  });

  it("G6 exact: six interactive prints in family order, NO CTA; a print opens the Viewer with its media", async () => {
    const { root } = gallery(6);
    await waitFor(() => expect(root.dataset.galleryState).toBe("G6"));
    const prints = [...visibleScene(root)!.querySelectorAll<HTMLElement>("[data-print][role=button]")];
    expect(prints).toHaveLength(6);
    expect(prints.map((p) => p.querySelector("img")!.getAttribute("src"))).toEqual(a13FamilyFixture(6, "mixte").map((m) => m.src));
    expect(prints.every((p) => p.tabIndex === 0)).toBe(true);
    expect(root.querySelector("[data-testid=cta-7plus]")).toBeNull();
    prints[3].focus();
    fireEvent.keyDown(prints[3], { key: "Enter" });
    await waitFor(() => expect(document.querySelector("[data-a13-viewer]")?.getAttribute("data-viewer-state")).toBe("open"));
    const v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
    expect(v.dataset.viewerOrigin).toBe("gallery");
    expect(v.dataset.a13ViewerTheme).toBe("dark");
    expect(v.querySelector("[data-viewer-photo]")!.getAttribute("src")).toBe(a13FamilyFixture(6, "mixte")[3].src);
  });

  it("Signature 7+: six interactive prints (media 1…6), CTA present, CTA → onSeeMore", async () => {
    for (const n of [7, 8, 12]) {
      const { root, onSeeMore } = gallery(n);
      await waitFor(() => expect(root.dataset.galleryState).toBe("G6_SIGNATURE_7PLUS"));
      const prints = [...visibleScene(root)!.querySelectorAll<HTMLElement>("[data-print][role=button]")];
      expect(prints.map((p) => p.querySelector("img")!.getAttribute("src"))).toEqual(a13FamilyFixture(n, "mixte").slice(0, 6).map((m) => m.src));
      const cta = root.querySelector<HTMLButtonElement>("[data-testid=cta-7plus]")!;
      expect(cta.textContent).toBe("Voir plus de souvenirs");
      fireEvent.click(cta);
      expect(onSeeMore).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("Full Album: every media once, in family order, each print opening the Viewer (origin Album)", async () => {
    const media = a13FamilyFixture(12, "mixte");
    const view = render(<A13DesktopFullAlbum media={media} theme="light" language="fr" />);
    const table = view.container.querySelector<HTMLElement>("[data-testid=album-memory-table]")!;
    const prints = [...table.querySelectorAll<HTMLElement>("[data-print][role=button]")];
    expect(prints.map((p) => p.querySelector("img")!.getAttribute("src"))).toEqual(media.map((m) => m.src));
    fireEvent.click(prints[9]);
    await waitFor(() => expect(document.querySelector("[data-a13-viewer]")?.getAttribute("data-viewer-state")).toBe("open"));
    const v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
    expect(v.dataset.viewerOrigin).toBe("album");
    expect(v.querySelector("[data-viewer-photo]")!.getAttribute("src")).toBe(media[9].src);
  });
});
