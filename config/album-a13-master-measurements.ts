/**
 * A13 — ALBUM COMPLET DESKTOP LIGHT — MASTER MEASUREMENTS (pilot V1).
 *
 * Transcription of the eleven tirages of the Album Light Master, the
 * composition authority named by `album-architecture-study-v1.json`
 * (`authorities.light`, 1536 × 1024). Handoff §3: "Ces deux familles doivent
 * être mesurées lors du pilote depuis les relations visibles du Master."
 *
 * ## Provenance
 *
 * The QG supplied the Master in-session (message "Je joins le MASTER ALBUM
 * DESKTOP LIGHT autoritaire"). The received file is a 1536 × 1024 WebP
 * (SHA-256 32c3ac03…d3259a), not the PNG referenced by the Handoff
 * (SHA-256 4a31cc0f…4f1b73): same dimensions, lossy re-encoding by the
 * transport. The QG declared it authoritative; the deviation is reported.
 * The Master itself is NOT committed (like every earlier A13 Master).
 *
 * ## Method (reproducible: `scripts/pilot/album-a13-measure-master.py`)
 *
 * - photo window: robust rotated-rectangle fit on the photo/paper edge
 *   (colour distance to the table cream, per-side sub-pixel gradient maxima,
 *   iterative outlier rejection, opposite sides parallel);
 * - paper: side and top margins read at 13 px on every unobstructed side
 *   (luminance shadow edge); bottom band read where it is unobstructed
 *   (P4, P5, P6, P9, P10, P11), otherwise their median 35.75 px;
 * - outer box = window + 13 / 13 / 13 / band, same rotation;
 * - depth: read at every paper crossing (see `A13_ALBUM_MASTER_DEPTH`).
 *
 * All values are Master source px (1536 frame). The runtime works in the
 * canonical A13 1670 frame used by DynamicPolaroid: `× A13_ALBUM_SOURCE_TO_CANONICAL`.
 * Nothing here is tuned by the renderer.
 */

export const A13_ALBUM_MASTER = {
  role: "composition",
  handoffFile: "image(20260927-134324).png",
  handoffSha256: "4a31cc0fe455836e3b969f17c2dc6fbfdc63dd5dde068a9d39aa65dcf94f1b73",
  receivedFile: "1.webp (QG in-session upload)",
  receivedSha256: "32c3ac0334b37a6597a3185414302153ea679c4214a8eae0d4514a686bd3259a",
  dimensions: { width: 1536, height: 1024 },
} as const;

/** Master frame 1536 → canonical A13 frame 1670 (DynamicPolaroid px). */
export const A13_ALBUM_SOURCE_TO_CANONICAL = 1670 / 1536;

export type AlbumMasterPrintId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9" | "P10" | "P11";

export interface AlbumMasterPrint {
  id: AlbumMasterPrintId;
  /** Outer paper box, source px. */
  outerCenter: { x: number; y: number };
  outerSize: { width: number; height: number };
  /** Clockwise, degrees. */
  rotationDeg: number;
  /** Photo window (the precise measure), source px. */
  windowCenter: { x: number; y: number };
  windowSize: { width: number; height: number };
  bottomBand: number;
  bottomBandMeasured: boolean;
}

