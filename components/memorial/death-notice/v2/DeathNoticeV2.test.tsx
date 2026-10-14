// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_DEATH_NOTICE_PRECISIONS, type DeathNoticeContent } from "@/types/death-notice";
import type { HeroContent } from "@/types/hero";

/**
 * Avis de décès V2 — pilote Mobile Light, Mobile Dark et Desktop Light.
 * Contrats du renderer : Master authentique (SHA-256), données du Builder
 * rendues telles quelles, précisions absentes sans trace, i18n, ornements.
 * jsdom ne fait aucune mise en page (ni requête de conteneur) :
 * l'allongement réel du décor et la bascule Mobile / Desktop sont vérifiés
 * par les captures de validation, pas ici.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { DeathNoticeV2 } = await import("./DeathNoticeV2");
const {
  DEATH_NOTICE_V2_TOKENS,
  DEATH_NOTICE_V2_DESKTOP_MAX_PX,
  DEATH_NOTICE_V2_DESKTOP_MIN_PX,
  deathNoticeV2DesktopColumns,
} = await import("@/config/death-notice-v2-tokens");

afterEach(cleanup);

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const MOBILE_LIGHT = DEATH_NOTICE_V2_TOKENS.light!.mobile;
const MOBILE_DARK = DEATH_NOTICE_V2_TOKENS.dark!.mobile;
const DESKTOP_LIGHT = DEATH_NOTICE_V2_TOKENS.light!.desktop!;
/** SHA-256 du fond vierge Desktop Light remis par la PO (même ZIP). */
const PO_DESKTOP_LIGHT_SHA256 = "f95b05ce584292ae3059f4d2f4463b8bd62ad72fb6ed7f6433d451e9d721c070";
/** SHA-256 du fond vierge Mobile Light remis par la PO (ZIP de référence). */
const PO_MOBILE_LIGHT_SHA256 = "757fab95d4094a9fcf3ee3c651b1b3c962a0a723a781a3ccde14f89608fb3e6a";
/** SHA-256 du fond vierge Mobile Dark remis par la PO (même ZIP). */
const PO_MOBILE_DARK_SHA256 = "0164cefbe1281d61bdff86c2e6bc24c385f6ee45350a4dd4328b2a5be2b43980";
const VARIANTS = [
  ["light", MOBILE_LIGHT, PO_MOBILE_LIGHT_SHA256],
  ["dark", MOBILE_DARK, PO_MOBILE_DARK_SHA256],
] as const;

const HERO: HeroContent = {
  displayName: "Élise Martin",
  birth: { precision: "year", year: 1948 },
  death: { precision: "year", year: 2023 },
  shortPhrase: null,
  photo: null,
};

const ALL_PRECISIONS = {
  generalLocation: "Paris, France",
  familyMessage: "“Ton sourire nous accompagnera toujours.”",
  thought: "Chaque souvenir est une lumière qui demeure.",
  quote: "Ce qui est aimé ne disparaît jamais vraiment.",
  other: "La famille remercie chaleureusement tous ceux qui partagent son souvenir.",
};

function notice(precisions: Partial<typeof ALL_PRECISIONS>): DeathNoticeContent {
  return {
    announcementText: "C’est avec une profonde tristesse que sa famille annonce le départ d’Élise.",
    precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, ...precisions },
  };
}

function renderNotice(props: Partial<React.ComponentProps<typeof DeathNoticeV2>> = {}) {
  return render(
    <DeathNoticeV2 hero={HERO} deathNotice={notice(ALL_PRECISIONS)} language="fr" skinVariant="light" {...props} />,
  );
}

function publicFile(src: string) {
  return path.join(ROOT, "public", src);
}

