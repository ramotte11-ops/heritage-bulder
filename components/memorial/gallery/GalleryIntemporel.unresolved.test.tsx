// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * GO PO / QG 23/10/2026 — « Voir plus de souvenirs » on Mobile: an Album
 * the engine cannot compose never leaves the visitor in front of an empty
 * Album (the next section in its place). The STOP is forced here through
 * the engine module (no realistic composition is refused any more since the
 * P3 portrait fallback), the rest is the real host and the real sections.
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

const engine = vi.hoisted(() => ({ solveStop: false, layoutStop: false }));
vi.mock("@/lib/memorial/album/album-mobile-layout", async (orig) => {
  const real = await orig<typeof import("@/lib/memorial/album/album-mobile-layout")>();
  return {
    ...real,
    solveAlbumMobileGeometry: (...args: Parameters<typeof real.solveAlbumMobileGeometry>) => {
      const g = real.solveAlbumMobileGeometry(...args);
      return engine.solveStop ? { ...g, status: "ITEM_INACCESSIBLE" as const } : g;
    },
    layoutAlbumMobile: (...args: Parameters<typeof real.layoutAlbumMobile>) => {
      const l = real.layoutAlbumMobile(...args);
      return engine.layoutStop ? { ...l, status: "ITEM_INACCESSIBLE" as const } : l;
    },
  };
});

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


beforeEach(() => {
  engine.solveStop = false;
  engine.layoutStop = false;
});

async function mountAt(w: number, n: number, mutate: (media: ReturnType<typeof a13FamilyFixture>) => void = () => {}) {
  sectionWidth = w;
  const media = a13FamilyFixture(n, "mixte");
  mutate(media);
  const view = render(<GalleryIntemporel media={media} theme="light" title="Souvenirs de famille" subtitle="Les instants que nous gardons près de nous" language="fr" />);
  const root = view.container.querySelector<HTMLElement>("[data-memorial-gallery]")!;
  const gallery = root.querySelector<HTMLElement>("[data-testid=a13-mobile-gallery]")!;
  await waitFor(() => expect(gallery.dataset.galleryOutcome).toBe("resolved"));
  return { media, root, gallery, cta: root.querySelector<HTMLButtonElement>("[data-testid=cta-7plus]")! };
}

describe("« Voir plus de souvenirs » — Mobile, Small Mobile and Tablet", () => {
  it("A: a 3rd photograph narrower than 3:4 (2:3, a 9:19.5 screenshot) now opens the full Album, every photograph in family order", { timeout: 240000 }, async () => {
    for (const w of [360, 390, 768])
      for (const [tw, th] of [
        [1200, 1800],
        [1170, 2532],
      ]) {
        const { media, root, cta } = await mountAt(w, 9, (m) => {
          m[2] = { ...m[2], width: tw, height: th };
        });
        fireEvent.click(cta);
        expect(root.dataset.galleryView, `${w} ${tw}×${th}`).toBe("album");
        const album = root.querySelector<HTMLElement>("[data-memorial-gallery-album] [data-testid=a13-mobile-full-album]")!;
        await waitFor(() => expect(album.dataset.albumStatus, `${w} ${tw}×${th}`).toBe("PASS"));
        const srcs = [...album.querySelectorAll<HTMLElement>("[data-testid=album-memory-table] [data-print][role=button] img")].map((i) => i.getAttribute("src"));
        expect(srcs).toEqual(media.map((m) => m.src));
        cleanup();
      }
  });

  it("B: a composition the engine refuses — the CTA leaves the Gallery in place (never parked), no Album, focus on the CTA, no scroll", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { root, gallery, cta } = await mountAt(390, 9);
    engine.solveStop = true;
    scrollY = 900;
    cta.focus();
    scrollTo.mockClear();
    fireEvent.click(cta);
    expect(root.dataset.galleryView).toBe("gallery");
    expect(gallery.parentElement!.dataset.memorialGalleryScene).toBe("shown");
    expect(root.querySelector("[data-memorial-gallery-album]")).toBeNull();
    expect(document.activeElement).toBe(cta);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Gallery: Mobile Album composition unresolved — the Gallery stays shown.");
    error.mockRestore();
  });

  it("B: an Album that still reports a STOP once open returns to the Gallery exactly like « Retour » (scroll restored, focus on the CTA)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { root, gallery, cta } = await mountAt(390, 9);
    engine.layoutStop = true;
    scrollY = 900;
    fireEvent.click(cta);
    await waitFor(() => expect(root.dataset.galleryView).toBe("gallery"));
    expect(gallery.parentElement!.dataset.memorialGalleryScene).toBe("shown");
    expect(root.querySelector("[data-memorial-gallery-album]")).toBeNull();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 900, behavior: "instant" });
    expect(document.activeElement).toBe(cta);
    error.mockRestore();
  });

  it("the Desktop families are not concerned: the CTA opens the Desktop Album without consulting the Mobile engine", async () => {
    sectionWidth = 1280;
    engine.solveStop = true;
    const media = a13FamilyFixture(9, "mixte");
    const view = render(<GalleryIntemporel media={media} theme="light" title="Souvenirs de famille" subtitle="Les instants que nous gardons près de nous" language="fr" />);
    const root = view.container.querySelector<HTMLElement>("[data-memorial-gallery]")!;
    const desktop = root.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!;
    await waitFor(() => expect(desktop.dataset.galleryOutcome).toBe("resolved"), { timeout: 60000 });
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    expect(root.dataset.galleryView).toBe("album");
  });
});
