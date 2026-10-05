// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import type { Language } from "@/config/languages";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import type { A13FlowCaptionSet } from "@/lib/memorial/a13-desktop-flow-fixtures";

/**
 * Dette D5 — the A13 Desktop sections speak the active language (FR / EN /
 * ES) for HERITAGE product text only: CTA, print position names, Album
 * name, Viewer dialog name and close button. Family content (captions,
 * alt texts, title/subtitle received from the host) is rendered as is,
 * whatever the language, and the geometry never depends on the language.
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
// The Viewer's shared caption primitive needs layout (jsdom has none): one line per caption, 11.5 px per character at 27 px.
vi.mock("@/lib/memorial/viewer/viewer-caption-measure", async (orig) => {
  const gate = { ready: true, family: "La Belle Aurore", style: "normal", weight: "400", spec: "", faces: [] };
  return {
    ...(await orig<typeof import("@/lib/memorial/viewer/viewer-caption-measure")>()),
    awaitViewerCaptionFont: async () => gate,
    viewerCaptionFontStatus: () => gate,
    createViewerCaptionMeasure: () => ({
      element: document.createElement("div"),
      wrap: (text: string, fs: number, lh: number, width: number) => ({ lines: [{ text, start: 0, end: text.length, x: 0, y: 0, width: Math.min(width, ([...text].length * 11.5 * fs) / 27), height: lh }] }),
    }),
  };
});
vi.mock("@/lib/memorial/gallery/title-glyph-mask", async (orig) => ({
  ...(await orig<typeof import("@/lib/memorial/gallery/title-glyph-mask")>()),
  measureTitleGlyphMask: async () => ({ mask: MASK, heading: R.headingInkReference, microcopy: R.microcopyInkReference, fontsChecked: true, deviationPx: { heading: 0, microcopy: 0 } }),
}));

const { A13DesktopGallery } = await import("@/components/memorial/gallery/A13DesktopGallery");
const { A13DesktopFullAlbum } = await import("@/components/memorial/album/A13DesktopFullAlbum");
const { a13FamilyFixture } = await import("@/lib/memorial/a13-desktop-flow-fixtures");

const TITLE = "Souvenirs de famille";
const SUBTITLE = "Les instants que nous gardons près de nous";
const LANGS: Language[] = ["fr", "en", "es"];
const EXPECTED = {
  fr: { cta: "Voir plus de souvenirs", position: (i: number, n: number) => `Souvenir ${i} sur ${n}`, album: "Album de souvenirs", close: "Fermer le souvenir", dialog: (s: string) => `Souvenir — ${s}` },
  en: { cta: "See more memories", position: (i: number, n: number) => `Memory ${i} of ${n}`, album: "Memory album", close: "Close memory", dialog: (s: string) => `Memory — ${s}` },
  es: { cta: "Ver más recuerdos", position: (i: number, n: number) => `Recuerdo ${i} de ${n}`, album: "Álbum de recuerdos", close: "Cerrar el recuerdo", dialog: (s: string) => `Recuerdo — ${s}` },
} as const;

beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", { value: 1670, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 941, configurable: true });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

async function gallery(n: number, captions: A13FlowCaptionSet, language: Language) {
  const view = render(<A13DesktopGallery media={a13FamilyFixture(n, captions)} theme="light" title={TITLE} subtitle={SUBTITLE} language={language} onSeeMore={() => {}} />);
  const root = view.container.querySelector<HTMLElement>("[data-testid=a13-desktop-gallery]")!;
  await waitFor(() => expect(root.dataset.galleryOutcome).toBe("resolved"));
  const scene = root.querySelector<HTMLElement>(":scope > [data-testid=a13-pilot-scene]")!;
  return { root, scene, prints: [...scene.querySelectorAll<HTMLElement>("[data-print][role=button]")] };
}
async function album(n: number, captions: A13FlowCaptionSet, language: Language) {
  const view = render(<A13DesktopFullAlbum media={a13FamilyFixture(n, captions)} theme="light" language={language} />);
  const table = view.container.querySelector<HTMLElement>("[data-testid=album-memory-table]")!;
  return { table, prints: [...table.querySelectorAll<HTMLElement>("[data-print][role=button]")] };
}
async function openViewer(print: HTMLElement) {
  fireEvent.click(print);
  await waitFor(() => expect(document.querySelector("[data-a13-viewer]")?.getAttribute("data-viewer-state")).toBe("open"));
  const v = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
  return { dialog: v.querySelector<HTMLElement>("[role=dialog]")!, close: v.querySelector<HTMLElement>("[data-viewer-close]")!, v };
}
/** Everything but the product text (accessible names, lang, CTA label): the language must not change it. */
function withoutProductText(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
    el.removeAttribute("aria-label");
    el.removeAttribute("lang");
  }
  const label = clone.querySelector("[data-testid=cta-7plus-label]");
  if (label) label.textContent = "";
  return clone.innerHTML;
}

