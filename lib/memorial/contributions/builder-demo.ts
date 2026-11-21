import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { builderDemoSlots } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_MOBILE_LAYOUTS } from "@/config/contributions-mobile-v1";
import { solveContributionsScene, type ContributionScenePlacement, type ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";
import { demoContributions, type DemoContributionContent } from "@/lib/memorial/contributions/demo-contributions";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";

/**
 * M7 — la démonstration du Builder (états de dévoilement B0…B3 du relevé M0,
 * `CONTRIBUTIONS_BUILDER_REVEAL` / `builderDemoSlots`).
 *
 * La scène COMPLÈTE est composée une fois, par le moteur validé (M4 → M5-C),
 * avec quatre exemples fictifs posés sur les emplacements du Master : deux
 * récits sur R1 et R2, une condoléance sur C1, un Polaroid sur P1. Chaque
 * fonctionnalité ouverte fait apparaître SES cartes, à leur emplacement, sans
 * recomposer les autres : la scène est une fonction pure des choix, donc
 * réversible, et une carte ne bouge jamais quand une autre apparaît.
 *
 * Exemples PUREMENT VISUELS : textes et photos de démonstration
 * (`demo-contributions.ts`), jamais écrits dans le brouillon, jamais
 * publiés, jamais présentés comme des messages reçus.
 */

export type BuilderDemoFrame = "desktop" | "mobile";

/** Ordre de lecture des ancrages : Desktop R1 · C1 · R2 · P1 ; Mobile (P1) R1 · R2 · C1 · P1. */
const DEMO_COMBO: Record<BuilderDemoFrame, string> = { desktop: "RCRP", mobile: "RRCP" };

export interface BuilderDemoScene {
  frame: BuilderDemoFrame;
  theme: ContributionsTheme;
  /** Les quatre exemples, à leurs emplacements de Master. */
  placements: readonly ContributionScenePlacement[];
  contents: Readonly<Record<string, DemoContributionContent>>;
}

const CACHE = new Map<string, BuilderDemoScene | null>();

/** La scène de démonstration complète (mémorisée), ou `null` si le moteur ne la compose pas (fail closed). */
export function builderDemoScene(frame: BuilderDemoFrame, theme: ContributionsTheme): BuilderDemoScene | null {
  const key = `${frame}-${theme}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  const demo = demoContributions(DEMO_COMBO[frame]).map((d) => ({ ...d, id: `builder-demo-${d.id}` }));
  const items: ContributionSceneItem[] = demo.map((d) => ({ id: d.id, kind: d.kind, ...(d.photo ? { photo: d.photo } : {}) }));
  const scene =
    frame === "desktop"
      ? solveContributionsScene(items, { frame: "desktop", theme })
      : solveContributionsScene(items, { frame: "mobile", theme, geometry: CONTRIBUTIONS_MOBILE_LAYOUTS["grille-2x2"].geometry[theme] });
  const result: BuilderDemoScene | null =
    scene.status === "PASS" ? { frame, theme, placements: scene.placements, contents: Object.fromEntries(demo.map((d) => [d.id, d.content])) } : null;
  CACHE.set(key, result);
  return result;
}

/** Les exemples visibles pour ces choix : ceux des emplacements B1…B3 ouverts (B0 : aucun). */
export function visibleDemoPlacements(scene: BuilderDemoScene, features: ContributionsFeatures): ContributionScenePlacement[] {
  const slots = new Set(builderDemoSlots({ condolences: features.condolences, stories: features.stories, photos: features.photos }));
  return scene.placements.filter((p) => slots.has(p.anchorId));
}
