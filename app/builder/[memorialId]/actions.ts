"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { MemorialEditConflictError } from "@/lib/adapters/memorial-edit-repository";
import { createSupabaseMemorialEditRepository } from "@/lib/adapters/supabase/memorial-edit-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { isLanguage } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { withStoredPresentation } from "@/lib/memorial/section-visibility";
import {
  changedConfigurationMutation,
  changedMemorialContentMutations,
} from "@/lib/memorial/edit-mutations";
import {
  commitAuthorizedConfigurationEdit,
  commitAuthorizedDraftEdit,
} from "@/lib/memorial/persist-edit";
import type { ConfigurationSaveResponse, DraftSaveResponse } from "@/lib/builder/draft-revision";

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
 *   * the session-scoped client reads the current durable facts through
 *     RLS; the edit repository's service-only RPC then repeats ownership,
 *     lifecycle and revision checks under locks before writing;
 *   * the server computes the real stored/submitted diff and submits every
 *     changed target to Security V1. Unknown paths fail closed;
 *   * the RPC changes the draft and appends any required audit event in
 *     one transaction. A CAS or audit failure rejects this action.
 *
 * The successful result retains Missions 007-010's `updatedAt` and adds
 * the durable draft revision. The client coordinator supplies that revision
 * to every later write and treats a tagged conflict as non-retryable.
 */
export async function saveDraftAction(
  memorialId: string,
  content: MemorialContent,
  expectedRevision: number,
): Promise<DraftSaveResponse> {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    throw new Error("Unsupported draft content.");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("Unsupported draft revision.");
  }

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
  const editRepository = createSupabaseMemorialEditRepository(supabase);
  const snapshot = await editRepository.load(access.memorialId);
  if (snapshot === null) throw new Error("Draft save refused.");

  // « Gérer les rubriques visibles »: `presentation` is owned by
  // `saveSectionVisibilityAction` alone. A screen autosaves the whole
  // content it mounted with, which may predate a visibility change —
  // so the STORED value is always kept, never the client's copy
  // (lib/memorial/section-visibility.ts).
  const nextContent = withStoredPresentation(content, snapshot.draft.content);
  const mutations = changedMemorialContentMutations(snapshot.draft.content, nextContent);

  try {
    const result = await commitAuthorizedDraftEdit({
      repository: editRepository,
      access,
      snapshot,
      expectedRevision,
      content: nextContent,
      operation: "content.saved",
      mutations,
    });
    return { status: "saved", ...result };
  } catch (error) {
    if (
      error instanceof MemorialEditConflictError ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "MEMORIAL_EDIT_CONFLICT")
    ) {
      return { status: "conflict" };
    }
    throw error;
  }
}

/**
 * Mission 023 — T01's one write: the family's language choice.
 *
 * Same shape and same rules as `saveDraftAction` above, deliberately:
 * re-authorized on EVERY call (never once at render time), the id used
 * is `access.memorialId` (the verified one), and the current lifecycle
 * facts are re-read server-side before the Lot 1 policy and atomic RPC
 * run. A refusal REJECTS rather than resolving with fabricated success.
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
export async function saveLanguageAction(
  memorialId: string,
  expectedLanguage: string | null,
  language: string,
): Promise<ConfigurationSaveResponse> {
  if (expectedLanguage !== null && !isLanguage(expectedLanguage)) {
    throw new Error("Unsupported expected language.");
  }
  if (!isLanguage(language)) {
    throw new Error("Unsupported language.");
  }

  const access = await authorizeMemorialForRequest(memorialId);

  if (access.status !== "granted") {
    // Same deliberate opacity as saveDraftAction's refusal above.
    throw new Error("Language save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const editRepository = createSupabaseMemorialEditRepository(supabase);
  const snapshot = await editRepository.load(access.memorialId);
  if (snapshot === null) throw new Error("Language save refused.");

  try {
    await commitAuthorizedConfigurationEdit({
      repository: editRepository,
      access,
      snapshot,
      target: "language",
      expectedValue: expectedLanguage,
      value: language,
      mutations: changedConfigurationMutation("language", snapshot.language, language),
    });
    return { status: "saved" };
  } catch (error) {
    if (
      error instanceof MemorialEditConflictError ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "MEMORIAL_EDIT_CONFLICT")
    ) {
      return { status: "conflict" };
    }
    throw error;
  }
}
