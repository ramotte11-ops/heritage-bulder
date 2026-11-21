import { describe, expect, it } from "vitest";
import { albumOrder, compareP1, contributionsPublicState, selectSceneContributions, type PublishedContribution } from "./public-contributions";

const ALL = { condolences: true, stories: true, photos: true };
const c = (id: string, type: PublishedContribution["type"], day: number, hour = 10): PublishedContribution => ({
  id,
  type,
  publishedAt: `2026-11-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`,
});

describe("M8-E3 — P1 : Album du plus récent au plus ancien", () => {
  it("catégories mélangées ; départage par id décroissant ; instants, pas chaînes", () => {
    const items = [c("a", "condolence", 1), c("b", "photo", 3), c("c", "testimonial", 2), c("d", "condolence", 2), { id: "e", type: "photo" as const, publishedAt: "2026-11-02T11:00:00+02:00" }];
    // e = 09:00Z le 2 : avant c et d (10:00Z).
    expect(albumOrder(items, ALL).map((x) => x.id)).toEqual(["b", "d", "c", "e", "a"]);
    expect(compareP1(c("x", "photo", 1), c("y", "photo", 1))).toBeGreaterThan(0);
  });

  it("une catégorie désactivée disparaît de l'Album ; les doublons sont écartés", () => {
    const items = [c("a", "condolence", 1), c("b", "photo", 3), c("b", "photo", 3)];
    expect(albumOrder(items, { ...ALL, photos: false }).map((x) => x.id)).toEqual(["a"]);
    expect(albumOrder(items, ALL).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("M8-E3 — O8 : sélection de la scène", () => {
  it("chaque catégorie disponible représentée, puis les plus récentes, présentées par récence", () => {
    // 6 photos récentes, 1 récit et 1 condoléance anciens : la scène garde le récit et la condoléance.
    const items = [
      ...[10, 11, 12, 13, 14, 15].map((d) => c(`p${d}`, "photo", d)),
      c("s1", "testimonial", 2),
      c("k1", "condolence", 1),
    ];
    expect(selectSceneContributions(items, ALL).map((x) => x.id)).toEqual(["p15", "p14", "s1", "k1"]);
  });

  it("une seule catégorie : les 4 plus récentes", () => {
    const items = [1, 2, 3, 4, 5].map((d) => c(`k${d}`, "condolence", d));
    expect(selectSceneContributions(items, ALL).map((x) => x.id)).toEqual(["k5", "k4", "k3", "k2"]);
  });

  it("1 à 3 contributions : toutes, ordre P1", () => {
    expect(selectSceneContributions([c("a", "photo", 1), c("b", "testimonial", 2)], ALL).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("une catégorie désactivée n'est jamais sur la scène, même la plus récente", () => {
    const items = [c("p", "photo", 9), c("s", "testimonial", 2), c("k", "condolence", 1)];
    expect(selectSceneContributions(items, { ...ALL, photos: false }).map((x) => x.id)).toEqual(["s", "k"]);
  });

  it("aucune contribution : scène vide (jamais de contenu fictif)", () => {
    expect(selectSceneContributions([], ALL)).toEqual([]);
  });
});

describe("M8-E3 — états publics", () => {
  it("fermée, vide (M0), contributions (Voir tous dès 4)", () => {
    expect(contributionsPublicState({ condolences: false, stories: false, photos: false }, 9)).toEqual({ kind: "closed" });
    expect(contributionsPublicState(ALL, 0)).toEqual({ kind: "empty" });
    expect(contributionsPublicState(ALL, 3)).toEqual({ kind: "contributions", viewAll: false });
    expect(contributionsPublicState(ALL, 4)).toEqual({ kind: "contributions", viewAll: true });
  });
});
