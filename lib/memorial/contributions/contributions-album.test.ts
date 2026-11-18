import { describe, expect, it } from "vitest";
import { CONTRIBUTIONS_ALBUM_FRAMES, contributionsAlbumPlateGeometry } from "@/config/contributions-album-v1";
import {
  CONTRIBUTIONS_ALBUM_CACHE_LIMIT,
  clearContributionsAlbumCache,
  contributionsAlbumCacheStats,
  createContributionsAlbumComposer,
  contributionsAlbumSizes,
  contributionsAlbumSnapshot,
  partitionContributionsAlbum,
  solveContributionsAlbum,
} from "@/lib/memorial/contributions/contributions-album";
import { solveContributionsScene, type ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";

/** M6 — Album complet : partition A13, solveur de scène par planche, ordre, cache, ajustement. */

const FRAMES = ["desktop", "mobile"] as const;
const THEMES = ["light", "dark"] as const;

function items(combo: string, ratios: [number, number][] = [[291, 270]]): ContributionSceneItem[] {
  let photos = 0;
  return [...combo].map((c, i) => {
    if (c === "P") {
      const [width, height] = ratios[photos++ % ratios.length];
      return { id: `c${i}`, kind: "photo", photo: { width, height } };
    }
    return { id: `c${i}`, kind: c === "C" ? "condolence" : "story" };
  });
}

const repeat = (pattern: string, n: number) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]).join("");

describe("M6 Album des contributions — partition", () => {
  it("tranches contiguës, aucune perdue, aucune isolée, jamais plus que la planche", () => {
    for (const frame of FRAMES) {
      const G = CONTRIBUTIONS_ALBUM_FRAMES[frame].groupSize;
      for (let n = 1; n <= 60; n++) {
        const groups = partitionContributionsAlbum(n, frame);
        expect(groups.reduce((s, g) => s + g.size, 0)).toBe(n);
        groups.forEach((g, i) => {
          expect(g.start).toBe(i === 0 ? 0 : groups[i - 1].start + groups[i - 1].size);
          expect(g.size).toBeLessThanOrEqual(G);
          if (n > 1) expect(g.size).toBeGreaterThanOrEqual(2);
        });
      }
    }
  });

  it("règle A13 transposée : reste 1 partagé en deux clôtures", () => {
    expect(contributionsAlbumSizes(7, 3)).toEqual([3, 2, 2]);
    expect(contributionsAlbumSizes(9, 4)).toEqual([4, 3, 2]);
    expect(contributionsAlbumSizes(10, 3)).toEqual([3, 3, 2, 2]);
    expect(contributionsAlbumSizes(11, 4)).toEqual([4, 4, 3]);
    expect(contributionsAlbumSizes(0, 3)).toEqual([]);
  });

  it("phase Thue–Morse (A B B A B A A B) d'une planche à l'autre", () => {
    expect(partitionContributionsAlbum(24, "desktop").map((g) => g.phase).join("")).toBe("ABBABAAB");
  });
});

describe("M6 Album des contributions — planches (solveur A13 de la scène)", () => {
  it("toutes les suites de types se composent, dans l'ordre de la source, sur les deux repères, thèmes et phases", () => {
    const combos: string[] = [];
    const go = (p: string, max: number) => {
      if (p.length) combos.push(p);
      if (p.length < max) for (const k of "CRP") go(p + k, max);
    };
    for (const frame of FRAMES) {
      combos.length = 0;
      go("", CONTRIBUTIONS_ALBUM_FRAMES[frame].groupSize);
      for (const theme of THEMES)
        for (const phase of ["A", "B"] as const) {
          const g = contributionsAlbumPlateGeometry(frame, theme, phase);
          for (const c of combos) {
            const r = solveContributionsScene(items(c), { frame, theme, geometry: g });
            expect(r.status, `${frame} ${theme} ${phase} ${c}`).toBe("PASS");
            const reading = [...r.placements].sort((a, b) => g.order.indexOf(a.anchorId) - g.order.indexOf(b.anchorId)).map((p) => p.itemId);
            expect(reading, `${frame} ${theme} ${phase} ${c}`).toEqual(items(c).map((it) => it.id));
          }
        }
    }
  }, 120_000);

  it("photographies de tous formats (3:4, 4:3, 1:1, 9:16, 16:9, 2,39:1) dans des planches mixtes", () => {
    const ratios: [number, number][] = [[300, 400], [400, 300], [300, 300], [270, 480], [480, 270], [478, 200]];
    for (const frame of FRAMES)
      for (const theme of THEMES) {
        const r = solveContributionsAlbum(items(repeat("PRPCPP", 36), ratios), { frame, theme });
        expect(r.status, `${frame} ${theme}`).toBe("PASS");
      }
  }, 120_000);
});

