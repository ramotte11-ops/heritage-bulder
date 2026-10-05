// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import type { MediaRequest, ResolvedMedia } from "@/lib/memorial/assembly/media-resolver";

/**
 * Dettes D2–D4 — the Preview's own rendering path, end to end in jsdom:
 * draft content (with content.gallery) → assembleMemorial → MemorialAssembly
 * → the REAL renderers, the Gallery among them (GalleryIntemporel → A13).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
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

const { MemorialAssembly } = await import("./MemorialAssembly");
const { assembleMemorial } = await import("@/lib/memorial/assembly/assemble-memorial");
const { updateGallery } = await import("@/lib/memorial/gallery-content");
const { FIXTURE_READ_URL, fullAnnouncement, recordingResolver } = await import("@/lib/memorial/assembly/test-fixtures");

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-00000000000${n % 10}`;

// jsdom has no layout: the Gallery section measures its own width (A13 Responsive Bridge V1) — a Desktop Preview here.
const nativeRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
  const r = nativeRect.call(this);
  if (!this.matches("[data-memorial-gallery]")) return r;
  const box = { x: r.x, y: r.y, left: r.left, top: r.top, width: 1670, height: r.height, right: r.left + 1670, bottom: r.bottom };
  return { ...box, toJSON: () => box } as DOMRect;
};

beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", { value: 1670, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 941, configurable: true });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

async function renderPreviewAssembly(n: number, skinVariant: "light" | "dark" = "light") {
  const base = fullAnnouncement();
  const written = updateGallery(base, { items: Array.from({ length: n }, (_, i) => ({ mediaId: id(i + 1), caption: i === 1 ? "Tous les deux" : null })) });
  if (!written.ok) throw new Error(written.reason);
  const heroId = (base.hero as { photo: { mediaId: string } }).photo.mediaId;
  const resolver = recordingResolver((r: MediaRequest): ResolvedMedia | null => {
    if (r.mediaId === heroId) return r.purpose === "hero" ? { mediaId: r.mediaId, readUrl: FIXTURE_READ_URL } : null;
    return r.purpose === "gallery" ? { mediaId: r.mediaId, readUrl: `${FIXTURE_READ_URL}/${r.mediaId}`, width: 1200, height: 1600 } : null;
  });
  const assembled = await assembleMemorial({ editorialContext: "announcement", skin: "intemporel", skinVariant, language: "fr", content: written.content as MemorialContent }, { resolveMedia: resolver.resolve });
  const view = render(<MemorialAssembly assembled={assembled} />);
  return { assembled, resolver, container: view.container };
}

describe("the Preview's rendering path mounts the Gallery as a Memorial section", () => {
  it("7 photographs: sections in canonical order; the Gallery is Signature 7+ with its CTA; one <h1> (the Hero's)", async () => {
    const { container, resolver } = await renderPreviewAssembly(7);
    const sections = [...container.querySelectorAll("[data-memorial-section]")].map((el) => el.getAttribute("data-memorial-section"));
    expect(sections).toEqual(["hero", "deathNotice", "story", "ceremony", "gallery"]);
    const gallery = container.querySelector<HTMLElement>("[data-memorial-section=gallery] [data-testid=a13-desktop-gallery]")!;
    await waitFor(() => expect(gallery.dataset.galleryState).toBe("G6_SIGNATURE_7PLUS"));
    expect(gallery.querySelector("[data-testid=cta-7plus]")!.textContent).toBe("Voir plus de souvenirs");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(resolver.calls.filter((c) => c.purpose === "gallery").map((c) => c.mediaId)).toEqual(Array.from({ length: 7 }, (_, i) => id(i + 1)));
  });

  it("6 photographs: G6 exact, no CTA; the CTA → Album → back cycle works inside the assembled Memorial for 7+", async () => {
    const six = await renderPreviewAssembly(6);
    const g6 = six.container.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!;
    await waitFor(() => expect(g6.dataset.galleryState).toBe("G6"));
    expect(six.container.querySelector("[data-testid=cta-7plus]")).toBeNull();
    cleanup();

    const eight = await renderPreviewAssembly(8, "dark");
    const root = eight.container.querySelector<HTMLElement>("[data-memorial-gallery]")!;
    await waitFor(() => expect(root.querySelector("[data-testid=cta-7plus]")).not.toBeNull());
    expect(root.querySelector("[data-testid=a13-pilot-scene]")!.getAttribute("data-a13-theme")).toBe("dark");
    fireEvent.click(root.querySelector("[data-testid=cta-7plus]")!);
    expect(root.querySelectorAll("[data-testid=album-memory-table] [data-print]")).toHaveLength(8);
    expect(root.querySelector("[data-testid=album-memory-table]")!.getAttribute("data-a13-theme")).toBe("dark");
    fireEvent.click(root.querySelector<HTMLButtonElement>("[data-memorial-gallery-album] button")!);
    expect(document.activeElement).toBe(root.querySelector("[data-testid=cta-7plus]"));
  });

  it("the alt of a print without caption is the localized position label; a caption stays the family's own words", async () => {
    const { container } = await renderPreviewAssembly(7);
    const gallery = container.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!;
    await waitFor(() => expect(gallery.dataset.galleryOutcome).toBe("resolved"));
    const alts = [...gallery.querySelectorAll(":scope > [data-testid=a13-pilot-scene] [data-print] img")].map((img) => img.getAttribute("alt"));
    expect(alts[0]).toBe("Souvenir 1 sur 7");
    expect(alts[1]).toBe("Tous les deux");
  });
});
