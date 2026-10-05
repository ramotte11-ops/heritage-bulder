/**
 * A13 — ALBUM DESKTOP — LONG SEQUENCE CALIBRATION V1.2 (GREEN QG).
 *
 * Transcription of `contract/album-long-sequence-calibration-v1.2.json`
 * (package `A13_ALBUM_DESKTOP_LONG_SEQUENCE_CALIBRATION_V1_2`). V1.2 is the
 * authority for the relational seams between FULL groups (A/B → A/B) only;
 * everything else stays `A13_ALBUM_V1_1`.
 *
 * - seed: `(popcount(i) + 2·popcount(i−1)) mod 4` (V1.1's transitionCode is
 *   redundant with the popcount parity that defines A/B and made the seed
 *   only 0 or 2);
 * - envelope of a translated full group: its outer paper stays in 12…1658
 *   (canvas − the V1.1 functional shadow reserve 12). The local solver and
 *   the closures keep 48…1622;
 * - bounded dx: `dx = sign(nominal) · min(|nominal|, floor(slack_side))`,
 *   slack left = minX − 12, slack right = 1658 − maxX (group paper before
 *   dx); the state is invalid when |dx| < ½ |nominal| (36 px COMPACT,
 *   20 px AIRY) and the selector moves on in the V1.1 trial order. Nominal
 *   gestures and the AIRY sign rule are V1.1's.
 */

export const A13_ALBUM_V1_2 = {
  contractId: "A13_ALBUM_DESKTOP_LONG_SEQUENCE_CALIBRATION_V1_2",
  inherits: "A13_ALBUM_COMPLET_DESKTOP_LIGHT_RUNTIME_CALIBRATION_HANDOFF_V1_1",
  scope: "relational seams between FULL groups only",
  seed: "(popcount(i)+2*popcount(i-1))%4",
  groupPlacementEnvelope: { xRange: [12, 1658] as const, measuredOn: "outer paper polygons of the translated full group" },
  localSolverSafeX: [48, 1622] as const,
  closuresCanvas: [48, 1622] as const,
  stateDx: { rule: "sign(nominal)*min(|nominal|, floor(slack_side))", minFractionOfNominal: 0.5 },
} as const;
