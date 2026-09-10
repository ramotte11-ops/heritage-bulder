import { randomUUID } from "node:crypto";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseMediaRepository } from "@/lib/adapters/supabase/media-repository";
import { SupabaseMediaObjectStore } from "@/lib/adapters/supabase/media-object-store";
import { SupabaseMemorialOwnershipRepository } from "@/lib/adapters/supabase/memorial-ownership-repository";
import type { MediaEngineDeps } from "./media-engine";

/**
 * SERVER ONLY. Mission 033 — the one place that wires Mission 030's real
 * media primitives (`lib/media/*`) to real Supabase, in the same shape
 * as `lib/integration/etsy/etsy-session.ts` and
 * `lib/admin/admin-session.ts`: it builds real adapters and passes real
 * configuration, and holds no decision worth testing separately — every
 * actual rule lives in the fully-tested `lib/media/*` primitives this
 * only wires together.
 *
 * `mediaRepository` and `objectStore` MUST run on the service-role
 * client — `authenticated` holds no privilege on `media` or on
 * `storage.objects` for the `memorial-media` bucket at all (Mission
 * 030), so a session-scoped client could not perform these reads/writes
 * even if this file tried. `memorialOwnershipRepository` uses the same
 * client `lib/auth/heritage-session.ts`'s own
 * `authorizeMemorialForRequest` already does, for the identical reason.
 *
 * This is called from every server-side caller of the media engine —
 * `app/builder/[memorialId]/media-actions.ts` (the browser-facing
 * reserve/finalize/replace Server Actions) and
 * `lib/builder/guided-flow/resolve-hero-photo-step.ts` (PAGE C's own
 * server-side read/reconcile) — one wiring, reused, never a second
 * engine (mission brief section 6: "ne créer aucun deuxième moteur
 * upload").
 *
 * Never import this from a Client Component — it constructs the
 * service-role client. See `lib/entitlement/server-only-boundary.test.ts`.
 */
export function createServerMediaEngineDeps(): MediaEngineDeps {
  const client = createServiceRoleSupabaseClient();

  return {
    memorialOwnershipRepository: new SupabaseMemorialOwnershipRepository(client),
    mediaRepository: new SupabaseMediaRepository(client),
    objectStore: new SupabaseMediaObjectStore(client),
    // A fresh, opaque, unguessable id per upload — see MediaEngineDeps's
    // own docstring for why this is injected rather than read from
    // anywhere the caller could influence.
    generateMediaId: () => randomUUID(),
    now: () => new Date(),
  };
}
