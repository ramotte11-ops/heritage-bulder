// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import type { Media } from "@/types/media";
import {
  HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME,
  HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME,
  HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME,
  HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME,
  HERO_INTEMPOREL_MOBILE_SEPARATOR_GEOMETRY,
  HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT,
  HERO_INTEMPOREL_RUNTIME_MASTER_SPECS,
} from "@/config/hero-intemporel-tokens";
import { heroMobileLightPhotoCssTransform } from "@/lib/memorial/hero-mobile-light-photo-runtime";

/**
 * Mission 035 v4 (Studio V3 FINAL runtime masters) — contract tests for
 * the runtime-master Hero Intemporel renderer. Same discipline as every
 * other Guided Flow component test in this codebase: state/render
 * contracts, never computed CSS/pixel layout from the real browser
 * engine — except where a geometric proof is warranted (the "no
 * rotation anywhere" guard below), which stays a pure source-level check
 * rather than a real-browser measurement.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { HeroIntemporel, fitMobileContractName } = await import("./HeroIntemporel");

afterEach(cleanup);

const MEDIA_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";

const MEDIA: Media = {
  id: MEDIA_ID,
  memorialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "11111111-1111-4111-8111-111111111111",
  storagePath: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${MEDIA_ID}/original.jpg`,
  mediaType: "photo",
  purpose: "hero",
  status: "ready",
  mimeType: "image/jpeg",
  originalFilename: null,
  sizeBytes: 12345,
  width: null,
  height: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PHOTO = { media: MEDIA, readUrl: "https://storage.test/signed/reveal" };

const FULL_HERO: HeroContent = {
  displayName: "Jean Dupont",
  birth: { precision: "year", year: 1948 },
  death: { precision: "year", year: 2023 },
  shortPhrase: "Toujours dans nos cœurs",
  photo: { mediaId: MEDIA_ID, crop: { focalX: 0.5, focalY: 0.5, zoom: 1 } },
};

function renderHero(overrides: Partial<React.ComponentProps<typeof HeroIntemporel>> = {}) {
  return render(
    <HeroIntemporel
      hero={FULL_HERO}
      photo={PHOTO}
      skinVariant="light"
      editorialContext="remembrance"
      language="fr"
      {...overrides}
    />,
  );
}

describe("HeroIntemporel — the Studio's own runtime masters, nothing recomposed", () => {
  it("renders both the light desktop and light mobile masters (one hidden by CSS, the DOM stays single)", () => {
    const { container } = renderHero({ skinVariant: "light" });

    expect(container.querySelector('img[src*="hero-runtime-light-desktop.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="hero-runtime-light-mobile.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="dark"]')).toBeNull();
  });

  it("renders the dark masters when skinVariant is dark", () => {
    const { container } = renderHero({ skinVariant: "dark" });

    expect(container.querySelector('img[src*="hero-runtime-dark-desktop.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="hero-runtime-dark-mobile.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="light"]')).toBeNull();
  });

  it("never draws a paper, botanical, postcard, seal, or paperclip asset of its own", () => {
    const { container } = renderHero();

    const sources = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    for (const src of sources) {
      expect(src).not.toMatch(/paper|botanical|postcard|seal|paperclip|deckled/i);
    }
  });
});

describe("HeroIntemporel — photo window geometry (mission 035 v4, section 4)", () => {
  it.each(["light", "dark"] as const)(
    "positions the %s desktop photo window from the manifest's own photoWindowPx, as a percentage of the master canvas",
    (variant) => {
      const spec = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS[variant].desktop;
      const { container } = renderHero({ skinVariant: variant });

      const window_ = container.querySelector('[class*="photoWindow"]') as HTMLElement;
      expect(window_).toBeTruthy();

      const [canvasW, canvasH] = spec.dimensionsPx;
      const expectedLeftPct = (spec.photoWindowPx.x / canvasW) * 100;
      const expectedTopPct = (spec.photoWindowPx.y / canvasH) * 100;
      const expectedWidthPct = (spec.photoWindowPx.width / canvasW) * 100;
      const expectedHeightPct = (spec.photoWindowPx.height / canvasH) * 100;

      expect(window_.style.getPropertyValue("--win-xd")).toBe(`${expectedLeftPct}%`);
      expect(window_.style.getPropertyValue("--win-yd")).toBe(`${expectedTopPct}%`);
      expect(window_.style.getPropertyValue("--win-wd")).toBe(`${expectedWidthPct}%`);
      expect(window_.style.getPropertyValue("--win-hd")).toBe(`${expectedHeightPct}%`);
    },
  );

  it("carries the mobile window's own (different) geometry alongside the desktop one, switched by CSS alone", () => {
    const spec = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS.light.mobile;
    const { container } = renderHero({ skinVariant: "light" });

    const window_ = container.querySelector('[class*="photoWindow"]') as HTMLElement;
    const [canvasW, canvasH] = spec.dimensionsPx;
    const expectedWidthPct = (spec.photoWindowPx.width / canvasW) * 100;
    const expectedHeightPct = (spec.photoWindowPx.height / canvasH) * 100;

    expect(window_.style.getPropertyValue("--win-wm")).toBe(`${expectedWidthPct}%`);
    expect(window_.style.getPropertyValue("--win-hm")).toBe(`${expectedHeightPct}%`);
    // Desktop and mobile geometry differ — both live on the same element,
    // only the 960px breakpoint (in CSS, not here) picks which applies.
    expect(canvasH).not.toBe(HERO_INTEMPOREL_RUNTIME_MASTER_SPECS.light.desktop.dimensionsPx[1]);
  });

  it("every photo window is 4:5, matching the Studio's own ratio for all 4 masters", () => {
    for (const variant of ["light", "dark"] as const) {
      for (const format of ["desktop", "mobile"] as const) {
        const { width, height } = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS[variant][format].photoWindowPx;
        expect(width / height).toBeCloseTo(4 / 5, 2);
      }
    }
  });
});

describe("HeroIntemporel — Handoff V1.2 Mobile Light photo runtime", () => {
  const CSS_SOURCE = readFileSync(
    path.resolve(import.meta.dirname, "HeroIntemporel.module.css"),
    "utf8",
  );

  it("renders the authoritative projected/masked layer and CLEAN plate only for the light variant", () => {
    const { container, rerender } = renderHero({ skinVariant: "light" });

    const projected = container.querySelector('[data-hero-mobile-light-layer="projected-masked-photo"]');
    const plate = container.querySelector('[data-hero-mobile-light-layer="clean-plate"]') as HTMLImageElement;
    const mask = projected?.querySelector("mask image");
    expect(projected?.getAttribute("viewBox")).toBe("0 0 941 1672");
    expect(mask?.getAttribute("href")).toBe(HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.maskSrc);
    expect(plate.src).toContain(HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.plateSrc);

    rerender(
      <HeroIntemporel
        hero={FULL_HERO}
        photo={PHOTO}
        skinVariant="dark"
        editorialContext="remembrance"
        language="fr"
      />,
    );
    expect(container.querySelector('[data-hero-mobile-light-layer="projected-masked-photo"]')).toBeNull();
    expect(container.querySelector('[data-hero-mobile-light-layer="clean-plate"]')).toBeNull();
  });

  it("uses the exact homography matrix on the logical 4:5 raster", () => {
    const { container } = renderHero();
    const raster = container.querySelector('[class*="mobileLightLogicalRaster"]') as HTMLElement;
    expect(raster.style.transform).toBe(heroMobileLightPhotoCssTransform());
  });

  it("preserves the saved Builder crop as the single upstream 4:5 framing decision", () => {
    const hero: HeroContent = {
      ...FULL_HERO,
      photo: { mediaId: MEDIA_ID, crop: { focalX: 0.2, focalY: 0.8, zoom: 1.75 } },
    };
    const { container } = renderHero({ hero });
    const photos = Array.from(container.querySelectorAll(`img[src="${PHOTO.readUrl}"]`)) as HTMLElement[];
    expect(photos).toHaveLength(3);
    expect(new Set(photos.map((photo) => photo.getAttribute("style"))).size).toBe(1);
    expect(photos[0].style.width).not.toBe("100%");
  });

  it("keeps the contractual paint order: photo, CLEAN plate, then dynamic content", () => {
    const { container } = renderHero();
    const photoLayer = container.querySelector('[data-hero-mobile-light-layer="projected-masked-photo"]')!;
    const plateLayer = container.querySelector('[data-hero-mobile-light-layer="clean-plate"]')!;
    const contentLayer = container.querySelector('[data-hero-mobile-light-layer="dynamic-content"]')!;

    expect(photoLayer.compareDocumentPosition(plateLayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plateLayer.compareDocumentPosition(contentLayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(contentLayer.textContent).toContain("Jean Dupont");
    expect(contentLayer.textContent).toContain("1948 – 2023");
  });

  it("loads no QA, witness, Studio-authority or isolated-paperclip asset at runtime", () => {
    const { container } = renderHero();
    const assetReferences = [
      ...Array.from(container.querySelectorAll("img")).map((node) => node.getAttribute("src")),
      ...Array.from(container.querySelectorAll("image")).map((node) => node.getAttribute("href")),
    ].filter((value): value is string => value !== null);

    for (const reference of assetReferences) {
      expect(reference).not.toMatch(/\/qa\/|studio_authority|paperclip_foreground/i);
    }
  });

  it("scopes the replacement to Light at exactly the contracted 320–430px band", () => {
    expect(CSS_SOURCE).toContain("@media (min-width: 320px) and (max-width: 430px)");
    expect(CSS_SOURCE).toContain('[data-heritage-skin-variant="light"] .mobileLightPhotoRuntime');
    expect(CSS_SOURCE).toContain('[data-heritage-skin-variant="light"] .mobileLightRuntimePlate');
    expect(CSS_SOURCE).not.toContain('[data-heritage-skin-variant="dark"] .mobileLightPhotoRuntime');
  });

  it("negative control: reversing photo and plate is rejected by the paint-order assertion", () => {
    const assertPaintOrder = (layers: readonly string[]) => {
      expect(layers).toEqual(["projected-masked-photo", "clean-plate", "dynamic-content"]);
    };
    expect(() => assertPaintOrder(["clean-plate", "projected-masked-photo", "dynamic-content"])).toThrow();
  });

  it("negative control: bbox/contain/stretch/isolated-paperclip/raster-text alternatives are absent", () => {
    const { container } = renderHero({ skinVariant: "light" });
    const projected = container.querySelector('[data-hero-mobile-light-layer="projected-masked-photo"]');
    const SOURCE = readFileSync(path.resolve(import.meta.dirname, "HeroIntemporel.tsx"), "utf8");
    expect(projected?.querySelector("clipPath")).toBeNull();
    expect(projected?.querySelector("mask image")).toBeTruthy();
    expect(SOURCE).not.toMatch(/objectFit:\s*["']contain|paperclip_foreground|Élise Martin/);
    expect(SOURCE).toContain("maskSrc");
    expect(SOURCE).toContain("resolveHeroCropGeometry");
  });
});

describe("HeroIntemporel — Mobile Dark V2 Handoff Runtime V1", () => {
  const CSS_SOURCE = readFileSync(
    path.resolve(import.meta.dirname, "HeroIntemporel.module.css"),
    "utf8",
  );

  it("paints the projected family photo, authoritative overlay, then dynamic content", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    const layers = Array.from(container.querySelectorAll("[data-hero-mobile-dark-layer]"));

    expect(layers.map((node) => node.getAttribute("data-hero-mobile-dark-layer"))).toEqual([
      "projected-photo",
      "authoritative-overlay",
      "dynamic-content",
    ]);
    expect(layers[0].querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeTruthy();
    expect((layers[1] as HTMLImageElement).src).toContain(
      HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME.overlaySrc,
    );
  });

  it("uses the real RGBA overlay as visibility authority, never a bbox mask", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    const projected = container.querySelector('[data-hero-mobile-dark-layer="projected-photo"]');
    expect(projected?.querySelector("mask, clipPath")).toBeNull();
    expect(container.querySelector('[data-hero-mobile-dark-layer="authoritative-overlay"]')).toBeTruthy();
  });

  it("renders exactly one authoritative Dark V2 overlay and no reconstructed artistic parts", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    expect(
      container.querySelectorAll('[data-hero-mobile-dark-layer="authoritative-overlay"]'),
    ).toHaveLength(1);
    expect(container.querySelector('[data-hero-mobile-dark-part="paperclip"]')).toBeNull();
    expect(container.querySelector('[data-hero-mobile-dark-part="leaf"]')).toBeNull();
    expect(container.querySelector('[data-hero-mobile-dark-part="seal"]')).toBeNull();
  });

  it("scopes the 982×1602 runtime to Dark 320–430 only", () => {
    expect(CSS_SOURCE).toContain("@media (min-width: 320px) and (max-width: 430px)");
    expect(CSS_SOURCE).toContain('[data-heritage-skin-variant="dark"] .mobileDarkPhotoRuntime');
    expect(CSS_SOURCE).toContain("aspect-ratio: 982 / 1602;");
    expect(CSS_SOURCE).not.toContain('[data-heritage-skin-variant="light"] .mobileDarkPhotoRuntime');
  });

  it("does not add a Mobile Dark runtime layer to Light", () => {
    const { container } = renderHero({ skinVariant: "light" });
    expect(container.querySelector("[data-hero-mobile-dark-layer]")).toBeNull();
  });
});

describe("HeroIntemporel — Desktop Light Handoff Runtime V1", () => {
  const CSS_SOURCE = readFileSync(
    path.resolve(import.meta.dirname, "HeroIntemporel.module.css"),
    "utf8",
  );

  it("paints the clipped projected photo, authoritative overlay, then dynamic content", () => {
    const { container } = renderHero({ skinVariant: "light" });
    const layers = Array.from(container.querySelectorAll("[data-hero-desktop-light-layer]"));
    expect(layers.map((node) => node.getAttribute("data-hero-desktop-light-layer"))).toEqual([
      "projected-clipped-photo",
      "authoritative-overlay",
      "dynamic-content",
    ]);
    expect(layers[0].querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeTruthy();
    expect((layers[1] as HTMLImageElement).src).toContain(
      HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME.overlaySrc,
    );
  });

  it("clips the projected photo to the exact quad before overlay composition", () => {
    const { container } = renderHero({ skinVariant: "light" });
    const projected = container.querySelector('[data-hero-desktop-light-layer="projected-clipped-photo"]');
    const polygon = projected?.querySelector("clipPath polygon");
    expect(polygon?.getAttribute("points")).toBe(
      HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME.destinationQuadPx
        .map(([x, y]) => `${x},${y}`)
        .join(" "),
    );
    expect(projected?.querySelector("g")?.getAttribute("clip-path")).toMatch(
      /^url\(#hero-desktop-light-photo-clip-/,
    );
  });

  it("uses only the existing desktop breakpoint and the native 1672×941 ratio", () => {
    expect(CSS_SOURCE).toContain("@media (min-width: 960px)");
    expect(CSS_SOURCE).toContain("max-width: 1672px;");
    expect(CSS_SOURCE).toContain("aspect-ratio: 1672 / 941;");
    expect(CSS_SOURCE).not.toMatch(/min-width:\s*(1024|1280|1440|1672)px/);
  });

  it("does not add a Desktop Light runtime layer to Dark", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    expect(container.querySelector("[data-hero-desktop-light-layer]")).toBeNull();
  });
});

describe("HeroIntemporel — Desktop Dark Handoff Runtime V1", () => {
  it("paints the clipped projected photo, authoritative overlay, then dynamic content", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    const layers = Array.from(container.querySelectorAll("[data-hero-desktop-dark-layer]"));
    expect(layers.map((node) => node.getAttribute("data-hero-desktop-dark-layer"))).toEqual([
      "projected-clipped-photo",
      "authoritative-overlay",
      "dynamic-content",
    ]);
    expect(layers[0].querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeTruthy();
    expect((layers[1] as HTMLImageElement).src).toContain(
      HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME.overlaySrc,
    );
  });

  it("clips the projected photo to the exact quad before overlay composition", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    const projected = container.querySelector('[data-hero-desktop-dark-layer="projected-clipped-photo"]');
    const polygon = projected?.querySelector("clipPath polygon");
    expect(polygon?.getAttribute("points")).toBe(
      HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME.destinationQuadPx
        .map(([x, y]) => `${x},${y}`)
        .join(" "),
    );
    expect(projected?.querySelector("g")?.getAttribute("clip-path")).toMatch(
      /^url\(#hero-desktop-dark-photo-clip-/,
    );
  });

  it("renders exactly one authoritative overlay and no reconstructed artistic element", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    expect(
      container.querySelectorAll('[data-hero-desktop-dark-layer="authoritative-overlay"]'),
    ).toHaveLength(1);
    expect(container.querySelector('[data-hero-desktop-dark-part="seal"]')).toBeNull();
    expect(container.querySelector('[data-hero-desktop-dark-part="botanical"]')).toBeNull();
  });

  it("does not add a Desktop Dark runtime layer to Light", () => {
    const { container } = renderHero({ skinVariant: "light" });
    expect(container.querySelector("[data-hero-desktop-dark-layer]")).toBeNull();
  });
});

describe("HeroIntemporel — restored context label (mission 035, section 1/10)", () => {
  it("renders the remembrance context label in French", () => {
    renderHero({ editorialContext: "remembrance", language: "fr" });
    expect(screen.getByText("Mémoire & Hommage")).toBeTruthy();
  });

  it("renders the announcement context label in French", () => {
    renderHero({ editorialContext: "announcement", language: "fr" });
    expect(screen.getByText("Annonce & Hommage")).toBeTruthy();
  });

  it("renders the context label in English via the existing i18n system, never hardcoded French", () => {
    renderHero({ editorialContext: "remembrance", language: "en" });
    expect(screen.getByText("Memory & Tribute")).toBeTruthy();
  });

  it("renders the context label in Spanish via the existing i18n system", () => {
    renderHero({ editorialContext: "announcement", language: "es" });
    expect(screen.getByText("Anuncio y homenaje")).toBeTruthy();
  });

  it("derives the label purely from editorial_context — not a new family field", () => {
    // Same hero content, only editorialContext differs, label changes —
    // proof the label is derived, never stored on HeroContent itself.
    expect("editorialContext" in FULL_HERO).toBe(false);
  });
});

describe("HeroIntemporel — Light/Dark scoping (mission section 9)", () => {
  it("scopes the render under data-heritage-skin / data-heritage-skin-variant, never prefers-color-scheme", () => {
    const { container } = renderHero({ skinVariant: "dark" });

    const scope = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute("data-heritage-skin-variant")).toBe("dark");
  });
});

describe("HeroIntemporel — dynamic content: photo, context label, name, dates, shortPhrase", () => {
  it("renders the family's own content — name, dates and phrase", () => {
    renderHero();

    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getByText("1948 – 2023")).toBeTruthy();
    expect(screen.getByText("Toujours dans nos cœurs")).toBeTruthy();
  });

  it("omits the dates line entirely when neither date is present — no reserved space", () => {
    renderHero({ hero: { ...FULL_HERO, birth: null, death: null } });
    expect(screen.queryByText(/–/)).toBeNull();
  });

  it("renders a single date alone when only one is present", () => {
    renderHero({ hero: { ...FULL_HERO, death: null } });
    expect(screen.getByText("1948")).toBeTruthy();
  });

  it("omits the short phrase entirely when absent — no invented content", () => {
    renderHero({ hero: { ...FULL_HERO, shortPhrase: null } });
    expect(screen.queryByText("Toujours dans nos cœurs")).toBeNull();
  });
});

describe("HeroIntemporel — accessibility", () => {
  it("marks every master/decorative image aria-hidden with an empty alt, and gives the real photo a real alt", () => {
    const { container } = renderHero();

    const images = Array.from(container.querySelectorAll("img"));
    const decorative = images.filter((img) => img.getAttribute("src") !== PHOTO.readUrl);
    expect(decorative.length).toBe(4); // two legacy masters plus the Mobile/ Desktop Light overlays
    for (const img of decorative) {
      expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("alt")).toBe("");
    }

    const photoImgs = images.filter((img) => img.getAttribute("src") === PHOTO.readUrl);
    expect(photoImgs.length).toBe(3); // legacy path plus contracted Mobile and Desktop Light paths
    for (const img of photoImgs) expect(img.getAttribute("alt")).not.toBe("");
  });
});

describe("HeroIntemporel — a missing photo degrades cleanly, never crashes", () => {
  it("renders without a photo window when photo is null, master and text still render", () => {
    const { container } = renderHero({ hero: { ...FULL_HERO, photo: null }, photo: null });

    expect(container.querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeNull();
    expect(container.querySelector('img[src*="hero-runtime-light-desktop.png"]')).toBeTruthy();
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
  });
});

describe("HeroIntemporel — projective transforms remain isolated to their four runtimes", () => {
  const CSS_SOURCE = readFileSync(
    path.resolve(import.meta.dirname, "HeroIntemporel.module.css"),
    "utf8",
  );
  // Comments stripped first, same technique as this codebase's other
  // source-level guards — this file's own docstring-style comments
  // legitimately explain what it does NOT do (mentioning "rotate()" in
  // prose), which must never look identical to actually declaring it.
  const CSS_RULES_ONLY = CSS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the stylesheet defines no `rotate(` anywhere at all", () => {
    expect(CSS_RULES_ONLY).not.toMatch(/rotate\(/);
  });

  it.each([
    ["light", ["mobileLightLogicalRaster", "desktopLightLogicalRaster"]],
    ["dark", ["mobileDarkLogicalRaster", "desktopDarkLogicalRaster"]],
  ] as const)("keeps %s transforms on the two dedicated logical rasters only", (variant, classes) => {
    const { container } = renderHero({ skinVariant: variant });
    const transformed = Array.from(container.querySelectorAll<HTMLElement>("[style*='transform']"));
    expect(transformed).toHaveLength(2);
    expect(transformed.map((node) => node.className)).toEqual(
      expect.arrayContaining(classes.map((className) => expect.stringMatching(className))),
    );
    for (const node of transformed) expect(node.style.transform).not.toMatch(/rotate/);
  });
});

/**
 * Mission 035 v4 section 6 — the QG-locked three-tier (plus documented
 * fallback extrême) name-fitting strategy. jsdom performs no real text
 * layout, so `Range.getClientRects()` cannot report a real line count on
 * its own; these tests install a controlled stand-in for it to exercise
 * `useFitDisplayName`'s actual shrink loop deterministically, rather
 * than skip the behaviour entirely.
 */
