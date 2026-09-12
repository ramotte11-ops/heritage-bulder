"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { resolveSkinVariantRuntime } from "@/lib/memorial/skin-runtime";

/**
 * Mission 035 (QG-authorized, section 18 audit) — T08's one write onto
 * `memorials`: the family's confirmed Light/Dark ambiance.
 *
 * Kept in its OWN file rather than folded into `./actions.ts` for one
 * concrete reason, not just tidiness: `actions.ts`'s own
 * `saveEditorialContextAction` guard (actions.test.ts — "never deduces
 * the context from anything else") asserts that file's source contains
 * no mention of a skin at all, so that a context/skin coupling could
 * never sneak back in unnoticed. Adding this action there would trip
 * that guard on the word "skin" alone, for a reason that has nothing to
 * do with what it actually protects. `media-actions.ts` already
 * established the precedent that one Server Action file per Guided Flow
 * concern is normal in this route — this is that same pattern, once
 * more, for T08.
 *
 * ## Same shape, same rules as `saveLanguageAction`/`saveEditorialContextAction`
 *
 * Re-authorized on EVERY call (never once at render time, never trusting
 * a decision an earlier render made), the id used is `access.memorialId`
 * (the verified one, never the raw argument), the Supabase client is
 * session-scoped and built per call so `memorials_update_own` plus the
 * new column-level grant are a real second lock, and a refusal REJECTS —
 * never a fabricated success. `skinVariant` arrives as a plain `string`
 * and is re-validated here (`resolveSkinVariantRuntime` — the ONE place
 * a raw value becomes a checked `SkinVariant`, lib/memorial/skin-runtime.ts)
 * before anything else runs: a Server Action's argument crosses a
 * network boundary and must never be trusted just because today's one
 * client happens to only ever send `"light"`/`"dark"`.
 *
 * ## Why this never also writes T08's own `StepRecord`
 *
 * Mission 035 section 6's durable ordering — persist `skin_variant`
 * FIRST, wait for that to actually succeed, only THEN mark T08 completed
 * — is composed by the CALLER (`HeroRevealStep.tsx`), not fused into one
 * action here: this action's only job is the `memorials` write, exactly
 * mirroring how `commitPageC`/`commitPageD` (the content-side writes)
 * are already separate from the generic `saveDraftAction` that actually
 * persists them. `HeroRevealStep` awaits this action, and only calls
 * `commitPageE` (lib/builder/guided-flow/hero-step.ts) + `saveDraftAction`
 * once it resolves — never before, and never if it rejects.
 *
 * `skin_variant` is never re-closed after publication by this action or
 * by the migration it depends on (Mission 035 section 7 — "Light/Dark
 * reste réversible après publication"): there is no `status` check here
 * of any kind, deliberately.
 */
export async function saveSkinVariantAction(memorialId: string, skinVariant: string): Promise<void> {
  const resolved = resolveSkinVariantRuntime(skinVariant);
  if (resolved.status !== "resolved") {
    throw new Error("Unsupported skin variant.");
  }

  const access = await authorizeMemorialForRequest(memorialId);

  if (access.status !== "granted") {
    // Deliberately opaque and deliberately a rejection — the same
    // collapsed denial every other Guided Flow write in this route
    // already uses (see actions.ts's own docstring).
    throw new Error("Hero ambiance save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const memorialConfigRepository = new SupabaseMemorialConfigRepository(supabase);

  // access.memorialId — the authorized id, never the raw argument.
  return memorialConfigRepository.saveSkinVariant(access.memorialId, resolved.variant);
}
