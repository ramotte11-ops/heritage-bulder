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

/** Contract V2 §8 — per slot: 20–24 characters, 32 characters, absent. */
export const PILOT_CAPTION_MODES = ["courte", "longue", "aucune"] as const;
export type PilotCaptionMode = (typeof PILOT_CAPTION_MODES)[number];

const BASE = "/pilot/a13-dynamic-polaroid";

export const A13_PILOT_MEDIA: readonly PilotMedia[] = [
  {
    src: `${BASE}/p1-portrait-3x4.jpg`,
    label: "1 · portrait standard 3:4",
    width: 1200,
    height: 1600,
    focal: { x: 0.5, y: 0.38 },
    captions: { courte: "Maman, un soir de juin", longue: "Maman, un beau soir de juin 1974", aucune: null },
  },
  {
    src: `${BASE}/p2-paysage-3x2.jpg`,
    label: "2 · paysage standard 3:2",
    width: 1800,
    height: 1200,
    focal: { x: 0.39, y: 0.7 },
    captions: { courte: "Tous deux sur la colline", longue: "Tous les deux, sur les collines.", aucune: null },
  },
  {
    src: `${BASE}/p3-carre-1x1.jpg`,
    label: "3 · carré 1:1",
    width: 1400,
    height: 1400,
    focal: { x: 0.48, y: 0.62 },
    captions: { courte: "Son chapeau de paille", longue: "Son chapeau de paille, été 1982.", aucune: null },
  },
  {
    src: `${BASE}/p4-portrait-etroit-9x16.jpg`,
    label: "4 · portrait étroit 9:16",
    width: 1080,
    height: 1920,
    focal: { x: 0.52, y: 0.62 },
    captions: { courte: "Sous l'arche de la ferme", longue: "Sous l'arche de la vieille ferme", aucune: null },
  },
  {
    src: `${BASE}/p5-paysage-large-16x9.jpg`,
    label: "5 · paysage large 16:9",
    width: 1920,
    height: 1080,
    focal: { x: 0.6, y: 0.6 },
    captions: { courte: "Le ponton du lac, 1998", longue: "Le ponton du lac, un soir d'août", aucune: null },
  },
  {
    src: `${BASE}/p6-panorama-3x1.jpg`,
    label: "6 · panorama difficile 3:1 (sujet au bord droit)",
    width: 2700,
    height: 900,
    focal: { x: 0.9, y: 0.7 },
    captions: { courte: "Le village, vu du muret", longue: "Le village depuis le vieux muret", aucune: null },
  },
];

/** Runtime title/subtitle — pilot fixture copy, DOM only (V1 geometry kept). */
export const A13_PILOT_TITLE = {
  title: "Souvenirs de famille",
  subtitle: "Les instants que nous gardons près de nous",
} as const;
