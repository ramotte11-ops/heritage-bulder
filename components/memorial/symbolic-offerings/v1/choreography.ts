import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";

/**
 * Offrandes symboliques V1 — chorégraphie validée par la PO (démonstration
 * animée, transition A « fondu enchaîné voilé »). Pur, sans DOM : les
 * durées et images clés que le composant joue avec l'API Web Animations.
 *
 * Durées naturelles en millisecondes, à partir du clic. Les 10 secondes de
 * la séquence de présentation ne les modifient pas ; la scène finale reste
 * affichée jusqu'à l'action du visiteur (aucun retour automatique).
 *
 * Toutes les animations ont `fill: "backwards"` : pendant leur délai elles
 * tiennent leur première image ; à la fin, l'élément retrouve son style
 * statique, qui est déjà l'état final. Interrompre une animation laisse donc
 * toujours l'état final, jamais un état intermédiaire.
 */

export type AnimationTarget =
  | "selectionText"
  | "fond"
  | "veil"
  | "object"
  | "shadowLarge"
  | "shadowContact"
  | "flame"
  | "halo"
  | "wax"
  | "glow"
  | "status"
  | "continue"
  | "offering";

export interface AnimationStep {
  target: AnimationTarget;
  /** Images clés ; `{px}` est remplacé par la valeur d'un px de canevas. */
  keyframes: Keyframe[];
  duration: number;
  delay: number;
  easing: string;
}

const EASE = "cubic-bezier(.45,0,.25,1)";
const EASE_OUT = "cubic-bezier(.2,.7,.2,1)";

/** Voile de la transition A : papier en Light, assombrissement en Dark. */
export const VEIL = {
  light: { color: "rgb(243 227 213)", peak: 0.2 },
  dark: { color: "rgb(8 6 4)", peak: 0.25 },
} as const;

/** Fin du mouvement de chaque geste : la confirmation n'apparaît pas avant. */
export const MOTION_END: Readonly<Record<OfferingKind, number>> = { bougie: 2500, lys: 1700, coeur: 1800 };

export function transitionSteps(variant: "light" | "dark"): AnimationStep[] {
  const veil = VEIL[variant];
  return [
    { target: "selectionText", keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 250, delay: 0, easing: "ease-out" },
    { target: "fond", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 750, delay: 150, easing: EASE },
    {
      target: "veil",
      keyframes: [{ opacity: 0 }, { opacity: veil.peak, offset: 0.5 }, { opacity: 0 }],
      duration: 750,
      delay: 150,
      easing: EASE,
    },
  ];
}

export function gestureSteps(kind: OfferingKind): AnimationStep[] {
  if (kind === "bougie") {
    return [
      { target: "object", keyframes: [{ opacity: 0, transform: "translateY(calc({px} * 6)) scale(.985)" }, { opacity: 1, transform: "none" }], duration: 600, delay: 700, easing: EASE_OUT },
      { target: "shadowLarge", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 600, delay: 700, easing: EASE_OUT },
      { target: "shadowContact", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 600, delay: 700, easing: EASE_OUT },
      // La flamme naît de la mèche : origine de transformation = base de la flamme.
      {
        target: "flame",
        keyframes: [
          { opacity: 0, transform: "scale(.35, .05)" },
          { opacity: 0.9, transform: "scale(.6, .55)", offset: 0.4 },
          { opacity: 1, transform: "scale(1, 1)" },
        ],
        duration: 1200,
        delay: 1300,
        easing: EASE_OUT,
      },
      { target: "halo", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 1400, delay: 1500, easing: "ease-out" },
      { target: "wax", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 1400, delay: 1500, easing: "ease-out" },
    ];
  }
  if (kind === "lys") {
    return [
      {
        target: "object",
        keyframes: [
          { opacity: 0, transform: "translateY(calc({px} * -16)) rotate(-2deg)" },
          { opacity: 1, offset: 0.55 },
          { opacity: 1, transform: "none" },
        ],
        duration: 1000,
        delay: 700,
        easing: EASE_OUT,
      },
      // L'ombre se forme à l'approche du papier.
      { target: "shadowLarge", keyframes: [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], duration: 1000, delay: 700, easing: EASE_OUT },
      { target: "shadowContact", keyframes: [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], duration: 1000, delay: 700, easing: EASE_OUT },
    ];
  }
  return [
    { target: "object", keyframes: [{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], duration: 1100, delay: 700, easing: EASE_OUT },
    { target: "shadowLarge", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 1100, delay: 700, easing: EASE_OUT },
    { target: "shadowContact", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 1100, delay: 700, easing: EASE_OUT },
    // Lueur douce qui s'éteint en arrivant : opacité statique 0.
    { target: "glow", keyframes: [{ opacity: 0 }, { opacity: 0.35, offset: 0.55 }, { opacity: 0 }], duration: 1100, delay: 700, easing: "ease-in-out" },
  ];
}

/** Confirmation (ou message d'échec), puis le bouton, après le serveur. */
export function statusSteps(): AnimationStep[] {
  return [
    { target: "status", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 400, delay: 0, easing: "ease-out" },
    { target: "continue", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 300, delay: 600, easing: "ease-out" },
  ];
}

/** Retour aux cartes : la scène s'efface, le fond se retire, les textes de
 * sélection reviennent. */
export function returnSteps(): AnimationStep[] {
  return [
    { target: "offering", keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 300, delay: 0, easing: "ease-in" },
    { target: "status", keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 200, delay: 0, easing: "ease-in" },
    { target: "fond", keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 600, delay: 150, easing: EASE },
    { target: "selectionText", keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 400, delay: 350, easing: "ease-out" },
  ];
}

/** Fin de la dernière étape d'une liste (ms, avant facteur de vitesse). */
export function stepsEnd(steps: readonly AnimationStep[]): number {
  return steps.reduce((end, s) => Math.max(end, s.delay + s.duration), 0);
}
