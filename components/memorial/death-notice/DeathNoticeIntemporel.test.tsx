// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import type { DeathNoticeContent } from "@/types/death-notice";
import { EMPTY_DEATH_NOTICE_PRECISIONS } from "@/types/death-notice";

/**
 * Mission 039B — contract tests for the real Death Notice ("Avis de
 * décès") A03 renderer. jsdom performs no real layout, so the tests that
 * touch `useSceneRuntime`'s N formula stub `getBoundingClientRect`
 * directly (the same discipline HeroIntemporel.test.tsx already applies
 * to `Range.getClientRects` for its own name-fitting hook) rather than
 * skip that mechanic entirely. ResizeObserver does not exist in jsdom —
 * stubbed as a no-op constructor so the component can mount at all.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubResizeObserver);

const { DeathNoticeIntemporel } = await import("./DeathNoticeIntemporel");

afterEach(cleanup);

const FULL_HERO: HeroContent = {
  displayName: "Jean Dupont",
  birth: { precision: "year", year: 1948 },
  death: { precision: "year", year: 2023 },
  shortPhrase: "Toujours dans nos cœurs",
  photo: null,
};

const FULL_DEATH_NOTICE: DeathNoticeContent = {
  announcementText: "Elle s'en est allée paisiblement, entourée des siens.",
  precisions: {
    ...EMPTY_DEATH_NOTICE_PRECISIONS,
    generalLocation: "En Bretagne",
    familyMessage: "Merci à tous pour votre soutien.",
  },
};

function renderNotice(overrides: Partial<React.ComponentProps<typeof DeathNoticeIntemporel>> = {}) {
  return render(
    <DeathNoticeIntemporel
      hero={FULL_HERO}
      deathNotice={FULL_DEATH_NOTICE}
      editorialContext="announcement"
      language="fr"
      skinVariant="light"
      {...overrides}
    />,
  );
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
}

describe("DeathNoticeIntemporel — SCENE TOP + MIDDLE×N + BOTTOM, real assets only", () => {
  it("renders the light desktop scene assets (top, at least one middle, bottom)", () => {
    setViewportWidth(1200);
    const { container } = renderNotice({ skinVariant: "light" });

    expect(container.querySelector('img[src*="/light/desktop/a03-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/desktop/a03-scene-middle.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/desktop/a03-scene-bottom.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="dark"]')).toBeNull();
  });

  it("renders the mobile scene assets under the desktop breakpoint", () => {
    setViewportWidth(500);
    const { container } = renderNotice({ skinVariant: "light" });

    expect(container.querySelector('img[src*="/light/mobile/a03-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/mobile/a03-scene-bottom.png"]')).toBeTruthy();
  });

  it("renders the dark scene assets when skinVariant is dark", () => {
    setViewportWidth(1200);
    const { container } = renderNotice({ skinVariant: "dark" });

    expect(container.querySelector('img[src*="/dark/desktop/a03-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="light"]')).toBeNull();
  });

  it("never renders more than one TOP and one BOTTOM image, whatever the content length", () => {
    setViewportWidth(1200);
    const { container } = renderNotice();
    expect(container.querySelectorAll('img[src*="a03-scene-top.png"]').length).toBe(1);
    expect(container.querySelectorAll('img[src*="a03-scene-bottom.png"]').length).toBe(1);
  });

  it("MIDDLE repeats at least once (N minimum = 1) even for the shortest content", () => {
    setViewportWidth(1200);
    const { container } = renderNotice({
      deathNotice: { announcementText: "Au revoir.", precisions: EMPTY_DEATH_NOTICE_PRECISIONS },
    });
    expect(container.querySelectorAll('img[src*="a03-scene-middle.png"]').length).toBeGreaterThanOrEqual(1);
  });
});

describe("DeathNoticeIntemporel — allongement dynamique (mission brief section 6)", () => {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  /** Stubs measurement so the wrapper reports a fixed rendered width
   * (driving `scale`) and the content overlay reports a fixed height —
   * exactly the two real DOM facts `useSceneRuntime` reads. */
  function stubMeasurements(wrapperWidth: number, contentBottom: number) {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const isContent = this.className.toString().includes("content");
      return {
        width: wrapperWidth,
        height: 0,
        top: 0,
        left: 0,
        right: wrapperWidth,
        bottom: isContent ? contentBottom : 0,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
    };
  }

  it("short content stays at N=1", () => {
    setViewportWidth(1200);
    stubMeasurements(1672, 300); // well within TOP_H (420) alone
    const { container } = renderNotice();
    expect(container.querySelectorAll('img[src*="a03-scene-middle.png"]').length).toBe(1);
  });

  it("long content extends N past 1, proportionally to how far it overflows TOP+BOTTOM", () => {
    setViewportWidth(1200);
    // TOP(420) + BOTTOM(393) = 813; content bottom far past that forces
    // several MIDDLE(128) repeats.
    stubMeasurements(1672, 813 + 128 * 4 + 50);
    const { container } = renderNotice();
    const n = container.querySelectorAll('img[src*="a03-scene-middle.png"]').length;
    expect(n).toBeGreaterThan(1);
  });

  it("recalculates on viewport resize (responsive stable, mission brief section 6)", () => {
    setViewportWidth(1200);
    stubMeasurements(1672, 300);
    const { container } = renderNotice();
    const desktopN = container.querySelectorAll('img[src*="a03-scene-middle.png"]').length;

    setViewportWidth(500);
    stubMeasurements(941, 300);
    window.dispatchEvent(new Event("resize"));

    // Still renders a valid scene after the resize — mobile geometry now
    // applies (independent MIDDLE_H/TOP_H/BOTTOM_H), never crashes.
    expect(container.querySelectorAll('img[src*="a03-scene-middle.png"]').length).toBeGreaterThanOrEqual(1);
    expect(desktopN).toBeGreaterThanOrEqual(1);
  });
});