describe("DeathNoticeV2 — Master et dérivés", () => {
  it.each(VARIANTS)("Mobile %s : le Master est le fond de la PO, octet pour octet", (_, T, sha) => {
    expect(T.masterSha256).toBe(sha);
    const digest = createHash("sha256").update(readFileSync(publicFile(T.masterSrc))).digest("hex");
    expect(digest).toBe(sha);
  });

  it.each(VARIANTS)("Mobile %s : chaque texture dérivée existe, et aucune n'est le Master", (_, T) => {
    const derived = [T.paperTone, ...T.paperGrains.map((g) => g.src)];
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).not.toBe(T.masterSrc);
    }
  });

  it.each(VARIANTS)("Mobile %s : la coupe tombe dans le Master, son fondu aussi", (_, T) => {
    expect(T.cutY - T.fadePx).toBeGreaterThan(T.textTopCanvas);
    expect(T.cutY + T.fadePx).toBeLessThan(T.canvas.height - T.footCanvas);
  });

  it("Light et Dark ont chacun leurs propres fond, textures et réglages (aucun recopié)", () => {
    expect(MOBILE_DARK.masterSrc).not.toBe(MOBILE_LIGHT.masterSrc);
    expect(MOBILE_DARK.paperTone).not.toBe(MOBILE_LIGHT.paperTone);
    for (const g of MOBILE_DARK.paperGrains) expect(g.src).toContain("/mobile/dark/");
    expect(MOBILE_DARK.cutY).not.toBe(MOBILE_LIGHT.cutY);
    expect(MOBILE_DARK.canvas).toEqual({ width: 941, height: 1672 });
    expect(MOBILE_DARK.ink).not.toBe(MOBILE_LIGHT.ink);
  });

  it.each(VARIANTS)("Mobile %s : la requête de conteneur du module CSS suit `singleColumnBelowPx`", (_, T) => {
    const css = readFileSync(path.join(import.meta.dirname, "DeathNoticeV2.module.css"), "utf8");
    expect(css).toContain(`@container (max-width: ${T.singleColumnBelowPx - 0.02}px)`);
  });

  it("chaque variante rend SON fond : Dark ne se rabat jamais sur Light", () => {
    const light = renderNotice({ skinVariant: "light" });
    const lightWrap = light.container.querySelector("[data-variant]") as HTMLElement;
    expect(lightWrap.getAttribute("data-variant")).toBe("light");
    expect(lightWrap.style.getPropertyValue("--m-src")).toContain(MOBILE_LIGHT.masterSrc);
    light.unmount();
    const dark = renderNotice({ skinVariant: "dark" });
    const darkWrap = dark.container.querySelector("[data-variant]") as HTMLElement;
    expect(darkWrap.getAttribute("data-variant")).toBe("dark");
    expect(darkWrap.style.getPropertyValue("--m-src")).toContain(MOBILE_DARK.masterSrc);
    expect(darkWrap.style.getPropertyValue("--ink")).toBe(MOBILE_DARK.ink);
    expect(dark.container.querySelector('[data-heritage-skin-variant="dark"]')).toBeTruthy();
  });

  it("la langue du contenu est portée par le conteneur (titre ES resserré sur le fond Dark)", () => {
    const { container } = renderNotice({ skinVariant: "dark", language: "es" });
    expect(container.querySelector("[data-variant]")!.getAttribute("lang")).toBe("es");
  });
});