/** Reading order of the Master (row by row, left to right). */
export const A13_ALBUM_MASTER_PRINTS: readonly AlbumMasterPrint[] = [
  { id: "P1", outerCenter: { x: 474.7, y: 208.4 }, outerSize: { width: 460.3, height: 288.6 }, rotationDeg: 6.14, windowCenter: { x: 475.9, y: 197.1 }, windowSize: { width: 434.3, height: 239.9 }, bottomBand: 35.75, bottomBandMeasured: false },
  { id: "P2", outerCenter: { x: 1204.0, y: 207.4 }, outerSize: { width: 362.6, height: 237.9 }, rotationDeg: 7.15, windowCenter: { x: 1205.4, y: 196.1 }, windowSize: { width: 336.6, height: 189.2 }, bottomBand: 35.75, bottomBandMeasured: false },
  { id: "P3", outerCenter: { x: 246.7, y: 442.6 }, outerSize: { width: 346.1, height: 230.2 }, rotationDeg: 3.41, windowCenter: { x: 247.4, y: 431.2 }, windowSize: { width: 320.1, height: 181.4 }, bottomBand: 35.75, bottomBandMeasured: false },
  { id: "P4", outerCenter: { x: 758.9, y: 470.6 }, outerSize: { width: 583.5, height: 268.4 }, rotationDeg: -3.76, windowCenter: { x: 758.0, y: 457.6 }, windowSize: { width: 557.5, height: 216.4 }, bottomBand: 39, bottomBandMeasured: true },
  { id: "P5", outerCenter: { x: 1285.2, y: 452.2 }, outerSize: { width: 392.3, height: 232.0 }, rotationDeg: -5.17, windowCenter: { x: 1284.3, y: 442.2 }, windowSize: { width: 366.3, height: 186.0 }, bottomBand: 33, bottomBandMeasured: true },
  { id: "P6", outerCenter: { x: 270.6, y: 675.8 }, outerSize: { width: 440.9, height: 247.9 }, rotationDeg: -2.92, windowCenter: { x: 270.1, y: 666.1 }, windowSize: { width: 414.9, height: 202.4 }, bottomBand: 32.5, bottomBandMeasured: true },
  { id: "P7", outerCenter: { x: 953.0, y: 675.0 }, outerSize: { width: 332.1, height: 206.4 }, rotationDeg: 4.09, windowCenter: { x: 953.8, y: 663.7 }, windowSize: { width: 306.1, height: 157.7 }, bottomBand: 35.75, bottomBandMeasured: false },
  { id: "P8", outerCenter: { x: 1333.2, y: 682.1 }, outerSize: { width: 351.2, height: 214.8 }, rotationDeg: 0.8, windowCenter: { x: 1333.4, y: 670.7 }, windowSize: { width: 325.2, height: 166.0 }, bottomBand: 35.75, bottomBandMeasured: false },
  { id: "P9", outerCenter: { x: 366.1, y: 891.8 }, outerSize: { width: 358.3, height: 221.4 }, rotationDeg: -2.16, windowCenter: { x: 365.7, y: 881.3 }, windowSize: { width: 332.3, height: 174.4 }, bottomBand: 34, bottomBandMeasured: true },
  { id: "P10", outerCenter: { x: 815.8, y: 900.4 }, outerSize: { width: 417.8, height: 239.7 }, rotationDeg: 6.15, windowCenter: { x: 817.3, y: 886.2 }, windowSize: { width: 391.8, height: 185.2 }, bottomBand: 41.5, bottomBandMeasured: true },
  { id: "P11", outerCenter: { x: 1286.2, y: 910.5 }, outerSize: { width: 360.2, height: 229.7 }, rotationDeg: 7.29, windowCenter: { x: 1287.8, y: 898.3 }, windowSize: { width: 334.2, height: 179.2 }, bottomBand: 37.5, bottomBandMeasured: true },
];

/**
 * Depth read at each paper crossing of the Master ("upper over lower"):
 * P1/P4, P1/P3, P7/P4, P4/P6, P3/P6, P9/P6, P2/P5, P8/P5, P8/P11 (P1/P4 and
 * P1/P3 are the least legible crossings). Topological order of these
 * relations, ties broken by reading order (earlier = lower):
 * P5 < P2 < P6 < P3 < P4 < P1 < P7 < P9 < P10 < P11 < P8.
 */
export const A13_ALBUM_MASTER_DEPTH: Record<AlbumMasterPrintId, number> = {
  P5: 10,
  P2: 20,
  P6: 30,
  P3: 40,
  P4: 50,
  P1: 60,
  P7: 70,
  P9: 80,
  P10: 90,
  P11: 100,
  P8: 110,
};

export const A13_ALBUM_MASTER_CROSSINGS: readonly { upper: AlbumMasterPrintId; lower: AlbumMasterPrintId; legible: boolean }[] = [
  { upper: "P1", lower: "P4", legible: false },
  { upper: "P1", lower: "P3", legible: false },
  { upper: "P7", lower: "P4", legible: true },
  { upper: "P4", lower: "P6", legible: true },
  { upper: "P3", lower: "P6", legible: true },
  { upper: "P9", lower: "P6", legible: true },
  { upper: "P2", lower: "P5", legible: true },
  { upper: "P8", lower: "P5", legible: true },
  { upper: "P8", lower: "P11", legible: true },
];

/**
 * Top artistic zone of the Master: the centred sprig ornament (glyph ink,
 * source px). The bouquet, seal and torn papers of the upper-left corner
 * lie UNDER P1 and are art, not a protected zone. The photo-free TOP art
 * export does not exist yet (Handoff §10: "futur export"; "Il n'est demandé
 * … ni export, ni asset"): the pilot protects this zone, renders no decor.
 */
export const A13_ALBUM_MASTER_TOP_ORNAMENT = { x0: 633, y0: 19, x1: 895, y1: 75 } as const;

/**
 * Body material, Light: mean of 9 × 9 samples at seven empty table points
 * of the Master (rgb 243.8 / 227.6 / 207.4). Handoff §10 "couleur/gradient
 * matériel propre au thème + microtexture non directionnelle".
 */
export const A13_ALBUM_MASTER_BODY_LIGHT = { color: "#F4E4CF", sampledRgb: [243.8, 227.6, 207.4] } as const;
