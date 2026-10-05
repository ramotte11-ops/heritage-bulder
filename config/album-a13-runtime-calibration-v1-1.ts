/**
 * A13 — ALBUM COMPLET DESKTOP LIGHT — RUNTIME CALIBRATION HANDOFF V1.1
 * (GREEN QG — READY FOR PATCH).
 *
 * Verbatim transcription of `contract/album-runtime-calibration-v1.1.json`
 * (package `A13_ALBUM_COMPLET_DESKTOP_LIGHT_RUNTIME_CALIBRATION_HANDOFF_V1_1`,
 * SHA-256 of the JSON in the package `HASHES.sha256`). This file is the ONLY
 * authority for every Album seam value; the runtime invents none.
 *
 * All lengths are source px of the canonical 1670 frame (README §2).
 */

export const A13_ALBUM_V1_1 = {
  contractId: "A13_ALBUM_COMPLET_DESKTOP_LIGHT_RUNTIME_CALIBRATION_HANDOFF_V1_1",
  coordinateSpace: { width: 1670, unit: "source_px", scaleRule: "renderedWidth/1670" },
  localSolver: {
    territory: { leaderPercentXY: 11, otherPercentX: 18, otherPercentY: 19 },
    scale: { min: 0.995, max: 1.0, step: 0.005 },
    alreadyPlacedGroupsImmutable: true,
  },
  silhouette: {
    useOuterPaperPolygons: true,
    xRange: [80, 1590] as const,
    laneCount: 12,
    nullLaneIgnored: true,
    gapDefinition: "incomingUpperY + dy - previousLowerY",
  },
  seam: {
    canvasSafeX: [48, 1622] as const,
    overlapTolerance: 16,
    maxPaperOverlap: 136,
    maxTwoAdjacentCentralLaneGap: 240,
    minVisibleInteractivePhotoFraction: 0.35,
    states: [
      { id: "COMPACT_LEFT", dx: -72, targetOverlap: 120, minContactLanes: 3 },
      { id: "BALANCED", dx: 0, targetOverlap: 96, minContactLanes: 3 },
      { id: "COMPACT_RIGHT", dx: 72, targetOverlap: 120, minContactLanes: 3 },
      { id: "AIRY_OFFSET", dxMagnitude: 40, signRule: "popcount(groupIndex)%2==0?left:right", targetOverlap: 72, minContactLanes: 2 },
    ],
    transitionCodes: { "A>A": 0, "A>B": 1, "B>A": 2, "B>B": 3 },
    seed: "(popcount(i)+2*popcount(i-1)+transitionCode)%4",
    trialOffsets: [0, 1, 3, 2] as const,
  },
  depth: {
    localZRanks: "unchanged_from_v1_master_measurements",
    globalPaintKey: ["depositEpoch", "localZRank", "mediaIndex"] as const,
    depositEpoch: "groupIndex",
    groupClipping: false,
    groupIsolation: false,
  },
  closures: {
    C2: { dxCandidates: [-96, 96, 0], targetOverlap: 120, minContactLanes: 2, preference: "largest_outer_four_lane_void" },
    C3: { dxCandidates: [-64, 0, 64], targetOverlap: 108, minContactLanes: 2, preference: "opposite_previous_lower_barycenter" },
    C4: { dxCandidates: [-48, 0, 48], targetOverlap: 96, minContactLanes: 3, preference: "opposite_previous_lower_barycenter" },
  },
  ending: { breathing: 120, functionalShadowReserveMax: 12 },
  stopConditions: [
    "ALBUM_RELATIONAL_SEAM_STOP",
    "ALBUM_CLOSURE_SEAM_STOP",
    "ITEM_INACCESSIBLE_STOP",
    "ALBUM_CANVAS_STOP",
    "ALBUM_SCALE_STOP",
    "ALBUM_NONDETERMINISM_STOP",
    "ALBUM_GROUP_LEAK_STOP",
    "ALBUM_THEME_GEOMETRY_PARITY_STOP",
  ] as const,
} as const;

export type AlbumSeamStateId = (typeof A13_ALBUM_V1_1.seam.states)[number]["id"];
export type AlbumStopV11 = (typeof A13_ALBUM_V1_1.stopConditions)[number];

/**
 * Readings of the README stated for the QG (no value invented):
 * - "lanes centrales" (§4.2 / §4.4-4): the 12 lanes split as 4 outer-left
 *   + 4 central + 4 outer-right — the split the contract itself names for
 *   C2 ("les 4 lanes extérieures"). Central lanes = indices 4…7; adjacent
 *   pairs (4,5) (5,6) (6,7) fail when BOTH gaps exceed 240.
 * - "chevauchement" of a candidate = the deepest lane overlap
 *   max(−gap[k]); dy is solved so that it equals the target exactly (so the
 *   ±16 tolerance and the 136 maximum are verified, never searched).
 * - "lane de contact" = a lane where both silhouettes exist and gap ≤ 0.
 * - C2 "vide cumulé" of a side = Σ over its 4 outer lanes of
 *   (lowest previous bottom − previous bottom of the lane), null lanes
 *   ignored; the larger side is tried first (tie → left).
 * - C3/C4 "barycentre bas du groupe précédent" = Σ x_k·w_k / Σ w_k over the
 *   previous lower silhouette, w_k = lowerPrev[k] − min(lowerPrev); the sign
 *   is opposite to its side of the canvas centre 835 (tie → left).
 */
export const A13_ALBUM_V1_1_READINGS = {
  centralLanes: [4, 5, 6, 7] as const,
  outerLanesLeft: [0, 1, 2, 3] as const,
  outerLanesRight: [8, 9, 10, 11] as const,
  canvasCenterX: 835,
} as const;
