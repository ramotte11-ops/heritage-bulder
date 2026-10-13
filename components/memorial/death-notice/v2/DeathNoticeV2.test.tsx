// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_DEATH_NOTICE_PRECISIONS, type DeathNoticeContent } from "@/types/death-notice";
import type { HeroContent } from "@/types/hero";

/**
 * Avis de décès V2 — phase 1, pilote Mobile Light. Contrats du renderer :
 * Master authentique (SHA-256), données du Builder rendues telles quelles,
 * précisions absentes sans trace, i18n, repères d'ornements temporaires.
 * jsdom ne fait aucune mise en page : l'allongement réel du décor est
 * vérifié par les captures de la phase 1, pas ici.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { DeathNoticeV2 } = await import("./DeathNoticeV2");
const { DEATH_NOTICE_V2_TOKENS } = await import("@/config/death-notice-v2-tokens");

afterEach(cleanup);

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const MOBILE_LIGHT = DEATH_NOTICE_V2_TOKENS.light!.mobile;
/** SHA-256 du fond vierge Mobile Light remis par la PO (ZIP de référence). */
const PO_MOBILE_LIGHT_SHA256 = "757fab95d4094a9fcf3ee3c651b1b3c962a0a723a781a3ccde14f89608fb3e6a";

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
  it("le Master Mobile Light est le fond de la PO, octet pour octet", () => {
    expect(MOBILE_LIGHT.masterSha256).toBe(PO_MOBILE_LIGHT_SHA256);
    const digest = createHash("sha256").update(readFileSync(publicFile(MOBILE_LIGHT.masterSrc))).digest("hex");
    expect(digest).toBe(PO_MOBILE_LIGHT_SHA256);
  });

  it("chaque texture dérivée existe, et aucune n'est le Master", () => {
    const derived = [MOBILE_LIGHT.paperTone, ...MOBILE_LIGHT.paperGrains.map((g) => g.src)];
    for (const src of derived) {
      expect(existsSync(publicFile(src))).toBe(true);
      expect(src).not.toBe(MOBILE_LIGHT.masterSrc);
    }
  });

  it("la coupe tombe dans le Master, son fondu aussi", () => {
    expect(MOBILE_LIGHT.cutY - MOBILE_LIGHT.fadePx).toBeGreaterThan(MOBILE_LIGHT.textTopCanvas);
    expect(MOBILE_LIGHT.cutY + MOBILE_LIGHT.fadePx).toBeLessThan(MOBILE_LIGHT.canvas.height - MOBILE_LIGHT.footCanvas);
  });

  it("la requête de conteneur du module CSS suit `singleColumnBelowPx`", () => {
    const css = readFileSync(path.join(import.meta.dirname, "DeathNoticeV2.module.css"), "utf8");
    expect(css).toContain(`@container (max-width: ${MOBILE_LIGHT.singleColumnBelowPx - 0.02}px)`);
  });

  it("phase 1 : la variante Dark n'a pas de réglages et ne rend rien (aucun repli sur Light)", () => {
    expect(DEATH_NOTICE_V2_TOKENS.dark).toBeNull();
    const { container } = renderNotice({ skinVariant: "dark" });
    expect(container.innerHTML).toBe("");
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
