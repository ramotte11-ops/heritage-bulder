"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { isLanguage } from "@/config/languages";
import { isEditorialContext } from "@/config/memorial";
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

/**
 * Mission 023 — T01's one write: the family's language choice.
 *
 * Same shape and same rules as `saveDraftAction` above, deliberately:
 * re-authorized on EVERY call (never once at render time), the id used
 * is `access.memorialId` (the verified one), the Supabase client is
 * built here, server-side, per call, with the session-scoped client so
 * `memorials_update_own` is a real second lock, and a refusal REJECTS
 * rather than resolving with a fabricated success.
 *
 * `language` is re-validated here against `config/languages.ts`'s
 * `LANGUAGES` (via `isLanguage`) even though `LanguageStep` never lets a
 * caller submit anything else: a Server Action's argument crosses a
 * network boundary and must never be trusted just because the one
 * client this codebase ships happens to behave — see
 * `lib/i18n/translate.ts`'s own `isSupportedLanguage`, the same guard
 * under the name that module already documented. An invalid value
 * rejects before any Supabase call, the same "never a false success"
 * discipline as a denied authorization.
 */
export async function saveLanguageAction(memorialId: string, language: string): Promise<void> {
  if (!isLanguage(language)) {
    throw new Error("Unsupported language.");
  }

  const access = await authorizeMemorialForRequest(memorialId);

  if (access.status !== "granted") {
    // Same deliberate opacity as saveDraftAction's refusal above.
    throw new Error("Language save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const memorialConfigRepository = new SupabaseMemorialConfigRepository(supabase);

  // access.memorialId — the authorized id, never the raw argument.
  return memorialConfigRepository.saveLanguage(access.memorialId, language);
}

/**
 * Mission 024 — T02's one write: the family's editorial-context choice.
 *
 * Identical shape and identical rules to `saveLanguageAction` above —
 * re-authorized on every call, the id used is `access.memorialId`, the
 * Supabase client is session-scoped and built per call, a refusal
 * REJECTS. `editorialContext` is re-validated here against
 * `config/memorial.ts`'s `EDITORIAL_CONTEXTS` (via `isEditorialContext`)
 * for the same reason `saveLanguageAction` re-validates `language`: a
 * Server Action argument crosses a network boundary.
 */
export async function saveEditorialContextAction(
  memorialId: string,
  editorialContext: string,
): Promise<void> {
  if (!isEditorialContext(editorialContext)) {
    throw new Error("Unsupported editorial context.");
  }

  const access = await authorizeMemorialForRequest(memorialId);

  if (access.status !== "granted") {
    // Same deliberate opacity as saveDraftAction's refusal above.
    throw new Error("Editorial context save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const memorialConfigRepository = new SupabaseMemorialConfigRepository(supabase);

  // access.memorialId — the authorized id, never the raw argument.
  return memorialConfigRepository.saveEditorialContext(access.memorialId, editorialContext);
}
