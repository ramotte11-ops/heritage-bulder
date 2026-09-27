import type { Metadata } from "next";
import { DarkPilotClient } from "./DarkPilotClient";

/**
 * A13 — Desktop DARK — runtime pilot V1.1 (material handoff V1.1).
 * Same engine, same geometry, same solver, same media decisions — Dark
 * materials only. 36 Light/Dark geometry pairs + rendered scenes.
 * Pilot route, noindex, no persistence.
 */
export const metadata: Metadata = {
  title: "A13 · Desktop Dark · pilote runtime V1.1",
  robots: { index: false, follow: false },
};

export default function A13DarkPilotPage() {
  return <DarkPilotClient />;
}