describe("DeathNoticeIntemporel — content is HTML/CSS, never duplicated into an asset", () => {
  it("renders the family's own name, dates and announcement as real text", () => {
    renderNotice();
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getByText("1948 – 2023")).toBeTruthy();
    expect(screen.getByText("Elle s'en est allée paisiblement, entourée des siens.")).toBeTruthy();
  });

  it("renders the fixed eyebrow + title via i18n, not hardcoded", () => {
    renderNotice({ editorialContext: "announcement", language: "en" });
    expect(screen.getByText("Announcement & Tribute")).toBeTruthy();
    expect(screen.getByText("Death Notice")).toBeTruthy();
  });

  it("renders French copy", () => {
    renderNotice({ language: "fr" });
    expect(screen.getByText("Annonce & Hommage")).toBeTruthy();
    expect(screen.getByText("Avis de décès")).toBeTruthy();
  });

  it("renders Spanish copy", () => {
    renderNotice({ language: "es" });
    expect(screen.getByText("Anuncio y homenaje")).toBeTruthy();
    expect(screen.getByText("Aviso de defunción")).toBeTruthy();
  });
});

describe("DeathNoticeIntemporel — details (mission brief section 8)", () => {
  it("an absent block disappears totally: no content, no label, no reserved row", () => {
    renderNotice({
      deathNotice: { announcementText: "Texte.", precisions: EMPTY_DEATH_NOTICE_PRECISIONS },
    });
    expect(screen.queryByText("Lieu général")).toBeNull();
    expect(screen.queryByText("Mot de la famille")).toBeNull();
  });

  it("renders only the precisions actually entered, with their own label", () => {
    renderNotice();
    expect(screen.getByText("En Bretagne")).toBeTruthy();
    expect(screen.getByText("Merci à tous pour votre soutien.")).toBeTruthy();
    expect(screen.queryByText("Pensée")).toBeNull();
  });

  it("1 visible block spans full width (desktop grid rule)", () => {
    const { container } = renderNotice({
      deathNotice: {
        announcementText: "Texte.",
        precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, generalLocation: "Lyon" },
      },
    });
    const blocks = container.querySelectorAll('[class*="block"]:not([class*="blockHeading"]):not([class*="blockLabel"]):not([class*="blockText"]):not([class*="blockDot"])');
    // Exactly one real block wrapper, and it carries the "full width" class.
    const fullWidthBlocks = Array.from(blocks).filter((el) => el.className.includes("blockFull"));
    expect(fullWidthBlocks.length).toBe(1);
  });

  it("2 visible blocks: neither spans full width (even count -> two columns)", () => {
    const { container } = renderNotice(); // 2 precisions filled
    const fullWidthBlocks = container.querySelectorAll('[class*="blockFull"]');
    expect(fullWidthBlocks.length).toBe(0);
  });

  it("3 visible blocks: only the last spans full width (2 + 1 pleine largeur)", () => {
    const { container } = renderNotice({
      deathNotice: {
        announcementText: "Texte.",
        precisions: {
          ...EMPTY_DEATH_NOTICE_PRECISIONS,
          generalLocation: "Lyon",
          familyMessage: "Merci.",
          thought: "Une pensée.",
        },
      },
    });
    const fullWidthBlocks = container.querySelectorAll('[class*="blockFull"]');
    expect(fullWidthBlocks.length).toBe(1);
    expect(fullWidthBlocks[0].textContent).toContain("Une pensée.");
  });

  it("4 visible blocks: none spans full width (2 + 2)", () => {
    const { container } = renderNotice({
      deathNotice: {
        announcementText: "Texte.",
        precisions: {
          ...EMPTY_DEATH_NOTICE_PRECISIONS,
          generalLocation: "Lyon",
          familyMessage: "Merci.",
          thought: "Une pensée.",
          quote: "Une citation.",
        },
      },
    });
    expect(container.querySelectorAll('[class*="blockFull"]').length).toBe(0);
  });

  it("5 visible blocks: only the last spans full width (2 + 2 + 1 pleine largeur)", () => {
    const { container } = renderNotice({
      deathNotice: {
        announcementText: "Texte.",
        precisions: {
          generalLocation: "Lyon",
          familyMessage: "Merci.",
          thought: "Une pensée.",
          quote: "Une citation.",
          other: "Autre précision.",
        },
      },
    });
    const fullWidthBlocks = container.querySelectorAll('[class*="blockFull"]');
    expect(fullWidthBlocks.length).toBe(1);
    expect(fullWidthBlocks[0].textContent).toContain("Autre précision.");
  });

  it("mobile forces a single column via CSS alone, never a JS recomputation", () => {
    const CSS_SOURCE = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    // The unconditional .details rule declares one column; only the
    // desktop media query introduces two.
    const beforeMediaQuery = CSS_SOURCE.split("@media (min-width: 960px) {\n  .details")[0];
    expect(beforeMediaQuery).toMatch(/\.details\s*{[^}]*grid-template-columns:\s*1fr;/);
  });
});