describe("D5 — Gallery speaks the active language", () => {
  for (const l of LANGS)
    it(`${l}: Signature 7+ CTA label and lang; print names = position label when no caption`, async () => {
      const { root, prints } = await gallery(7, "aucune", l);
      const cta = root.querySelector<HTMLElement>("[data-testid=cta-7plus]")!;
      expect(cta.textContent).toBe(EXPECTED[l].cta);
      expect(cta.getAttribute("lang")).toBe(l);
      expect(prints.map((p) => p.getAttribute("aria-label"))).toEqual([1, 2, 3, 4, 5, 6].map((i) => EXPECTED[l].position(i, 6)));
    });

  it("G2–G5 (V2) prints without caption take the position label of the active language", async () => {
    for (const l of LANGS) {
      const { prints } = await gallery(3, "aucune", l);
      expect(prints.map((p) => p.getAttribute("aria-label"))).toEqual([1, 2, 3].map((i) => EXPECTED[l].position(i, 3)));
      cleanup();
    }
  });

  it("family content is never translated: captions, caption-named prints, alt texts, title and subtitle are identical in FR / EN / ES", async () => {
    const media = a13FamilyFixture(8, "mixte");
    const seen: string[] = [];
    for (const l of LANGS) {
      const { root, scene, prints } = await gallery(8, "mixte", l);
      const alts = prints.map((p) => p.querySelector("img")!.getAttribute("alt"));
      expect(alts).toEqual(media.slice(0, 6).map((m) => m.alt));
      const captioned = prints.filter((_, i) => media[i].caption);
      expect(captioned.length).toBeGreaterThan(0);
      captioned.forEach((p) => {
        const i = prints.indexOf(p);
        const text = p.querySelector("figcaption")!.textContent!;
        // the family caption, as written, is the print's name — never a product text
        expect(text.replace(/\s+/g, " ")).toBe(media[i].caption!.replace(/\s+/g, " "));
        expect(p.getAttribute("aria-label")).toBe(text);
      });
      expect(scene.textContent).toContain(TITLE);
      expect(scene.textContent).toContain(SUBTITLE);
      seen.push(JSON.stringify([captioned.map((p) => p.getAttribute("aria-label")), alts]));
      // Geometry and family DOM: identical to FR once the product text is removed.
      seen.push(withoutProductText(root));
      cleanup();
    }
    expect(seen[2]).toBe(seen[0]);
    expect(seen[4]).toBe(seen[0]);
    expect(seen[3]).toBe(seen[1]);
    expect(seen[5]).toBe(seen[1]);
  });
});

describe("D5 — Album speaks the active language", () => {
  for (const l of LANGS)
    it(`${l}: section name and position labels`, async () => {
      const { table, prints } = await album(9, "aucune", l);
      expect(table.getAttribute("aria-label")).toBe(EXPECTED[l].album);
      expect(prints.map((p) => p.getAttribute("aria-label"))).toEqual(Array.from({ length: 9 }, (_, i) => EXPECTED[l].position(i + 1, 9)));
    });

  it("captions and alt texts unchanged across languages; layout unchanged", async () => {
    const out: string[] = [];
    for (const l of LANGS) {
      const { table, prints } = await album(12, "mixte", l);
      out.push(JSON.stringify(prints.map((p) => [p.querySelector("img")!.getAttribute("alt"), p.querySelector("figcaption")?.textContent ?? null])));
      out.push(withoutProductText(table));
      cleanup();
    }
    expect(out[2]).toBe(out[0]);
    expect(out[4]).toBe(out[0]);
    expect(out[3]).toBe(out[1]);
    expect(out[5]).toBe(out[1]);
  });
});

describe("D5 — Viewer speaks the active language", () => {
  for (const l of LANGS)
    it(`${l}: dialog name = product prefix + untranslated caption; close button name`, async () => {
      const media = a13FamilyFixture(12, "32");
      const { prints } = await album(12, "32", l);
      const { dialog, close, v } = await openViewer(prints[4]);
      expect(dialog.getAttribute("aria-label")).toBe(EXPECTED[l].dialog(media[4].caption!));
      expect(close.getAttribute("aria-label")).toBe(EXPECTED[l].close);
      expect(v.querySelector("[data-viewer-caption]")!.textContent).toBe(media[4].caption);
      expect(v.querySelector("[data-viewer-photo]")!.getAttribute("alt")).toBe(media[4].alt);
    });

  it("without caption, the dialog name carries the untranslated alt text; Gallery origin too", async () => {
    for (const l of LANGS) {
      const media = a13FamilyFixture(7, "aucune");
      const { prints } = await gallery(7, "aucune", l);
      const { dialog, close } = await openViewer(prints[2]);
      expect(dialog.getAttribute("aria-label")).toBe(EXPECTED[l].dialog(media[2].alt));
      expect(close.getAttribute("aria-label")).toBe(EXPECTED[l].close);
      cleanup();
      document.body.innerHTML = "";
    }
  });
});
