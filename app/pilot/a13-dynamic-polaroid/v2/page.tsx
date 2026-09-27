import type { Metadata } from "next";
import { V2PilotClient } from "./V2PilotClient";

/**
 * A13 — Desktop Light — G2→G5 runtime pilot, SIMPLIFIED MANIFESTS V2.
 * Master self-check, the common 96-case fixture matrix, compact QA boards.
 * Pilot route, noindex, no persistence. G6 / Signature 7+ are not here.
 */
export const metadata: Metadata = {
  title: "A13 · G2→G5 · manifests simplifiés V2",
  robots: { index: false, follow: false },
};

export default function A13V2PilotPage() {
  return <V2PilotClient />;
}
