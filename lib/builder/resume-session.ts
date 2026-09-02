import type { DataRepository } from "@/lib/adapters/data-repository";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { StoredMemorial } from "@/types/memorial";

/**
 * Mission 009 — orchestrates the existing repositories
 * (lib/adapters/supabase/memorial-repository.ts,
 * lib/adapters/draft-repository.ts) into a single, testable answer to
 * "can this session resume this project, and what does that resume
 * state look like?" No I/O of its own, no Supabase import — every real
 * read happens inside the injected repositories, which is also what
 * makes this fully testable with plain mocks (see resume-session.test.ts).
 *
 * Deliberately knows nothing about MemorialType, Skin, Offer, Etsy, or
 * Netlify — only `memorialId` and the two repository ports. The same
 * function resumes a `person` memorial today and a `pet` memorial
 * tomorrow without a single conditional.
 *
 * `memorialId` is the ONLY project identifier this takes — never an
 * `ownerId`, never "the caller's memorials." This is not just a
 * convention: `Pick<DataRepository<StoredMemorial>, "findById">` and
 * `Pick<DraftRepository, "getDraftContent">` are the entire dependency
 * surface, and neither exposes any kind of listing method — there is no
 * "find the owner's first memorial" call this function could even make.
 * A future caller (not built in this mission) is the one that decides
 * which `memorialId` the family is trying to resume — e.g. from a URL
 * segment — never this function.
 *
 * Authorization is never re-implemented here — but WHERE it happens
 * changed in Mission 013C, and this paragraph is the corrected version.
 *
 * Missions 007-009 assumed a session-scoped Supabase client plus RLS
 * (`memorials_select_own`, `memorial_drafts_select_own`) would decide
 * whether `memorialId` belongs to the caller, yielding "zero rows" for
 * somebody else's memorial. Mission 013B measured that this never worked
 * against the real project: no HERITAGE migration had granted a table
 * privilege, so such a read failed with *permission denied* rather than
 * returning an empty set. Mission 013C then settled the model — `anon`
 * and `authenticated` hold no privilege on these tables while nothing
 * reads them as a client role — so those policies are currently inert.
 *
 * The ownership decision therefore belongs to Mission 014's
 * `authorizeMemorialAccess` (lib/auth/memorial-access.ts): the caller
 * that decides which `memorialId` the family is trying to resume must
 * authorize it there FIRST, and only then hand the verified id to this
 * function. Confirming a session exists at all remains upstream too
 * (`getHeritageActor()`, or `getAuthenticatedUser()` before it) — never
 * re-derived here. Nothing in this file calls Supabase, so nothing about
 * it changed; only the layer its callers must rely on did.
 */
export interface ResumeBuilderSessionDeps {
  memorialRepository: Pick<DataRepository<StoredMemorial>, "findById">;
  draftRepository: Pick<DraftRepository, "getDraftContent">;
}

export type ResumeBuilderSessionResult =
  | {
      /** The memorial is authorized and its draft loaded. `memorial.draft`
       * here is the value freshly read via `draftRepository.getDraftContent`
       * — never the one `findById()` composed internally — so a caller
       * only ever sees one authoritative draft, not two copies that
       * could disagree. Shaped to be passed directly into
       * lib/builder/builder-state.ts's `createInitialBuilderState`,
       * though nothing wires that up in this mission. */
      status: "resumable";
      memorial: StoredMemorial;
    }
  | {
      /** `memorialId` doesn't correspond to a memorial the caller can
       * access — doesn't exist, or belongs to someone else. These stay
       * deliberately indistinguishable (same reasoning as
       * `DraftRepository.getDraftContent`'s own `null`): never leak
       * whether an inaccessible id actually exists. */
      status: "notFoundOrForbidden";
    }
  | {
      /** The memorial itself was found and is authorized, but its draft
       * came back `null`. Structurally close to impossible today (the
       * `memorials_create_draft` trigger guarantees a draft row from
       * the moment a memorial exists, and both tables share the same
       * RLS predicate), kept as its own case rather than silently
       * treated like `notFoundOrForbidden` so a caller can tell "this
       * needs investigating" apart from "this project isn't yours."
       * Note: if `findById()`'s *own* internal draft fetch fails first
       * (it uses `.single()`, so it throws rather than returning a
       * partial result), that surfaces as `error` below, not this case
       * — this status only fires when `findById()` succeeds and the
       * separate `getDraftContent()` call is the one that comes back
       * null. */
      status: "draftAnomaly";
      memorial: StoredMemorial;
    }
  | {
      /** A genuine repository failure (Supabase/network/etc.), not an
       * authorization or data-integrity outcome. `reason` is whatever
       * message the underlying error carried — this is an internal
       * contract for a future caller to log/handle, not user-facing
       * text (no UI exists yet to show it to anyone). */
      status: "error";
      reason: string;
    };

export async function resumeBuilderSession(
  deps: ResumeBuilderSessionDeps,
  memorialId: string,
): Promise<ResumeBuilderSessionResult> {
  let memorial: StoredMemorial | null;
  try {
    memorial = await deps.memorialRepository.findById(memorialId);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error) };
  }

  if (!memorial) {
    return { status: "notFoundOrForbidden" };
  }

  let draft: StoredMemorial["draft"] | null;
  try {
    draft = await deps.draftRepository.getDraftContent(memorialId);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error) };
  }

  if (!draft) {
    return { status: "draftAnomaly", memorial };
  }

  return { status: "resumable", memorial: { ...memorial, draft } };
}
