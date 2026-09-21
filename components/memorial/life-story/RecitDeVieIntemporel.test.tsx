// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";

/**
 * Récit de vie Runtime V1.3.1 — contract tests for the real Memorial
 * renderer. Same discipline as CeremonyIntemporel.test.tsx/
 * DeathNoticeIntemporel.test.tsx: state/render contracts (what mounts,
 * what text/asset shows for which data, the seven presence states, the
 * rail rules), never computed CSS/pixel layout from a real browser
 * engine — that is QG's own screenshot pass, not a jsdom unit test's
 * job (mission brief section 15/21: "Les tests jsdom ne prétendent pas
 * valider la fidélité pixel").
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

const ALL_THREE = contentWith({
  personWords: "Elle avait toujours le mot pour rire.",
  lovedThings: "Le jardin, les dimanches en famille, le café du matin.",
  legacy: "Un héritage de gentillesse et de patience.",
});

function renderRecit(overrides: Partial<React.ComponentProps<typeof RecitDeVieIntemporel>> = {}) {
  return render(<RecitDeVieIntemporel content={ALL_THREE} language="fr" skinVariant="light" {...overrides} />);
}

describe("RecitDeVieIntemporel — presence: the seven valid states, never an eighth", () => {
  it("all three matters absent: renders nothing at all", () => {
    const { container } = renderRecit({ content: {} });
    expect(container.firstChild).toBeNull();
  });

  it("all three matters blank/whitespace-only: renders nothing (blanks-only normalizes to absent)", () => {
    const { container } = renderRecit({
      content: contentWith({ personWords: "   ", lovedThings: null, legacy: "\n\n" }),
    });
    expect(container.firstChild).toBeNull();
  });

  const cases: Array<[string, Parameters<typeof contentWith>[0], string[]]> = [
    ["A10", { personWords: "Texte A10." }, ["A10"]],
    ["A11", { lovedThings: "Texte A11." }, ["A11"]],
    ["A12", { legacy: "Texte A12." }, ["A12"]],
    ["A10+A11", { personWords: "Texte A10.", lovedThings: "Texte A11." }, ["A10", "A11"]],
    ["A10+A12", { personWords: "Texte A10.", legacy: "Texte A12." }, ["A10", "A12"]],
    ["A11+A12", { lovedThings: "Texte A11.", legacy: "Texte A12." }, ["A11", "A12"]],
    ["A10+A11+A12", { personWords: "Texte A10.", lovedThings: "Texte A11.", legacy: "Texte A12." }, ["A10", "A11", "A12"]],
  ];

  it.each(cases)("%s: renders exactly the present matters, in canonical order", (_label, fields, expectedIds) => {
    const { container } = renderRecit({ content: contentWith(fields) });
    const matterEls = Array.from(container.querySelectorAll("[data-matter]"));
    expect(matterEls.map((el) => el.getAttribute("data-matter"))).toEqual(expectedIds);
  });
});

describe("RecitDeVieIntemporel — absence removes label, icon and text together, never a phantom slot", () => {
  it("A11 absent: no 'CE QU'ELLE AIMAIT' label, no loved icon, no A11 text", () => {
    const { container, queryByText } = renderRecit({
      content: contentWith({ personWords: "Texte A10.", legacy: "Texte A12." }),
    });
    expect(queryByText("CE QU’ELLE AIMAIT")).toBeNull();
    expect(container.querySelector('img[src*="icon-loved.png"]')).toBeNull();
  });

  it("only A11 present: no person/legacy labels, no person/legacy icons", () => {
    const { container, queryByText } = renderRecit({ content: contentWith({ lovedThings: "Seul." }) });
    expect(queryByText("LA PERSONNE QU’ELLE ÉTAIT")).toBeNull();
    expect(queryByText("CE QU’ELLE LAISSE DERRIÈRE ELLE")).toBeNull();
    expect(container.querySelector('img[src*="icon-person.png"]')).toBeNull();
    expect(container.querySelector('img[src*="icon-legacy.png"]')).toBeNull();
  });
});

describe("RecitDeVieIntemporel — rails: only between present matters, never after the last", () => {
  it("single matter present: no rail-bearing sibling (only one .matter, itself :last-child)", () => {
    const { container } = renderRecit({ content: contentWith({ lovedThings: "Seul." }) });
    const matters = container.querySelectorAll("[data-matter]");
    expect(matters.length).toBe(1);
    expect(matters[0].className).toMatch(/matter/);
  });

  it("three matters present: exactly the middle DOM structure exists for two rail segments (first two are :not(:last-child))", () => {
    const { container } = renderRecit();
    const matters = Array.from(container.querySelectorAll("li[data-matter]"));
    expect(matters).toHaveLength(3);
    // The CSS timeline rail is a ::before pseudo-element on `:not(:last-child)`
    // — not a real DOM node — so this asserts the structural precondition
    // that rule depends on: exactly the first two <li>s have a following
    // sibling, the last does not.
    expect(matters[0].nextElementSibling).toBe(matters[1]);
    expect(matters[1].nextElementSibling).toBe(matters[2]);
    expect(matters[2].nextElementSibling).toBeNull();
  });
});

describe("RecitDeVieIntemporel — family text: verbatim, never reformulated", () => {
  it("renders A10/A11/A12 text exactly as stored, unmodified", () => {
    const { getByText } = renderRecit();
    expect(getByText("Elle avait toujours le mot pour rire.")).toBeTruthy();
    expect(getByText("Le jardin, les dimanches en famille, le café du matin.")).toBeTruthy();
    expect(getByText("Un héritage de gentillesse et de patience.")).toBeTruthy();
  });

  it("renders one paragraph per literal newline, in original order, nothing summarized", () => {
    const { getByText } = renderRecit({
      content: contentWith({ personWords: "Première ligne.\nDeuxième ligne.\nTroisième ligne." }),
    });
    expect(getByText("Première ligne.")).toBeTruthy();
    expect(getByText("Deuxième ligne.")).toBeTruthy();
    expect(getByText("Troisième ligne.")).toBeTruthy();
  });

  it("a long A10 text renders in full, never truncated or ellipsized", () => {
    const longText = "Un très long texte familial. ".repeat(60).trim();
    const { getByText } = renderRecit({ content: contentWith({ personWords: longText }) });
    expect(getByText(longText)).toBeTruthy();
  });
});

describe("RecitDeVieIntemporel — Studio assets, never reconstructed or substituted", () => {
  it("Light: uses the light scene/icon assets, never dark", () => {
    const { container } = renderRecit({ skinVariant: "light" });
    expect(container.querySelector('img[src*="/light/desktop-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/mobile-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/desktop-scene-bottom.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/icon-person.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/dark/"]')).toBeNull();
  });

  it("Dark: uses the dark scene/icon assets, never light", () => {
    const { container } = renderRecit({ skinVariant: "dark" });
    expect(container.querySelector('img[src*="/dark/desktop-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/dark/mobile-scene-top.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/dark/desktop-scene-bottom.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/dark/icon-person.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/"]')).toBeNull();
  });

  it("V1.3.1 runtime asset paths, never a V1.3/V1.2 or Studio reference path", () => {
    const { container } = renderRecit();
    const imgs = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    for (const src of imgs) {
      expect(src).toMatch(/^\/assets\/recit-de-vie\/intemporel\/runtime\//);
    }
  });

  it("never draws an inline SVG icon — every icon is a Studio PNG", () => {
    const { container } = renderRecit();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("the body texture never repeats on X (module stylesheet guard)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const css = readFileSync(path.resolve(import.meta.dirname, "RecitDeVieIntemporel.module.css"), "utf8");
    expect(css).toMatch(/background-repeat:\s*repeat-y/);
    expect(css).not.toMatch(/repeat-x/);
  });
});

describe("RecitDeVieIntemporel — Light/Dark ink custom properties", () => {
  it("sets the light ink custom properties", () => {
    const { container } = renderRecit({ skinVariant: "light" });
    const wrap = container.querySelector('[data-testid="recit-de-vie-intemporel"]') as HTMLElement;
    expect(wrap.style.getPropertyValue("--recit-background")).toBe("#F5EFE3");
    expect(wrap.style.getPropertyValue("--recit-title")).toBe("#302B22");
  });

  it("sets the dark ink custom properties", () => {
    const { container } = renderRecit({ skinVariant: "dark" });
    const wrap = container.querySelector('[data-testid="recit-de-vie-intemporel"]') as HTMLElement;
    expect(wrap.style.getPropertyValue("--recit-background")).toBe("#211D19");
    expect(wrap.style.getPropertyValue("--recit-title")).toBe("#F0DEBF");
  });

  it("never uses prefers-color-scheme — skinVariant alone decides", () => {
    const { container } = renderRecit({ skinVariant: "dark" });
    expect(container.innerHTML).not.toContain("prefers-color-scheme");
  });
});

describe("RecitDeVieIntemporel — i18n structural text resolves per language, family text never translated", () => {
  it("French (default)", () => {
    const { getByText } = renderRecit({ language: "fr" });
    expect(getByText("LE RÉCIT D’UNE VIE")).toBeTruthy();
    expect(getByText("LA PERSONNE QU’ELLE ÉTAIT")).toBeTruthy();
    expect(getByText("CE QU’ELLE AIMAIT")).toBeTruthy();
    expect(getByText("CE QU’ELLE LAISSE DERRIÈRE ELLE")).toBeTruthy();
    expect(getByText("Des souvenirs qui restent.")).toBeTruthy();
  });

  it("English", () => {
    const { getByText } = renderRecit({ language: "en" });
    expect(getByText("THE STORY OF A LIFE")).toBeTruthy();
    expect(getByText("THE PERSON THEY WERE")).toBeTruthy();
    expect(getByText("WHAT THEY LOVED")).toBeTruthy();
    expect(getByText("WHAT THEY LEAVE BEHIND")).toBeTruthy();
    expect(getByText("Memories that remain.")).toBeTruthy();
  });

  it("Spanish", () => {
    const { getByText } = renderRecit({ language: "es" });
    expect(getByText("EL RELATO DE UNA VIDA")).toBeTruthy();
    expect(getByText("LA PERSONA QUE ERA")).toBeTruthy();
    expect(getByText("LO QUE AMABA")).toBeTruthy();
    expect(getByText("LO QUE DEJA")).toBeTruthy();
    expect(getByText("Recuerdos que permanecen.")).toBeTruthy();
  });

  it("family text (French, verbatim) never gets swapped for a translated placeholder in another language", () => {
    const frenchOnlyText = "Elle avait toujours le mot pour rire.";
    const { getByText } = renderRecit({ language: "en", content: contentWith({ personWords: frenchOnlyText }) });
    expect(getByText(frenchOnlyText)).toBeTruthy();
  });
});

describe("RecitDeVieIntemporel — corrupted content never crashes", () => {
  it("a corrupted content.personWords (unknown key) renders without throwing", () => {
    const corrupted = {
      personWords: { text: "x", extra: "y" },
      lovedThings: { text: "Present matter." },
    } as MemorialContent;
    expect(() => renderRecit({ content: corrupted })).not.toThrow();
  });

  it("a corrupted content.legacy (wrong type) renders without throwing, corrupted matter treated as absent", () => {
    const corrupted = {
      legacy: "not an object",
      personWords: { text: "Present matter." },
    } as MemorialContent;
    const { container } = renderRecit({ content: corrupted });
    const matters = container.querySelectorAll("[data-matter]");
    expect(Array.from(matters).map((el) => el.getAttribute("data-matter"))).toEqual(["A10"]);
  });

  it("entirely absent content renders nothing without throwing", () => {
    expect(() => renderRecit({ content: {} })).not.toThrow();
  });
});