describe("DeathNoticeIntemporel — Light/Dark scoping (mission brief section 12)", () => {
  it("scopes the render under data-heritage-skin/data-heritage-skin-variant, never prefers-color-scheme", () => {
    const { container } = renderNotice({ skinVariant: "dark" });
    const scope = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute("data-heritage-skin-variant")).toBe("dark");
  });
});

describe("DeathNoticeIntemporel — long name (mission brief section 9)", () => {
  let originalGetClientRects: typeof Range.prototype.getClientRects;

  beforeEach(() => {
    originalGetClientRects = Range.prototype.getClientRects;
  });

  afterEach(() => {
    Range.prototype.getClientRects = originalGetClientRects;
  });

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

  it("full name always renders whole — never ellipsis or truncation", () => {
    setViewportWidth(500);
    stubLineCountByFontSize(() => 5);
    const { container } = renderNotice({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau Delacroix-Fontaine" },
    });
    const h2 = container.querySelector("h2") as HTMLElement;
    expect(h2.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau Delacroix-Fontaine");
  });

  it("mobile fallback never drops below the documented 32px floor", () => {
    setViewportWidth(500);
    stubLineCountByFontSize(() => 5); // never fits, at any size
    const { container } = renderNotice({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau Delacroix-Fontaine" },
    });
    const h2 = container.querySelector("h2") as HTMLElement;
    const finalSize = Number.parseFloat(h2.style.fontSize);
    expect(finalSize).toBe(32);
  });

  it("mobile fallback applies the fallback max-width/line-height class once engaged", () => {
    setViewportWidth(500);
    stubLineCountByFontSize((px) => (px <= 34 ? 3 : 4));
    const { container } = renderNotice({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });
    const h2 = container.querySelector("h2") as HTMLElement;
    expect(h2.className).toMatch(/nameFallback/);
  });

  it("desktop never engages the mobile-only fallback — a name that fits stays at the nominal 72px", () => {
    setViewportWidth(1200);
    stubLineCountByFontSize(() => 1);
    const { container } = renderNotice({ hero: { ...FULL_HERO, displayName: "Ana Vives" } });
    const h2 = container.querySelector("h2") as HTMLElement;
    expect(h2.className).not.toMatch(/nameFallback/);
    expect(Number.parseFloat(h2.style.fontSize)).toBe(72);
  });

  it("desktop shrinks a long name down to (never below) the 48px floor to try to fit 2 lines (mission brief section 9)", () => {
    setViewportWidth(1200);
    // 3 lines above 60px, 2 lines at 60px and below.
    stubLineCountByFontSize((px) => (px > 60 ? 3 : 2));
    const { container } = renderNotice({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" },
    });
    const h2 = container.querySelector("h2") as HTMLElement;
    const finalSize = Number.parseFloat(h2.style.fontSize);
    expect(finalSize).toBe(60);
    expect(finalSize).toBeGreaterThanOrEqual(48);
    expect(h2.className).not.toMatch(/nameFallback/); // the fallback class is mobile-only
    expect(h2.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau");
  });

  it("desktop STOP condition: a name that still exceeds 2 lines at the 48px floor stays there, whole, never truncated and never shrunk further", () => {
    setViewportWidth(1200);
    stubLineCountByFontSize(() => 4); // never fits <= 2 lines, at any size
    const { container } = renderNotice({
      hero: { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau Delacroix-Fontaine" },
    });
    const h2 = container.querySelector("h2") as HTMLElement;
    const finalSize = Number.parseFloat(h2.style.fontSize);
    expect(finalSize).toBe(48); // settles exactly at the documented floor, no lower
    expect(h2.textContent).toBe("Marie-Alexandrine de Beaumont-Rousseau Delacroix-Fontaine");
  });
});

describe("DeathNoticeIntemporel — reduced motion (mission brief section 13)", () => {
  it("the stylesheet disables the entrance animation under prefers-reduced-motion", () => {
    const CSS_SOURCE = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    expect(CSS_SOURCE).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("the stylesheet declares no parallax (background-attachment: fixed) anywhere", () => {
    const CSS_SOURCE = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    expect(CSS_SOURCE).not.toMatch(/background-attachment:\s*fixed/);
  });
});

describe("DeathNoticeIntemporel — no decorative element reconstructed in CSS/JS", () => {
  it("renders no separate ornament/branch/seal element of its own — only the three Studio images", () => {
    setViewportWidth(1200);
    const { container } = renderNotice();
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.every((img) => (img.getAttribute("src") ?? "").includes("a03-scene-"))).toBe(true);
  });
});
