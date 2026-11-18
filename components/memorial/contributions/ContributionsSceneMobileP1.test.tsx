// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CONTRIBUTIONS_MOBILE_LAYOUTS } from "@/config/contributions-mobile-v1";
import { ContributionsSceneMobileP1, P1_PREVIEW_TYPE } from "@/components/memorial/contributions/ContributionsSceneMobileP1";
import type { ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import { solveContributionsScene } from "@/lib/memorial/contributions/contributions-scene";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/** M5-C — Mobile P1 : cartes consultables, lecture agrandie accessible, règles d'affichage inchangées. */

beforeAll(() => {
  // jsdom n'implémente pas la fenêtre modale : ouverture simulée par l'attribut `open`.
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
});

afterEach(cleanup);

function renderP1(combo: string, theme: "light" | "dark" = "light") {
  const layout = CONTRIBUTIONS_MOBILE_LAYOUTS["grille-2x2"];
  const all = demoContributions(combo);
  const items = all.slice(0, layout.sceneCapacity);
  const scene = solveContributionsScene(items, { frame: "mobile", theme, geometry: layout.geometry[theme] });
  expect(scene.status).toBe("PASS");
  const contents: Record<string, ContributionContent> = Object.fromEntries(all.map((it) => [it.id, it.content]));
  return render(<ContributionsSceneMobileP1 theme={theme} layout={layout} placements={scene.placements} contents={contents} viewAll={scene.viewAll} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />);
}

const openButtons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>("[data-open-card]")];

describe("M5-C Contributions — Mobile P1 interactif", () => {
  it("chaque carte est un bouton nommé qui annonce une fenêtre", () => {
    const view = renderP1("RCRP");
    const buttons = openButtons(view.container);
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("aria-haspopup")).toBe("dialog");
      expect(b.getAttribute("aria-label")).toMatch(/^(Lire les condoléances|Lire le récit|Voir la photographie) de /);
    }
  });

  it("une condoléance s'ouvre en grand, se ferme par le bouton, le focus revient sur la carte", () => {
    const view = renderP1("CCCC");
    const card = openButtons(view.container)[0];
    fireEvent.click(card);
    const dialog = document.querySelector<HTMLDialogElement>("dialog[data-contribution-reading]");
    expect(dialog?.getAttribute("data-contribution-reading")).toBe("condolence");
    expect(dialog?.hasAttribute("open")).toBe(true);
    // Rendue hors de la scène (portail) : le moteur de stacking ne la voit pas.
    expect(view.container.contains(dialog)).toBe(false);
    expect(document.activeElement?.hasAttribute("data-reading-close")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Fermer/ }));
    expect(document.querySelector("dialog[data-contribution-reading]")).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it("un récit s'ouvre avec son texte COMPLET ; Échap ferme", () => {
    const view = renderP1("RRRP");
    const story = openButtons(view.container).find((b) => /Antoine/.test(b.getAttribute("aria-label") ?? ""));
    expect(story).toBeTruthy();
    fireEvent.click(story!);
    const dialog = document.querySelector<HTMLDialogElement>("dialog[data-contribution-reading]")!;
    expect(dialog.getAttribute("data-contribution-reading")).toBe("story");
    const full = demoContributions("RRRP").find((c) => c.content.author === "Antoine")!.content.text!;
    expect(dialog.textContent).toContain(full);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(document.querySelector("dialog[data-contribution-reading]")).toBeNull();
  });

  it("un Polaroid ouvre la photographie entière et sa légende", () => {
    const view = renderP1("PPPP");
    fireEvent.click(openButtons(view.container)[0]);
    const dialog = document.querySelector<HTMLDialogElement>("dialog[data-contribution-reading]")!;
    expect(dialog.getAttribute("data-contribution-reading")).toBe("photo");
    expect(dialog.querySelector("img")).toBeTruthy();
    expect(dialog.querySelector("figcaption")?.textContent?.length).toBeGreaterThan(0);
  });

  it("aperçu du Polaroid : légende sur UNE ligne ajustable, jamais sous le minimum lisible", () => {
    const view = renderP1("PPPP");
    const lines = [...view.container.querySelectorAll<HTMLElement>("[data-fit-line]")];
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(P1_PREVIEW_TYPE.caption.min);
  });

  it("corps d'aperçu en px CSS fixes", () => {
    const view = renderP1("CCCC");
    const bodies = [...view.container.querySelectorAll<HTMLElement>("[data-capacity]")];
    expect(bodies).toHaveLength(4);
    for (const b of bodies) expect(b.style.fontSize).toBe(`${P1_PREVIEW_TYPE.body}px`);
  });

  it("règles PO : 1 à 3 sans « Voir tous », dès 4 avec, au-delà 4 dans la scène", () => {
    for (const combo of ["R", "CR", "CRP"]) {
      renderP1(combo);
      expect(screen.queryByRole("button", { name: /Voir tous les messages/ })).toBeNull();
      cleanup();
    }
    let view = renderP1("RCRP");
    expect(screen.getByRole("button", { name: /Voir tous les messages/ })).toBeTruthy();
    cleanup();
    view = renderP1("RCRPCR");
    expect(openButtons(view.container)).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Voir tous les messages/ })).toBeTruthy();
  });
});
