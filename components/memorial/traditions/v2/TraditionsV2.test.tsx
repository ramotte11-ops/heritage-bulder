// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { TraditionEntry, TraditionsContent } from "@/types/traditions";

/**
 * Traditions & repères V2 — pilote Mobile Light (P1). Contrats du renderer :
 * décor authentique (SHA-256), repères de la famille rendus tels quels
 * (titre facultatif, texte libre, nombre libre), un médaillon neutre par
 * repère, textes HERITAGE traduits, aucune variante non construite.
 * jsdom ne fait aucune mise en page : l'allongement réel du décor est
 * vérifié par les captures de validation.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { TraditionsV2 } = await import("./TraditionsV2");
const { TRADITIONS_V2_TOKENS } = await import("@/config/traditions-v2-tokens");

afterEach(cleanup);

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const MOBILE_LIGHT = TRADITIONS_V2_TOKENS.light!.mobile;
/** SHA-256 du décor vierge Mobile Light remis par la PO
 * (`HERITAGE_TRADITIONS_02_DECORS_VIERGES.zip`, MANIFESTE.txt). */
const PO_MOBILE_LIGHT_DECOR_SHA256 = "203dfe8eb18c82b3c4ecdf0d78c9d2ee2cb08ff097d0bef83a67e7c8f40357b5";

function entry(n: number, title: string | null, text: string): TraditionEntry {
  return { id: `e${n}`, origin: "custom", suggestionId: null, title, text };
}

function traditions(...entries: TraditionEntry[]): TraditionsContent {
  return { entries };
}

function renderTraditions(props: Partial<React.ComponentProps<typeof TraditionsV2>> = {}) {
  return render(
    <TraditionsV2
      traditions={traditions(entry(1, "Fleurs", "Une pensée suffit."), entry(2, null, "Merci d’être là."))}
      language="fr"
      skinVariant="light"
      {...props}
    />,
  );
}

function publicFile(src: string) {
  return path.join(ROOT, "public", src);
}

