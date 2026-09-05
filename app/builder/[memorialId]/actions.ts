"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 021B (audit correction) — the one Server Action behind the
 * real Builder's autosave.
 *
 * ## Why this replaced a closure
 *
 * Mission 021 passed `BuilderShell` a `persist` closure built in the
 * Server Component: `(content) => draftRepository.saveDraftContent(id,
 * content)`, capturing a server-side Supabase client. Two things were
 * wrong with that, and an independent audit named both:
 *
 *   * a `"use client"` component cannot receive a live server object.
 *     What crosses that boundary must be serializable, or a Server
 *     Action reference — never a captured database client;
 *   * more importantly, it decided authorization ONCE, at render time,
 *     and then let every later save ride on that one decision. A save
 *     is its own request, minutes or hours after the page was rendered.
 *     It must be authorized as one.
 *
 * So the authorization is re-run here, inside the action, on EVERY
 * single save. `authorizeMemorialForRequest` (lib/auth/heritage-session.ts)
 * resolves the actor from the validated session itself — it takes no
 * actor parameter, so nothing a browser sends can influence who the
 * caller is. `memorialId` arrives as a bound argument (Next.js encrypts
 * bound Server Action arguments, but this code never treats it as
 * trusted either way): it is a claim, and the line below is what turns
 * it into a verified fact.
 *
 * ## The rules this action holds
 *
 *   * a refusal REJECTS. It never resolves with a fabricated
 *     `{ updatedAt }`, because Missions 007-010's autosave contract
 *     reads a resolved promise as "the row was written" — a false
 *     success would make the UI claim a save that never happened, and
 *     would silently discard the family's edit;
 *   * the id handed to the repository is `access.memorialId`, the one
 *     the authorization returned, never the raw parameter — the same
 *     discipline `authorizeMemorialAccess` documents for its verified
 *     `ownerId`;
 *   * the Supabase client is built HERE, server-side, per call, and is
 *     the session-scoped one (`createServerSupabaseClient`), never the
 *     service-role client: `memorial_drafts_update_own` is then a real
 *     second lock behind this explicit check;
 *   * it reuses `SupabaseDraftRepository.saveDraftContent` and creates
 *     no second draft store, no second authorization model, and no
 *     state of its own.
 *
 * The return type is exactly Missions 007-010's autosave contract —
 * `Promise<{ updatedAt: string }>` — so lib/builder/autosave-controller.ts
 * and lib/builder/use-autosave.ts consume it unchanged.
 */
export async function saveDraftAction(
  memorialId: string,
  content: MemorialContent,
): Promise<{ updatedAt: string }> {
  const access = await authorizeMemorialForRequest(memorialId);

  if (access.status !== "granted") {
    // Deliberately opaque and deliberately a rejection. "No session",
    // "no Owner", "someone else's memorial" and "no such memorial" all
    // read the same, exactly as authorizeMemorialAccess collapses them
    // — an autosave must not become an oracle for which memorial ids
    // are real.
    throw new Error("Draft save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const draftRepository = new SupabaseDraftRepository(supabase);

  // access.memorialId — the authorized id, never the raw argument.
  return draftRepository.saveDraftContent(access.memorialId, content);
}