describe("HeroIntemporel — displayedName fitting (mission 035 v4, section 6)", () => {
  let originalGetClientRects: typeof Range.prototype.getClientRects;

  beforeEach(() => {
    originalGetClientRects = Range.prototype.getClientRects;
  });

  afterEach(() => {
    Range.prototype.getClientRects = originalGetClientRects;
  });

  /** Simulates "this text currently wraps into N lines" purely as a
   * function of the element's OWN current inline font-size — exactly
   * what a real browser would report as smaller font-sizes let more
   * text fit per line. */
  function stubLineCountByFontSize(linesForFontSizePx: (px: number) => number) {
    Range.prototype.getClientRects = function (this: Range) {
      const container = this.commonAncestorContainer;
      const el = (
        container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement
      ) as HTMLElement | null;
      const px = el ? Number.parseFloat(el.style.fontSize || "0") : 0;
      const lines = linesForFontSizePx(px);
      return { length: lines } as unknown as DOMRectList;
    };
  }

  // jsdom's default `window.innerWidth` (1024) is >= the 960px
  // breakpoint, so every case below exercises the DESKTOP bounds
  // (nominal 86, normal floor 56, extreme fallback floor 40) — see
  // HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX.

  it("tier 1 — keeps the nominal Studio size when the name already fits in 1 line", () => {
    stubLineCountByFontSize(() => 1);
    const { container } = renderHero({ hero: { ...FULL_HERO, displayName: "Ana Vives" } });

    const h1 = container.querySelector("h1") as HTMLElement;
    expect(Number.parseFloat(h1.style.fontSize)).toBe(86);
  });

  it("tier 2 — shrinks progressively, in whole steps, never below the normal floor, until it fits in <= 2 lines", () => {
    // 3 lines above 70px, 2 lines at 70px and below.
    stubLineCountByFontSize((px) => (px > 70 ? 3 : 2));
    const { container } = renderHero({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });

    const h1 = container.querySelector("h1") as HTMLElement;
    const finalSize = Number.parseFloat(h1.style.fontSize);
    expect(finalSize).toBe(70);
    expect(finalSize).toBeGreaterThanOrEqual(56); // never below the desktop normal floor
    // The full name is still there — never truncated, never ellipsized.
    expect(h1.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau");
  });

  it("tier 3 — allows a 3rd line AT the normal floor, without shrinking further, before any extreme fallback", () => {
    // Never fits in <= 2 lines at any size, but fits in exactly 3 lines
    // once it reaches the normal floor (56px) or below.
    stubLineCountByFontSize((px) => (px <= 56 ? 3 : 4));
    const { container } = renderHero({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });

    const h1 = container.querySelector("h1") as HTMLElement;
    const finalSize = Number.parseFloat(h1.style.fontSize);
    expect(finalSize).toBe(56); // settles exactly at the normal floor, no extreme fallback needed
    expect(h1.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau"); // never truncated
  });

  it("tier 4 — the documented fallback extrême: shrinks below the normal floor, the smallest amount needed, down to (never past) extremeFallbackMinPx, once still > 3 lines at the floor", () => {
    // Never fits in <= 3 lines above 45px; fits in exactly 3 lines at
    // 45px and below (well within the extreme floor of 40px).
    stubLineCountByFontSize((px) => (px <= 45 ? 3 : 4));
    const { container } = renderHero({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });

    const h1 = container.querySelector("h1") as HTMLElement;
    const finalSize = Number.parseFloat(h1.style.fontSize);
    expect(finalSize).toBe(45);
    expect(finalSize).toBeLessThan(56); // genuinely below the normal floor — this IS the fallback extrême
    expect(finalSize).toBeGreaterThanOrEqual(40); // never past the documented extreme floor
    expect(h1.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau"); // never truncated
  });

  it("never shrinks past the extreme floor even if the name still wraps past 3 lines there — no invented rule, name stays whole", () => {
    stubLineCountByFontSize(() => 5); // never fits, at any size
    const { container } = renderHero({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });

    const h1 = container.querySelector("h1") as HTMLElement;
    const finalSize = Number.parseFloat(h1.style.fontSize);
    expect(finalSize).toBe(40); // settles exactly at the extreme floor, no lower
    expect(h1.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau"); // never truncated
  });

  /**
   * QG Hero 375px long-name collision fix — a forensic measurement
   * against the real mobile master assets found Tier 4's name reaching
   * into the botanical decoration baked into the master, specifically at
   * narrow phone widths (measured colliding at 375px, safe at 390px/
   * 430px). These tests exercise the resulting `maxWidth` cap in
   * isolation from real layout, the same `stubLineCountByFontSize`
   * technique the tiers above already use.
   */
  describe("Tier 4 narrow-mobile safe-area cap (QG Hero 375px collision fix)", () => {
    function setViewportWidth(width: number) {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
    }

    it("caps the element's own width AND uses the dedicated narrow-mobile floor once Tier 4 is reached, on a narrow mobile viewport (375px) — QG 'Option C'", () => {
      setViewportWidth(375);
      // Mobile bounds: nominal 72, normal floor 48. Never fits in <= 3
      // lines above 48px; still 5 lines at the SHARED extreme floor
      // (40px), but fits in exactly 4 once shrunk to the dedicated
      // narrow-mobile floor (32px) — the exact "Option C" QG validated
      // against the real 88%-capped render.
      stubLineCountByFontSize((px) => (px <= 32 ? 4 : 5));
      const { container } = renderHero({
        hero: {
          ...FULL_HERO,
          displayName: "Marie-Charlotte de La Fontaine-Delacroix-Beaumont du Plessis-Grandchamp",
        },
      });

      const h1 = container.querySelector("h1") as HTMLElement;
      expect(Number.parseFloat(h1.style.fontSize)).toBe(32); // the dedicated narrow-mobile floor, below the shared 40px
      expect(h1.style.maxWidth).toBe("88%"); // the QG-validated "Option C" safe-area cap
      expect(h1.textContent).toBe(
        "Marie-Charlotte de La Fontaine-Delacroix-Beaumont du Plessis-Grandchamp",
      ); // never truncated
    });

    it("never shrinks past the dedicated narrow-mobile floor (32px) even if still > 3 lines there", () => {
      setViewportWidth(375);
      stubLineCountByFontSize(() => 5); // never fits, at any size
      const { container } = renderHero({
        hero: {
          ...FULL_HERO,
          displayName: "Marie-Charlotte de La Fontaine-Delacroix-Beaumont du Plessis-Grandchamp",
        },
      });

      const h1 = container.querySelector("h1") as HTMLElement;
      expect(Number.parseFloat(h1.style.fontSize)).toBe(32); // settles exactly at the narrow-mobile floor, no lower
      expect(h1.style.maxWidth).toBe("88%");
    });

    it("still uses the SHARED 40px floor (never 32px) once Tier 4 is reached on a viewport wider than the narrow-mobile band", () => {
      setViewportWidth(390);
      // Same genuinely-extreme name; at 390px the cap never applies, so
      // the loop must stop at the ORIGINAL shared floor (40px), not the
      // narrow-mobile-only 32px one.
      stubLineCountByFontSize((px) => (px <= 32 ? 4 : 5));
      const { container } = renderHero({
        hero: {
          ...FULL_HERO,
          displayName: "Marie-Charlotte de La Fontaine-Delacroix-Beaumont du Plessis-Grandchamp",
        },
      });

      const h1 = container.querySelector("h1") as HTMLElement;
      expect(Number.parseFloat(h1.style.fontSize)).toBe(40); // stops at the SHARED floor — never reaches 32px here
      expect(h1.style.maxWidth).toBe("");
    });

    it("leaves Tiers 1-3 completely uncapped on the SAME narrow viewport — normal names are untouched", () => {
      setViewportWidth(375);
      stubLineCountByFontSize(() => 1); // fits in 1 line at nominal — Tier 1, never reaches Tier 4
      const { container } = renderHero({ hero: { ...FULL_HERO, displayName: "Éléonore Vasseur" } });

      const h1 = container.querySelector("h1") as HTMLElement;
      expect(Number.parseFloat(h1.style.fontSize)).toBe(72); // mobile nominal, untouched
      expect(h1.style.maxWidth).toBe(""); // no cap — Tier 1 never applies one
    });

    it("does not cap Tier 4 on desktop even at a narrow-mobile-equivalent pixel width", () => {
      // isDesktop is decided by the 960px breakpoint, never by this
      // narrow-mobile threshold — a desktop viewport must never trigger
      // the mobile-only cap even if some future desktop window happened
      // to sit below the raw NARROW_MOBILE_SAFE_AREA_MAX_WIDTH_PX value.
      setViewportWidth(1024); // real jsdom default; kept explicit here for clarity
      stubLineCountByFontSize(() => 5);
      const { container } = renderHero({
        hero: {
          ...FULL_HERO,
          displayName: "Marie-Alexandrine de Beaumont-Rousseau",
        },
      });

      const h1 = container.querySelector("h1") as HTMLElement;
      expect(h1.style.maxWidth).toBe("");
    });

    it("resets a previous narrow-mobile cap when a later fit finds Tiers 1-3 sufficient (e.g. a resize to a shorter effective wrap)", () => {
      setViewportWidth(375);
      let stage: "extreme" | "fits" = "extreme";
      stubLineCountByFontSize((px) => (stage === "extreme" ? (px <= 32 ? 4 : 5) : 1));

      const { container, rerender } = renderHero({
        hero: {
          ...FULL_HERO,
          displayName: "Marie-Charlotte de La Fontaine-Delacroix-Beaumont du Plessis-Grandchamp",
        },
      });
      const h1 = container.querySelector("h1") as HTMLElement;
      expect(h1.style.maxWidth).toBe("88%"); // Tier 4 cap applied first

      // Simulate the SAME element later fitting in 1 line (a shorter
      // name, or a resize) — the effect re-runs (text changed) and must
      // clear its own earlier cap rather than leaving it stuck.
      stage = "fits";
      rerender(
        <HeroIntemporel
          hero={{ ...FULL_HERO, displayName: "Ana Vives" }}
          photo={PHOTO}
          skinVariant="light"
          editorialContext="remembrance"
          language="fr"
        />,
      );
      const h1Again = container.querySelector("h1") as HTMLElement;
      expect(h1Again.style.maxWidth).toBe("");
    });
  });
});

/**
 * Étape 2 — Assembleur du Memorial (QG C1/D2).
 */
describe("HeroIntemporel — Étape 2 assembler contract", () => {
  it("renders the photo from a bare { readUrl } — no Media row needed", () => {
    const { container } = renderHero({ photo: { readUrl: "https://storage.test/signed/assembly" } });
    expect(container.querySelector('img[src="https://storage.test/signed/assembly"]')).toBeTruthy();
  });

  it("still accepts T08's { media, readUrl } unchanged", () => {
    const { container } = renderHero({ photo: PHOTO });
    expect(container.querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeTruthy();
  });

  it("the renderer itself caps its width at the desktop masters' native width (QG D2)", () => {
    const CSS = readFileSync(path.resolve(import.meta.dirname, "HeroIntemporel.module.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const heroRule = CSS.match(/^\.hero\s*\{([^}]*)\}/m)?.[1] ?? "";
    for (const variant of ["light", "dark"] as const) {
      const [desktopWidth] = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS[variant].desktop.dimensionsPx;
      expect(heroRule).toContain(`max-width: ${desktopWidth}px;`);
    }
    expect(heroRule).toContain("margin-inline: auto;");
  });
});

/**
 * HERO INTEMPOREL — MOBILE TEXT CONTRACT V1 REV1 (320–430px). Same
 * discipline as the rest of this file: render/state contracts plus
 * source-level CSS checks; the real-browser geometry is QA'd against the
 * contract with real witnesses, not here.
 */
describe("HeroIntemporel — Mobile Text Contract REV1", () => {
  const CSS_SOURCE = readFileSync(path.resolve(import.meta.dirname, "HeroIntemporel.module.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const MOBILE_BLOCKS = CSS_SOURCE.split("@media (min-width: 320px) and (max-width: 430px)").slice(1).join("\n");

  describe("fitMobileContractName — deterministic REV1 engine", () => {
    it("keeps a name that fits at the nominal 10vw — never the legacy 72px", () => {
      expect(fitMobileContractName(320, () => 1)).toEqual({ fontSizePx: 32, lines: 1, usedExtremeFallback: false });
      expect(fitMobileContractName(430, () => 1)).toEqual({ fontSizePx: 43, lines: 1, usedExtremeFallback: false });
    });

    it("lets a long name wrap to 2 lines at nominal size before any reduction", () => {
      const probe = vi.fn(() => 2);
      expect(fitMobileContractName(375, probe)).toEqual({ fontSizePx: 37.5, lines: 2, usedExtremeFallback: false });
      expect(probe).toHaveBeenCalledTimes(1);
    });

    it("then reduces in 1px steps until it fits 2 lines", () => {
      const sizes: number[] = [];
      const result = fitMobileContractName(375, (px) => {
        sizes.push(px);
        return px > 33 ? 3 : 2;
      });
      expect(sizes).toEqual([37.5, 36.5, 35.5, 34.5, 33.5, 32.5]);
      expect(result).toEqual({ fontSizePx: 32.5, lines: 2, usedExtremeFallback: false });
    });

    it("allows the exceptional 3rd line at the 7.6vw normal floor, without shrinking further", () => {
      const result = fitMobileContractName(375, (px) => (px > 28.5 ? 4 : 3));
      expect(result).toEqual({ fontSizePx: 28.5, lines: 3, usedExtremeFallback: false });
    });

    it("only then reduces toward the 6.8vw extreme floor", () => {
      const result = fitMobileContractName(375, (px) => (px > 26 ? 4 : 3));
      expect(result).toEqual({ fontSizePx: 25.5, lines: 3, usedExtremeFallback: true });
    });

    it("never goes below the extreme floor and never truncates — the remaining lines stay", () => {
      const result = fitMobileContractName(320, () => 5);
      expect(result.fontSizePx).toBeCloseTo(21.76, 10);
      expect(result.lines).toBe(5);
      expect(result.usedExtremeFallback).toBe(true);
    });
  });

  it("Light renders no runtime separator — the plate's baked traits+cœur is the only one", () => {
    const { container } = renderHero({ skinVariant: "light" });
    expect(HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT.light.separator.mode).toBe("baked");
    expect(container.querySelector('[data-hero-mobile-text-contract="runtime-separator"]')).toBeNull();
  });

  it("Dark renders exactly one decorative runtime separator, between dates and phrase", () => {
    const { container } = renderHero({ skinVariant: "dark" });
    const separators = container.querySelectorAll('[data-hero-mobile-text-contract="runtime-separator"]');
    expect(separators).toHaveLength(1);
    const separator = separators[0];
    expect(separator.getAttribute("aria-hidden")).toBe("true");
    expect(separator.getAttribute("viewBox")).toBe(HERO_INTEMPOREL_MOBILE_SEPARATOR_GEOMETRY.viewBox);
    expect(separator.previousElementSibling?.textContent).toBe("1948 – 2023");
    expect(separator.nextElementSibling?.textContent).toBe("Toujours dans nos cœurs");
  });

  it("phrase absent: only the phrase node goes — the Dark separator stays, nothing is invented", () => {
    const { container } = renderHero({ skinVariant: "dark", hero: { ...FULL_HERO, shortPhrase: null } });
    const separator = container.querySelector('[data-hero-mobile-text-contract="runtime-separator"]');
    expect(separator).toBeTruthy();
    expect(separator?.nextElementSibling).toBeNull();
  });

  it.each(["light", "dark"] as const)("maps %s from its own native scene, never from the other variant", (variant) => {
    const m = HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT[variant];
    const [canvasW, canvasH] = m.canvasPx;
    const { container } = renderHero({ skinVariant: variant });
    const zone = container.querySelector('[class*="textZone"]') as HTMLElement;
    expect(zone.style.getPropertyValue("--mt-name-x")).toBe(`${(m.nameBox[0] / canvasW) * 100}%`);
    expect(zone.style.getPropertyValue("--mt-name-y1")).toBe(`${(m.nameBox[3] / canvasH) * 100}%`);
    expect(zone.style.getPropertyValue("--mt-dates-cy")).toBe(`${((m.datesBox[1] + m.datesBox[3]) / 2 / canvasH) * 100}%`);
    expect(zone.style.getPropertyValue("--mt-phrase-cy")).toBe(`${((m.phraseBox[1] + m.phraseBox[3]) / 2 / canvasH) * 100}%`);
    expect(zone.style.getPropertyValue("--mt-axis")).toBe(`${(m.axisX / canvasW) * 100}%`);
  });

  it("carries REV1's exact boxes and corrected typography", () => {
    const c = HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT;
    expect(c.light.canvasPx).toEqual([941, 1672]);
    expect(c.light.nameBox).toEqual([150, 1008, 791, 1104]);
    expect(c.light.datesBox).toEqual([260, 1107, 681, 1131]);
    expect(c.light.separator.bbox).toEqual([346, 1134, 594, 1159]);
    expect(c.light.phraseBox).toEqual([145, 1174, 796, 1296]);
    expect(c.dark.canvasPx).toEqual([982, 1602]);
    expect(c.dark.nameBox).toEqual([155, 884, 827, 978]);
    expect(c.dark.datesBox).toEqual([270, 991, 712, 1017]);
    expect(c.dark.separator.bbox).toEqual([350, 1032, 632, 1062]);
    expect(c.dark.phraseBox).toEqual([150, 1082, 832, 1206]);
    expect(c.typography.name).toMatchObject({ vw: 10, normalMinVw: 7.6, extremeMinVw: 6.8, lineHeight: 0.95 });
    expect(c.typography.dates).toMatchObject({ vw: 3.25, lineHeight: 1.1 });
    expect(c.typography.phrase).toMatchObject({ vw: 5.15, lineHeight: 1.15, maxWidthVw: 72 });
  });

  it("applies the corrected sizes only inside the 320–430px band", () => {
    expect(MOBILE_BLOCKS).toContain("font-size: 10cqw;");
    expect(MOBILE_BLOCKS).toContain("font-size: 3.25cqw;");
    expect(MOBILE_BLOCKS).toContain("font-size: 5.15cqw;");
    expect(MOBILE_BLOCKS).toContain("width: 72%;");
    expect(MOBILE_BLOCKS).toContain("container-type: inline-size;");
    const outside = CSS_SOURCE.split("@media (min-width: 320px) and (max-width: 430px)")[0];
    expect(outside).not.toMatch(/cqw/);
  });

  it("hides the context label in the Mobile band and on Desktop only — 431–959px keeps it", () => {
    expect(MOBILE_BLOCKS).toMatch(/\.contextLabel\s*\{\s*display:\s*none;\s*\}/);
    const desktopBlocks = CSS_SOURCE.split("@media (min-width: 960px)").slice(1);
    expect(desktopBlocks.some((block) => /^\s*\{\s*\.contextLabel\s*\{\s*display:\s*none;/.test(block))).toBe(true);
    expect(CSS_SOURCE).not.toMatch(/max-width:\s*959px/);
  });

  it("the runtime separator is laid out nowhere outside the 320–430px band", () => {
    expect(CSS_SOURCE).toMatch(/^\.mobileSeparator\s*\{\s*display:\s*none;\s*\}/m);
  });
});