describe("M6 Album des contributions — composition complète", () => {
  it("dix condoléances, une collection de photographies, un mélange : tout est là, dans l'ordre", () => {
    for (const frame of FRAMES)
      for (const combo of [repeat("C", 10), repeat("P", 9), repeat("RCRPCC", 23)]) {
        const src = items(combo);
        const r = solveContributionsAlbum(src, { frame, theme: "light" });
        expect(r.status).toBe("PASS");
        const ids = r.plates.flatMap((p) => p.placements.map((q) => q.itemId).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
        expect(ids).toEqual(src.map((it) => it.id));
        expect(r.plates.every((p) => p.readingOrderKept)).toBe(true);
      }
  });

  it("planches ajustées : papiers dans leur planche, planches empilées sans se toucher", () => {
    for (const frame of FRAMES) {
      const r = solveContributionsAlbum(items(repeat("RCRPCC", 30)), { frame, theme: "dark" });
      const margin = CONTRIBUTIONS_ALBUM_FRAMES[frame].plateMargin;
      let top = 0;
      for (const p of r.plates) {
        expect(p.top).toBe(top);
        const ys = p.placements.flatMap((q) => q.outer.map((v) => v.y));
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(margin - 0.5);
        expect(Math.max(...ys)).toBeLessThanOrEqual(p.height - margin + 1);
        top += p.height;
      }
      expect(r.height).toBe(top);
    }
  });

  it("déterministe, et un résultat mis en cache est celui d'un calcul neuf", () => {
    const src = items(repeat("RCRPCCP", 40));
    clearContributionsAlbumCache();
    const fresh = contributionsAlbumSnapshot(solveContributionsAlbum(src, { frame: "desktop", theme: "light" }));
    const again = solveContributionsAlbum(src, { frame: "desktop", theme: "light" });
    expect(again.plates.every((p) => p.cached)).toBe(true);
    expect(contributionsAlbumSnapshot(again)).toBe(fresh);
  });

  it("grand Album : 500 contributions, les planches identiques ne sont composées qu'une fois, cache borné", () => {
    clearContributionsAlbumCache();
    const r = solveContributionsAlbum(items(repeat("CCRCPRCCPC", 500)), { frame: "mobile", theme: "light" });
    expect(r.status).toBe("PASS");
    expect(r.plates).toHaveLength(125);
    const s = contributionsAlbumCacheStats();
    expect(s.solved).toBeLessThanOrEqual(10);
    expect(s.solved + s.hits).toBe(125);
    expect(s.size).toBeLessThanOrEqual(CONTRIBUTIONS_ALBUM_CACHE_LIMIT);
  });

  it("composition progressive : planche par planche, résultat final identique au calcul complet", () => {
    const src = items(repeat("RCRPCCP", 60));
    for (const frame of FRAMES) {
      clearContributionsAlbumCache();
      const whole = contributionsAlbumSnapshot(solveContributionsAlbum(src, { frame, theme: "light" }));
      clearContributionsAlbumCache();
      const composer = createContributionsAlbumComposer(src, { frame, theme: "light" });
      composer.step();
      const first = composer.result();
      expect(first.status).toBe("PASS");
      expect(first.complete).toBe(false);
      expect(first.plates).toHaveLength(1);
      let previous = 1;
      while (!composer.done) {
        composer.run(0);
        const r = composer.result();
        expect(r.plates.length).toBe(previous + 1);
        previous = r.plates.length;
      }
      const last = composer.result();
      expect(last.complete).toBe(true);
      expect(contributionsAlbumSnapshot(last)).toBe(whole);
    }
  });

  it("aucune contribution : Album vide, rien n'est inventé", () => {
    const r = solveContributionsAlbum([], { frame: "desktop", theme: "light" });
    expect(r.status).toBe("CONTRIBUTIONS_ALBUM_EMPTY");
    expect(r.plates).toEqual([]);
  });

  it("contribution invalide (photo sans dimensions) : STOP explicite, aucune planche", () => {
    const bad: ContributionSceneItem[] = [...items("CRC"), { id: "x", kind: "photo", photo: null }];
    const r = solveContributionsAlbum(bad, { frame: "mobile", theme: "light" });
    expect(r.status).toBe("CONTRIBUTIONS_ALBUM_NO_HARMONIOUS_PLATE");
    expect(r.detail).toMatch(/planche 1/);
    expect(r.plates).toEqual([]);
  });
});
