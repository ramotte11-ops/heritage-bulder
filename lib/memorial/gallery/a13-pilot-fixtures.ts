import type { PhotoSource } from "@/lib/memorial/gallery/dynamic-polaroid-layout";

/**
 * A13 Dynamic Polaroid — PILOT fixtures. The six ratios the QG mission
 * imposes, in the mission's own order (media[i] → slot[i], never sorted).
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

export const PILOT_CAPTION_MODES = ["mixte", "aucune", "une-ligne", "deux-lignes"] as const;
export type PilotCaptionMode = (typeof PILOT_CAPTION_MODES)[number];

const BASE = "/pilot/a13-dynamic-polaroid";

export const A13_PILOT_MEDIA: readonly PilotMedia[] = [
  {
    src: `${BASE}/p1-portrait-3x4.jpg`,
    label: "1 · portrait standard 3:4",
    width: 1200,
    height: 1600,
    focal: { x: 0.5, y: 0.38 },
    captions: { mixte: "Maman, un soir de juin", aucune: null, "une-ligne": "Maman", "deux-lignes": "Maman, un soir de juin à Gordes" },
  },
  {
    src: `${BASE}/p2-paysage-3x2.jpg`,
    label: "2 · paysage standard 3:2",
    width: 1800,
    height: 1200,
    focal: { x: 0.39, y: 0.7 },
    captions: { mixte: null, aucune: null, "une-ligne": "Les collines", "deux-lignes": "Tous les deux sur les collines" },
  },
  {
    src: `${BASE}/p3-carre-1x1.jpg`,
    label: "3 · carré 1:1",
    width: 1400,
    height: 1400,
    focal: { x: 0.48, y: 0.62 },
    captions: { mixte: "Son chapeau de paille, l'été", aucune: null, "une-ligne": "Son chapeau", "deux-lignes": "Son chapeau de paille, l'été 82" },
  },
  {
    src: `${BASE}/p4-portrait-etroit-9x16.jpg`,
    label: "4 · portrait étroit 9:16",
    width: 1080,
    height: 1920,
    focal: { x: 0.52, y: 0.62 },
    captions: { mixte: "Sous l'arche", aucune: null, "une-ligne": "Sous l'arche", "deux-lignes": "Sous l'arche de la vieille ferme" },
  },
  {
    src: `${BASE}/p5-paysage-large-16x9.jpg`,
    label: "5 · paysage large 16:9",
    width: 1920,
    height: 1080,
    focal: { x: 0.6, y: 0.6 },
    captions: { mixte: null, aucune: null, "une-ligne": "Le ponton", "deux-lignes": "Le ponton du lac, août 1998" },
  },
  {
    src: `${BASE}/p6-panorama-3x1.jpg`,
    label: "6 · panorama difficile 3:1 (sujet au bord droit)",
    width: 2700,
    height: 900,
    focal: { x: 0.9, y: 0.7 },
    captions: { mixte: "Le village, depuis le muret", aucune: null, "une-ligne": "Le village", "deux-lignes": "Le village depuis le vieux muret" },
  },
];

/** Runtime title/subtitle — pilot fixture copy, DOM only. */
export const A13_PILOT_TITLE = {
  title: "Souvenirs de famille",
  subtitle: "Les instants que nous gardons près de nous",
} as const;
