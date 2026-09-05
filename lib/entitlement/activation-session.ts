import { getAuthenticatedUser } from "@/lib/supabase/session";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseOwnerRepository } from "@/lib/adapters/supabase/owner-repository";
import { SupabaseEntitlementRepository } from "@/lib/adapters/supabase/entitlement-repository";
import { SupabaseActivationRateLimiter } from "@/lib/adapters/supabase/activation-rate-limiter";
import type { Skin } from "@/config/skins";
import {
  activateHeritageAccess,
  type ActivateHeritageAccessResult,
} from "./activate-heritage-access";
import type { AuthenticatedIdentity } from "./resolve-owner";

/**
 * SERVER ONLY. Mission 019C — the one entry point `/activate`'s Server
 * Action calls, in the same shape as lib/admin/admin-session.ts and
 * lib/auth/heritage-session.ts: it resolves the session itself, from the
 * validated cookie, and never accepts an identity from its caller.
 *
 * `/activate` requires authentication before a key can even be submitted
 * (Mission 019C's own rule), so this is also where that requirement is
 * actually enforced for the mutation path — a Server Action can always be
 * invoked directly, bypassing whatever the page rendered, so the real
 * gate has to live here rather than only in app/activate/page.tsx.
 *
 * Everything else — rate limiting, key resolution, owner resolution,
 * redemption — is lib/entitlement/activate-heritage-access.ts, fully
 * testable with fake repositories. This file is the wiring: real
 * session, real Supabase, no logic of its own worth testing separately.
 */

export type HeritageActivationOutcome =
  | { status: "unauthenticated" }
  | { status: "completed"; result: ActivateHeritageAccessResult };

export async function runHeritageActivationAttempt(
  rawActivationKey: string,
  selectedSkin?: Skin,
): Promise<HeritageActivationOutcome> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { status: "unauthenticated" };
  }

  // Narrowed to exactly the fields lib/entitlement/resolve-owner.ts is
  // allowed to read — same reasoning as getHeritageActor() in
  // lib/auth/heritage-session.ts.
  const identity: AuthenticatedIdentity = {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    is_anonymous: user.is_anonymous,
  };

  const client = createServiceRoleSupabaseClient();

  const result = await activateHeritageAccess(
    {
      rateLimiter: new SupabaseActivationRateLimiter(client),
      ownerRepository: new SupabaseOwnerRepository(client),
      entitlementRepository: new SupabaseEntitlementRepository(client),
    },
    { identity, rawActivationKey, selectedSkin },
  );

  return { status: "completed", result };
}
