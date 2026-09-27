import type { Metadata } from "next";
import { Suspense } from "react";
import { AlbumPilotClient } from "./AlbumPilotClient";

/**
 * A13 — ALBUM COMPLET DESKTOP LIGHT — extensible memory table, RUNTIME
 * PILOT V1. Pilot route, noindex, no persistence, Light only. The Gallery
 * signature (G2→G6 / 7+) is not rendered here and not modified.
 */
export const metadata: Metadata = {
  title: "A13 · Album complet Desktop Light · pilote",
  robots: { index: false, follow: false },
};

export default function A13AlbumLightPilotPage() {
  return (
    <Suspense fallback={null}>
      <AlbumPilotClient />
    </Suspense>
  );
}
