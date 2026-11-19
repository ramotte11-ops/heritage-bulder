// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { PublicContribution, PublicContributionsInitial } from "@/lib/memorial/contributions/public-contribution-types";
import { CONTRIBUTIONS_RENDER_ASSETS } from "@/config/contributions-render-v1";

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
}));

const { ContributionsV1Section } = await import("./ContributionsV1Section");
const { PublicContributionsProvider } = await import("./contributions-host");

/** M8-E3 — la rubrique dans le Mémorial assemblé : données SYNTHÉTIQUES uniquement. */

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== "function") proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ALL = { condolences: true, stories: true, photos: true };
const at = (d: number) => `2026-11-${String(d).padStart(2, "0")}T10:00:00Z`;
const cond = (id: string, d: number): PublicContribution => ({ id, type: "condolence", authorName: `Auteur ${id}`, text: `Pensées ${id}`, caption: null, publishedAt: at(d), photo: null });
const story = (id: string, d: number): PublicContribution => ({ id, type: "testimonial", authorName: `Auteur ${id}`, text: `Souvenir ${id}`, caption: null, publishedAt: at(d), photo: null });
const photo = (id: string, d: number): PublicContribution => ({ id, type: "photo", authorName: `Auteur ${id}`, text: null, caption: `Légende ${id}`, publishedAt: at(d), photo: { url: `https://storage.test/signed/${id}`, width: 2000, height: 1500 } });

function initial(items: PublicContribution[], categories = ALL): PublicContributionsInitial {
  return { categories, total: items.length, items, complete: true, nextCursor: null };
}

function renderPublic(init: PublicContributionsInitial | null, { language = "fr", theme = "light" }: { language?: Language; theme?: SkinVariant } = {}) {
  const wrap = ({ children }: { children: ReactNode }) => <PublicContributionsProvider initial={init}>{children}</PublicContributionsProvider>;
  return render(<ContributionsV1Section skinVariant={theme} language={language} displayName="Élise Martin" features={ALL} />, { wrapper: wrap });
}


describe("M8-E3 — page publique : contributions réelles", () => {
  it("0 contribution : Master M0 de l'état vide, jamais une carte fictive", () => {
    const view = renderPublic(initial([]));
    expect(view.container.querySelector('[data-contributions-host="public"]')?.getAttribute("data-contributions-state")).toBe("empty");
    expect(view.container.querySelector('[data-contributions-state="empty"][data-contributions-scene]')).not.toBeNull();
    expect(screen.getByText("Cet espace accueillera les pensées, les souvenirs et les mots des proches.")).toBeTruthy();
    expect(screen.getByText("Laissez le premier message en sa mémoire.")).toBeTruthy();
    expect(screen.getByText("Vos mots feront vivre sa mémoire et perpétueront sa lumière.")).toBeTruthy();
    expect(screen.getByText(/en mémoire d’Élise Martin\./)).toBeTruthy();
    expect(view.container.querySelectorAll("[data-contribution]")).toHaveLength(0);
    expect(view.container.innerHTML).not.toMatch(/builder-demo|photo-demo|Marie et Pierre/);
  });

  it("1 à 3 : toutes les cartes réelles, sans « Voir tous »", () => {
    const view = renderPublic(initial([cond("a", 1), story("b", 2), photo("c", 3)]));
    expect(view.container.querySelectorAll("[data-contribution]")).toHaveLength(3);
    expect(view.container.textContent).toContain("Auteur a");
    expect(view.container.innerHTML).toContain("https://storage.test/signed/c");
    expect(screen.queryByRole("button", { name: /Voir tous les messages/ })).toBeNull();
  });

  it("4 et plus : scène M5 de 4 cartes (sélection O8) et « Voir tous »", () => {
    const items = [...[10, 11, 12, 13, 14, 15].map((d) => photo(`p${d}`, d)), story("s1", 2), cond("k1", 1)];
    const view = renderPublic(initial(items));
    const shown = [...view.container.querySelectorAll<HTMLElement>("[data-contribution]")].map((n) => n.dataset.contribution);
    expect(shown).toHaveLength(4);
    // Chaque catégorie disponible représentée, même ancienne.
    expect(new Set(shown)).toEqual(new Set(["photo", "story", "condolence"]));
    expect(view.container.textContent).toContain("Auteur s1");
    expect(view.container.textContent).toContain("Auteur k1");
    expect(screen.getByRole("button", { name: /Voir tous les messages/ })).toBeTruthy();
  });

  it("une catégorie désactivée (O9) n'est ni sur la scène ni comptée", () => {
    const items = [photo("p", 9), story("s", 2), cond("k", 1)];
    const view = renderPublic(initial(items, { ...ALL, photos: false }));
    expect(view.container.querySelectorAll('[data-contribution="photo"]')).toHaveLength(0);
    expect(view.container.querySelectorAll("[data-contribution]")).toHaveLength(2);
  });

  it("toutes les catégories désactivées : aucune rubrique", () => {
    const view = renderPublic(initial([cond("k", 1)], { condolences: false, stories: false, photos: false }));
    expect(view.container.innerHTML).toBe("");
  });

  it("lecture impossible : aucune rubrique, et surtout jamais la démonstration", () => {
    const view = renderPublic(null);
    expect(view.container.innerHTML).toBe("");
  });

  it("anglais et espagnol : libellés de la rubrique traduits, textes des proches tels quels", () => {
    const en = renderPublic(initial([]), { language: "en" });
    expect(en.container.textContent).toContain("Contributions from loved ones");
    expect(en.container.textContent).toContain("Leave the first message in their memory.");
    expect(en.container.textContent).toContain("in memory of Élise Martin.");
    cleanup();
    const es = renderPublic(initial([cond("a", 1)]), { language: "es" });
    expect(es.container.textContent).toContain("Contribuciones de los seres queridos");
    expect(es.container.textContent).toContain("Dejar un mensaje");
    expect(es.container.textContent).toContain("Pensées a");
  });

  it("Desktop (≥ 1024 px) et Mobile : le bon repère, Light et Dark", () => {
    for (const theme of ["light", "dark"] as const) {
      const mobile = renderPublic(initial([]), { theme });
      expect(mobile.container.querySelector("[data-contributions-scene]")?.getAttribute("data-contributions-scene")).toBe("mobile");
      expect(mobile.container.querySelector("[data-theme-variant]")?.getAttribute("data-theme-variant")).toBe(theme);
      cleanup();
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
      const desktop = renderPublic(initial([]), { theme });
      expect(desktop.container.querySelector("[data-contributions-scene]")?.getAttribute("data-contributions-scene")).toBe("desktop");
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("les fonds de l'état vide existent (Desktop et Mobile, Light et Dark)", () => {
    for (const frame of ["desktop", "mobile"] as const)
      for (const theme of ["light", "dark"] as const) {
        expect(existsSync(path.join(process.cwd(), "public", CONTRIBUTIONS_RENDER_ASSETS.emptyBackground[frame][theme]))).toBe(true);
      }
  });
});

describe("M8-E3 — Aperçu du Builder : démonstration seulement (O10)", () => {
  it("sans hôte public : la démonstration M7, jamais une contribution réelle", () => {
    const view = render(<ContributionsV1Section skinVariant="light" language="fr" displayName="Élise Martin" features={{ condolences: true, stories: false, photos: false }} />);
    expect(view.container.querySelector('[data-contributions-host="preview"]')).not.toBeNull();
    expect(view.container.querySelector('[data-contributions-host="public"]')).toBeNull();
    expect(view.container.textContent).toContain("exemples fictifs");
  });
});

