// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import type { Media } from "@/types/media";

/**
 * Mission 035 — contract tests for the real Hero Intemporel renderer.
 * Same discipline as every other Guided Flow component test in this
 * codebase: state/render contracts, never computed CSS/pixel layout
 * from the real browser engine.
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

describe("HeroIntemporel — Light/Dark scoping (mission brief section 6)", () => {
  it("scopes the render under data-heritage-skin / data-heritage-skin-variant, never prefers-color-scheme", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="dark" editorialContext="remembrance" language="fr" />,
    );

    const scope = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute("data-heritage-skin-variant")).toBe("dark");
  });
});

describe("HeroIntemporel — conditional content flow (mission brief section 11)", () => {
  it("omits the dates line entirely when neither date is present — no reserved space", () => {
    const hero = { ...FULL_HERO, birth: null, death: null };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" editorialContext="remembrance" language="fr" />);

    expect(screen.queryByText(/–/)).toBeNull();
  });

  it("renders a single date alone when only one is present", () => {
    const hero = { ...FULL_HERO, death: null };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" editorialContext="remembrance" language="fr" />);

    expect(screen.getByText("1948")).toBeTruthy();
  });

  it("omits the short phrase entirely when absent — no invented content", () => {
    const hero = { ...FULL_HERO, shortPhrase: null };
    render(<HeroIntemporel hero={hero} photo={PHOTO} skinVariant="light" editorialContext="remembrance" language="fr" />);

    expect(screen.queryByText("Toujours dans nos cœurs")).toBeNull();
  });

  it("reuses the existing approved editorial-context copy, never invented text", () => {
    render(<HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" editorialContext="announcement" language="fr" />);
    expect(screen.getByText("Annonce & Hommage")).toBeTruthy();

    cleanup();
    render(<HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" editorialContext="remembrance" language="fr" />);
    expect(screen.getByText("Mémoire & Hommage")).toBeTruthy();
  });
});

describe("HeroIntemporel — accessibility (mission brief section 21)", () => {
  it("marks every decorative image aria-hidden with an empty alt, and gives the real photo a real alt", () => {
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" editorialContext="remembrance" language="fr" />,
    );

    const images = Array.from(container.querySelectorAll("img"));
    const decorative = images.filter((img) => img.getAttribute("src") !== PHOTO.readUrl);
    expect(decorative.length).toBeGreaterThan(0);
    for (const img of decorative) {
      expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("alt")).toBe("");
    }

    const photoImg = images.find((img) => img.getAttribute("src") === PHOTO.readUrl);
    expect(photoImg?.getAttribute("alt")).not.toBe("");
  });

  it("never rotates the family photo itself via inline style, unlike the frame around it", () => {
    // The photo's own "never rotates" invariant is enforced structurally
    // by HeroIntemporel.module.css's `.photoImage { transform: rotate(0deg) }`
    // (jsdom does not apply external stylesheet rules, so this test
    // checks what THIS component actually sets in JS: no per-render
    // rotation is ever computed or inlined for the photo, unlike the
    // frame, which carries a real Studio rotation value via `--rotd`/
    // `--rotm`).
    const { container } = render(
      <HeroIntemporel hero={FULL_HERO} photo={PHOTO} skinVariant="light" editorialContext="remembrance" language="fr" />,
    );

    const photoImg = container.querySelector<HTMLImageElement>(`img[src="${PHOTO.readUrl}"]`);
    expect(photoImg?.style.getPropertyValue("--rotd")).toBe("");
    expect(photoImg?.style.getPropertyValue("--rotm")).toBe("");
  });
});

describe("HeroIntemporel — a missing photo degrades cleanly, never crashes", () => {
  it("renders without the photo/frame/paperclip when photo is null", () => {
    const { container } = render(
      <HeroIntemporel hero={{ ...FULL_HERO, photo: null }} photo={null} skinVariant="light" editorialContext="remembrance" language="fr" />,
    );

    expect(container.querySelector(`img[src="${PHOTO.readUrl}"]`)).toBeNull();
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
  });
});
