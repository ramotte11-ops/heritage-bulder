import type { Metadata } from "next";
import { Suspense } from "react";
import { AlbumMobilePilotClient } from "./AlbumMobilePilotClient";

/**
 * A13 — FULL ALBUM MOBILE LIGHT — pilot (Handoff V1.1). Pilot route,
 * noindex, no persistence, fixture media only; never mounted by the product.
 */
export const metadata: Metadata = {
  title: "A13 · Album complet Mobile Light · pilote",
  robots: { index: false, follow: false },
};

export default function A13AlbumMobileLightPilotPage() {
  return (
    <Suspense fallback={null}>
      <AlbumMobilePilotClient />
    </Suspense>
  );
}
