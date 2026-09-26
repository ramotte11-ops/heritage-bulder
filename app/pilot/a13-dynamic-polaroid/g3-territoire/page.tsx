import type { Metadata } from "next";
import { G3TerritoryClient } from "./G3TerritoryClient";

/**
 * A13 — G3 Desktop Light — SLOT TERRITORY pilot (study V1). Artistic board
 * (Master witness vs hard runtime solutions), a separate diagnostic view and
 * the full QA matrix. G3 only; pilot route, noindex, no persistence.
 */
export const metadata: Metadata = {
  title: "A13 · G3 · territoires de slot",
  robots: { index: false, follow: false },
};

export default function A13G3TerritoryPage() {
  return <G3TerritoryClient />;
}
