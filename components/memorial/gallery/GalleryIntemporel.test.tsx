// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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

/*
 * jsdom has no layout: the section's width W (A13 Responsive Bridge V1) is
 * stubbed on the three roots that measure it — the host, and the two Mobile
 * sections (full width of the host) — and `resize(W)` plays a ResizeObserver
 * round, as a rotation or a window resize would.
 */
let sectionWidth = 1670;
const WIDTH_ROOTS = "[data-memorial-gallery], [data-testid=a13-mobile-gallery], [data-testid=a13-mobile-full-album]";
const nativeRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
  const r = nativeRect.call(this);
  if (!this.matches(WIDTH_ROOTS)) return r;
  const box = { x: r.x, y: r.y, left: r.left, top: r.top, width: sectionWidth, height: r.height, right: r.left + sectionWidth, bottom: r.bottom };
  return { ...box, toJSON: () => box } as DOMRect;
};
const observers = new Set<() => void>();
vi.stubGlobal(
  "ResizeObserver",
  class {
    private readonly cb: () => void;
    constructor(cb: () => void) {
      this.cb = () => cb();
    }
    observe() {
      observers.add(this.cb);
    }
    unobserve() {}
    disconnect() {
      observers.delete(this.cb);
    }
  },
);
function resize(w: number) {
  sectionWidth = w;
  act(() => {
    for (const cb of [...observers]) cb();
  });
}

