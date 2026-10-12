// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";

/**
 * Récit de vie V2 — Mobile. Contrats d'affectation et de rendu ; la mise
 * en page réelle (hauteurs, raccords, collisions) est vérifiée par les
 * captures navigateur, pas par jsdom.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { RecitDeVieMobileV2 } = await import("./RecitDeVieMobileV2");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const content = {
  hero: { displayName: "Élise" },
  personWords: { text: "Née à Lyon en 1948, Élise aimait les gens." },
  lovedThings: { text: "Un café au soleil." },
  legacy: { text: "Sa générosité." },
} as unknown as MemorialContent;

describe("RecitDeVieMobileV2", () => {
  it("DARK rend la matière ivoire / champagne et son Master", () => {
    render(<RecitDeVieMobileV2 content={content} language="fr" skinVariant="dark" />);
    const section = screen.getByTestId("recit-v2-mobile");
    expect(section.dataset.artwork).toBe("ivoireChampagne");
    const wrap = section.parentElement as HTMLElement;
    expect(wrap.style.getPropertyValue("--m-src")).toBe("url(/assets/recit-de-vie/runtime-v2/mobile/ivoire-champagne.png)");
    expect(wrap.style.getPropertyValue("--ink")).toBe("#39332E");
    expect(wrap.style.getPropertyValue("--rule-guard")).toBe("0");
    expect(section.style.getPropertyValue("--d-m-src")).toBe("url(/assets/recit-de-vie/runtime-v2/desktop/ivoire-champagne-desktop.png)");
  });

  it("LIGHT rend la matière bleu pétrole, son Master et son encre claire — jamais l'ivoire", () => {
    render(<RecitDeVieMobileV2 content={content} language="fr" skinVariant="light" />);
    const section = screen.getByTestId("recit-v2-mobile");
    expect(section.dataset.artwork).toBe("bleuPetrole");
    const wrap = section.parentElement as HTMLElement;
    expect(wrap.style.getPropertyValue("--m-src")).toBe("url(/assets/recit-de-vie/runtime-v2/mobile/bleu-petrole.png)");
    expect(wrap.style.getPropertyValue("--ink")).toBe("#F9F2E4");
    expect(wrap.style.getPropertyValue("--number-size")).toBe("40px");
    expect(wrap.style.getPropertyValue("--rule-guard")).toBe("1");
    expect(section.style.getPropertyValue("--d-m-src")).toBe("url(/assets/recit-de-vie/runtime-v2/desktop/bleu-petrole-desktop.png)");
  });

  it("affiche l'en-tête, l'introduction nominative et les trois chapitres dans l'ordre", () => {
    render(<RecitDeVieMobileV2 content={content} language="fr" skinVariant="dark" />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Récit de vie");
    expect(screen.getByText(/le parcours de Élise/)).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Son histoire, sa personnalité",
      "Ses petits bonheurs",
      "Son empreinte dans nos vies",
    ]);
    expect(screen.getByText("Un café au soleil.")).toBeTruthy();
  });

  it("colle la ponctuation française au mot précédent à l'affichage, sans toucher aux données", () => {
    const withPunctuation = {
      ...content,
      legacy: { text: "Elle nous laisse une leçon : prendre le temps !" },
    } as unknown as MemorialContent;
    render(<RecitDeVieMobileV2 content={withPunctuation} language="fr" skinVariant="dark" />);
    const legacyBody = screen.getByTestId("recit-v2-mobile").querySelector('[data-matter="a12"] p:last-child');
    expect(legacyBody?.textContent).toBe("Elle nous laisse une leçon\u00A0: prendre le temps\u00A0!");
    expect((withPunctuation as unknown as { legacy: { text: string } }).legacy.text).toBe(
      "Elle nous laisse une leçon : prendre le temps !",
    );
  });
});
