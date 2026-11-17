import { expect } from "vitest";
import { CONTRIBUTIONS_CARD_BAND, type ContributionsFormat, type ContributionsTheme } from "@/config/contributions-master-measurements";
import { visibleFraction } from "@/lib/memorial/album/album-group-solver";
import { convexIntersectionArea } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { cardPaperSize } from "@/lib/memorial/contributions/contribution-shapes";
import {
  CONTRIBUTIONS_SCENE_SEARCH,
  contributionsForbiddenZones,
  solveContributionsScene,
  type ContributionKind,
  type ContributionSceneItem,
  type ContributionsSceneResult,
} from "@/lib/memorial/contributions/contributions-scene";

/**
 * M4.1 — matrice des compositions (aide de test, pas un test) : les 120
 * suites de 1 à 4 contributions (C condoléance, R récit, P photographie),
 * pour chacun des quatre Masters.
 */

export const LETTER: Record<string, ContributionKind> = { C: "condolence", R: "story", P: "photo" };

export function sequences(): string[] {
  const out: string[] = [];
  const go = (s: string) => {
    if (s.length) out.push(s);
    if (s.length < 4) for (const c of "CRP") go(s + c);
  };
  go("");
  return out.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

export function itemsOf(seq: string, photo: { width: number; height: number } = { width: 1000, height: 1000 }): ContributionSceneItem[] {
  return [...seq].map((c, i) => ({ id: `${c}${i}`, kind: LETTER[c], ...(c === "P" ? { photo } : {}) }));
}

/**
 * STOP attendus (mesurés en M4.2, formats communs Light / Dark, ratio 1:1).
 * Desktop : aucun. Mobile : exactement les compositions à TROIS condoléances
 * ou plus. Cause géométrique : sur la grille 2 × 2 des Masters Mobile, trois
 * éléments imposent une rangée de deux, donc deux condoléances côte à côte ;
 * condoléance commune 487 × 274, inclinée au moins de 3,8° → 504 px chacune,
 * 1 008 px pour 915 utiles : 93 px de chevauchement pour 68 px de marge hors
 * texte (75 px même en retranchant l'obliquité des bords). Mobile reste
 * provisoire (lisibilité, O1).
 */
const MOBILE_THREE_CONDOLENCES = ["CCC", "CCCC", "CCCP", "CCCR", "CCPC", "CCRC", "CPCC", "CRCC", "PCCC", "RCCC"] as const;

export const EXPECTED_STOPS: Record<ContributionsFormat, Record<ContributionsTheme, readonly string[]>> = {
  desktop: { light: [], dark: [] },
  mobile: { light: MOBILE_THREE_CONDOLENCES, dark: MOBILE_THREE_CONDOLENCES },
};

/** Invariants artistiques et d'accessibilité d'une scène résolue. */
export function expectSceneInvariants(r: ContributionsSceneResult, items: readonly ContributionSceneItem[]) {
  const zones = contributionsForbiddenZones(r.frame);
  const band = CONTRIBUTIONS_CARD_BAND[r.frame];
  // Chaque contribution visible est posée une fois, avec SA forme.
  expect(r.placements.map((p) => p.itemId).sort()).toEqual(items.slice(0, 4).map((i) => i.id).sort());
  for (const p of r.placements) {
    const item = items.find((i) => i.id === p.itemId)!;
    expect(p.kind).toBe(item.kind);
    if (item.kind === "condolence") expect(p.format).toBe("condolence");
    if (item.kind === "story") expect(["story-tall", "story-wide"]).toContain(p.format);
    if (item.kind === "photo") expect(p.format).toBe("polaroid");
    if (p.layout.kind === "card") {
      const size = cardPaperSize(p.layout.card.format, r.frame);
      expect([p.layout.card.paper.width, p.layout.card.paper.height]).toEqual([size.width, size.height]);
      expect(p.scale).toBe(1);
    } else expect(p.scale).toBeGreaterThanOrEqual(CONTRIBUTIONS_SCENE_SEARCH.polaroidScale.hard[0] - 1e-9);
    const above = r.placements.filter((o) => o.zIndex > p.zIndex).map((o) => o.outer);
    // Texte, signature, en-tête (carte) ou légende (Polaroid) : intégralement visibles.
    // Tolérance du solveur A13 : fraction 1e-6 (< 0,1 px² ici).
    expect(above.length ? visibleFraction(p.protectedRegion, above) : 1).toBeGreaterThanOrEqual(1 - 1e-6);
    for (const cover of above) expect(convexIntersectionArea(p.protectedRegion, cover)).toBeLessThan(0.1);
    // Papiers : contacts et légers chevauchements seulement.
    expect(above.length ? visibleFraction(p.outer, above) : 1).toBeGreaterThanOrEqual(CONTRIBUTIONS_SCENE_SEARCH.minVisiblePaper - 1e-6);
    // Titres, actions, pied, sceau : jamais touchés ; scène de dimensions fixes.
    for (const z of zones) expect(convexIntersectionArea(p.outer, z)).toBeLessThan(1e-6);
    for (const q of p.outer) {
      expect(q.x).toBeGreaterThanOrEqual(band.x0 - 1e-3);
      expect(q.x).toBeLessThanOrEqual(band.x1 + 1e-3);
      expect(q.y).toBeGreaterThanOrEqual(band.y0 - 1e-3);
      expect(q.y).toBeLessThanOrEqual(band.y1 + 1e-3);
    }
  }
}

/** Toute la matrice d'un Master : PASS vérifié, ou STOP attendu, explicite et sans placement. */
export function checkMatrix(frame: ContributionsFormat, theme: ContributionsTheme) {
  const stops: string[] = [];
  for (const seq of sequences()) {
    const items = itemsOf(seq);
    const r = solveContributionsScene(items, { frame, theme });
    if (r.status === "PASS") expectSceneInvariants(r, items);
    else {
      expect(r.status, seq).toBe("CONTRIBUTIONS_NO_HARMONIOUS_PLACEMENT");
      expect(r.placements).toEqual([]);
      expect(r.trials.length).toBeGreaterThan(0);
      stops.push(seq);
    }
  }
  expect([...stops].sort()).toEqual([...EXPECTED_STOPS[frame][theme]].sort());
}