describe("TraditionsV2 — décor et dérivés", () => {
  it("le décor runtime est le décor vierge de la PO, octet pour octet", () => {
    expect(MOBILE_LIGHT.masterSha256).toBe(PO_MOBILE_LIGHT_DECOR_SHA256);
    const digest = createHash("sha256").update(readFileSync(publicFile(MOBILE_LIGHT.masterSrc))).digest("hex");
    expect(digest).toBe(PO_MOBILE_LIGHT_DECOR_SHA256);
    expect(MOBILE_LIGHT.canvas).toEqual({ width: 941, height: 1671 });
  });

  it("chaque texture dérivée existe, et aucune n'est le décor", () => {
    const derived = [MOBILE_LIGHT.paperTone, MOBILE_LIGHT.edgeStrip.src, ...MOBILE_LIGHT.paperGrains.map((g) => g.src)];
    expect(new Set(derived).size).toBe(derived.length);
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).not.toBe(MOBILE_LIGHT.masterSrc);
      expect(src).toContain("/traditions/v2/mobile/light/");
    }
  });

  it("la coupe et son fondu tombent dans le Master, sous l'en-tête et au-dessus du pied", () => {
    expect(MOBILE_LIGHT.cutY - MOBILE_LIGHT.fadePx).toBeGreaterThan(MOBILE_LIGHT.textTopCanvas);
    expect(MOBILE_LIGHT.cutY + MOBILE_LIGHT.fadePx).toBeLessThan(MOBILE_LIGHT.canvas.height - MOBILE_LIGHT.footCanvas);
    // La bande des bords est tirée au-dessus de la fin du fondu bas.
    expect(MOBILE_LIGHT.cutY + MOBILE_LIGHT.fadePx - MOBILE_LIGHT.edgeStrip.heightCanvas).toBeGreaterThan(0);
  });

  it("seule la variante Light est construite : Dark ne rend rien (aucun repli sur Light)", () => {
    expect(TRADITIONS_V2_TOKENS.dark).toBeNull();
    const { container } = renderTraditions({ skinVariant: "dark" });
    expect(container.querySelector('[data-testid="traditions-v2"]')).toBeNull();
  });

  it("le décor est purement décoratif ; pas de surface sans excédent mesuré", () => {
    const { container } = renderTraditions();
    const section = container.querySelector('[data-testid="traditions-v2"]')!;
    expect(section.getAttribute("data-extended")).toBe("false");
    expect(container.querySelector('[class*="paper"]:not([class*="entryPaper"])')).toBeNull();
    expect(container.querySelector('[class*="edges"]')).toBeNull();
    for (const cls of ["master", "bottom"]) {
      expect(container.querySelector(`[class*="${cls}"]`)!.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("TraditionsV2 — repères de la famille, tels quels", () => {
  it("un feuillet par repère, dans l'ordre saisi, texte et titre inchangés (aucun guillemet ajouté)", () => {
    const entries = [
      entry(1, "Cérémonie & recueillement", "Merci d’arriver en avance."),
      entry(2, "Fleurs", "“Une pensée suffit.”"),
      entry(3, null, "Ligne 1\nLigne 2"),
    ];
    const { container } = renderTraditions({ traditions: traditions(...entries) });
    const items = Array.from(container.querySelectorAll("li"));
    expect(items.map((li) => li.getAttribute("data-entry"))).toEqual(["e1", "e2", "e3"]);
    items.forEach((li, i) => {
      expect(li.querySelector("p")!.textContent).toBe(entries[i].text);
    });
    expect(items[0].querySelector("h2")!.textContent).toBe("Cérémonie & recueillement");
  });

  it("sans titre : ni intitulé ni filet d'intitulé, le texte reste", () => {
    const { container } = renderTraditions({ traditions: traditions(entry(1, null, "Merci.")) });
    const li = container.querySelector("li")!;
    expect(li.getAttribute("data-titled")).toBe("false");
    expect(li.querySelector("h2")).toBeNull();
    expect(li.querySelector('[class*="entryRule"]')).toBeNull();
    expect(li.querySelector("p")!.textContent).toBe("Merci.");
  });

  it.each([1, 2, 4, 6, 8, 12])("%i repère(s) : autant de feuillets que de médaillons, aucun nombre imposé", (count) => {
    const entries = Array.from({ length: count }, (_, i) => entry(i + 1, `Repère ${i + 1}`, `Texte ${i + 1}`));
    const { container } = renderTraditions({ traditions: traditions(...entries) });
    expect(container.querySelectorAll("li")).toHaveLength(count);
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(count);
    for (const li of container.querySelectorAll("li")) {
      expect(li.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(1);
    }
  });

  it("sans repère : ni liste ni médaillon ; en-tête et pied HERITAGE restent", () => {
    const { container } = renderTraditions({ traditions: traditions() });
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector('[data-ornament="medaillon"]')).toBeNull();
    expect(screen.getByText("Traditions & repères")).toBeTruthy();
    expect(screen.getByText("Merci d’accompagner notre famille dans le respect de ses traditions.")).toBeTruthy();
  });

  it("médaillons neutres : le même rameau au trait pour chaque repère, aucun pictogramme selon le titre", () => {
    const { container } = renderTraditions({
      traditions: traditions(entry(1, "Cérémonie religieuse", "a"), entry(2, "Fleurs", "b"), entry(3, "Cimetière", "c")),
    });
    const drawings = Array.from(container.querySelectorAll('[data-ornament="medaillon"] svg')).map((svg) => svg.innerHTML);
    expect(new Set(drawings).size).toBe(1);
  });

  it("ornements masqués aux lecteurs d'écran", () => {
    const { container } = renderTraditions();
    for (const el of container.querySelectorAll("[data-ornament]")) {
      expect(el.closest('[aria-hidden="true"]')).toBeTruthy();
    }
  });
});

describe("TraditionsV2 — textes HERITAGE et niveaux de titre", () => {
  it.each([
    ["fr", "Pour nous accompagner", "Traditions & repères", "Merci d’accompagner notre famille dans le respect de ses traditions."],
    ["en", "To accompany us", "Traditions & personal notes", "Thank you for accompanying our family in keeping with its traditions."],
    ["es", "Para acompañarnos", "Tradiciones y detalles", "Gracias por acompañar a nuestra familia en el respeto de sus tradiciones."],
  ] as const)("%s : surtitre, titre et phrase finale traduits ; textes de la famille inchangés", (language, surtitle, title, closing) => {
    const { container } = renderTraditions({ language, traditions: traditions(entry(1, "Fleurs", "Une pensée suffit.")) });
    expect(screen.getByText(surtitle)).toBeTruthy();
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(closing)).toBeTruthy();
    expect(container.querySelector("li p")!.textContent).toBe("Une pensée suffit.");
    expect(container.querySelector("[data-variant]")!.getAttribute("lang")).toBe(language);
  });

  it("niveaux de titre : page → h1 / h2 ; section → h2 / h3", () => {
    const page = renderTraditions();
    expect(page.container.querySelector("h1")!.textContent).toBe("Traditions & repères");
    expect(page.container.querySelector("li h2")!.textContent).toBe("Fleurs");
    page.unmount();
    const section = renderTraditions({ headingLevel: "section" });
    expect(section.container.querySelector("h1")).toBeNull();
    expect(section.container.querySelector("h2")!.textContent).toBe("Traditions & repères");
    expect(section.container.querySelector("li h3")!.textContent).toBe("Fleurs");
  });
});
