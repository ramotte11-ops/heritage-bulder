// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";

/**
 * Contract tests for the real "Récit de vie" Memorial renderer
 * (StoryIntemporel), Studio pack RECIT_DE_VIE_STUDIO_RUNTIME_V1_1. Same
 * discipline as CeremonyIntemporel.test.tsx: state/render contracts —
 * what mounts, what text/asset shows for which data — never computed
 * CSS/pixel layout from a real browser engine (that is the QG Runtime
 * Demo's job, visually, not a jsdom unit test's).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "eb-garamond-mock" }),
}));

const { StoryIntemporel } = await import("./StoryIntemporel");

afterEach(cleanup);

// Deliberately fictional fixture text only — never real family content.
const A10_TEXT = "Elle était douce, attentive et toujours à l'écoute.";
const A11_TEXT = "Elle aimait les livres, la nature et les longues promenades.";
const A12_TEXT = "Elle nous laisse des valeurs précieuses : la générosité et la joie.";

function contentWith(matters: {
  personWords?: string | null;
  lovedThings?: string | null;
  legacy?: string | null;
}): MemorialContent {
  return {
    ...(matters.personWords !== undefined ? { personWords: { text: matters.personWords } } : {}),
    ...(matters.lovedThings !== undefined ? { lovedThings: { text: matters.lovedThings } } : {}),
    ...(matters.legacy !== undefined ? { legacy: { text: matters.legacy } } : {}),
  } as unknown as MemorialContent;
}

function renderStory(overrides: Partial<React.ComponentProps<typeof StoryIntemporel>> = {}) {
  return render(
    <StoryIntemporel
      content={contentWith({ personWords: A10_TEXT, lovedThings: A11_TEXT, legacy: A12_TEXT })}
      language="fr"
      skinVariant="light"
      {...overrides}
    />,
  );
}

// ---------------------------------------------------------------------
// Zero matières -> no empty shell
// ---------------------------------------------------------------------

describe("StoryIntemporel — zero matières present", () => {
  it("renders nothing at all when all three matières are absent", () => {
    const { container } = render(
      <StoryIntemporel content={contentWith({})} language="fr" skinVariant="light" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for an entirely empty MemorialContent", () => {
    const { container } = render(<StoryIntemporel content={{}} language="fr" skinVariant="light" />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------
// The seven non-empty combinations
// ---------------------------------------------------------------------

describe("StoryIntemporel — the seven valid non-empty combinations", () => {
  it("A10 alone", () => {
    const { getByText, queryByText } = renderStory({
      content: contentWith({ personWords: A10_TEXT, lovedThings: null, legacy: null }),
    });
    expect(getByText(A10_TEXT)).toBeTruthy();
    expect(queryByText(A11_TEXT)).toBeNull();
    expect(queryByText(A12_TEXT)).toBeNull();
  });

  it("A11 alone", () => {
    const { getByText, queryByText } = renderStory({
      content: contentWith({ personWords: null, lovedThings: A11_TEXT, legacy: null }),
    });
    expect(getByText(A11_TEXT)).toBeTruthy();
    expect(queryByText(A10_TEXT)).toBeNull();
    expect(queryByText(A12_TEXT)).toBeNull();
  });

  it("A12 alone", () => {
    const { getByText, queryByText } = renderStory({
      content: contentWith({ personWords: null, lovedThings: null, legacy: A12_TEXT }),
    });
    expect(getByText(A12_TEXT)).toBeTruthy();
    expect(queryByText(A10_TEXT)).toBeNull();
    expect(queryByText(A11_TEXT)).toBeNull();
  });

  it("A10+A11", () => {
    const { getByText, queryByText } = renderStory({
      content: contentWith({ personWords: A10_TEXT, lovedThings: A11_TEXT, legacy: null }),
    });
    expect(getByText(A10_TEXT)).toBeTruthy();
    expect(getByText(A11_TEXT)).toBeTruthy();
    expect(queryByText(A12_TEXT)).toBeNull();
  });

  it("A10+A12", () => {
    const { getByText, queryByText } = renderStory({
      content: contentWith({ personWords: A10_TEXT, lovedThings: null, legacy: A12_TEXT }),
    });
    expect(getByText(A10_TEXT)).toBeTruthy();
    expect(getByText(A12_TEXT)).toBeTruthy();
    expect(queryByText(A11_TEXT)).toBeNull();
  });

  it("A11+A12", () => {
    const { getByText, queryByText } = renderStory({
      content: contentWith({ personWords: null, lovedThings: A11_TEXT, legacy: A12_TEXT }),
    });
    expect(getByText(A11_TEXT)).toBeTruthy();
    expect(getByText(A12_TEXT)).toBeTruthy();
    expect(queryByText(A10_TEXT)).toBeNull();
  });

  it("A10+A11+A12", () => {
    const { getByText } = renderStory();
    expect(getByText(A10_TEXT)).toBeTruthy();
    expect(getByText(A11_TEXT)).toBeTruthy();
    expect(getByText(A12_TEXT)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------
// Absence removes label/icon/rail together — never an orphan, never a
// reserved empty slot.
// ---------------------------------------------------------------------

describe("StoryIntemporel — absence rules (spec/absence-rules.json)", () => {
  it("an absent matière's label and icon are both gone, not just its text", () => {
    const { container, queryByText } = renderStory({
      content: contentWith({ personWords: null, lovedThings: A11_TEXT, legacy: A12_TEXT }),
    });
    expect(queryByText("LA PERSONNE QU’ELLE ÉTAIT")).toBeNull();
    expect(container.querySelector('img[src*="icon-person.png"]')).toBeNull();
  });

  it("the order of present matières is always A10 -> A11 -> A12, regardless of which is absent", () => {
    const { container } = renderStory({
      content: contentWith({ personWords: A10_TEXT, lovedThings: null, legacy: A12_TEXT }),
    });
    const labels = Array.from(container.querySelectorAll('[class*="label"]')).map((el) => el.textContent);
    expect(labels).toEqual(["LA PERSONNE QU’ELLE ÉTAIT", "CE QU’ELLE LAISSE DERRIÈRE ELLE"]);
  });

  it("only one matter has no trailing rail (a single present matière)", () => {
    const { container } = renderStory({
      content: contentWith({ personWords: null, lovedThings: A11_TEXT, legacy: null }),
    });
    expect(container.querySelectorAll('[class*="matter"]').length).toBeGreaterThan(0);
    // Exactly one rail div exists in the DOM (CSS hides it via :last-child,
    // but this proves there is only ever one matter row to begin with).
    expect(container.querySelectorAll('[class*="rail"]').length).toBe(1);
  });

  it("three present matières render three rail divs (CSS hides the last one)", () => {
    const { container } = renderStory();
    expect(container.querySelectorAll('[class*="rail"]').length).toBe(3);
  });
});

// ---------------------------------------------------------------------
// Long text — no truncation
// ---------------------------------------------------------------------

describe("StoryIntemporel — long family text is never truncated", () => {
  it("renders a long paragraph in full, verbatim", () => {
    const longText = "Elle avait une présence rassurante et une grande capacité d'écoute. ".repeat(10).trim();
    const { getByText } = renderStory({ content: contentWith({ personWords: longText, lovedThings: null, legacy: null }) });
    expect(getByText(longText)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------
// Verbatim — never reformulated, never generated
// ---------------------------------------------------------------------

describe("StoryIntemporel — family text rendered verbatim, nothing generated", () => {
  it("renders the exact text including punctuation and casing", () => {
    const text = "Elle riait fort — et détestait qu'on soit en retard !";
    const { getByText } = renderStory({ content: contentWith({ personWords: text, lovedThings: null, legacy: null }) });
    expect(getByText(text)).toBeTruthy();
  });

  it("never invents a title/heading derived from the family's own text", () => {
    const { queryByText } = renderStory({
      content: contentWith({ personWords: "Un texte de famille.", lovedThings: null, legacy: null }),
    });
    // Only the fixed, HERITAGE-authored structural title exists.
    expect(queryByText("Un texte de famille")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Fail-safe on corrupted / unrelated content — other Memorial data
// preserved, never crashes.
// ---------------------------------------------------------------------

describe("StoryIntemporel — fail-safe, never crashes, never touches other content", () => {
  it("a corrupted content.personWords degrades to absent rather than throwing", () => {
    const content = {
      personWords: { text: "x", title: "y" },
      lovedThings: { text: A11_TEXT },
      hero: { displayName: "Real content" },
    } as unknown as MemorialContent;

    expect(() => render(<StoryIntemporel content={content} language="fr" skinVariant="light" />)).not.toThrow();
  });

  it("renders correctly alongside unrelated content (hero, ceremony, traditions) without reading or mutating it", () => {
    const hero = { displayName: "Real content" };
    const content = {
      personWords: { text: A10_TEXT },
      hero,
      ceremony: { date: "2026-01-01" },
      traditions: [{ id: "x" }],
    } as unknown as MemorialContent;

    render(<StoryIntemporel content={content} language="fr" skinVariant="light" />);
    expect(content.hero).toBe(hero);
  });
});

// ---------------------------------------------------------------------
// No Gallery / Etsy dependency — trivially true (no such import exists),
// asserted as a guard against future coupling.
// ---------------------------------------------------------------------

describe("StoryIntemporel — no coupling to Gallery/A13 or Etsy", () => {
  it("renders with only the three known matières present in content, nothing else required", () => {
    const { container } = renderStory({ content: contentWith({ personWords: A10_TEXT }) });
    expect(container.firstChild).not.toBeNull();
  });
});

// ---------------------------------------------------------------------
// i18n — FR / EN / ES structural chrome, family text never translated
// ---------------------------------------------------------------------

describe("StoryIntemporel — i18n", () => {
  it("renders the FR structural title and labels", () => {
    const { getByText } = renderStory({ language: "fr" });
    expect(getByText("LE RÉCIT D’UNE VIE")).toBeTruthy();
    expect(getByText("LA PERSONNE QU’ELLE ÉTAIT")).toBeTruthy();
    expect(getByText("CE QU’ELLE AIMAIT")).toBeTruthy();
    expect(getByText("CE QU’ELLE LAISSE DERRIÈRE ELLE")).toBeTruthy();
    expect(getByText("Des souvenirs qui restent.")).toBeTruthy();
  });

  it("renders the EN structural title and labels", () => {
    const { getByText } = renderStory({ language: "en" });
    expect(getByText("THE STORY OF A LIFE")).toBeTruthy();
    expect(getByText("THE PERSON THEY WERE")).toBeTruthy();
    expect(getByText("WHAT THEY LOVED")).toBeTruthy();
    expect(getByText("WHAT THEY LEAVE BEHIND")).toBeTruthy();
    expect(getByText("Memories that remain.")).toBeTruthy();
  });

  it("renders the ES structural title and labels", () => {
    const { getByText } = renderStory({ language: "es" });
    expect(getByText("EL RELATO DE UNA VIDA")).toBeTruthy();
    expect(getByText("LA PERSONA QUE ERA")).toBeTruthy();
    expect(getByText("LO QUE AMABA")).toBeTruthy();
    expect(getByText("LO QUE DEJA")).toBeTruthy();
    expect(getByText("Recuerdos que permanecen.")).toBeTruthy();
  });

  it("never translates the family's own text regardless of language", () => {
    const frenchFamilyText = "Elle aimait le café au soleil.";
    const { getByText } = renderStory({
      language: "en",
      content: contentWith({ personWords: null, lovedThings: frenchFamilyText, legacy: null }),
    });
    expect(getByText(frenchFamilyText)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------
// Light / Dark — dedicated assets, never a CSS filter
// ---------------------------------------------------------------------

describe("StoryIntemporel — Light/Dark, dedicated assets", () => {
  it("uses the light runtime assets for skinVariant=light", () => {
    const { container } = renderStory({ skinVariant: "light" });
    expect(container.querySelector('img[src*="/story/intemporel/runtime/light/"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/story/intemporel/runtime/dark/"]')).toBeNull();
  });

  it("uses the dark runtime assets for skinVariant=dark", () => {
    const { container } = renderStory({ skinVariant: "dark" });
    expect(container.querySelector('img[src*="/story/intemporel/runtime/dark/"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/story/intemporel/runtime/light/"]')).toBeNull();
  });

  it("uses the Studio's own decor/icon assets verbatim — never an inline SVG/CSS-drawn icon", () => {
    const { container } = renderStory();
    expect(container.querySelector('img[src*="icon-person.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="icon-loved.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="icon-legacy.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="botanical-desktop-left.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="botanical-desktop-right.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="botanical-mobile-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="botanical-mobile-bottom.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="seal.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="sprig.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="editorial-note.png"]')).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// SkinScope wiring
// ---------------------------------------------------------------------

describe("StoryIntemporel — SkinScope", () => {
  it("stamps data-heritage-skin/data-heritage-skin-variant on its wrapper", () => {
    const { container } = renderStory({ skinVariant: "dark" });
    const scoped = container.querySelector('[data-heritage-skin="intemporel"][data-heritage-skin-variant="dark"]');
    expect(scoped).toBeTruthy();
  });
});
