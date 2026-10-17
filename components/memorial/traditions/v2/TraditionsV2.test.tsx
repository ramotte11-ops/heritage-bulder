// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { TraditionEntry, TraditionsContent } from "@/types/traditions";

/**
 * Traditions & repères V2 — pilotes Mobile Light (P1) et Mobile Dark (P2),
 * validés PO ; Desktop Light (P3) ; Desktop Dark (P4).
 * Contrats du renderer : un seul composant, décor authentique propre à
 * chaque variante (SHA-256), repères de la famille rendus tels quels
 * (titre facultatif, texte libre, nombre libre), un médaillon neutre par
 * repère, textes HERITAGE traduits.
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
const MOBILE_DARK = TRADITIONS_V2_TOKENS.dark!.mobile;
/** SHA-256 des décors vierges remis par la PO
 * (`HERITAGE_TRADITIONS_02_DECORS_VIERGES.zip`, MANIFESTE.txt). */
const PO_MOBILE_LIGHT_DECOR_SHA256 = "203dfe8eb18c82b3c4ecdf0d78c9d2ee2cb08ff097d0bef83a67e7c8f40357b5";
const PO_MOBILE_DARK_DECOR_SHA256 = "bbea9d4b7c3c95ad278e2961da23e80954380ce854ff90fa67f058ff379c2389";
const PO_DESKTOP_LIGHT_DECOR_SHA256 = "e21f17ca490a5d1a8a51e5850418ae6db28593fac8f0371dcb0673ebf7165566";
const DESKTOP_LIGHT = TRADITIONS_V2_TOKENS.light!.desktop!;
const PO_DESKTOP_DARK_DECOR_SHA256 = "83c1e431bdbb2e6b372001267190c0a0b0952b70be904b2dfa7223b563e10c98";
const DESKTOP_DARK = TRADITIONS_V2_TOKENS.dark!.desktop!;
const VARIANTS = [
  ["light", MOBILE_LIGHT, PO_MOBILE_LIGHT_DECOR_SHA256],
  ["dark", MOBILE_DARK, PO_MOBILE_DARK_DECOR_SHA256],
] as const;

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
  it.each(VARIANTS)("%s : le décor runtime est le décor vierge de la PO, octet pour octet", (_, T, sha) => {
    expect(T.masterSha256).toBe(sha);
    const digest = createHash("sha256").update(readFileSync(publicFile(T.masterSrc))).digest("hex");
    expect(digest).toBe(sha);
    expect(T.canvas).toEqual({ width: 941, height: 1671 });
  });

  it.each(VARIANTS)("%s : chaque texture dérivée existe, dans le dossier de sa variante, et aucune n'est le décor", (variant, T) => {
    const derived = [T.paperTone, T.edgeStrip.src, ...T.paperGrains.map((g) => g.src)];
    expect(new Set(derived).size).toBe(derived.length);
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).not.toBe(T.masterSrc);
      expect(src).toContain(`/traditions/v2/mobile/${variant}/`);
    }
  });

  it("aucun asset partagé entre Light et Dark : chaque variante a les siens", () => {
    const assets = (T: typeof MOBILE_LIGHT) => [T.masterSrc, T.paperTone, T.edgeStrip.src, ...T.paperGrains.map((g) => g.src)];
    const light = new Set(assets(MOBILE_LIGHT));
    for (const src of assets(MOBILE_DARK)) expect(light.has(src)).toBe(false);
  });

  it.each(VARIANTS)("%s : la coupe et son fondu tombent dans le Master, sous l'en-tête et au-dessus du pied", (_, T) => {
    expect(T.cutY - T.fadePx).toBeGreaterThan(T.textTopCanvas);
    expect(T.cutY + T.fadePx).toBeLessThan(T.canvas.height - T.footCanvas);
    // La bande des bords est tirée au-dessus de la fin du fondu bas.
    expect(T.cutY + T.fadePx - T.edgeStrip.heightCanvas).toBeGreaterThan(0);
  });

  it("chaque variante rend son propre décor, sans repli sur l'autre", () => {
    for (const [variant, T] of VARIANTS) {
      const { container, unmount } = renderTraditions({ skinVariant: variant });
      const wrap = container.querySelector("[data-variant]") as HTMLElement;
      expect(wrap.getAttribute("data-variant")).toBe(variant);
      expect(wrap.style.getPropertyValue("--m-src")).toBe(`url(${T.masterSrc})`);
      unmount();
    }
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

describe("TraditionsV2 — composition propre à chaque Master", () => {
  it("Light : un filet sous le surtitre, rameau au pied ; mention du coin réservée au Desktop", () => {
    const { container } = renderTraditions();
    expect(container.querySelector('[class*="surtitleRule"]')).toBeTruthy();
    expect(container.querySelector('[class*="surtitleSideRule"]')).toBeNull();
    expect(container.querySelectorAll('footer [data-ornament="rameau"]')).toHaveLength(1);
    expect(container.querySelector('footer [data-ornament="coeur"]')).toBeNull();
    // Le Master Mobile Light ne la porte pas, le Master Desktop Light si :
    // rendue, mais marquée Desktop seul (masquée sous 1024 px).
    const note = container.querySelector('[class*="cornerNote"]')!;
    expect(note.hasAttribute("data-desktop-only")).toBe(true);
    expect(note.querySelector('[class*="cornerText"]')!.textContent).toBe("Des gestes\nqui ont du sens");
  });

  it("Dark : filets de part et d'autre du surtitre, cœur au pied, mention « Des gestes qui ont du sens » et son cœur", () => {
    const { container } = renderTraditions({ skinVariant: "dark" });
    expect(container.querySelector('[class*="surtitleRule"]')).toBeNull();
    expect(container.querySelectorAll('[class*="surtitleSideRule"]')).toHaveLength(2);
    expect(container.querySelector('footer [data-ornament="rameau"]')).toBeNull();
    expect(container.querySelectorAll('footer [data-ornament="coeur"]')).toHaveLength(1);
    const note = container.querySelector('[class*="cornerText"]')!;
    expect(note.textContent).toBe("Des gestes\nqui ont du sens");
    expect(container.querySelectorAll('[class*="cornerNote"] [data-ornament="coeur"]')).toHaveLength(1);
  });

  it("Dark : mêmes feuillets dynamiques et médaillons neutres que le Light", () => {
    const entries = Array.from({ length: 8 }, (_, i) => entry(i + 1, i % 2 ? null : `Repère ${i + 1}`, `Texte ${i + 1}`));
    const { container } = renderTraditions({ skinVariant: "dark", traditions: traditions(...entries) });
    expect(container.querySelectorAll("li")).toHaveLength(8);
    const drawings = Array.from(container.querySelectorAll('[data-ornament="medaillon"] svg')).map((svg) => svg.innerHTML);
    expect(drawings).toHaveLength(8);
    expect(new Set(drawings).size).toBe(1);
  });
});

describe("TraditionsV2 — Desktop Light (P3)", () => {
  it("décor Desktop = décor vierge de la PO, octet pour octet", () => {
    expect(DESKTOP_LIGHT.masterSha256).toBe(PO_DESKTOP_LIGHT_DECOR_SHA256);
    const digest = createHash("sha256").update(readFileSync(publicFile(DESKTOP_LIGHT.masterSrc))).digest("hex");
    expect(digest).toBe(PO_DESKTOP_LIGHT_DECOR_SHA256);
    expect(DESKTOP_LIGHT.canvas).toEqual({ width: 1670, height: 941 });
  });

  it("chaque dérivé Desktop existe dans son dossier ; la zone droite n'a pas de bande des bords", () => {
    const { left, right } = DESKTOP_LIGHT.zones;
    const derived = [left.paperTone, right.paperTone, left.edgeStrip!.src, ...DESKTOP_LIGHT.paperGrains.map((g) => g.src)];
    expect(new Set(derived).size).toBe(derived.length);
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).toContain("/traditions/v2/desktop/light/");
      expect(src).not.toBe(DESKTOP_LIGHT.masterSrc);
    }
    expect(right.edgeStrip).toBeNull();
  });

  it("deux zones : coupes et fondus dans le canevas, fondu des zones dans la feuille nue", () => {
    const H = DESKTOP_LIGHT.canvas.height;
    for (const zone of [DESKTOP_LIGHT.zones.left, DESKTOP_LIGHT.zones.right]) {
      expect(zone.cutY - zone.fadePx).toBeGreaterThan(0);
      expect(zone.cutY + zone.fadePx).toBeLessThan(H - DESKTOP_LIGHT.footCanvas);
      if (zone.edgeStrip !== null) expect(zone.cutY + zone.fadePx - zone.edgeStrip.heightCanvas).toBeGreaterThan(0);
    }
    expect(DESKTOP_LIGHT.zoneSplitCanvas - DESKTOP_LIGHT.zoneBlendCanvas / 2).toBeGreaterThan(DESKTOP_LIGHT.textLeftCanvas);
    expect(DESKTOP_LIGHT.zoneSplitCanvas + DESKTOP_LIGHT.zoneBlendCanvas / 2).toBeLessThan(DESKTOP_LIGHT.textRightCanvas);
  });

  it("Light : même DOM, pile de la zone droite et réglages Desktop présents", () => {
    const light = renderTraditions();
    expect(light.container.querySelector("[data-variant]")!.hasAttribute("data-desktop")).toBe(true);
    expect(light.container.querySelectorAll('[data-zone="right"]')).toHaveLength(1);
    const section = light.container.querySelector('[data-testid="traditions-v2"]') as HTMLElement;
    expect(section.style.getPropertyValue("--d-m-src")).toBe(`url(${DESKTOP_LIGHT.masterSrc})`);
    expect(section.style.getPropertyValue("--d-edges-src-right")).toBe("none");
  });

  it.each([1, 3, 5, 8])("%i repère(s) : mêmes feuillets et médaillons en Desktop (aucun plafond)", (count) => {
    const entries = Array.from({ length: count }, (_, i) => entry(i + 1, i === 0 ? null : `Repère ${i + 1}`, `Texte ${i + 1}`));
    const { container } = renderTraditions({ traditions: traditions(...entries) });
    expect(container.querySelectorAll("li")).toHaveLength(count);
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(count);
  });
});

