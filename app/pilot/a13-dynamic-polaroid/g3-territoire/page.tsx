import type { Metadata } from "next";
import { G3TerritoryClient } from "./G3TerritoryClient";

/**
 * ⚠ LEGACY / ÉTUDE HISTORIQUE / NON PRODUIT (dette D8). A13 — G3 Desktop
 * Light — SLOT TERRITORY study V1, D2/D3 coupled (Coupled Slot Territory
 * calibration V1): its own study solver (`g3-territory.ts`), superseded by
 * the V2 runtime. Not the A13 runtime: G3 = `solveV2` through
 * `runDesktopGallery` (`/pilot/a13-desktop`). Artistic board (Master
 * witness vs the study's hard solutions), a diagnostic view and the study
 * QA matrix. Pilot route, noindex, no persistence.
 */
export const metadata: Metadata = {
  title: "LEGACY · A13 · G3 · étude territoires de slot couplés (non produit)",
  robots: { index: false, follow: false },
};

export default function A13G3TerritoryPage() {
  return <G3TerritoryClient />;
}
