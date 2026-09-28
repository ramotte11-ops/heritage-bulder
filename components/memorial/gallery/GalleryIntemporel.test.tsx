// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * Dettes D2–D4 — the product host of the A13 runtime in the Preview:
 * Gallery → Viewer, Signature 7+ CTA → Full Album (local state, no URL),
 * Album → Viewer, Album → Gallery with scroll and focus restored.
 */

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
const FONT = { measurer: fake, fontFamily: "La Belle Aurore", fontCheck: true, faces: [] };
vi.mock("@/lib/memorial/gallery/use-caption-measurer", () => ({ useCaptionMeasurer: () => FONT }));
vi.mock("@/lib/memorial/gallery/caption-measurer", () => ({ createCaptionMeasurer: async () => FONT }));
vi.mock("@/lib/memorial/gallery/title-glyph-mask", async (orig) => ({
  ...(await orig<typeof import("@/lib/memorial/gallery/title-glyph-mask")>()),
  measureTitleGlyphMask: async () => ({ mask: MASK, heading: R.headingInkReference, microcopy: R.microcopyInkReference, fontsChecked: true, deviationPx: { heading: 0, microcopy: 0 } }),
}));

const { GalleryIntemporel } = await import("./GalleryIntemporel");
const { a13FamilyFixture } = await import("@/lib/memorial/a13-desktop-flow-fixtures");

let scrollTo: ReturnType<typeof vi.fn>;
let scrollY = 0;
beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", { value: 1670, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 941, configurable: true });
  Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });
  scrollY = 0;
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

async function mount(n: number, theme: "light" | "dark" = "light") {
  const media = a13FamilyFixture(n, "mixte");
  const view = render(<GalleryIntemporel media={media} theme={theme} title="Souvenirs de famille" subtitle="Les instants que nous gardons près de nous" language="fr" />);
  const root = view.container.querySelector<HTMLElement>("[data-memorial-gallery]")!;
  const gallery = root.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!;
  // G2–G5 run the real V2 solver (seconds under jsdom).
  await waitFor(() => expect(gallery.dataset.galleryOutcome).toBe("resolved"), { timeout: 60000 });
  return { media, root, gallery };
}
const scene = (gallery: HTMLElement) => gallery.querySelector<HTMLElement>(":scope > [data-testid=a13-pilot-scene]")!;
const viewerState = () => document.querySelector("[data-a13-viewer]")?.getAttribute("data-viewer-state");

describe("Gallery (in the Memorial)", () => {
  it("6 photographs: G6 exact, six interactive prints, NO CTA, no Album", async () => {
    const { root, gallery } = await mount(6);
    expect(gallery.dataset.galleryState).toBe("G6");
    expect(scene(gallery).querySelectorAll("[data-print][role=button]")).toHaveLength(6);
    expect(root.querySelector("[data-testid=cta-7plus]")).toBeNull();
    expect(root.querySelector("[data-memorial-gallery-album]")).toBeNull();
  });

  it("2–5 photographs: G2–G5, no CTA", { timeout: 240000 }, async () => {
    for (const n of [2, 3, 4, 5]) {
      const { root, gallery } = await mount(n);
      expect(gallery.dataset.galleryState).toBe(`G${n}`);
      expect(root.querySelector("[data-testid=cta-7plus]")).toBeNull();
      cleanup();
    }
  });

  it("a print opens the Viewer (origin Gallery) with its own media", async () => {
    const { media, gallery } = await mount(7);
    fireEvent.click(scene(gallery).querySelectorAll<HTMLElement>("[data-print][role=button]")[2]);
    await waitFor(() => expect(viewerState()).toBe("open"));
    const v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
    expect(v.dataset.viewerOrigin).toBe("gallery");
    expect(v.querySelector("[data-viewer-photo]")!.getAttribute("src")).toBe(media[2].src);
  });

  it("Dark: same composition, Dark materials (theme from skinVariant)", async () => {
    const light = await mount(7, "light");
    const lightState = [light.gallery.dataset.galleryState, scene(light.gallery).querySelectorAll("[data-print]").length];
    cleanup();
    const dark = await mount(7, "dark");
    expect([dark.gallery.dataset.galleryState, scene(dark.gallery).querySelectorAll("[data-print]").length]).toEqual(lightState);
    expect(scene(dark.gallery).getAttribute("data-a13-theme")).toBe("dark");
  });
});

describe("Signature 7+ → Full Album (local state) → back", () => {
  it("the CTA is a <button>; activating it shows the Album of ALL photographs, in family order — no URL change", async () => {
    const href = window.location.href;
    const { media, root } = await mount(12);
    const cta = root.querySelector<HTMLButtonElement>("[data-testid=cta-7plus]")!;
    expect(cta.tagName).toBe("BUTTON");
    expect(cta.textContent).toBe("Voir plus de souvenirs");
    fireEvent.click(cta);
    const album = root.querySelector<HTMLElement>("[data-memorial-gallery-album]")!;
    expect(root.dataset.galleryView).toBe("album");
    const prints = [...album.querySelectorAll<HTMLElement>("[data-testid=album-memory-table] [data-print]")];
    expect(prints.map((p) => p.querySelector("img")!.getAttribute("src"))).toEqual(media.map((m) => m.src));
    expect(window.location.href).toBe(href);
  });

  it("opening: Gallery hidden (not unmounted), Album brought to the top, focus on its 'Retour' control", async () => {
    const { root, gallery } = await mount(7);
    scrollY = 1840;
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    const back = root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!;
    expect(back.textContent).toBe("Retour");
    expect(document.activeElement).toBe(back);
    expect(gallery.isConnected).toBe(true);
    expect(gallery.parentElement!.hidden).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: root.getBoundingClientRect().top + 1840, behavior: "instant" });
  });

  it("a print of the Album opens the Viewer (origin Album)", async () => {
    const { media, root } = await mount(9);
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    const prints = root.querySelectorAll<HTMLElement>("[data-testid=album-memory-table] [data-print][role=button]");
    fireEvent.click(prints[8]);
    await waitFor(() => expect(viewerState()).toBe("open"));
    const v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
    expect(v.dataset.viewerOrigin).toBe("album");
    expect(v.querySelector("[data-viewer-photo]")!.getAttribute("src")).toBe(media[8].src);
  });

  it("returning: Album gone, Gallery shown again (same composition), scroll restored, focus back on the CTA", async () => {
    const { root, gallery } = await mount(7);
    const before = scene(gallery).innerHTML;
    scrollY = 1840;
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    scrollY = 0;
    fireEvent.click(root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!);
    expect(root.dataset.galleryView).toBe("gallery");
    expect(root.querySelector("[data-memorial-gallery-album]")).toBeNull();
    expect(gallery.parentElement!.hidden).toBe(false);
    expect(scene(gallery).innerHTML).toBe(before);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 1840, behavior: "instant" });
    expect(document.activeElement).toBe(root.querySelector("[data-testid=cta-7plus]"));
  });

  it("keyboard: the CTA and 'Retour' are native buttons (Enter/Space); no global Escape, no focus trap added", async () => {
    const { root } = await mount(7);
    const cta = root.querySelector<HTMLButtonElement>("[data-testid=cta-7plus]")!;
    cta.focus();
    fireEvent.click(cta); // a native <button> turns Enter/Space into click
    fireEvent.keyDown(document, { key: "Escape" });
    expect(root.dataset.galleryView).toBe("album");
    const back = root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!;
    expect(back.type).toBe("button");
    fireEvent.keyDown(back, { key: "Tab" });
    expect(document.activeElement).toBe(back);
  });
});
