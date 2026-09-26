import type { PhotoSource } from "@/lib/memorial/gallery/dynamic-polaroid-layout";

/**
 * A13 Dynamic Polaroid — PILOT fixtures. The six ratios the QG mission
 * imposes, in the mission's own order (media[i] → slot[i], never sorted).
 *
 * V2.1 §6 lists the landscape case as 4:3; V1 and V2 used a 3:2 landscape,
 * kept as `A13_PILOT_MEDIA_LANDSCAPE_3X2` (page preset `?paysage=3x2`) so
 * the V2 run can be replayed.
 *
 * The photos are SYNTHETIC scenes (see `scripts/pilot/a13-test-photos.html`):
 * this session had no access to any image bank. They exist to exercise the
 * six ratios; the pilot page also accepts real local files at runtime.
 */

export interface PilotMedia extends PhotoSource {
  src: string;
  label: string;
  /** Caption text by caption mode (runtime text, never baked). */
  captions: Record<PilotCaptionMode, string | null>;
}

/** QA V2.1 — per slot: absent, one line, 24 characters, 32 characters. */
export const PILOT_CAPTION_MODES = ["aucune", "une-ligne", "24", "32"] as const;
export type PilotCaptionMode = (typeof PILOT_CAPTION_MODES)[number];

const BASE = "/pilot/a13-dynamic-polaroid";

export const A13_PILOT_MEDIA: readonly PilotMedia[] = [
  {
    src: `${BASE}/p1-portrait-3x4.jpg`,
    label: "1 · portrait standard 3:4",
    width: 1200,
    height: 1600,
    focal: { x: 0.5, y: 0.38 },
    captions: { aucune: null, "une-ligne": "Maman", "24": "Maman, un soir à Gordes.", "32": "Maman, un beau soir de juin 1974" },
  },
  {
    src: `${BASE}/p2-paysage-4x3.jpg`,
    label: "2 · paysage standard 4:3",
    width: 1600,
    height: 1200,
    focal: { x: 0.39, y: 0.7 },
    captions: { aucune: null, "une-ligne": "Tous les deux", "24": "Tous deux sur la colline", "32": "Tous les deux, sur les collines." },
  },
  {
    src: `${BASE}/p3-carre-1x1.jpg`,
    label: "3 · carré 1:1",
    width: 1400,
    height: 1400,
    focal: { x: 0.48, y: 0.62 },
    captions: { aucune: null, "une-ligne": "Son chapeau", "24": "Son chapeau, l'été 1982.", "32": "Son chapeau de paille, été 1982." },
  },
  {
    src: `${BASE}/p4-portrait-etroit-9x16.jpg`,
    label: "4 · portrait étroit 9:16",
    width: 1080,
    height: 1920,
    focal: { x: 0.52, y: 0.62 },
    captions: { aucune: null, "une-ligne": "Sous l'arche", "24": "Sous l'arche de la ferme", "32": "Sous l'arche de la vieille ferme" },
  },
  {
    src: `${BASE}/p5-paysage-large-16x9.jpg`,
    label: "5 · paysage large 16:9",
    width: 1920,
    height: 1080,
    focal: { x: 0.6, y: 0.6 },
    captions: { aucune: null, "une-ligne": "Le ponton", "24": "Le ponton du lac, été 98", "32": "Le ponton du lac, un soir d'août" },
  },
  {
    src: `${BASE}/p6-panorama-3x1.jpg`,
    label: "6 · panorama difficile 3:1 (sujet au bord droit)",
    width: 2700,
    height: 900,
    focal: { x: 0.9, y: 0.7 },
    captions: { aucune: null, "une-ligne": "Le village", "24": "Le village, vu du muret.", "32": "Le village depuis le vieux muret" },
  },
];

/** The V1/V2 landscape (3:2), same scene, same captions as media[1]. */
export const A13_PILOT_MEDIA_LANDSCAPE_3X2: PilotMedia = {
  ...A13_PILOT_MEDIA[1],
  src: `${BASE}/p2-paysage-3x2.jpg`,
  label: "2 · paysage standard 3:2 (jeu V1/V2)",
  width: 1800,
  height: 1200,
};

/**
 * Multi-state pool: the six V2.1 test media in family order, then a 7th
 * (the 3:2 landscape) so the ≥ 7 Signature state can be exercised. A state
 * of N media takes `A13_PILOT_MEDIA_POOL.slice(0, N)` — never a re-sort.
 */
export const A13_PILOT_MEDIA_POOL: readonly PilotMedia[] = [
  ...A13_PILOT_MEDIA,
  { ...A13_PILOT_MEDIA_LANDSCAPE_3X2, label: "7 · paysage 3:2 (7e média, non affiché)" },
];

/**
 * Calibration V1.1 QA ratio set, in the contract's order: 3:4, 4:3, 1:1,
 * 9:16, 16:9, 2.39:1 (the 2.39:1 panorama is the V1.1 addition, same
 * generator). `rotateMatrixMedia(r)` gives slot i the ratio (i + r) mod 6.
 */
export const A13_MATRIX_MEDIA: readonly PilotMedia[] = [
  A13_PILOT_MEDIA[0],
  A13_PILOT_MEDIA[1],
  A13_PILOT_MEDIA[2],
  A13_PILOT_MEDIA[3],
  A13_PILOT_MEDIA[4],
  {
    ...A13_PILOT_MEDIA[5],
    src: `${BASE}/p6b-panorama-239x100.jpg`,
    label: "6 · panorama 2,39:1",
    width: 2390,
    height: 1000,
  },
];

export function rotateMatrixMedia(rotation: number, count: number): PilotMedia[] {
  return Array.from({ length: count }, (_, i) => {
    const m = A13_MATRIX_MEDIA[(i + rotation) % A13_MATRIX_MEDIA.length];
    // Family position i keeps its own caption set; only the ratio rotates.
    return { ...m, captions: A13_PILOT_MEDIA_POOL[i].captions };
  });
}

/** Runtime title/subtitle — pilot fixture copy, DOM only (V1 geometry kept). */
export const A13_PILOT_TITLE = {
  title: "Souvenirs de famille",
  subtitle: "Les instants que nous gardons près de nous",
} as const;
