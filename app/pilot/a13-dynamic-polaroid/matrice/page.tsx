import type { Metadata } from "next";
import { MatrixClient } from "./MatrixClient";

/**
 * A13 — Desktop Light — calibration V1.1 QA matrix (G2–G5 × 6 ratio
 * rotations × 5 caption states), computed live with the real La Belle
 * Aurore metrics. Pilot route, noindex, no persistence.
 */
export const metadata: Metadata = {
  title: "A13 · calibration V1.1 · matrice QA",
  robots: { index: false, follow: false },
};

export default function A13CalibrationMatrixPage() {
  return <MatrixClient />;
}
