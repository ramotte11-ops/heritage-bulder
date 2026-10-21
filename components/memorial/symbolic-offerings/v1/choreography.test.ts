import { describe, expect, it } from "vitest";
import { MOTION_END, VEIL, gestureSteps, returnSteps, statusSteps, stepsEnd, transitionSteps } from "./choreography";

/**
 * Chorégraphie M2 — verrouille les décisions PO : transition A (fondu
 * enchaîné voilé), durées naturelles des gestes, état final = style statique.
 */
describe("choreography", () => {
  it.each(["lys", "coeur"] as const)("%s : la confirmation attend la fin exacte du mouvement", (kind) => {
    expect(MOTION_END[kind]).toBe(Math.max(stepsEnd(gestureSteps(kind)), stepsEnd(transitionSteps("light"))));
  });

  it("durées naturelles validées : bougie 2,5 s, lys 1,7 s, cœur 1,8 s — loin des 10 s de présentation", () => {
    expect(MOTION_END).toEqual({ bougie: 2500, lys: 1700, coeur: 1800 });
  });

  it("transition A : les cartes s'effacent, puis fondu du fond avec un voile qui culmine à mi-parcours", () => {
    for (const variant of ["light", "dark"] as const) {
      const [sel, fond, veil] = transitionSteps(variant);
      expect(sel).toMatchObject({ target: "selectionText", duration: 250, delay: 0 });
      expect(fond).toMatchObject({ target: "fond", duration: 750, delay: 150 });
      expect(veil).toMatchObject({ target: "veil", duration: 750, delay: 150 });
      expect(veil.keyframes).toEqual([{ opacity: 0 }, { opacity: VEIL[variant].peak, offset: 0.5 }, { opacity: 0 }]);
    }
  });

  it("chaque animation se termine sur l'état final statique (opacité 1, aucune transformation)", () => {
    for (const kind of ["bougie", "lys", "coeur"] as const) {
      for (const step of gestureSteps(kind)) {
        const last = step.keyframes[step.keyframes.length - 1];
        if (step.target === "glow") expect(last.opacity).toBe(0);
        else expect(last.opacity).toBe(1);
        if (last.transform !== undefined) expect(["none", "scale(1, 1)"]).toContain(last.transform);
      }
    }
  });

  it("bougie : la flamme s'allume après l'apparition de la bougie, halo et lueur ensuite ; immobile au-delà", () => {
    const steps = Object.fromEntries(gestureSteps("bougie").map((s) => [s.target, s]));
    expect(steps.flame.delay).toBeGreaterThanOrEqual(steps.object.delay + steps.object.duration);
    expect(steps.halo.delay).toBeGreaterThan(steps.flame.delay);
    expect(stepsEnd(gestureSteps("bougie"))).toBe(2900); // la lueur finit de monter, la flamme est fixe dès 2,5 s
    expect(steps.flame.delay + steps.flame.duration).toBe(MOTION_END.bougie);
  });

  it("aucun geste n'a d'animation infinie (flamme stable, pas de scintillement)", () => {
    for (const steps of [gestureSteps("bougie"), gestureSteps("lys"), gestureSteps("coeur"), statusSteps(), returnSteps()]) {
      for (const s of steps) expect(Number.isFinite(s.duration) && s.duration <= 1400).toBe(true);
    }
  });

  it("le bouton suit la confirmation ; le retour aux cartes dure moins d'une seconde", () => {
    const [status, cont] = statusSteps();
    expect(cont.delay).toBeGreaterThan(status.delay);
    expect(stepsEnd(returnSteps())).toBeLessThan(1000);
  });
});
