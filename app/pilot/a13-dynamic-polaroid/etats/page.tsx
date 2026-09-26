import type { Metadata } from "next";
import { StatesBoard } from "./StatesBoard";

/**
 * A13 — Dynamic Polaroid — Desktop Light — runtime board of the six
 * multi-state manifests (G2, G3, G4, G5, G6 exact, G6 Signature 7+),
 * rendered live side by side for the QG gate. Pilot route, noindex, no
 * Supabase, no Builder, no persistence.
 */
export const metadata: Metadata = {
  title: "A13 · Dynamic Polaroid · planche multi-états",
  robots: { index: false, follow: false },
};

export default function A13StatesBoardPage() {
  return <StatesBoard />;
}
