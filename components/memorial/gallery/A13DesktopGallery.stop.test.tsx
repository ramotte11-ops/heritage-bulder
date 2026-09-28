// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * Dette D7 — the Gallery section on a V2 STOP (real solver, adversarial
 * title mask covering the canvas): no Gallery rendered, no crash, no
 * technical text for the visitor, outcome exposed, anomaly logged once.
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
const WALL = maskFromRects([{ x0: 0, y0: 0, x1: 1669, y1: 940 }]);
// Stable object, like the real hook's state (a fresh object per render would re-run every effect).
const FONT = { measurer: fake, fontFamily: "La Belle Aurore", fontCheck: true, faces: [] };
vi.mock("@/lib/memorial/gallery/use-caption-measurer", () => ({
  useCaptionMeasurer: () => FONT,
}));
vi.mock("@/lib/memorial/gallery/title-glyph-mask", async (orig) => ({
  ...(await orig<typeof import("@/lib/memorial/gallery/title-glyph-mask")>()),
  measureTitleGlyphMask: async () => ({ mask: WALL, heading: { xMin: 0, xMax: 1669, yMin: 0, yMax: 940 }, microcopy: { xMin: 0, xMax: 1669, yMin: 0, yMax: 940 }, fontsChecked: true, deviationPx: { heading: 0, microcopy: 0 } }),
}));

const { A13DesktopGallery } = await import("./A13DesktopGallery");
const { a13FamilyFixture } = await import("@/lib/memorial/a13-desktop-flow-fixtures");

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

function mount(n: number) {
  const onRun = vi.fn();
  const onSeeMore = vi.fn();
  const view = render(<A13DesktopGallery media={a13FamilyFixture(n, "mixte")} theme="light" title="Souvenirs de famille" subtitle="Les instants" ctaLabel={{ text: "Voir plus de souvenirs", lang: "fr" }} onSeeMore={onSeeMore} onRun={onRun} />);
  return { root: view.container.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!, onRun };
}
const scene = (root: HTMLElement) => root.querySelector(":scope > [data-testid=a13-pilot-scene]");

describe("A13 Desktop Gallery — V2 STOP policy (D7)", () => {
  it("G2–G5 STOP: unresolved, no Gallery (no empty scene, no placeholder, no print, no CTA), logged once, no visitor text", async () => {
    for (const n of [2, 3, 4, 5]) {
      errorSpy.mockClear();
      const { root, onRun } = mount(n);
      await waitFor(() => expect(root.dataset.galleryOutcome).toBe("unresolved"));
      expect(root.dataset.galleryState).toBe(["G2", "G3", "G4", "G5"][n - 2]);
      expect(root.dataset.galleryStatus).toBe("TITLE_COLLISION_STOP");
      expect(scene(root)).toBeNull();
      expect(root.querySelector("[data-testid=a13-desktop-gallery-pending]")).toBeNull();
      expect(root.querySelectorAll("[role=button]")).toHaveLength(0);
      expect(root.querySelector("[data-testid=cta-7plus]")).toBeNull();
      const visibleText = [...root.childNodes].filter((c) => !(c instanceof HTMLElement && (c.getAttribute("aria-hidden") === "true" || c.hasAttribute("inert")))).map((c) => c.textContent).join("");
      expect(visibleText).not.toMatch(/STOP|TITLE|solveV2|V2/);
      // logged by a passive effect: wait for it, then check it happened exactly once
      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0].join(" "))).toMatch(/TITLE_COLLISION_STOP/);
      expect(onRun.mock.calls.at(-1)![0]).toMatchObject({ outcome: "unresolved", entries: [], hasCta: false });
      cleanup();
    }
  });

  it("0–1 media: absent (not unresolved), nothing logged", async () => {
    for (const n of [0, 1]) {
      errorSpy.mockClear();
      const { root } = mount(n);
      await waitFor(() => expect(root.dataset.galleryOutcome).toBe("absent"));
      expect(scene(root)).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("G6 / Signature 7+ are unaffected (not V2): resolved, rendered, nothing logged", async () => {
    for (const n of [6, 7]) {
      errorSpy.mockClear();
      const { root } = mount(n);
      await waitFor(() => expect(root.dataset.galleryOutcome).toBe("resolved"));
      expect(scene(root)!.querySelectorAll("[data-print][role=button]")).toHaveLength(6);
      expect(!!root.querySelector("[data-testid=cta-7plus]")).toBe(n >= 7);
      expect(errorSpy).not.toHaveBeenCalled();
      cleanup();
    }
  });
});
