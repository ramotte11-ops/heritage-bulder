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

/**
 * A tiny, brace-depth-aware CSS rule extractor — this module's own
 * stylesheet has exactly one level of `@media` nesting and never nests a
 * rule inside another rule, so a full parser is unneeded. Used only by
 * the regression tests below that need to inspect ONE specific rule's
 * own declarations without a naive regex accidentally matching past the
 * first inner `}` (which would silently stop at the wrong rule whenever
 * more than one declaration block sits inside the same `@media` query).
 */
function extractCssRuleBlocks(css: string): { selector: string; body: string; mediaContext: string | null }[] {
  const blocks: { selector: string; body: string; mediaContext: string | null }[] = [];
  const mediaStack: string[] = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (/\s/.test(css[i])) {
      i++;
      continue;
    }
    if (css[i] === "}") {
      mediaStack.pop();
      i++;
      continue;
    }
    const nextBrace = css.indexOf("{", i);
    if (nextBrace === -1) break;
    const header = css.slice(i, nextBrace).trim();
    if (header.startsWith("@")) {
      mediaStack.push(header);
      i = nextBrace + 1;
      continue;
    }
    const closeIdx = css.indexOf("}", nextBrace);
    const rawBody = css.slice(nextBrace + 1, closeIdx);
    const body = rawBody.replace(/\/\*[\s\S]*?\*\//g, "");
    blocks.push({ selector: header, body, mediaContext: mediaStack[mediaStack.length - 1] ?? null });
    i = closeIdx + 1;
  }
  return blocks;
}

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

  it("REGRESSION (QG audit): Desktop Stage crops (object-fit: cover) to fill .wrap's real height, never a fixed height incompatible with dynamic content", () => {
    // A prior version left Desktop `.stage` at `height: auto` — its own
    // fixed natural render, independent of `.wrap`'s real (dynamic,
    // content-driven) height. Any Sheet taller than that fixed render
    // exposed a flat `--dn-stage-bg` rectangle below the real Studio art
    // — a visible horizontal seam a live QG audit caught at a real
    // 1440px desktop viewport. The fix makes Desktop `.stage` fill
    // `.wrap`'s own height and crop (never stretch) the SAME unmodified
    // asset via `object-fit: cover` — this guards against silently
    // reverting to a content-independent fixed height.
    const cssSource = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    const blocks = extractCssRuleBlocks(cssSource);
    const desktopStageBlock = blocks.find(
      (b) => b.selector.includes(".stage") && (b.mediaContext ?? "").includes("768px"),
    );
    expect(desktopStageBlock).toBeTruthy();
    expect(desktopStageBlock!.body).toMatch(/height:\s*100%/);
    expect(desktopStageBlock!.body).toMatch(/object-fit:\s*cover/);
    expect(desktopStageBlock!.body).not.toMatch(/height:\s*auto/);
  });

  it("REGRESSION (QG audit): the Desktop cap-text clearance keeps the title above the rameau baked into sheet-top", () => {
    // Measured directly off `light/desktop/sheet-top.png`'s own opaque
    // pixels: the rameau sits at 46.7%-64.7% of the cap's own height. A
    // prior clearance (12%, then 6%) let the eyebrow+title block's real
    // rendered height reach into that zone at real Desktop widths (QG
    // audit at 1440px viewport, Sheet ~953px) — invisible in narrower
    // dev-harness measurements. This guards the clearance stays small
    // enough (title finishes comfortably above 46.7%) without a human
    // re-deriving the pixel math by eye.
    const cssSource = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    const blocks = extractCssRuleBlocks(cssSource);
    const desktopCapTextBoxBlock = blocks.find(
      (b) => b.selector.includes(".capTextBox") && (b.mediaContext ?? "").includes("768px"),
    );
    expect(desktopCapTextBoxBlock).toBeTruthy();
    const paddingTopMatch = desktopCapTextBoxBlock!.body.match(/padding-top:\s*([\d.]+)%/);
    expect(paddingTopMatch).toBeTruthy();
    expect(Number(paddingTopMatch![1])).toBeLessThanOrEqual(4);
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

  it("REGRESSION (QG audit): useFitLongName applies .nameFallback BEFORE measuring, never after", () => {
    // A prior version added the class only via `setResult` -> React
    // re-render, which happens AFTER the measurement loop below has
    // already run — so the loop measured against the wider, pre-fallback
    // box and could exit one or more sizes too early, silently shipping
    // a name that re-wrapped past 3 lines the moment React narrowed the
    // box a moment later (the exact bug a live QG audit at a real 390px
    // viewport caught: the QA name rendered 4 lines at a stale 33px).
    // Guard the FIX's own ordering directly in source: the imperative
    // `classList.add` must appear before the `while (lines >` loop that
    // does the actual size measurement.
    const source = readFileSync(path.resolve(import.meta.dirname, "DeathNoticeIntemporel.tsx"), "utf8");
    const addIndex = source.indexOf("el.classList.add(styles.nameFallback)");
    const loopIndex = source.indexOf("while (lines > fb.maxLines");
    expect(addIndex).toBeGreaterThan(-1);
    expect(loopIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeLessThan(loopIndex);
  });

  it("REGRESSION (QG audit): the fallback max-width resolves against the Sheet's own width, not .content's already-padded box", () => {
    // Spec §9.2 caps the fallback name at "88% de la feuille mobile" —
    // the SHEET's width. `.name`'s actual CSS containing block is
    // `.content`, which already loses 20% of the Sheet's width to its
    // own horizontal padding (10% each side) — so a naive
    // `max-width: 88%` here resolves against that already-narrower box
    // (effectively ~70% of the Sheet), not the spec's own 88%. The fix
    // expresses the Sheet-relative 88% AS a percentage of `.content`'s
    // width (88 / 80 = 110%) with a matching negative margin breakout,
    // recentering the box. A regression back to a bare `max-width: 88%`
    // (with no compensating negative margin) silently narrows the
    // fallback name again — exactly what caused the QA name to fail to
    // reach 3 lines even at the 32px floor.
    const cssSource = readFileSync(
      path.resolve(import.meta.dirname, "DeathNoticeIntemporel.module.css"),
      "utf8",
    );
    const fallbackBlockMatch = cssSource.match(/\.nameFallback\s*\{[^}]*\}/);
    expect(fallbackBlockMatch).toBeTruthy();
    const block = fallbackBlockMatch![0];
    expect(block).toMatch(/max-width:\s*110%/);
    expect(block).toMatch(/margin-left:\s*-5%/);
    expect(block).toMatch(/margin-right:\s*-5%/);
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
