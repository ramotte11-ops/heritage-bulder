import type { Metadata } from "next";
import { PilotQa } from "./PilotQa";

/**
 * A13 — Dynamic Polaroid — Desktop Light — PILOT (QG prototype only).
 *
 * Not a Memorial route, not wired into the Builder, the assembly or the
 * section registry. No Supabase, no Auth, no persistence: fixtures and
 * optional local files only. Desktop Light only — no Mobile, no Dark.
 */
export const metadata: Metadata = {
  title: "A13 · Dynamic Polaroid · pilote Desktop Light V2",
  robots: { index: false, follow: false },
};

export default function A13DynamicPolaroidPilotPage() {
  return <PilotQa />;
}
