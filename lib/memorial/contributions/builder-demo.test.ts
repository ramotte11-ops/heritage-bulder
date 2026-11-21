import { describe, expect, it } from "vitest";
import { CONTRIBUTIONS_BUILDER_REVEAL } from "@/config/contributions-master-measurements";
import { builderDemoScene, visibleDemoPlacements } from "@/lib/memorial/contributions/builder-demo";
import { CONTRIBUTION_FEATURES, NO_CONTRIBUTION_FEATURES, type ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";

/** M7 — dévoilement B0…B3 du relevé M0, sur les scènes validées. */

const FRAMES = ["desktop", "mobile"] as const;
const THEMES = ["light", "dark"] as const;
const ALL: ContributionsFeatures[] = [];
for (let mask = 0; mask < 8; mask++) ALL.push({ condolences: !!(mask & 1), stories: !!(mask & 2), photos: !!(mask & 4) });

describe("M7 — démonstration du Builder", () => {
  it("la scène complète se compose (moteur validé), chaque exemple sur son emplacement de Master", () => {
    for (const frame of FRAMES)
      for (const theme of THEMES) {
        const scene = builderDemoScene(frame, theme);
        expect(scene, `${frame} ${theme}`).not.toBeNull();
        const at = Object.fromEntries(scene!.placements.map((p) => [p.anchorId, p.kind]));
        expect(at).toEqual({ R1: "story", R2: "story", C1: "condolence", P1: "photo" });
      }
  });

  it("B0 : aucune fonctionnalité, aucune carte", () => {
    for (const frame of FRAMES) expect(visibleDemoPlacements(builderDemoScene(frame, "light")!, NO_CONTRIBUTION_FEATURES)).toEqual([]);
  });

  it("B1–B3 : chaque fonctionnalité fait apparaître SES cartes (règle M0), et seulement elles", () => {
    const slotsOf = (id: "B1" | "B2" | "B3") => CONTRIBUTIONS_BUILDER_REVEAL.find((s) => s.id === id)!.slots;
    for (const frame of FRAMES) {
      const scene = builderDemoScene(frame, "dark")!;
      const only = (f: (typeof CONTRIBUTION_FEATURES)[number]) => visibleDemoPlacements(scene, { ...NO_CONTRIBUTION_FEATURES, [f]: true }).map((p) => p.anchorId).sort();
      expect(only("condolences")).toEqual([...slotsOf("B1")].sort());
      expect(only("stories")).toEqual([...slotsOf("B2")].sort());
      expect(only("photos")).toEqual([...slotsOf("B3")].sort());
    }
  });

  it("aucune recomposition : une carte visible est la même, au même endroit, quels que soient les autres choix", () => {
    for (const frame of FRAMES)
      for (const theme of THEMES) {
        const scene = builderDemoScene(frame, theme)!;
        const byAnchor = new Map(scene.placements.map((p) => [p.anchorId, p]));
        for (const f of ALL) for (const p of visibleDemoPlacements(scene, f)) expect(p).toBe(byAnchor.get(p.anchorId));
      }
  });

  it("réversible et pur : mêmes choix, même aperçu", () => {
    const scene = builderDemoScene("mobile", "light")!;
    const on = { condolences: true, stories: true, photos: false };
    const first = visibleDemoPlacements(scene, on);
    visibleDemoPlacements(scene, NO_CONTRIBUTION_FEATURES);
    expect(visibleDemoPlacements(scene, on)).toEqual(first);
    expect(builderDemoScene("mobile", "light")).toBe(scene);
  });

  it("exemples purement visuels : des contenus de démonstration, identifiés comme tels", () => {
    const scene = builderDemoScene("desktop", "light")!;
    for (const p of scene.placements) expect(p.itemId.startsWith("builder-demo-")).toBe(true);
    expect(Object.keys(scene.contents)).toHaveLength(4);
  });
});