describe("TraditionsV2 — Desktop Dark (P4)", () => {
  it("décor Desktop Dark = décor vierge de la PO, octet pour octet", () => {
    expect(DESKTOP_DARK.masterSha256).toBe(PO_DESKTOP_DARK_DECOR_SHA256);
    const digest = createHash("sha256").update(readFileSync(publicFile(DESKTOP_DARK.masterSrc))).digest("hex");
    expect(digest).toBe(PO_DESKTOP_DARK_DECOR_SHA256);
    expect(DESKTOP_DARK.canvas).toEqual({ width: 1670, height: 942 });
  });

  it("dérivés propres au Desktop Dark, aucun partagé avec une autre variante", () => {
    const { left, right } = DESKTOP_DARK.zones;
    const derived = [left.paperTone, right.paperTone, left.edgeStrip!.src, right.edgeStrip!.src, ...DESKTOP_DARK.paperGrains.map((g) => g.src)];
    expect(new Set(derived).size).toBe(derived.length);
    const others = new Set(
      [MOBILE_LIGHT, MOBILE_DARK].flatMap((T) => [T.masterSrc, T.paperTone, T.edgeStrip.src, ...T.paperGrains.map((g) => g.src)]).concat(
        DESKTOP_LIGHT.masterSrc,
        DESKTOP_LIGHT.zones.left.paperTone,
        DESKTOP_LIGHT.zones.right.paperTone,
        ...DESKTOP_LIGHT.paperGrains.map((g) => g.src),
      ),
    );
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).toContain("/traditions/v2/desktop/dark/");
      expect(others.has(src)).toBe(false);
    }
  });

  it("coupe commune aux deux zones, dans le canevas ; bandes sous la fin du fondu", () => {
    for (const zone of [DESKTOP_DARK.zones.left, DESKTOP_DARK.zones.right]) {
      expect(zone.cutY).toBe(620);
      expect(zone.cutY + zone.fadePx).toBeLessThan(DESKTOP_DARK.canvas.height - DESKTOP_DARK.footCanvas);
      expect(zone.cutY + zone.fadePx - zone.edgeStrip!.heightCanvas).toBeGreaterThan(0);
    }
  });

  it("Dark : même DOM, réglages Desktop Dark ; la composition Dark (filets, cœur, mention) reste", () => {
    const { container } = renderTraditions({ skinVariant: "dark" });
    expect(container.querySelector("[data-variant]")!.hasAttribute("data-desktop")).toBe(true);
    expect(container.querySelectorAll('[data-zone="right"]')).toHaveLength(1);
    const section = container.querySelector('[data-testid="traditions-v2"]') as HTMLElement;
    expect(section.style.getPropertyValue("--d-m-src")).toBe(`url(${DESKTOP_DARK.masterSrc})`);
    expect(container.querySelectorAll('[class*="surtitleSideRule"]')).toHaveLength(2);
    expect(container.querySelectorAll('footer [data-ornament="coeur"]')).toHaveLength(1);
    // Mention présente sur les deux Masters Dark : jamais réservée au Desktop.
    expect(container.querySelector('[class*="cornerNote"]')!.hasAttribute("data-desktop-only")).toBe(false);
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

  it.each([
    ["fr", "Des gestes\nqui ont du sens"],
    ["en", "Meaningful\ngestures"],
    ["es", "Gestos\ncon sentido"],
  ] as const)("%s : mention du coin (Dark) traduite, coupure de ligne du Master conservée", (language, note) => {
    const { container } = renderTraditions({ skinVariant: "dark", language });
    expect(container.querySelector('[class*="cornerText"]')!.textContent).toBe(note);
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
