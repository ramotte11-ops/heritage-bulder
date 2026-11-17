import { describe, expect, it } from "vitest";
import { CONTRIBUTIONS_MASTER_ITEMS, type ContributionsFormat, type ContributionsTheme } from "@/config/contributions-master-measurements";
import {
  contributionAnchorRuns,
  contributionsSceneSnapshot,
  contributionsSceneVisibility,
  solveContributionsScene,
  type ContributionSceneItem,
} from "@/lib/memorial/contributions/contributions-scene";
import { EXPECTED_STOPS, expectSceneInvariants, itemsOf } from "@/lib/memorial/contributions/contributions-scene-matrix";

const FRAMES: ContributionsFormat[] = ["desktop", "mobile"];
const THEMES: ContributionsTheme[] = ["light", "dark"];
const RATIOS: [number, number][] = [[3, 4], [4, 3], [1, 1], [9, 16], [16, 9], [239, 100]];

describe("M4.1 Contributions — règle d'affichage de la PO", () => {
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
    expect(solveContributionsScene([], { frame: "desktop", theme: "light" })).toMatchObject({ state: "empty", status: "CONTRIBUTIONS_EMPTY", placements: [], viewAll: false, stats: null });
  });

  it("plus de 4 : les quatre premières de l'appelant, « Voir tous » présent", () => {
    const items = itemsOf("RCRPCC");
    const r = solveContributionsScene(items, { frame: "desktop", theme: "dark" });
    expect(r.status).toBe("PASS");
    expect(r).toMatchObject({ total: 6, visibleCount: 4, viewAll: true });
    expectSceneInvariants(r, items);
  });

  it("1 à 3 : toutes visibles, sans « Voir tous »", () => {
    for (const seq of ["C", "RP", "CRC"]) {
      const r = solveContributionsScene(itemsOf(seq), { frame: "desktop", theme: "light" });
      expect(r.status).toBe("PASS");
      expect(r.viewAll).toBe(false);
      expect(r.placements).toHaveLength(seq.length);
    }
  });
});

describe("M4.1 Contributions — composition dynamique", () => {
  it("R C R P : la répartition exacte du Master sur Desktop, une répartition valide sur Mobile", () => {
    for (const frame of FRAMES)
      for (const theme of THEMES) {
        const r = solveContributionsScene(itemsOf("RCRP"), { frame, theme });
        expect(r.status).toBe("PASS");
        expect(r.stats?.pass).toBe("A");
        const at = Object.fromEntries(r.placements.map((p) => [p.anchorId, p.itemId]));
        // Desktop : R1 C1 R2 P1 = la répartition exacte du Master, dans l'ordre de l'appelant.
        // Mobile : l'ordre de lecture (R1 R2 puis C1 P1), ou, s'il échoue, une autre répartition valide.
        if (frame === "desktop") expect(at).toEqual({ R1: "R0", C1: "C1", R2: "R2", P1: "P3" });
        expectSceneInvariants(r, itemsOf("RCRP"));
      }
  }, 120_000);

  it("suites d'ancrages : contiguës d'abord (la plus centrée en tête), puis les autres, toutes dans l'ordre de lecture", () => {
    expect(contributionAnchorRuns("desktop", "light", 4).map((r) => r.ids)).toEqual([["R1", "C1", "R2", "P1"]]);
    const two = contributionAnchorRuns("desktop", "light", 2).map((r) => r.ids.join("+"));
    expect(two[0]).toBe("C1+R2");
    expect(two.slice(0, 3).sort()).toEqual(["C1+R2", "R1+C1", "R2+P1"]);
    expect(two).toHaveLength(6);
    expect(contributionAnchorRuns("mobile", "dark", 3)).toHaveLength(4);
  });

  it("Light et Dark gardent chacun leur géométrie de Master (aucune moyenne)", () => {
    const l = solveContributionsScene(itemsOf("RCRP"), { frame: "desktop", theme: "light" });
    const d = solveContributionsScene(itemsOf("RCRP"), { frame: "desktop", theme: "dark" });
    const c = (r: typeof l) => r.placements.find((p) => p.anchorId === "C1")!.center;
    const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    // Proche de SON Master (l'écartement selon les formes réelles peut décaler de quelques px).
    expect(near(c(l), CONTRIBUTIONS_MASTER_ITEMS.desktop.light.C1.center)).toBeLessThanOrEqual(12);
    expect(near(c(d), CONTRIBUTIONS_MASTER_ITEMS.desktop.dark.C1.center)).toBeLessThanOrEqual(12);
    expect(c(l)).not.toEqual(c(d));
  }, 60_000);

  it("une carte posée sur l'ancrage du Polaroid garde une inclinaison de carte", () => {
    const r = solveContributionsScene(itemsOf("CCCC"), { frame: "desktop", theme: "dark" });
    expect(r.status).toBe("PASS");
    const p1 = r.placements.find((p) => p.anchorId === "P1")!;
    expect(p1.rotationDeg).toBe(CONTRIBUTIONS_MASTER_ITEMS.desktop.dark.C1.rotationDeg);
  }, 60_000);
});

describe("M4.1 Contributions — ratios photographiques (M4) sur les quatre Masters", () => {
  for (const frame of FRAMES)
    for (const theme of THEMES)
      it(`${frame} ${theme} : mélange du Master et photographies seules, six ratios`, () => {
        for (const seq of ["RCRP", "PP", "P"]) {
          for (const [w, h] of RATIOS) {
            const items = itemsOf(seq, { width: w * 100, height: h * 100 });
            const r = solveContributionsScene(items, { frame, theme });
            expect(r.status, `${seq} ${w}:${h} ${r.detail}`).toBe("PASS");
            expectSceneInvariants(r, items);
          }
        }
      }, 300_000);
});

describe("M4.1 Contributions — stabilité et refus", () => {
  it("contenu identique → géométrie identique à l'octet, à froid", () => {
    for (const seq of ["RCRP", "CCRR", "PRC", "R"]) {
      const a = contributionsSceneSnapshot(solveContributionsScene(itemsOf(seq), { frame: "desktop", theme: "dark" }));
      const b = contributionsSceneSnapshot(solveContributionsScene(itemsOf(seq), { frame: "desktop", theme: "dark" }));
      expect(a).toBe(b);
    }
  }, 120_000);

  it("une composition impossible est un STOP explicite, jamais un rendu dégradé", () => {
    expect(EXPECTED_STOPS.desktop.light).toContain("CCCC");
    const r = solveContributionsScene(itemsOf("CCCC"), { frame: "desktop", theme: "light" });
    expect(r.status).toBe("CONTRIBUTIONS_NO_HARMONIOUS_PLACEMENT");
    expect(r.placements).toEqual([]);
    expect(r.detail).toMatch(/compositions essayées/);
  }, 120_000);

  it("une photographie sans dimensions est refusée", () => {
    const r = solveContributionsScene([{ id: "p", kind: "photo" } as ContributionSceneItem], { frame: "desktop", theme: "light" });
    expect(r.status).toBe("CONTRIBUTIONS_INVALID_ITEM");
    expect(r.placements).toEqual([]);
  });
});
