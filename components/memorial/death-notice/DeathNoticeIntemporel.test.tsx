// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { HeroContent } from "@/types/hero";
import { EMPTY_DEATH_NOTICE_PRECISIONS, type DeathNoticeContent } from "@/types/death-notice";

/**
 * Mission 039B (A03) — "intégration finale du handoff Studio" — contract
 * tests for the Death Notice Intemporel renderer. Same discipline as
 * HeroIntemporel.test.tsx: state/render contracts (what appears, what
 * disappears, how it is scoped/labelled), never computed CSS/pixel
 * layout.
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

  it("renders the 'quote' precision text in italics — the pack's own dedicated typography token", () => {
    const { container } = renderNotice({
      deathNotice: {
        ...FULL_DEATH_NOTICE,
        precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, quote: "« Une citation. »" },
      },
    });
    const quoteText = screen.getByText("« Une citation. »");
    expect(quoteText.className).toMatch(/precisionTextQuote/);
    void container;
  });
});

describe("DeathNoticeIntemporel — skin scoping", () => {
  it("scopes the render under data-heritage-skin / data-heritage-skin-variant", () => {
    const { container } = renderNotice({ skinVariant: "dark" });
    const scope = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute("data-heritage-skin-variant")).toBe("dark");
  });
});

describe("DeathNoticeIntemporel — the Stage + Sheet handoff (Mission 039B intégration finale)", () => {
  it("uses the Light Stage/Sheet assets by default — never mixed with Dark", () => {
    const { container } = renderNotice({ skinVariant: "light" });

    expect(
      container.querySelector('img[src="/assets/death-notice/intemporel/a03/light/mobile/stage.png"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('source[srcset="/assets/death-notice/intemporel/a03/light/desktop/stage.png"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="/assets/death-notice/intemporel/a03/light/mobile/sheet-top.png"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="/assets/death-notice/intemporel/a03/light/desktop/sheet-top.png"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="/assets/death-notice/intemporel/a03/light/mobile/sheet-bottom.png"]'),
    ).toBeTruthy();

    // No Dark asset, and no leftover old-generation (V1 pack) asset,
    // leaks into the Light render.
    expect(container.innerHTML).not.toMatch(/\/a03\/dark\//);
    expect(container.innerHTML).not.toMatch(/runtime-top-|runtime-middle-|runtime-bottom-|ornament-branch/);
  });

  it("uses the REAL Dark Stage/Sheet assets when skinVariant is dark — never the Light ones", () => {
    const { container } = renderNotice({ skinVariant: "dark" });

    expect(
      container.querySelector('img[src="/assets/death-notice/intemporel/a03/dark/mobile/stage.png"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('source[srcset="/assets/death-notice/intemporel/a03/dark/desktop/stage.png"]'),
    ).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/\/a03\/light\//);
  });

  it("never renders a separate ornament/seal/botanical element — the rameau is now baked into sheetTop", () => {
    const { container } = renderNotice();
    expect(container.querySelector('[class*="ornament"]')).toBeNull();
    expect(container.querySelector('[class*="seal"]')).toBeNull();
    expect(container.querySelector('[class*="botanical"]')).toBeNull();
  });

  it("the old Runtime Split Pack (V1) token entries are no longer consumed by this component's source", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "DeathNoticeIntemporel.tsx"), "utf8");
    expect(source).not.toMatch(/runtimeTop\b/);
    expect(source).not.toMatch(/runtimeMiddle\b/);
    expect(source).not.toMatch(/runtimeBottom\b/);
    expect(source).not.toMatch(/ornamentBranch\b/);
  });

  it("TOP and BOTTOM caps are never stretched — their own natural aspect ratio is declared, not overridden by an explicit height", () => {
    const cssSource = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    expect(cssSource).toMatch(/aspect-ratio:\s*1107\s*\/\s*255/);
    expect(cssSource).toMatch(/aspect-ratio:\s*531\s*\/\s*300/);
    expect(cssSource).toMatch(/aspect-ratio:\s*559\s*\/\s*300/);
  });

  it("BODY tiles vertically (repeat-y), never stretched to a single deformed image", () => {
    const cssSource = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    expect(cssSource).toMatch(/background-repeat:\s*repeat-y/);
  });

  it("the Stage uses <picture>/<source> so only one breakpoint's heavy asset is requested (spec §12)", () => {
    const { container } = renderNotice();
    const picture = container.querySelector("picture");
    expect(picture).toBeTruthy();
    expect(picture?.querySelector("source[media]")).toBeTruthy();
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

    expect(lightMaskSrc).toContain("/assets/death-notice/intemporel/a03/icons/icon-thought.png");
    expect(darkMaskSrc).toBe(lightMaskSrc);
  });

  it("never applies a CSS filter/inversion to fake Dark from the Light assets", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"), "utf8");
    expect(source).not.toMatch(/filter\s*:/);
    expect(source).not.toMatch(/invert\(/);
  });
});

describe("DeathNoticeIntemporel — long name fallback (spec §9.1/§9.2)", () => {
  it("never truncates or ellipsizes the name — the full displayName is always the element's text content", () => {
    const longName = "Marie-Alexandrine de Beaumont-Rousseau Delacroix-Fontaine";
    renderNotice({ hero: { ...FULL_HERO, displayName: longName } });
    expect(screen.getByText(longName)).toBeTruthy();
  });

  it("never applies line-clamp/ellipsis CSS to the name", () => {
    const cssSource = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    expect(cssSource).not.toMatch(/line-clamp/);
    expect(cssSource).not.toMatch(/text-overflow\s*:\s*ellipsis/);
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
