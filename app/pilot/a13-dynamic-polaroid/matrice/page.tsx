import type { Metadata } from "next";
import { MatrixClient } from "./MatrixClient";

/**
 * ⚠ LEGACY / QA HISTORIQUE / NON PRODUIT (dette D8). A13 — Desktop Light —
 * calibration V1.1 QA matrix (G2–G5 × 6 ratio rotations × 5 caption
 * states) of the SUPERSEDED V1.1 path, computed live with the real La Belle
 * Aurore metrics. Not the A13 runtime: G2–G5 = `solveV2` through
 * `runDesktopGallery` (`/pilot/a13-desktop`). Pilot route, noindex, no
 * persistence.
 */
export const metadata: Metadata = {
  title: "LEGACY · A13 · calibration V1.1 · matrice QA (non produit)",
  robots: { index: false, follow: false },
};

export default function A13CalibrationMatrixPage() {
  return <MatrixClient />;
}