describe("DeathNoticeV2 — contenu du Builder, tel quel", () => {
  it("rend le nom et les dates du Hero, et l'annonce", () => {
    renderNotice();
    expect(screen.getByRole("heading", { name: "Élise Martin" })).toBeTruthy();
    expect(screen.getByText("1948 –")).toBeTruthy();
    expect(screen.getByText("2023")).toBeTruthy();
    expect(screen.getByText(/C’est avec une profonde tristesse/)).toBeTruthy();
  });

  it("dates complètes via formatHeroDateRange, chaque date d'un seul tenant, coupure après le tiret", () => {
    const { container } = renderNotice({
      hero: { ...HERO, birth: { precision: "date", date: "1938-09-12" }, death: { precision: "date", date: "2026-03-03" } },
    });
    const dates = container.querySelector('[class*="dates"]')!;
    expect(dates.textContent).toBe("12 septembre 1938 – 3 mars 2026");
    expect(Array.from(dates.querySelectorAll('[class*="dateUnit"]')).map((n) => n.textContent)).toEqual([
      "12 septembre 1938 –",
      "3 mars 2026",
    ]);
  });

  it("sans date, aucune ligne de dates", () => {
    const { container } = renderNotice({ hero: { ...HERO, birth: null, death: null } });
    expect(container.querySelector('[class*="dates"]')).toBeNull();
  });

  it("n'ajoute aucun guillemet : chaque précision est rendue exactement comme saisie", () => {
    const { container } = renderNotice();
    for (const [field, text] of Object.entries(ALL_PRECISIONS)) {
      const block = container.querySelector(`[data-field="${field}"]`)!;
      expect(block.querySelector("p")!.textContent).toBe(text);
    }
  });

  it("italique pour le mot de la famille, la pensée et la citation seulement (maquette)", () => {
    const { container } = renderNotice();
    const italic = (field: string) =>
      container.querySelector(`[data-field="${field}"] p`)!.className.includes("bodyItalic");
    expect(["generalLocation", "familyMessage", "thought", "quote", "other"].map(italic)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe("DeathNoticeV2 — précisions absentes et composition 2 + 2 + 1", () => {
  it("une précision absente disparaît totalement", () => {
    const { container } = renderNotice({ deathNotice: notice({ quote: ALL_PRECISIONS.quote }) });
    expect(container.querySelectorAll("[data-field]")).toHaveLength(1);
    expect(screen.queryByText("Lieu général")).toBeNull();
    expect(screen.getByText("Citation")).toBeTruthy();
  });

  it("sans précision : ni grille, ni filet, ni bloc", () => {
    const { container } = renderNotice({ deathNotice: notice({}) });
    expect(container.querySelector("[data-count]")).toBeNull();
    expect(container.querySelector('[class*="detailsRule"]')).toBeNull();
    expect(container.querySelector('[data-last-row="none"]')).toBeTruthy();
  });

  it.each([
    [1, "single", true],
    [2, "pair", false],
    [3, "single", true],
    [4, "pair", false],
    [5, "single", true],
  ])("%i précision(s) : dernière rangée « %s », dernier bloc centré seul = %s", (count, lastRow, lastIsFull) => {
    const fields = Object.keys(ALL_PRECISIONS).slice(0, count) as (keyof typeof ALL_PRECISIONS)[];
    const precisions = Object.fromEntries(fields.map((f) => [f, ALL_PRECISIONS[f]]));
    const { container } = renderNotice({ deathNotice: notice(precisions) });
    expect(container.querySelector(`[data-count="${count}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-last-row="${lastRow}"]`)).toBeTruthy();
    const blocks = container.querySelectorAll("[data-field]");
    expect(blocks[blocks.length - 1].className.includes("blockFull")).toBe(lastIsFull);
    expect(container.querySelectorAll('[class*="blockFull"]').length).toBe(lastIsFull ? 1 : 0);
  });
});

describe("DeathNoticeV2 — i18n, titres, repères temporaires", () => {
  it.each([
    ["fr", "Avis de décès", "Mot de la famille"],
    ["en", "Death Notice", "A word from the family"],
    ["es", "Aviso de defunción", "Unas palabras de la familia"],
  ] as const)("%s : titre et étiquettes traduits", (language, title, label) => {
    renderNotice({ language });
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("niveaux de titre : page → h1/h2, section → h2/h3", () => {
    const { container, unmount } = renderNotice();
    expect(container.querySelector("h1")!.textContent).toBe("Avis de décès");
    expect(container.querySelector("h2")!.textContent).toBe("Élise Martin");
    unmount();
    const section = renderNotice({ headingLevel: "section" });
    expect(section.container.querySelector("h1")).toBeNull();
    expect(section.container.querySelector("h2")!.textContent).toBe("Avis de décès");
    expect(section.container.querySelector("h3")!.textContent).toBe("Élise Martin");
  });

  it("ornements : un rameau, un cœur, et un médaillon par précision rendue — tous masqués aux lecteurs d'écran", () => {
    const { container } = renderNotice();
    expect(container.querySelectorAll('[data-ornament="rameau"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ornament="coeur"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(5);
    for (const el of container.querySelectorAll("[data-ornament]")) {
      expect(el.closest('[aria-hidden="true"]')).toBeTruthy();
    }
    expect(container.querySelector("[data-placeholder]")).toBeNull();
  });

  it.each([
    [["quote"], 0, false],
    [["generalLocation", "other"], 0, false],
    [["generalLocation", "familyMessage", "thought"], 1, true],
    [["generalLocation", "familyMessage", "thought", "quote"], 1, false],
    [["generalLocation", "familyMessage", "thought", "quote", "other"], 2, true],
  ] as const)(
    "précisions %j : un médaillon par bloc, %i séparateur(s) de rangée, dernier court = %s",
    (fields, rowRules, lastShort) => {
      const precisions = Object.fromEntries(fields.map((f) => [f, ALL_PRECISIONS[f]]));
      const { container } = renderNotice({ deathNotice: notice(precisions) });
      const blocks = container.querySelectorAll("[data-field]");
      expect(blocks).toHaveLength(fields.length);
      for (const block of blocks) {
        expect(block.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(1);
      }
      expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(fields.length);
      const rules = container.querySelectorAll("[data-row-rule]");
      expect(rules).toHaveLength(rowRules);
      if (rowRules > 0) expect(rules[rules.length - 1].className.includes("rowRuleShort")).toBe(lastShort);
    },
  );

  it("chaque médaillon porte le pictogramme de sa précision (cinq tracés distincts)", () => {
    const { container } = renderNotice();
    const drawings = Array.from(container.querySelectorAll('[data-ornament="medaillon"] svg')).map((svg) =>
      svg.innerHTML.replace(/id="[^"]*"|url\(#[^)]*\)/g, ""),
    );
    expect(new Set(drawings).size).toBe(5);
  });

  it("sans précision : ni médaillon, ni séparateur ; rameau et cœur restent", () => {
    const { container } = renderNotice({ deathNotice: notice({}) });
    expect(container.querySelector('[data-ornament="medaillon"]')).toBeNull();
    expect(container.querySelector("[data-row-rule]")).toBeNull();
    expect(container.querySelector('[data-ornament="rameau"]')).toBeTruthy();
    expect(container.querySelector('[data-ornament="coeur"]')).toBeTruthy();
  });

  it("les SVG d'ornements gardent leur ratio (viewBox fixe, aucune déformation)", () => {
    const { container } = renderNotice();
    expect(container.querySelector('[data-ornament="rameau"]')!.getAttribute("viewBox")).toBe("0 0 160 86");
    expect(container.querySelector('[data-ornament="coeur"]')!.getAttribute("viewBox")).toBe("0 0 30 27");
    for (const svg of container.querySelectorAll('[data-ornament="medaillon"] svg')) {
      expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
      expect(svg.getAttribute("preserveAspectRatio")).toBeNull();
    }
  });

  it("le décor est purement décoratif ; pas de papier central sans excédent mesuré", () => {
    const { container } = renderNotice();
    const section = container.querySelector('[data-testid="death-notice-v2"]')!;
    expect(section.getAttribute("data-extended")).toBe("false");
    expect(container.querySelector('[class*="paper"]')).toBeNull();
    for (const cls of ["master", "bottom"]) {
      expect(container.querySelector(`[class*="${cls}"]`)!.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("DeathNoticeV2 — Mobile Dark : mêmes règles de contenu que Light", () => {
  it.each([
    [["quote"], 0],
    [["generalLocation", "other"], 0],
    [["generalLocation", "familyMessage", "thought"], 1],
    [["generalLocation", "familyMessage", "thought", "quote", "other"], 2],
  ] as const)("précisions %j : un médaillon par bloc, %i séparateur(s)", (fields, rowRules) => {
    const precisions = Object.fromEntries(fields.map((f) => [f, ALL_PRECISIONS[f]]));
    const { container } = renderNotice({ skinVariant: "dark", deathNotice: notice(precisions) });
    expect(container.querySelectorAll("[data-field]")).toHaveLength(fields.length);
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(fields.length);
    expect(container.querySelectorAll("[data-row-rule]")).toHaveLength(rowRules);
  });

  it("sans précision : ni médaillon, ni séparateur ; rameau et cœur restent", () => {
    const { container } = renderNotice({ skinVariant: "dark", deathNotice: notice({}) });
    expect(container.querySelector('[data-ornament="medaillon"]')).toBeNull();
    expect(container.querySelector('[data-ornament="rameau"]')).toBeTruthy();
    expect(container.querySelector('[data-ornament="coeur"]')).toBeTruthy();
  });

  it("textes familiaux rendus tels quels, aucun guillemet ajouté", () => {
    const { container } = renderNotice({ skinVariant: "dark" });
    for (const [field, text] of Object.entries(ALL_PRECISIONS)) {
      expect(container.querySelector(`[data-field="${field}"] p`)!.textContent).toBe(text);
    }
  });

  it.each([
    ["fr", "Avis de décès"],
    ["en", "Death Notice"],
    ["es", "Aviso de defunción"],
  ] as const)("%s : titre traduit", (language, title) => {
    renderNotice({ skinVariant: "dark", language });
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  });

  it("palette d'ornements propre au Dark (cœur doré), Light inchangé", () => {
    const stroke = (variant: "light" | "dark") => {
      const r = renderNotice({ skinVariant: variant });
      const value = r.container.querySelector('[data-ornament="coeur"] path')!.getAttribute("stroke");
      r.unmount();
      return value;
    };
    expect(stroke("light")).toBe("#1a1611");
    expect(stroke("dark")).toBe("#ecd3a9");
  });
});


describe("DeathNoticeV2 — Desktop Light (phase 4)", () => {
  const CSS = readFileSync(path.join(import.meta.dirname, "DeathNoticeV2.module.css"), "utf8");

  it("le Master Desktop est le fond de la PO, octet pour octet", () => {
    expect(DESKTOP_LIGHT.masterSha256).toBe(PO_DESKTOP_LIGHT_SHA256);
    const digest = createHash("sha256").update(readFileSync(publicFile(DESKTOP_LIGHT.masterSrc))).digest("hex");
    expect(digest).toBe(PO_DESKTOP_LIGHT_SHA256);
    expect(DESKTOP_LIGHT.canvas).toEqual({ width: 1672, height: 941 });
  });

  it("textures dérivées propres au Desktop : présentes, distinctes du Master, rien de recopié du Mobile", () => {
    const derived = [DESKTOP_LIGHT.zones.left.paperTone, DESKTOP_LIGHT.zones.right.paperTone, ...DESKTOP_LIGHT.paperGrains.map((g) => g.src)];
    expect(new Set(derived).size).toBe(derived.length);
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).not.toBe(DESKTOP_LIGHT.masterSrc);
      expect(src).toContain("/desktop/light/");
    }
  });

  it("chaque zone coupe le Master sous le titre et au-dessus du contenu le plus bas ; raccord vertical dans le canevas", () => {
    for (const zone of [DESKTOP_LIGHT.zones.left, DESKTOP_LIGHT.zones.right]) {
      expect(zone.cutY - zone.fadePx).toBeGreaterThan(DESKTOP_LIGHT.textTopCanvas);
      expect(zone.cutY + zone.fadePx).toBeLessThan(DESKTOP_LIGHT.canvas.height - DESKTOP_LIGHT.footCanvas);
    }
    expect(DESKTOP_LIGHT.zones.left.cutY).not.toBe(DESKTOP_LIGHT.zones.right.cutY);
    expect(DESKTOP_LIGHT.zoneSplitCanvas - DESKTOP_LIGHT.zoneBlendCanvas / 2).toBeGreaterThan(0);
    expect(DESKTOP_LIGHT.zoneSplitCanvas + DESKTOP_LIGHT.zoneBlendCanvas / 2).toBeLessThan(DESKTOP_LIGHT.canvas.width);
  });

  it("breakpoint 1024 px sur la largeur du conteneur et plafond 1448 px (décisions PO), dans le module CSS", () => {
    expect(DEATH_NOTICE_V2_DESKTOP_MIN_PX).toBe(1024);
    expect(DEATH_NOTICE_V2_DESKTOP_MAX_PX).toBe(1448);
    expect(CSS).toContain(`@container (min-width: ${DEATH_NOTICE_V2_DESKTOP_MIN_PX}px)`);
    expect(CSS).toContain(`max-width: ${DEATH_NOTICE_V2_DESKTOP_MAX_PX}px`);
    expect(CSS).not.toMatch(/@media[^{]*min-width/);
  });

  it("Light porte les réglages Desktop et la pile de la zone droite, masquée aux lecteurs d'écran", () => {
    const { container } = renderNotice({ skinVariant: "light" });
    const wrap = container.querySelector("[data-variant]") as HTMLElement;
    expect(wrap.hasAttribute("data-desktop")).toBe(true);
    const section = container.querySelector('[data-testid="death-notice-v2"]') as HTMLElement;
    expect(section.style.getPropertyValue("--d-m-src")).toContain(DESKTOP_LIGHT.masterSrc);
    expect(section.style.getPropertyValue("--d-cut-left")).toBe(String(DESKTOP_LIGHT.zones.left.cutY));
    expect(section.style.getPropertyValue("--d-cut-right")).toBe(String(DESKTOP_LIGHT.zones.right.cutY));
    const zone = container.querySelector('[data-zone="right"]')!;
    expect(zone.getAttribute("aria-hidden")).toBe("true");
    // Le Mobile garde son propre Master : les réglages Desktop sont à part.
    expect(wrap.style.getPropertyValue("--m-src")).toContain(MOBILE_LIGHT.masterSrc);
  });

  it("Dark n'a pas encore de Desktop : ni réglages, ni pile droite, ni colonnes Desktop (Mobile à toutes les largeurs)", () => {
    expect(DEATH_NOTICE_V2_TOKENS.dark!.desktop).toBeNull();
    const { container } = renderNotice({ skinVariant: "dark" });
    expect(container.querySelector("[data-variant]")!.hasAttribute("data-desktop")).toBe(false);
    expect(container.querySelector('[data-zone="right"]')).toBeNull();
    const section = container.querySelector('[data-testid="death-notice-v2"]') as HTMLElement;
    expect(section.style.getPropertyValue("--d-m-src")).toBe("");
    for (const block of container.querySelectorAll<HTMLElement>("[data-field]")) {
      expect(block.style.getPropertyValue("--col-pitch")).toBe("");
    }
  });

  it("cinq précisions : colonnes de la maquette (centres à ±10 px de 262 / 550 / 835 / 1113 / 1407)", () => {
    const columns = deathNoticeV2DesktopColumns(DESKTOP_LIGHT, 5);
    const maquette = [262, 550, 835, 1113, 1407];
    columns.forEach((c, i) => expect(Math.abs(c.center - maquette[i])).toBeLessThanOrEqual(10));
  });

  it.each([1, 2, 3, 4, 5])("%i précision(s) : groupe centré sur l'axe, textes dans la bande sans ornement", (count) => {
    const columns = deathNoticeV2DesktopColumns(DESKTOP_LIGHT, count);
    expect(columns).toHaveLength(count);
    const mean = columns.reduce((sum, c) => sum + c.center, 0) / count;
    expect(mean).toBeCloseTo(DESKTOP_LIGHT.axisCanvas, 6);
    for (const c of columns) {
      expect(c.center - c.half).toBeGreaterThanOrEqual(DESKTOP_LIGHT.precisionLeftCanvas);
      expect(c.center + c.half).toBeLessThanOrEqual(DESKTOP_LIGHT.precisionRightCanvas);
      // Le plus étroit (première de cinq, contre le bouquet) garde 160 px.
      expect(c.half * 2).toBeGreaterThanOrEqual(160);
      expect(c.foot).toBeGreaterThanOrEqual(0);
    }
    expect(DESKTOP_LIGHT.columnFootCanvas[count as 1 | 2 | 3 | 4 | 5]).toHaveLength(count);
  });

  it("chaque bloc rendu reçoit sa colonne Desktop ; aucun emplacement pour une précision absente", () => {
    const { container } = renderNotice({ deathNotice: notice({ generalLocation: ALL_PRECISIONS.generalLocation, quote: ALL_PRECISIONS.quote }) });
    const blocks = Array.from(container.querySelectorAll<HTMLElement>("[data-field]"));
    expect(blocks).toHaveLength(2);
    const expected = deathNoticeV2DesktopColumns(DESKTOP_LIGHT, 2);
    blocks.forEach((block, i) => {
      expect(block.style.getPropertyValue("--col-pitch")).toBe(String(expected[i].pitch));
      expect(block.style.getPropertyValue("--col-half")).toBe(String(expected[i].half));
      expect(block.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(1);
    });
    expect(deathNoticeV2DesktopColumns(DESKTOP_LIGHT, 0)).toEqual([]);
  });

  it("les réglages Mobile validés ne changent pas (phases 1 à 3)", () => {
    expect([MOBILE_LIGHT.cutY, MOBILE_LIGHT.fadePx, MOBILE_LIGHT.footCanvas, MOBILE_LIGHT.textTopCanvas]).toEqual([955, 40, 346, 236]);
    expect([MOBILE_DARK.cutY, MOBILE_DARK.fadePx, MOBILE_DARK.footCanvas, MOBILE_DARK.textTopCanvas]).toEqual([895, 40, 356, 243]);
    expect([MOBILE_LIGHT.ink, MOBILE_LIGHT.label, MOBILE_DARK.ink, MOBILE_DARK.label]).toEqual(["#211d13", "#3a3226", "#f4e9d8", "#c6bcab"]);
  });
});
