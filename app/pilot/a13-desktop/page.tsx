import type { Metadata } from "next";
import { Suspense } from "react";
import { DesktopFlowClient } from "./DesktopFlowClient";

/**
 * A13 — DESKTOP — functional flow pilot (Gallery → Viewer, Signature 7+ CTA
 * → Full Album → Viewer), Light and Dark. Pilot route, noindex, no
 * persistence; fixture media only.
 */
export const metadata: Metadata = {
  title: "A13 · Desktop · parcours fonctionnel · pilote",
  robots: { index: false, follow: false },
};

export default function A13DesktopFlowPage() {
  return (
    <Suspense fallback={null}>
      <DesktopFlowClient />
    </Suspense>
  );
}
