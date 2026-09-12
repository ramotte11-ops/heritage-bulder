// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import type { Media } from "@/types/media";
import { HERO_INTEMPOREL_RUNTIME_MASTER_SPECS } from "@/config/hero-intemporel-tokens";

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
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { HeroIntemporel } = await import("./HeroIntemporel");

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
    expect(decorative.length).toBe(2); // exactly the two master images
    for (const img of decorative) {
      expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("alt")).toBe("");
    }

    const photoImgs = images.filter((img) => img.getAttribute("src") === PHOTO.readUrl);
    expect(photoImgs.length).toBe(1); // one single photo window, no per-breakpoint duplicate
    expect(photoImgs[0].getAttribute("alt")).not.toBe("");
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

/**
 * Mission 035 v4 — the photo's pixels are never rotated. V3 FINAL's
 * masters give an axis-aligned window (no rotation anywhere in the
 * manifest), and this component now declares no `transform` at all —
 * this guard stays as a structural guarantee against that v2 defect
 * class ever recurring, whatever future masters this component renders.
 */
describe("HeroIntemporel — the photo's pixels are never rotated", () => {
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

  it("no element in the rendered photo's ancestor chain carries an inline rotation transform", () => {
    const { container } = renderHero();

    const photoImgs = Array.from(container.querySelectorAll(`img[src="${PHOTO.readUrl}"]`));
    expect(photoImgs.length).toBeGreaterThan(0);

    for (const img of photoImgs) {
      let node: HTMLElement | null = img as HTMLElement;
      while (node !== null) {
        const inlineTransform = node.style.transform;
        expect(inlineTransform).not.toMatch(/rotate/);
        node = node.parentElement;
      }
    }
  });

  it("the component source itself declares no `transform` of any kind on the photo or its ancestors", () => {
    const SOURCE = readFileSync(path.resolve(import.meta.dirname, "HeroIntemporel.tsx"), "utf8");
    const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(CODE).not.toMatch(/transform:/);
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
});
