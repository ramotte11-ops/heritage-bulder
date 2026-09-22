// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";

/**
 * Récit de vie Runtime — Handoff GREEN QG
 * `HERITAGE_RDV_HANDOFF_RUNTIME_V1_0_QG_AUDIT`. Contract tests for the
 * real Memorial renderer. Same discipline as CeremonyIntemporel.test.tsx:
 * state/render contracts, never computed CSS/pixel layout from a real
 * browser engine — that is QG's own screenshot pass (QA.md), not a
 * jsdom unit test's job.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  EB_Garamond: (opts: { style?: string[] }) =>
    opts?.style?.includes("italic")
      ? { variable: "--font-heritage-recit-serif-italic-mock", className: "eb-garamond-italic-mock" }
      : { variable: "--font-heritage-ceremony-serif-mock", className: "eb-garamond-mock" },
}));

const { RecitDeVieIntemporel } = await import("./RecitDeVieIntemporel");

afterEach(cleanup);

function contentWith(fields: { personWords?: string | null; lovedThings?: string | null; legacy?: string | null }): MemorialContent {
  const content: MemorialContent = {};
  if (fields.personWords !== undefined) (content as Record<string, unknown>).personWords = { text: fields.personWords };
  if (fields.lovedThings !== undefined) (content as Record<string, unknown>).lovedThings = { text: fields.lovedThings };
  if (fields.legacy !== undefined) (content as Record<string, unknown>).legacy = { text: fields.legacy };
  return content;
}

function renderRecit(overrides: Partial<React.ComponentProps<typeof RecitDeVieIntemporel>> = {}) {
  return render(
    <RecitDeVieIntemporel
      content={contentWith({ personWords: "Texte A10.", lovedThings: "Texte A11.", legacy: "Texte A12." })}
      language="fr"
      skinVariant="light"
      {...overrides}
    />,
  );
}

describe("RecitDeVieIntemporel — always three matters, never a hidden/partial state", () => {
  it("renders A10, A11 and A12, in canonical order, even with a fully empty content", () => {
    const { container } = renderRecit({ content: {} });
    const matterEls = Array.from(container.querySelectorAll("[data-matter]"));
    expect(matterEls.map((el) => el.getAttribute("data-matter"))).toEqual(["a10", "a11", "a12"]);
  });

  it("three empty matters -> three fallback bodies visible, section itself never disappears", () => {
    const { container, getByText } = renderRecit({ content: {} });
    expect(container.querySelector('[data-testid="recit-de-vie-intemporel"]')).toBeTruthy();
    expect(getByText("Une vie se raconte aussi dans les souvenirs qu’elle laisse derrière elle.")).toBeTruthy();
    expect(getByText("Ce sont souvent les choses les plus simples qui deviennent nos souvenirs les plus précieux.")).toBeTruthy();
    expect(getByText("Il reste parfois un geste, une phrase, un souvenir. Des choses simples que le temps n'efface pas.")).toBeTruthy();
  });

  it("marks fallback matters via data-fallback, and family-text matters as not-fallback", () => {
    const { container } = renderRecit({ content: contentWith({ personWords: "Présent." }) });
    const a10 = container.querySelector('[data-matter="a10"]');
    const a11 = container.querySelector('[data-matter="a11"]');
    expect(a10?.getAttribute("data-fallback")).toBe("false");
    expect(a11?.getAttribute("data-fallback")).toBe("true");
  });
});

describe("RecitDeVieIntemporel — family text verbatim, never replaced by fallback", () => {
  it("renders the family's own words when present", () => {
    const { getByText } = renderRecit({
      content: contentWith({ personWords: "Elle avait un rire lumineux." }),
    });
    expect(getByText("Elle avait un rire lumineux.")).toBeTruthy();
  });

  it("a stress 240/240/240 case renders every matter's full text, uncollided, untruncated", () => {
    const text240 = "Un texte familial représentatif qui approche la limite contractuelle de deux cent quarante caractères sans jamais être coupé, résumé, ni tronqué par le runtime HERITAGE, quelle que soit la largeur affichée à l'écran.".slice(0, 240);
    const { getAllByText } = renderRecit({
      content: contentWith({ personWords: text240, lovedThings: text240, legacy: text240 }),
    });
    expect(getAllByText(text240)).toHaveLength(3);
  });

  it("mixed: one matter has family text, the other two show their own fallback", () => {
    const { getByText } = renderRecit({
      content: contentWith({ personWords: "Mots de la famille." }),
    });
    expect(getByText("Mots de la famille.")).toBeTruthy();
    expect(getByText("Ce sont souvent les choses les plus simples qui deviennent nos souvenirs les plus précieux.")).toBeTruthy();
  });
});

describe("RecitDeVieIntemporel — Studio assets, never a separate runtime icon", () => {
  it("Light: renders the light Mobile stack and Desktop scene, never dark", () => {
    const { container } = renderRecit({ skinVariant: "light" });
    expect(container.querySelector('img[src*="/mobile/light/top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/mobile/light/middle.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/mobile/light/bottom.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/desktop/light.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/dark/"]')).toBeNull();
  });

  it("Dark: renders the dark Mobile stack and Desktop scene, never light", () => {
    const { container } = renderRecit({ skinVariant: "dark" });
    expect(container.querySelector('img[src*="/mobile/dark/top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/desktop/dark.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/mobile/light/"]')).toBeNull();
    expect(container.querySelector('img[src*="/desktop/light.png"]')).toBeNull();
  });

  it("exactly four ART images (3 Mobile + 1 Desktop), no separate icon image, no inline SVG", () => {
    const { container } = renderRecit();
    expect(container.querySelectorAll("img").length).toBe(4);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("RecitDeVieIntemporel — Light/Dark ink parity, no layout change", () => {
  it("sets the light ink custom property", () => {
    const { container } = renderRecit({ skinVariant: "light" });
    const wrap = container.querySelector('[data-testid="recit-de-vie-intemporel"]') as HTMLElement;
    expect(wrap.style.getPropertyValue("--recit-ink")).toBe("#39332E");
  });

  it("sets the dark ink custom property", () => {
    const { container } = renderRecit({ skinVariant: "dark" });
    const wrap = container.querySelector('[data-testid="recit-de-vie-intemporel"]') as HTMLElement;
    expect(wrap.style.getPropertyValue("--recit-ink")).toBe("#F9F2E4");
  });

  it("never uses prefers-color-scheme — skinVariant alone decides", () => {
    const { container } = renderRecit({ skinVariant: "dark" });
    expect(container.innerHTML).not.toContain("prefers-color-scheme");
  });

  it("theme switch changes no DOM structure — same matters, same text, only ink differs", () => {
    const light = renderRecit({ skinVariant: "light" });
    const lightMatters = Array.from(light.container.querySelectorAll("[data-matter]")).map((el) => el.textContent);
    light.unmount();

    const dark = renderRecit({ skinVariant: "dark" });
    const darkMatters = Array.from(dark.container.querySelectorAll("[data-matter]")).map((el) => el.textContent);
    expect(darkMatters).toEqual(lightMatters);
  });
});

describe("RecitDeVieIntemporel — i18n structural text resolves per language", () => {
  it("French", () => {
    const { getByText } = renderRecit({ language: "fr" });
    expect(getByText("LE RÉCIT D’UNE VIE")).toBeTruthy();
    expect(getByText("LA PERSONNE QU’ELLE ÉTAIT")).toBeTruthy();
    expect(getByText("Des souvenirs qui restent.")).toBeTruthy();
  });

  it("English structural labels resolve, without inventing an English fallback translation", () => {
    const { getByText, getAllByText } = renderRecit({ language: "en", content: {} });
    expect(getByText("Memories that remain.")).toBeTruthy();
    // The EN fallback is the explicit, flagged technical marker — never an
    // invented translation of the FR fallback's editorial meaning. All
    // three matters show it (all three are empty in this case).
    expect(getAllByText(/not yet validated by QG/)).toHaveLength(3);
  });
});

describe("RecitDeVieIntemporel — corrupted content never crashes", () => {
  it("a corrupted content.legacy renders without throwing, falls back for that matter only", () => {
    const corrupted = {
      legacy: "not an object",
      personWords: { text: "Présent." },
    } as MemorialContent;
    expect(() => renderRecit({ content: corrupted })).not.toThrow();
    const { container } = renderRecit({ content: corrupted });
    expect(container.querySelector('[data-matter="a10"]')?.getAttribute("data-fallback")).toBe("false");
    expect(container.querySelector('[data-matter="a12"]')?.getAttribute("data-fallback")).toBe("true");
  });

  it("entirely absent content renders without throwing", () => {
    expect(() => renderRecit({ content: {} })).not.toThrow();
  });
});
