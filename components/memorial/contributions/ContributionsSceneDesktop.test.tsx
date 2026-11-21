// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { CONTRIBUTIONS_FRAMES } from "@/config/contributions-master-measurements";
import { bodyLineCapacity, CONTRIBUTIONS_RENDER_ASSETS } from "@/config/contributions-render-v1";
import { ContributionsSceneDesktop, deckledEdge, type ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import { solveContributionsScene } from "@/lib/memorial/contributions/contributions-scene";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/**
 * M5-A — premier rendu Desktop des Contributions des proches : la scène
 * affiche ce que le moteur M4.2 a résolu (rien n'est recalculé), avec ses
 * éléments graphiques présents dans le dépôt.
 */

afterEach(cleanup);

const publicFile = (src: string) => path.join(process.cwd(), "public", src);

function renderScene(combo: string, theme: "light" | "dark" = "light") {
  const items = demoContributions(combo);
  const scene = solveContributionsScene(items, { frame: "desktop", theme });
  const contents: Record<string, ContributionContent> = Object.fromEntries(items.map((it) => [it.id, it.content]));
  const view = render(
    <ContributionsSceneDesktop theme={theme} placements={scene.placements} contents={contents} viewAll={scene.viewAll} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />,
  );
  return { scene, view };
}

describe("M5-A Contributions — éléments graphiques", () => {
  it("chaque élément référencé existe dans public/", () => {
    const a = CONTRIBUTIONS_RENDER_ASSETS;
    const all = [a.background.light, a.background.dark, ...Object.values(a.paper), a.emblem.light, a.emblem.dark, a.dividerSprig.light, a.dividerSprig.dark, a.storySprig, a.condolenceSprig];
    for (const src of all) expect(existsSync(publicFile(src)), src).toBe(true);
  });

  it("les fonds sont les fonds vierges Desktop de la PO, au repère des Masters (1671 × 941)", () => {
    for (const src of [CONTRIBUTIONS_RENDER_ASSETS.background.light, CONTRIBUTIONS_RENDER_ASSETS.background.dark]) {
      const png = readFileSync(publicFile(src));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([CONTRIBUTIONS_FRAMES.desktop.width, CONTRIBUTIONS_FRAMES.desktop.height]);
    }
  });
});

describe("M5-A Contributions — scène rendue", () => {
  it("R C R P : quatre contributions, chacune avec son identité graphique, à l'ancrage du moteur", () => {
    const { scene, view } = renderScene("RCRP");
    const cards = view.container.querySelectorAll("[data-contribution]");
    expect(cards).toHaveLength(4);
    expect([...cards].map((c) => c.getAttribute("data-format")).sort()).toEqual(["condolence", "polaroid", "story-tall", "story-wide"]);
    for (const p of scene.placements) expect(view.container.querySelector(`[data-anchor="${p.anchorId}"]`)).not.toBeNull();
    expect(screen.getByText("Marie et Pierre")).toBeTruthy();
    expect(screen.getByText("Nos dimanches au jardin.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Laisser un message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voir tous les messages/ })).toBeTruthy();
  });

  it("quatre condoléances : quatre cartes bleu pétrole, signatures distinctes", () => {
    const { view } = renderScene("CCCC", "dark");
    const cards = [...view.container.querySelectorAll("[data-contribution]")];
    expect(cards.map((c) => c.getAttribute("data-format"))).toEqual(["condolence", "condolence", "condolence", "condolence"]);
    for (const name of ["Marie et Pierre", "La famille Durand", "Hélène et Jacques", "Les voisins du Clos"]) expect(screen.getByText(name)).toBeTruthy();
  });

  it("1 à 3 contributions : pas de « Voir tous les messages »", () => {
    renderScene("CRP");
    expect(screen.queryByRole("button", { name: /Voir tous les messages/ })).toBeNull();
  });

  it("l'ordre de peinture est la profondeur du moteur", () => {
    const { scene, view } = renderScene("PRPP");
    const z = [...view.container.querySelectorAll<HTMLElement>("[data-contribution]")].map((li) => Number(li.style.zIndex));
    expect(z).toEqual([...scene.placements.map((p) => p.zIndex)].sort((a, b) => a - b));
  });
});

describe("M5-A Contributions — textes", () => {
  it("le corps n'est jamais réduit : la capacité est un nombre entier de lignes au corps nominal", () => {
    expect(bodyLineCapacity(228, 24)).toBe(7);
    expect(bodyLineCapacity(146, 24)).toBe(4);
    expect(bodyLineCapacity(10, 24)).toBe(0);
    expect(bodyLineCapacity(0, 24)).toBe(0);
  });

  it("bord déchiré : déterministe, toujours à l'intérieur du papier", () => {
    const a = deckledEdge("demo-0-R", 389, 356);
    expect(deckledEdge("demo-0-R", 389, 356)).toBe(a);
    expect(deckledEdge("demo-1-R", 389, 356)).not.toBe(a);
    const values = [...a.matchAll(/(-?[\d.]+)%/g)].map((m) => Number(m[1]));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
