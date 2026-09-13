// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import { EMPTY_DEATH_NOTICE_PRECISIONS, type DeathNoticeContent } from "@/types/death-notice";

/**
 * Mission 039B (A03) — contract tests for the Death Notice Intemporel
 * renderer. Same discipline as HeroIntemporel.test.tsx: state/render
 * contracts (what appears, what disappears, how it is scoped/labelled),
 * never computed CSS/pixel layout.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { DeathNoticeIntemporel } = await import("./DeathNoticeIntemporel");

afterEach(cleanup);

const FULL_HERO: HeroContent = {
  displayName: "Élise Martin",
  birth: { precision: "year", year: 1948 },
  death: { precision: "year", year: 2023 },
  shortPhrase: "Toujours dans nos cœurs",
  photo: null,
};

const FULL_DEATH_NOTICE: DeathNoticeContent = {
  announcementText: "C'est avec une profonde tristesse que nous vous faisons part du décès d'Élise Martin.",
  precisions: {
    generalLocation: "Les obsèques se dérouleront à Lyon.",
    familyMessage: "Sa famille tient à remercier chaleureusement toutes les personnes présentes.",
    thought: "Toujours à l'écoute, toujours présente.",
    quote: "« Il y a quelque chose de plus fort que la mort. »",
    other: "En lieu et place de fleurs, la famille souhaite un don aux enfants hospitalisés.",
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

describe("DeathNoticeIntemporel — dynamic content, nothing baked", () => {
  it("renders the name, dates, and the announcement text from canonical content", () => {
    renderNotice();

    expect(screen.getByText("Élise Martin")).toBeTruthy();
    expect(screen.getByText("1948 – 2023")).toBeTruthy();
    expect(
      screen.getByText("C'est avec une profonde tristesse que nous vous faisons part du décès d'Élise Martin."),
    ).toBeTruthy();
  });

  it("renders the fixed title and context label via i18n, never hardcoded", () => {
    renderNotice({ language: "en", editorialContext: "announcement" });
    expect(screen.getByText("Death Notice")).toBeTruthy();
    expect(screen.getByText("Announcement & Tribute")).toBeTruthy();
  });

  it("omits the dates line entirely when neither date is present — no reserved space", () => {
    renderNotice({ hero: { ...FULL_HERO, birth: null, death: null } });
    expect(screen.queryByText(/–/)).toBeNull();
  });

  it("never renders shortPhrase — A03 composes only Hero identity + Death Notice content", () => {
    renderNotice();
    expect(screen.queryByText("Toujours dans nos cœurs")).toBeNull();
  });

  it("degrades cleanly (never throws) when announcementText is null", () => {
    expect(() =>
      renderNotice({ deathNotice: { ...FULL_DEATH_NOTICE, announcementText: null } }),
    ).not.toThrow();
  });
});

describe("DeathNoticeIntemporel — modular precision blocks (AGENTS.md section 9)", () => {
  it("renders all five precision blocks, each with its own label and text, when all are present", () => {
    renderNotice();

    expect(screen.getByText("Lieu général")).toBeTruthy();
    expect(screen.getByText("Les obsèques se dérouleront à Lyon.")).toBeTruthy();
    expect(screen.getByText("Mot de la famille")).toBeTruthy();
    expect(screen.getByText("Sa famille tient à remercier chaleureusement toutes les personnes présentes.")).toBeTruthy();
    expect(screen.getByText("Pensée")).toBeTruthy();
    expect(screen.getByText("Toujours à l'écoute, toujours présente.")).toBeTruthy();
    expect(screen.getByText("Citation")).toBeTruthy();
    expect(screen.getByText("« Il y a quelque chose de plus fort que la mort. »")).toBeTruthy();
    expect(screen.getByText("Autre précision")).toBeTruthy();
    expect(
      screen.getByText("En lieu et place de fleurs, la famille souhaite un don aux enfants hospitalisés."),
    ).toBeTruthy();
  });

  it("renders no precision block label at all when every precision is absent — no empty section, no trou", () => {
    renderNotice({ deathNotice: { ...FULL_DEATH_NOTICE, precisions: EMPTY_DEATH_NOTICE_PRECISIONS } });

    expect(screen.queryByText("Lieu général")).toBeNull();
    expect(screen.queryByText("Mot de la famille")).toBeNull();
    expect(screen.queryByText("Pensée")).toBeNull();
    expect(screen.queryByText("Citation")).toBeNull();
    expect(screen.queryByText("Autre précision")).toBeNull();
  });

  it("renders exactly one precision block when only one is present", () => {
    renderNotice({
      deathNotice: {
        ...FULL_DEATH_NOTICE,
        precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, thought: "Une pensée pour tous." },
      },
    });

    expect(screen.getByText("Pensée")).toBeTruthy();
    expect(screen.getByText("Une pensée pour tous.")).toBeTruthy();
    expect(screen.queryByText("Lieu général")).toBeNull();
    expect(screen.queryByText("Citation")).toBeNull();
  });

  it.each(["generalLocation", "familyMessage", "thought", "quote", "other"] as const)(
    "renders the '%s' precision alone correctly",
    (field) => {
      renderNotice({
        deathNotice: {
          ...FULL_DEATH_NOTICE,
          precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, [field]: "Texte de la famille." },
        },
      });
      expect(screen.getByText("Texte de la famille.")).toBeTruthy();
    },
  );
});

describe("DeathNoticeIntemporel — skin scoping", () => {
  it("scopes the render under data-heritage-skin / data-heritage-skin-variant", () => {
    const { container } = renderNotice({ skinVariant: "dark" });
    const scope = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute("data-heritage-skin-variant")).toBe("dark");
  });
});

describe("DeathNoticeIntemporel — Light/Dark real assets (Mission 039B correction)", () => {
  it("uses the Light paper/botanical/seal/ornament assets by default", () => {
    const { container } = renderNotice({ skinVariant: "light" });

    const card = container.querySelector('[class*="card"]') as HTMLElement;
    expect(card.style.backgroundImage).toContain("/assets/death-notice/intemporel/paper-background-tile.png");
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/botanical-left.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/botanical-right.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/seal-heritage.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/ornament-branch.png"]')).toBeTruthy();
    // No Dark asset leaks into the Light render.
    expect(container.innerHTML).not.toMatch(/-dark\.png/);
  });

  it("uses the REAL Dark pack assets (V2 QG FINAL) when skinVariant is dark — never the Light ones, never a V1 leftover", () => {
    const { container } = renderNotice({ skinVariant: "dark" });

    const card = container.querySelector('[class*="card"]') as HTMLElement;
    expect(card.style.backgroundImage).toContain("/assets/death-notice/intemporel/paper-background-dark.png");
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/botanical-left-dark.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/botanical-right-dark.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/seal-heritage-dark.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/ornament-branch-dark.png"]')).toBeTruthy();
    // No Light asset leaks into the Dark render, and no V1 filename
    // (this V2 pack's own README: "ne pas mélanger avec... la texture
    // de V1" — a V1 leftover would not match this exact filename).
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/botanical-left.png"]')).toBeNull();
    expect(container.querySelector('img[src="/assets/death-notice/intemporel/seal-heritage.png"]')).toBeNull();
    expect(card.style.backgroundImage).not.toContain("paper-background-tile.png\")");
  });

  it("reuses the EXACT SAME precision icon files in both variants — no second (Dark) icon asset invented", () => {
    const contentWithOnePrecision = {
      ...FULL_DEATH_NOTICE,
      precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, thought: "Une pensée." },
    };

    const light = renderNotice({ skinVariant: "light", deathNotice: contentWithOnePrecision });
    const lightIcon = light.container.querySelector('[class*="precisionIcon"]') as HTMLElement;
    const lightMaskSrc = lightIcon.style.maskImage || lightIcon.style.getPropertyValue("-webkit-mask-image");
    cleanup();

    const dark = renderNotice({ skinVariant: "dark", deathNotice: contentWithOnePrecision });
    const darkIcon = dark.container.querySelector('[class*="precisionIcon"]') as HTMLElement;
    const darkMaskSrc = darkIcon.style.maskImage || darkIcon.style.getPropertyValue("-webkit-mask-image");

    expect(lightMaskSrc).toContain("/assets/death-notice/intemporel/icon-thought.png");
    expect(darkMaskSrc).toBe(lightMaskSrc);
  });

  it("never applies a CSS filter/inversion to fake Dark from the Light paper/botanical/seal/ornament assets", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"), "utf8");
    expect(source).not.toMatch(/filter\s*:/);
    expect(source).not.toMatch(/invert\(/);
  });
});

describe("DeathNoticeIntemporel — accessibility", () => {
  it("marks every decorative image aria-hidden with an empty alt", () => {
    const { container } = renderNotice();
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("never bakes family text into an asset filename — every image src is a fixed Studio asset path", () => {
    const { container } = renderNotice();
    const sources = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    for (const src of sources) {
      expect(src).toMatch(/^\/assets\/death-notice\/intemporel\//);
    }
  });
});
