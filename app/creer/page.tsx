import { GuestBuilderRuntime } from "@/components/builder/guest/GuestBuilderRuntime";

/**
 * QG 008 Lot 2 — the Builder unique, open WITHOUT an account:
 *
 *   /creer
 *
 * The same `GuestBuilderRuntime` as the development pilot
 * (/pilote/builder-invite): local IndexedDB V3 draft, no session, no
 * Supabase request, no network write (guest-import-graph.test.ts). Its
 * « Enregistrer mon hommage » leads to the durable save
 * (/brouillon/sauvegarder → magic link → /brouillon/reprise).
 *
 * Outside the session proxy on purpose, like the pilot. Exposing this
 * route publicly is a launch decision; nothing here is deployed by Lot 2.
 */
export default function CreateTributePage() {
  return <GuestBuilderRuntime />;
}
