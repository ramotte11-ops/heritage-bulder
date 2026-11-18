import { describe, expect, it } from "vitest";
import {
  CONTRIBUTIONS_MOBILE_FRAME_WIDTH as W,
  CONTRIBUTIONS_MOBILE_LAYOUTS,
  CONTRIBUTIONS_MOBILE_MIN_TOUCH_CSS,
  CONTRIBUTIONS_MOBILE_TYPE_CSS,
} from "@/config/contributions-mobile-v1";
import { visibleFraction } from "@/lib/memorial/album/album-group-solver";
import { convexIntersectionArea } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import {
  CONTRIBUTIONS_SCENE_SEARCH,
  contributionsSceneSnapshot,
  forbiddenZonesOf,
  masterGeometry,
  solveContributionsScene,
  type ContributionsGeometry,
  type ContributionsSceneResult,
} from "@/lib/memorial/contributions/contributions-scene";
import { itemsOf, sequences } from "@/lib/memorial/contributions/contributions-scene-matrix";

/**
 * M5-B — géométries Mobile EXPLORATOIRES (aucune validée par la PO). Le moteur
 * M4.2 est réutilisé tel quel ; seule la géométrie change. Ces tests
 * vérifient que chaque proposition compose toutes les suites de 1 à 4 (ou à
 * sa capacité) sans couvrir un texte, une légende, un titre ni un bouton, et
 * qu'elle respecte les seuils de lisibilité et de stacking annoncés.
 */

const LAYOUTS = Object.values(CONTRIBUTIONS_MOBILE_LAYOUTS);
const THEMES = ["light", "dark"] as const;

function expectInvariants(r: ContributionsSceneResult, g: ContributionsGeometry) {
  const zones = forbiddenZonesOf(g);
  for (const p of r.placements) {
    const above = r.placements.filter((o) => o.zIndex > p.zIndex).map((o) => o.outer);
    expect(above.length ? visibleFraction(p.protectedRegion, above) : 1).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(above.length ? visibleFraction(p.outer, above) : 1).toBeGreaterThanOrEqual(CONTRIBUTIONS_SCENE_SEARCH.minVisiblePaper - 1e-6);
    for (const z of zones) expect(convexIntersectionArea(p.outer, z)).toBeLessThan(1e-6);
    if (p.layout.kind === "card") expect([p.layout.card.paper.width, p.layout.card.paper.height]).toEqual([g.formats[p.layout.card.format].width, g.formats[p.layout.card.format].height]);
  }
}

describe("M5-B Contributions Mobile — moteur inchangé pour les Masters", () => {
  it("sans géométrie explicite, la scène est celle du Master (M4.2), à l'octet", () => {
    for (const frame of ["desktop", "mobile"] as const)
      for (const theme of THEMES) {
        const a = contributionsSceneSnapshot(solveContributionsScene(itemsOf("RCRP"), { frame, theme }));
        const b = contributionsSceneSnapshot(solveContributionsScene(itemsOf("RCRP"), { frame, theme, geometry: masterGeometry(frame, theme) }));
        expect(a).toBe(b);
      }
  }, 60_000);
});

describe("M5-B Contributions Mobile — compositions", () => {
  for (const layout of LAYOUTS)
    for (const theme of THEMES)
      it(`${layout.label} ${theme} : toutes les suites jusqu'à ${layout.sceneCapacity} contributions, invariants tenus`, () => {
        const g = layout.geometry[theme];
        for (const seq of sequences().filter((s) => s.length <= layout.sceneCapacity)) {
          const items = itemsOf(seq);
          const r = solveContributionsScene(items, { frame: "mobile", theme, geometry: g });
          expect(r.status, `${seq} ${r.detail}`).toBe("PASS");
          expect(r.placements.map((p) => p.itemId).sort()).toEqual(items.map((i) => i.id).sort());
          expectInvariants(r, g);
        }
      }, 300_000);

  it("déterministe : contenu identique, géométrie identique à l'octet", () => {
    for (const layout of LAYOUTS)
      for (const seq of ["RCRP", "CCCC", "PPPP"].map((s) => s.slice(0, layout.sceneCapacity))) {
        const run = () => contributionsSceneSnapshot(solveContributionsScene(itemsOf(seq), { frame: "mobile", theme: "dark", geometry: layout.geometry.dark }));
        expect(run()).toBe(run());
      }
  }, 120_000);
});

describe("M5-B Contributions Mobile — lisibilité et stacking (seuils de conception)", () => {
  it("le texte garde une taille lisible en px CSS, jamais dérivée de la largeur", () => {
    expect(CONTRIBUTIONS_MOBILE_TYPE_CSS.storyBody).toBeGreaterThanOrEqual(15);
    expect(CONTRIBUTIONS_MOBILE_TYPE_CSS.condolenceBody).toBeGreaterThanOrEqual(15);
    expect(CONTRIBUTIONS_MOBILE_TYPE_CSS.subtitle).toBeGreaterThanOrEqual(15);
    expect(CONTRIBUTIONS_MOBILE_TYPE_CSS.signature).toBeGreaterThanOrEqual(22);
  });

  for (const layout of LAYOUTS)
    it(`${layout.label} : boutons ≥ 44 px CSS dès 320 px, zone de sécurité sous les boutons`, () => {
      const s320 = 320 / W;
      const c = layout.chrome;
      for (const b of [c.leaveMessageButton, c.viewAllButton]) expect((b.y1 - b.y0) * s320).toBeGreaterThanOrEqual(CONTRIBUTIONS_MOBILE_MIN_TOUCH_CSS);
      // Zone de sécurité : du bas du dernier bouton au bas de la scène (recouvert en premier par la rubrique suivante).
      expect((layout.height - c.viewAllButton.y1) * (375 / W)).toBeGreaterThanOrEqual(200);
      // Aucune contribution ne descend dans la zone des boutons.
      for (const theme of THEMES) expect(layout.geometry[theme].band.y1).toBeLessThan(c.leaveMessageButton.y0);
    });
});