let scrollTo: ReturnType<typeof vi.fn>;
let scrollY = 0;
beforeEach(() => {
  sectionWidth = 1670;
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

  it("opening: Gallery parked (not unmounted), Album brought to the top, focus on its 'Retour' control", async () => {
    const { root, gallery } = await mount(7);
    scrollY = 1840;
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    const back = root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!;
    expect(back.textContent).toBe("Retour");
    expect(document.activeElement).toBe(back);
    expect(gallery.isConnected).toBe(true);
    expect(gallery.parentElement!.dataset.memorialGalleryScene).toBe("parked");
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
    expect(gallery.parentElement!.dataset.memorialGalleryScene).toBe("shown");
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

describe("A13 Responsive Bridge V1 — one family per width, wired in the real host", () => {
  async function mountAt(w: number, n: number, theme: "light" | "dark" = "light") {
    sectionWidth = w;
    const media = a13FamilyFixture(n, "mixte");
    const view = render(<GalleryIntemporel media={media} theme={theme} title="Souvenirs de famille" subtitle="Les instants que nous gardons près de nous" language="fr" />);
    const root = view.container.querySelector<HTMLElement>("[data-memorial-gallery]")!;
    return { media, root };
  }
  const mobileGallery = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-testid=a13-mobile-gallery]");
  const desktopGallery = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]");

  it("375–430 Mobile, 431–1023 Tablet (Mobile sections, the 430 frame), 1024–1199 Horizontal and ≥ 1200 Desktop (Desktop sections)", async () => {
    for (const [w, family, sourceWidth, kind] of [
      [375, "mobile", 375, "mobile"],
      [430, "mobile", 430, "mobile"],
      [431, "tablet", 430, "mobile"],
      [768, "tablet", 430, "mobile"],
      [1023, "tablet", 430, "mobile"],
      [1024, "horizontal", 1200, "desktop"],
      [1199, "horizontal", 1200, "desktop"],
      [1200, "desktop", 1200, "desktop"],
      [1670, "desktop", 1670, "desktop"],
    ] as const) {
      const { root } = await mountAt(w, 4);
      expect(root.dataset.a13Family, String(w)).toBe(family);
      expect(Number(root.dataset.a13SourceWidth), String(w)).toBe(sourceWidth);
      if (kind === "mobile") {
        expect(desktopGallery(root), String(w)).toBeNull();
        await waitFor(() => expect(mobileGallery(root)!.dataset.galleryOutcome).toBe("resolved"));
        expect(mobileGallery(root)!.dataset.galleryProfile, String(w)).toBe(family);
      } else {
        expect(mobileGallery(root), String(w)).toBeNull();
        expect(desktopGallery(root), String(w)).not.toBeNull();
      }
      cleanup();
    }
  });

  it("below 375: STOP_RESPONSIVE_BELOW_375_OUT_OF_SCOPE — exposed, logged once, no Gallery (no invented behaviour)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { root } = await mountAt(360, 7);
    expect(root.dataset.a13Family).toBe("none");
    expect(root.dataset.a13ResponsiveStop).toBe("STOP_RESPONSIVE_BELOW_375_OUT_OF_SCOPE");
    expect(root.querySelector("[data-testid=a13-mobile-gallery], [data-testid=a13-desktop-gallery], [data-print]")).toBeNull();
    resize(320);
    expect(error.mock.calls.filter((c) => String(c[1]) === "STOP_RESPONSIVE_BELOW_375_OUT_OF_SCOPE")).toHaveLength(1);
    resize(390);
    expect(root.dataset.a13ResponsiveStop).toBeUndefined();
    await waitFor(() => expect(mobileGallery(root)!.dataset.galleryOutcome).toBe("resolved"));
    error.mockRestore();
  });

  it("Mobile / Tablet, Dark: Gallery → Viewer (Dark, origin Gallery) → 7+ CTA → Full Album (Dark, family order) → Viewer (Dark, origin Album) → Retour", async () => {
    for (const w of [390, 768]) {
      const { media, root } = await mountAt(w, 9, "dark");
      const gallery = mobileGallery(root)!;
      await waitFor(() => expect(gallery.dataset.galleryOutcome).toBe("resolved"));
      expect(gallery.querySelector("[data-testid=a13-mobile-scene]")!.getAttribute("data-a13-theme")).toBe("dark");
      const prints = gallery.querySelectorAll<HTMLElement>("[data-testid=a13-mobile-scene] [data-print][role=button]");
      expect(prints).toHaveLength(6);
      fireEvent.click(prints[1]);
      await waitFor(() => expect(viewerState()).toBe("open"));
      let v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
      expect([v.dataset.viewerOrigin, v.dataset.a13ViewerTheme], String(w)).toEqual(["gallery", "dark"]);
      expect(v.querySelector("[data-viewer-photo]")!.getAttribute("src")).toBe(media[1].src);
      fireEvent.click(v.querySelector("[data-viewer-close]")!);
      await waitFor(() => expect(document.querySelector("[data-a13-viewer]")).toBeNull());

      scrollY = 900;
      fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
      expect(root.dataset.galleryView).toBe("album");
      expect(gallery.isConnected).toBe(true);
      expect(gallery.parentElement!.dataset.memorialGalleryScene).toBe("parked");
      const album = root.querySelector<HTMLElement>("[data-memorial-gallery-album] [data-testid=a13-mobile-full-album]")!;
      await waitFor(() => expect(album.dataset.albumStatus).toBe("PASS"));
      expect(album.dataset.albumFamily, String(w)).toBe(w > 430 ? "tablet" : undefined);
      const table = album.querySelector<HTMLElement>("[data-testid=album-memory-table]")!;
      expect(table.dataset.a13Theme).toBe("dark");
      const albumPrints = [...table.querySelectorAll<HTMLElement>("[data-print][role=button]")];
      expect(albumPrints.map((p) => p.querySelector("img")!.getAttribute("src"))).toEqual(media.map((m) => m.src));
      fireEvent.click(albumPrints[7]);
      await waitFor(() => expect(viewerState()).toBe("open"));
      v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
      expect([v.dataset.viewerOrigin, v.dataset.a13ViewerTheme], String(w)).toEqual(["album", "dark"]);
      expect(v.querySelector("[data-viewer-photo]")!.getAttribute("src")).toBe(media[7].src);
      fireEvent.click(v.querySelector("[data-viewer-close]")!);
      await waitFor(() => expect(document.querySelector("[data-a13-viewer]")).toBeNull());

      scrollY = 0;
      fireEvent.click(root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!);
      expect(root.dataset.galleryView).toBe("gallery");
      expect(gallery.parentElement!.dataset.memorialGalleryScene).toBe("shown");
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 900, behavior: "instant" });
      expect(document.activeElement).toBe(root.querySelector("[data-testid=cta-7plus]"));
      cleanup();
    }
  });

  it("Mobile-derived Album: the page grows once the Album has measured itself — it is brought up again, unless the visitor scrolled", async () => {
    const { root } = await mountAt(390, 9);
    await waitFor(() => expect(mobileGallery(root)!.dataset.galleryOutcome).toBe("resolved"));
    scrollY = 900;
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 900, behavior: "instant" });
    expect(document.activeElement).toBe(root.querySelector("[data-memorial-gallery-album] button"));
    scrollTo.mockClear();
    resize(390); // the Album laid itself out: the page is taller now
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 900, behavior: "instant" });
    scrollTo.mockClear();
    scrollY = 1500; // the visitor scrolled meanwhile: leave the page where it is
    resize(390);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("Tablet = the 430 authority remapped: same run, same Album table DOM; only the CSS-px lengths scale by W / 430", async () => {
    const at = async (w: number) => {
      const { root } = await mountAt(w, 9);
      const gallery = mobileGallery(root)!;
      await waitFor(() => expect(gallery.dataset.galleryOutcome).toBe("resolved"));
      const scene = gallery.querySelector<HTMLElement>("[data-testid=a13-mobile-scene]")!;
      const prints = [...scene.querySelectorAll<HTMLElement>("[data-slot-id]")].map((e) => e.outerHTML);
      const cta = scene.querySelector<HTMLElement>("[data-testid=cta-7plus]")!.getAttribute("style");
      const canvas = scene.querySelector<HTMLElement>("[data-a13-mobile-canvas]")!.outerHTML.length;
      const title = scene.querySelector<HTMLElement>("[data-testid=title-block]")!;
      const sep = title.querySelector("svg")!;
      const block = { top: parseFloat(title.style.top), width: parseFloat(title.style.width), height: parseFloat(title.style.height), font: parseFloat(title.querySelector("h2")!.style.fontSize), sepW: Number(sep.getAttribute("width")), viewBox: sep.getAttribute("viewBox") };
      fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
      const album = root.querySelector<HTMLElement>("[data-testid=a13-mobile-full-album]")!;
      await waitFor(() => expect(album.dataset.albumStatus).toBe("PASS"));
      const table = album.querySelector<HTMLElement>("[data-testid=album-memory-table]")!.outerHTML;
      const remap = scene.style.getPropertyValue("--a13-remap");
      cleanup();
      return { prints, cta, canvas, block, table, remap };
    };
    const m = await at(430);
    expect(m.prints).toHaveLength(6);
    expect(m.cta).toMatch(/var\(--k\)/);
    expect(Math.min(m.block.width, m.block.height, m.block.font, m.block.sepW)).toBeGreaterThan(0);
    for (const w of [431, 768, 1023]) {
      const t = await at(w);
      const r = w / 430;
      expect(t.prints, String(w)).toEqual(m.prints);
      expect(t.cta, String(w)).toBe(m.cta);
      expect(t.table, String(w)).toBe(m.table);
      expect(Number(t.remap), String(w)).toBeCloseTo(r, 12);
      expect(t.block.viewBox).toBe(m.block.viewBox);
      for (const k of ["top", "width", "height", "font", "sepW"] as const) expect(t.block[k], `${w} ${k}`).toBeCloseTo(m.block[k] * r, 9);
    }
    expect(m.remap).toBe("");
  });

  it("1023 → 1024 in the Album: atomic family switch (no hybrid), same view, same family order, same theme; back to a working Gallery", async () => {
    const { media, root } = await mountAt(1023, 8, "dark");
    await waitFor(() => expect(mobileGallery(root)!.dataset.galleryOutcome).toBe("resolved"));
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    resize(1024);
    expect(root.dataset.a13Family).toBe("horizontal");
    expect(root.dataset.galleryView).toBe("album");
    expect(root.querySelector("[data-testid=a13-mobile-full-album], [data-testid=a13-mobile-gallery]")).toBeNull();
    const table = root.querySelector<HTMLElement>("[data-memorial-gallery-album] [data-testid=album-memory-table]")!;
    expect(table.dataset.a13Theme).toBe("dark");
    expect([...table.querySelectorAll("[data-print] img")].map((i) => i.getAttribute("src"))).toEqual(media.map((m) => m.src));
    fireEvent.click(root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!);
    const gallery = desktopGallery(root)!;
    await waitFor(() => expect(gallery.dataset.galleryState).toBe("G6_SIGNATURE_7PLUS"));
    expect(gallery.querySelector("[data-testid=a13-pilot-scene]")!.getAttribute("data-a13-theme")).toBe("dark");
    resize(1023);
    expect(root.dataset.a13Family).toBe("tablet");
    expect(desktopGallery(root)).toBeNull();
    await waitFor(() => expect(mobileGallery(root)!.dataset.galleryOutcome).toBe("resolved"));
  });
});
