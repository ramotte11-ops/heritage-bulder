import { describe, expect, it } from "vitest";
import { CONTRIBUTIONS_CARD_BAND, CONTRIBUTIONS_MASTER_ITEMS, type ContributionsFormat, type ContributionsTheme } from "@/config/contributions-master-measurements";
import { visibleFraction } from "@/lib/memorial/album/album-group-solver";
import { convexIntersectionArea } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import {
  contributionsForbiddenZones,
  contributionsSceneSnapshot,
  contributionsSceneVisibility,
  solveContributionsScene,
  type ContributionSceneItem,
  type ContributionsSceneResult,
} from "@/lib/memorial/contributions/contributions-scene";
import { cardPaperSize } from "@/lib/memorial/contributions/contribution-shapes";

const FRAMES: ContributionsFormat[] = ["desktop", "mobile"];
const THEMES: ContributionsTheme[] = ["light", "dark"];
const RATIOS: [number, number][] = [[3, 4], [4, 3], [1, 1], [9, 16], [16, 9], [239, 100]];

const story = (id: string): ContributionSceneItem => ({ id, kind: "story" });
const condolence = (id: string): ContributionSceneItem => ({ id, kind: "condolence" });
const photo = (id: string, w = 1000, h = 1000): ContributionSceneItem => ({ id, kind: "photo", photo: { width: w, height: h } });
const masterMix = (w: number, h: number) => [story("r1"), condolence("c1"), story("r2"), photo("p1", w * 100, h * 100)];

/** Invariants artistiques et d'accessibilité d'une scène résolue. */
function expectSceneInvariants(r: ContributionsSceneResult) {
  const zones = contributionsForbiddenZones(r.frame);
  const band = CONTRIBUTIONS_CARD_BAND[r.frame];
  for (const p of r.placements) {
    const above = r.placements.filter((o) => o.zIndex > p.zIndex).map((o) => o.outer);
    // Texte, signature, en-tête (carte) ou photo + légende (Polaroid) : jamais couverts.
    // Tolérance = celle du solveur A13 (fraction 1e-6, soit < 0,1 px² ici : invisible).
    expect(above.length ? visibleFraction(p.protectedRegion, above) : 1).toBeGreaterThanOrEqual(1 - 1e-6);
    for (const cover of above) expect(convexIntersectionArea(p.protectedRegion, cover)).toBeLessThan(0.1);
    // Papier : chevauchement léger seulement (≥ 90 % visible).
    expect(above.length ? visibleFraction(p.outer, above) : 1).toBeGreaterThanOrEqual(0.9 - 1e-9);
    // Titres, actions, pied, sceau : jamais touchés ; la scène ne grandit pas.
    for (const z of zones) expect(convexIntersectionArea(p.outer, z)).toBeLessThan(1e-6);
    // Tolérance du solveur A13 (aire d'intersection ≤ 1e-6 px²) : un sommet peut
    // affleurer la bande d'un millième de pixel, jamais davantage.
    for (const q of p.outer) {
      expect(q.x).toBeGreaterThanOrEqual(band.x0 - 1e-3);
      expect(q.x).toBeLessThanOrEqual(band.x1 + 1e-3);
      expect(q.y).toBeGreaterThanOrEqual(band.y0 - 1e-3);
      expect(q.y).toBeLessThanOrEqual(band.y1 + 1e-3);
    }
  }
}

describe("M4 Contributions — règle d'affichage de la PO", () => {
  it.each([
    [0, "empty", 0, false],
    [1, "contributions", 1, false],
    [2, "contributions", 2, false],
    [3, "contributions", 3, false],
    [4, "contributions", 4, true],
    [5, "contributions", 4, true],
    [40, "contributions", 4, true],
  ] as const)("%i contribution(s) → %s, %i visible(s), « Voir tous » %s", (n, state, visible, viewAll) => {
    expect(contributionsSceneVisibility(n)).toEqual({ state, visibleCount: visible, viewAll });
  });

  it("0 contribution : état vide, aucun placement, aucune résolution", () => {
    const r = solveContributionsScene([], { frame: "desktop", theme: "light" });
    expect(r).toMatchObject({ state: "empty", status: "CONTRIBUTIONS_EMPTY", placements: [], viewAll: false, stats: null });
  });

  it("plus de 4 : les quatre premières de l'appelant dans la scène, « Voir tous » présent", () => {
    const items = [...masterMix(1, 1), story("r3"), condolence("c2")];
    const r = solveContributionsScene(items, { frame: "desktop", theme: "light" });
    expect(r.status).toBe("PASS");
    expect(r.viewAll).toBe(true);
    expect(r.total).toBe(6);
    expect(r.placements.map((p) => p.itemId).sort()).toEqual(["c1", "p1", "r1", "r2"]);
  });

  it("1 à 3 : contributions visibles à leur emplacement de Master, sans « Voir tous »", () => {
    const r = solveContributionsScene([condolence("c1"), photo("p1")], { frame: "desktop", theme: "dark" });
    expect(r.status).toBe("PASS");
    expect(r.viewAll).toBe(false);
    expect(r.placements.map((p) => p.slotId)).toEqual(["C1", "P1"]);
    const c1 = r.placements[0];
    expect(c1.translation).toEqual({ x: 0, y: 0 });
    expect(c1.center).toEqual(CONTRIBUTIONS_MASTER_ITEMS.desktop.dark.C1.center);
    expectSceneInvariants(r);
  });
});

