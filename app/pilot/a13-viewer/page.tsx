import type { Metadata } from "next";
import { Suspense } from "react";
import { ViewerPilotClient } from "./ViewerPilotClient";

/**
 * A13 — VIEWER DESKTOP V2 — runtime pilot (QA harness). Pilot route,
 * noindex, no persistence. The same `MemoryViewer` is also opened from the
 * Gallery pilot (`/pilot/a13-dynamic-polaroid/dark`) and the Album pilot
 * (`/pilot/a13-album-light`).
 */
export const metadata: Metadata = {
  title: "A13 · Viewer Desktop V2 · pilote",
  robots: { index: false, follow: false },
};

export default function A13ViewerPilotPage() {
  return (
    <Suspense fallback={null}>
      <ViewerPilotClient />
    </Suspense>
  );
}
