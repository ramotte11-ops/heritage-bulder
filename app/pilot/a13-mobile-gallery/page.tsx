import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileGalleryPilotClient } from "./MobileGalleryPilotClient";

/**
 * A13 — MOBILE LIGHT — Gallery G2 → 7+ pilot (Handoff V1.4). Pilot route,
 * noindex, no persistence, fixture media only; never mounted by the product.
 */
export const metadata: Metadata = {
  title: "A13 · Mobile Light · Galerie G2→7+ · pilote",
  robots: { index: false, follow: false },
};

export default function A13MobileGalleryPilotPage() {
  return (
    <Suspense fallback={null}>
      <MobileGalleryPilotClient />
    </Suspense>
  );
}