describe("M4 Contributions — scène des quatre Masters", () => {
  for (const frame of FRAMES)
    for (const theme of THEMES)
      it(`${frame} ${theme} : six ratios de photo résolus, cartes à leur position de Master`, () => {
        for (const [w, h] of RATIOS) {
          const r = solveContributionsScene(masterMix(w, h), { frame, theme });
          expect(r.status, `${w}:${h} ${r.detail}`).toBe("PASS");
          expect(r.stats?.pass).toBe("A");
          expect(r.provisional).toBe(frame === "mobile");
          for (const p of r.placements.filter((x) => x.kind !== "photo")) {
            expect(p.translation).toEqual({ x: 0, y: 0 });
            expect(p.center).toEqual(CONTRIBUTIONS_MASTER_ITEMS[frame][theme][p.slotId].center);
          }
          const pol = r.placements.find((x) => x.kind === "photo")!;
          expect(pol.scale).toBeGreaterThanOrEqual(0.85);
          expectSceneInvariants(r);
        }
      }, 60_000);

  it("Light et Dark gardent chacun leur géométrie de Master (aucune moyenne)", () => {
    const l = solveContributionsScene(masterMix(1, 1), { frame: "desktop", theme: "light" });
    const d = solveContributionsScene(masterMix(1, 1), { frame: "desktop", theme: "dark" });
    const r1 = (x: ContributionsSceneResult) => x.placements.find((p) => p.slotId === "R1")!;
    expect(r1(l).center).toEqual(CONTRIBUTIONS_MASTER_ITEMS.desktop.light.R1.center);
    expect(r1(d).center).toEqual(CONTRIBUTIONS_MASTER_ITEMS.desktop.dark.R1.center);
    expect(r1(l).center).not.toEqual(r1(d).center);
  });

  it("les condoléances ont des dimensions identiques ; les récits n'emploient que les formats haut et large", () => {
    for (const frame of FRAMES)
      for (const theme of THEMES) {
        const r = solveContributionsScene(masterMix(1, 1), { frame, theme });
        const fmt = (k: string) => r.placements.filter((p) => p.kind === k).map((p) => p.format);
        expect(fmt("story")).toEqual(["story-tall", "story-wide"]);
        const c = r.placements.find((p) => p.kind === "condolence")!;
        expect(c.layout.kind === "card" && c.layout.card.paper.width).toBe(cardPaperSize("condolence", frame, theme).width);
        expect(c.layout.kind === "card" && c.layout.card.paper.height).toBe(cardPaperSize("condolence", frame, theme).height);
      }
  });

  it("déterministe : deux résolutions à froid identiques à l'octet", () => {
    for (const [w, h] of RATIOS) {
      const a = contributionsSceneSnapshot(solveContributionsScene(masterMix(w, h), { frame: "desktop", theme: "light" }));
      const b = contributionsSceneSnapshot(solveContributionsScene(masterMix(w, h), { frame: "desktop", theme: "light" }));
      expect(a).toBe(b);
    }
  }, 60_000);
});

describe("M4 Contributions — refus sans invention", () => {
  it("un mélange que les Masters ne couvrent pas n'est pas recomposé (O4)", () => {
    const r = solveContributionsScene([condolence("c1"), condolence("c2"), story("r1")], { frame: "desktop", theme: "light" });
    expect(r.status).toBe("CONTRIBUTIONS_MIX_NOT_COVERED");
    expect(r.unplaced).toEqual(["c2"]);
    expect(r.placements.map((p) => p.itemId)).toEqual(["r1", "c1"]);
  });

  it("une photographie sans dimensions est refusée", () => {
    const r = solveContributionsScene([{ id: "p", kind: "photo" }], { frame: "desktop", theme: "light" });
    expect(r.status).toBe("CONTRIBUTIONS_INVALID_ITEM");
    expect(r.placements).toEqual([]);
  });

  it("une recherche trop étroite échoue en STOP, sans placement", () => {
    const r = solveContributionsScene(masterMix(239, 100), {
      frame: "desktop",
      theme: "light",
      search: { territoryPx: 0, polaroidScale: { preferred: [1, 1], hard: [1, 1] }, minVisiblePaper: 0.9 },
    });
    expect(r.status).not.toBe("PASS");
    expect(r.placements).toEqual([]);
  }, 60_000);
});
