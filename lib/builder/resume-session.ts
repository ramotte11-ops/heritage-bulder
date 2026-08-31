import type { DataRepository } from "@/lib/adapters/data-repository";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { Memorial } from "@/types/memorial";

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
 * convention: `Pick<DataRepository<Memorial>, "findById">` and
 * `Pick<DraftRepository, "getDraftContent">` are the entire dependency
 * surface, and neither exposes any kind of listing method — there is no
 * "find the owner's first memorial" call this function could even make.
 * A future caller (not built in this mission) is the one that decides
 * which `memorialId` the family is trying to resume — e.g. from a URL
 * segment — never this function.
 *
 * Authorization is never re-implemented here: `findById` and
 * `getDraftContent` must be constructed with a session-scoped Supabase
 * client (see lib/supabase/server-client.ts), and RLS
 * (`memorials_select_own`, `memorial_drafts_select_own`) is what
 * actually decides whether `memorialId` belongs to the caller. If there
 * is no authenticated session at all, an anon-scoped client hits the
 * exact same "zero rows" signal (there is no public SELECT policy on
 * either table) and this resolves to `notFoundOrForbidden` — the same
 * outcome as a wrong-owner attempt, on purpose. Confirming a session
 * exists in the first place stays `getAuthenticatedUser()`'s job
 * (Mission 004, upstream of this function), not re-derived here.
 */
export interface ResumeBuilderSessionDeps {
  memorialRepository: Pick<DataRepository<Memorial>, "findById">;
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
      memorial: Memorial;
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
      memorial: Memorial;
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
  let memorial: Memorial | null;
  try {
    memorial = await deps.memorialRepository.findById(memorialId);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error) };
  }

  if (!memorial) {
    return { status: "notFoundOrForbidden" };
  }

  let draft: Memorial["draft"] | null;
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
