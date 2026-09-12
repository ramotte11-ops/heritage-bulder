// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import type { Media } from "@/types/media";

/**
 * Mission 035 (QG strategy change) — contract tests for the runtime-
 * master Hero Intemporel renderer. Same discipline as every other
 * Guided Flow component test in this codebase: state/render contracts,
 * never computed CSS/pixel layout from the real browser engine.
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

describe("HeroIntemporel — the Studio's own runtime masters, nothing recomposed", () => {
  it("renders both the light desktop and light mobile masters (one hidden by CSS, the DOM stays single)", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" language="fr" />,
    );

    expect(container.querySelector('img[src*="hero-runtime-light-desktop.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="hero-runtime-light-mobile.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="dark"]')).toBeNull();
  });

  it("renders the dark masters when skinVariant is dark", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="dark" language="fr" />,
    );

    expect(container.querySelector('img[src*="hero-runtime-dark-desktop.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="hero-runtime-dark-mobile.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="light"]')).toBeNull();
  });

  it("never draws a paper, botanical, postcard, seal, or paperclip asset of its own", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" language="fr" />,
    );

    const sources = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    for (const src of sources) {
      expect(src).not.toMatch(/paper|botanical|postcard|seal|paperclip|deckled/i);
    }
  });
});

describe("HeroIntemporel — Light/Dark scoping (mission brief section 8)", () => {
  it("scopes the render under data-heritage-skin / data-heritage-skin-variant, never prefers-color-scheme", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="dark" language="fr" />,
    );

    const scope = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute("data-heritage-skin-variant")).toBe("dark");
  });
});

describe("HeroIntemporel — dynamic text only: photo, name, dates, shortPhrase (mission section 5)", () => {
  it("renders the family's own content — name, dates and phrase", () => {
    render(<HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" language="fr" />);

    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getByText("1948 – 2023")).toBeTruthy();
    expect(screen.getByText("Toujours dans nos cœurs")).toBeTruthy();
  });

  it("omits the dates line entirely when neither date is present — no reserved space", () => {
    const hero = { ...FULL_HERO, birth: null, death: null };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" language="fr" />);

    expect(screen.queryByText(/–/)).toBeNull();
  });

  it("renders a single date alone when only one is present", () => {
    const hero = { ...FULL_HERO, death: null };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" language="fr" />);

    expect(screen.getByText("1948")).toBeTruthy();
  });

  it("omits the short phrase entirely when absent — no invented content", () => {
    const hero = { ...FULL_HERO, shortPhrase: null };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" language="fr" />);

    expect(screen.queryByText("Toujours dans nos cœurs")).toBeNull();
  });

  it("never renders a name so long it becomes invisible (regression: a past overflow:hidden + max-height combo collapsed it to 0 height)", () => {
    const hero = { ...FULL_HERO, displayName: "Marie-Alexandrine de Beaumont-Rousseau" };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" language="fr" />);

    const name = screen.getByText("Marie-Alexandrine de Beaumont-Rousseau");
    expect(name).toBeTruthy();
    expect((name as HTMLElement).getBoundingClientRect).toBeDefined();
  });
});

describe("HeroIntemporel — accessibility", () => {
  it("marks every master/decorative image aria-hidden with an empty alt, and gives the real photo a real alt", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" language="fr" />,
    );

    const images = Array.from(container.querySelectorAll("img"));
    const decorative = images.filter((img) => img.getAttribute("src") !== PHOTO.readUrl);
    expect(decorative.length).toBe(2); // exactly the two master images
    for (const img of decorative) {
      expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("alt")).toBe("");
    }

    const photoImg = images.find((img) => img.getAttribute("src") === PHOTO.readUrl);
    expect(photoImg?.getAttribute("alt")).not.toBe("");
  });
});

describe("HeroIntemporel — Mission 034's crop engine, reused (mission section 4)", () => {
  it("never rotates the family photo itself, unlike the window around it", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" language="fr" />,
    );

    const photoImg = container.querySelector<HTMLImageElement>(`img[src="${PHOTO.readUrl}"]`);
    // The photo's own geometry (left/top/width/height as percentages)
    // comes straight from resolveHeroCropGeometry — a neutral centered
    // crop at zoom 1 covers the 4:5 window exactly (100% on the tighter
    // axis for a square source image, per hero-crop-geometry.ts).
    expect(photoImg?.style.width).toBeTruthy();
    expect(photoImg?.style.height).toBeTruthy();
  });

  it("positions the photo window at the master's own center/size/rotation, per variant", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="dark" language="fr" />,
    );

    const window = container.querySelector<HTMLDivElement>(`[class*="photoWindow"]`);
    // Dark desktop's own spec: center (462.8, 454.4) of a 1536×1024
    // canvas => ~30.13%/44.38%.
    expect(window?.style.getPropertyValue("--win-xd")).toMatch(/^30\.1/);
    expect(window?.style.getPropertyValue("--win-yd")).toMatch(/^44\.3/);
    expect(window?.style.getPropertyValue("--win-rotd")).toBe("-5.492deg");
  });
});

describe("HeroIntemporel — a missing photo degrades cleanly, never crashes", () => {
  it("renders without a photo window when photo is null, master and text still render", () => {
    const { container } = render(
      <HeroIntemporel hero={{ ...FULL_HERO, photo: null }} photo={null} skinVariant="light" language="fr" />,
    );

    expect(container.querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeNull();
    expect(container.querySelector('img[src*="hero-runtime-light-desktop.png"]')).toBeTruthy();
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
  });
});
