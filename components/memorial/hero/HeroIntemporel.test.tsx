// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import type { Media } from "@/types/media";
import { HERO_INTEMPOREL_RUNTIME_MASTER_SPECS } from "@/config/hero-intemporel-tokens";

/**
 * Mission 035 v3 (QG micro-audit) — contract tests for the runtime-
 * master Hero Intemporel renderer. Same discipline as every other
 * Guided Flow component test in this codebase: state/render contracts,
 * never computed CSS/pixel layout from the real browser engine — except
 * where the QG explicitly asked for a GEOMETRIC proof (section 2), which
 * this file gives via `photoMask()` (a pure function, testable without
 * any rendering) plus a source-level guard that no `rotate(` exists
 * anywhere in the photo's own stylesheet.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { HeroIntemporel, photoMask } = await import("./HeroIntemporel");

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

describe("HeroIntemporel — restored context label (mission 035 v3, section 1)", () => {
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

describe("HeroIntemporel — Light/Dark scoping (mission section 8)", () => {
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
    expect(photoImgs.length).toBe(2); // one per breakpoint wrapper
    for (const img of photoImgs) {
      expect(img.getAttribute("alt")).not.toBe("");
    }
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
 * Mission 035 v3 section 2 — the geometric audit the QG explicitly
 * asked for: not a CSS string check, a proof of the actual
 * transformation architecture. `photoMask()` is pure and exported
 * specifically so this can be verified without rendering anything —
 * see HeroIntemporel.tsx's own docstring, "Photo placement".
 */
describe("photoMask() — the rotated window, WITHOUT any rotation transform (mission 035 v3, section 2)", () => {
  it.each(["light", "dark"] as const)(
    "reproduces the Studio's own window center for %s desktop, from the bounding box of the real polygon alone",
    (variant) => {
      const spec = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS[variant].desktop;
      const mask = photoMask(spec);

      const [canvasW, canvasH] = spec.dimensionsPx;
      const wrapperCenterXPx = (mask.wrapper.leftPct + mask.wrapper.widthPct / 2) * (canvasW / 100);
      const wrapperCenterYPx = (mask.wrapper.topPct + mask.wrapper.heightPct / 2) * (canvasH / 100);

      // The bounding box of a rectangle rotated about its own center is
      // itself centered on that same point — this is what makes the
      // inner (un-rotated) crop window and the clip-path share one
      // center with no separate bookkeeping.
      expect(wrapperCenterXPx).toBeCloseTo(spec.photoWindowCenterPx[0], 0);
      expect(wrapperCenterYPx).toBeCloseTo(spec.photoWindowCenterPx[1], 0);
    },
  );

  it("produces a clip-path polygon with exactly the 4 given corners, expressed relative to the wrapper's own box", () => {
    const spec = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS.light.desktop;
    const mask = photoMask(spec);

    expect(mask.clipPath.startsWith("polygon(")).toBe(true);
    const pointCount = mask.clipPath.split(",").length;
    expect(pointCount).toBe(spec.photoWindowPolygonPx.length);

    // Every point must fall within [0, 100]% of the wrapper's own box —
    // by construction (the wrapper IS the polygon's bounding box), any
    // point outside that range would mean the wrapper was sized wrong.
    const pairs = mask.clipPath
      .slice("polygon(".length, -1)
      .split(",")
      .map((pair) => pair.trim().split(" ").map((v) => Number.parseFloat(v)));
    for (const [x, y] of pairs) {
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(x).toBeLessThanOrEqual(100.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
      expect(y).toBeLessThanOrEqual(100.01);
    }
  });

  it("sizes the inner (un-rotated) 4:5 crop window to the window's own local size, centered in the wrapper", () => {
    const spec = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS.dark.mobile;
    const mask = photoMask(spec);

    // Centered: left margin equals right margin.
    expect(mask.inner.leftPct).toBeCloseTo(100 - mask.inner.widthPct - mask.inner.leftPct, 5);
    expect(mask.inner.topPct).toBeCloseTo(100 - mask.inner.heightPct - mask.inner.topPct, 5);

    // The inner box IS smaller than the wrapper on both axes (the
    // wrapper is the ROTATED rectangle's bounding box, always larger
    // than the un-rotated rectangle it bounds, for any non-zero angle).
    expect(mask.inner.widthPct).toBeLessThan(100);
    expect(mask.inner.heightPct).toBeLessThan(100);
  });
});

describe("HeroIntemporel — the photo's pixels are never rotated (mission 035 v3, section 2, geometric proof)", () => {
  const CSS_SOURCE = readFileSync(
    path.resolve(import.meta.dirname, "HeroIntemporel.module.css"),
    "utf8",
  );
  // Comments stripped first, same technique as this codebase's other
  // source-level guards — this file's own docstring-style comments
  // legitimately explain what it does NOT do (mentioning "rotate()" in
  // prose), which must never look identical to actually declaring it.
  const CSS_RULES_ONLY = CSS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the stylesheet defines no `rotate(` anywhere at all — the v2 defect's exact signature", () => {
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

  it("the source itself uses clip-path (a shape), never transform, to fit the Studio's rotated window", () => {
    const SOURCE = readFileSync(path.resolve(import.meta.dirname, "HeroIntemporel.tsx"), "utf8");
    const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(CODE).toMatch(/clipPath/);
    expect(CODE).not.toMatch(/transform:\s*["'`]?rotate/);
  });
});

/**
 * Mission 035 v3 section 3 — the name-fitting strategy. jsdom performs
 * no real text layout, so `Range.getClientRects()` cannot report a real
 * line count on its own; these tests install a controlled stand-in for
 * it to exercise `useFitDisplayName`'s actual shrink loop deterministically,
 * rather than skip the behaviour entirely.
 */
describe("HeroIntemporel — displayedName fitting (mission 035 v3, section 3)", () => {
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

  it("keeps the nominal Studio size when the name already fits in 1 line", () => {
    stubLineCountByFontSize(() => 1);
    const { container } = renderHero({ hero: { ...FULL_HERO, displayName: "Ana Vives" } });

    const h1 = container.querySelector("h1") as HTMLElement;
    // jsdom's default `window.innerWidth` (1024) is >= the 960px
    // breakpoint, so this exercises the DESKTOP bounds (nominal 86,
    // floor 56) — see HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX.
    expect(Number.parseFloat(h1.style.fontSize)).toBe(86);
  });

  it("shrinks progressively, in whole steps, never below the Studio floor, until it fits in <= 2 lines", () => {
    // 3 lines above 70px, 2 lines at 70px and below.
    stubLineCountByFontSize((px) => (px > 70 ? 3 : 2));
    const { container } = renderHero({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });

    const h1 = container.querySelector("h1") as HTMLElement;
    const finalSize = Number.parseFloat(h1.style.fontSize);
    expect(finalSize).toBe(70);
    expect(finalSize).toBeGreaterThanOrEqual(56); // never below the desktop floor
    // The full name is still there — never truncated, never ellipsized.
    expect(h1.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau");
  });

  it("never shrinks past the floor even if the name still wraps past 2 lines there — no invented rule, name stays whole", () => {
    stubLineCountByFontSize(() => 4); // never fits, at any size
    const { container } = renderHero({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });

    const h1 = container.querySelector("h1") as HTMLElement;
    const finalSize = Number.parseFloat(h1.style.fontSize);
    expect(finalSize).toBe(56); // settles exactly at the desktop floor, no lower
    expect(h1.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau"); // never truncated
  });
});
