import type { MemorialConfigRepository } from "@/lib/adapters/memorial-config-repository";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { MemorialVersion, StoredMemorialConfig } from "@/types/memorial";

/**
 * Mission 009 — orchestrates the existing repositories into a single,
 * testable answer to "can this session resume this project, and what
 * does that resume state look like?" No I/O of its own, no Supabase
 * import — every real read happens inside the injected repositories,
 * which is also what makes this fully testable with plain mocks (see
 * resume-session.test.ts).
 *
 * Deliberately knows nothing about MemorialType, Skin, Offer, Etsy, or
 * Netlify — only `memorialId` and the two repository ports. The same
 * function resumes a `person` memorial today and a `pet` memorial
 * tomorrow without a single conditional.
 *
 * ## Mission 021B — what changed, and why
 *
 * The memorial half used to be `Pick<DataRepository<StoredMemorial>,
 * "findById">`, i.e. `SupabaseMemorialRepository.findById()`, which
 * composes THREE tables: `memorials`, `memorial_drafts` and
 * `memorial_published_snapshots`. Wiring the real Builder onto that
 * (Mission 021) would have meant granting a client role `SELECT` on
 * `memorial_published_snapshots` just to satisfy a read whose result
 * the Builder discards — a privilege opened for a feature nobody has
 * built. An independent audit called it, and the QG settled it:
 * this function now takes the narrow `MemorialConfigRepository` port
 * (lib/adapters/memorial-config-repository.ts), which reads exactly one
 * row from `memorials`.
 *
 * The draft has therefore become a value of its own in the result,
 * rather than a field grafted onto a composed memorial. That is the
 * honest shape: `memorial` is the configuration, `draft` is the one
 * authoritative draft, read once, through `DraftRepository` — never a
 * second copy that could disagree with it. `DataRepository<Memorial>`
 * and its Supabase implementation are untouched and remain available
 * for the publication flow, which does legitimately need all three
 * tables.
 *
 * `memorialId` is the ONLY project identifier this takes — never an
 * `ownerId`, never "the caller's memorials." This is not just a
 * convention: `MemorialConfigRepository` and
 * `Pick<DraftRepository, "getDraftContent">` are the entire dependency
 * surface, and neither exposes any kind of listing method — there is no
 * "find the owner's first memorial" call this function could even make.
 * The caller decides which `memorialId` the family is trying to resume
 * — e.g. from a URL segment — never this function.
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
 * returning an empty set. Mission 013C then settled the model — a client
 * role holds only what a migration provably opened — and Mission 021B's
 * migration opens exactly the three privileges the Builder needs
 * (`SELECT memorials`, `SELECT`/`UPDATE memorial_drafts`), which makes
 * those two policies genuinely enforcing rather than inert.
 *
 * The ownership decision nevertheless still belongs to Mission 014's
 * `authorizeMemorialAccess` (lib/auth/memorial-access.ts): the caller
 * that decides which `memorialId` the family is trying to resume must
 * authorize it there FIRST, and only then hand the verified id to this
 * function. RLS is the second lock, not the first. Confirming a session
 * exists at all remains upstream too (`getHeritageActor()`) — never
 * re-derived here. Nothing in this file calls Supabase.
 */
export interface ResumeBuilderSessionDeps {
  memorialConfigRepository: MemorialConfigRepository;
  draftRepository: Pick<DraftRepository, "getDraftContent">;
}

export type ResumeBuilderSessionResult =
  | {
      /** The memorial is authorized, its configuration read, and its
       * draft loaded. `memorial` carries no content at all (see
       * `StoredMemorialConfig`) and `draft` is the single authoritative
       * value, freshly read via `draftRepository.getDraftContent` — one
       * draft, from one place. Together they are exactly what
       * lib/builder/builder-state.ts's `createInitialBuilderState`
       * consumes (`BuilderMemorial`). */
      status: "resumable";
      memorial: StoredMemorialConfig;
      draft: MemorialVersion;
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
       * needs investigating" apart from "this project isn't yours." */
      status: "draftAnomaly";
      memorial: StoredMemorialConfig;
    }
  | {
      /** A genuine repository failure (Supabase/network/etc.), not an
       * authorization or data-integrity outcome. `reason` is whatever
       * message the underlying error carried — an internal contract for
       * the caller to log/handle, never user-facing text. */
      status: "error";
      reason: string;
    };

export async function resumeBuilderSession(
  deps: ResumeBuilderSessionDeps,
  memorialId: string,
): Promise<ResumeBuilderSessionResult> {
  let memorial: StoredMemorialConfig | null;
  try {
    memorial = await deps.memorialConfigRepository.findConfigById(memorialId);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error) };
  }

  if (!memorial) {
    return { status: "notFoundOrForbidden" };
  }

  let draft: MemorialVersion | null;
  try {
    draft = await deps.draftRepository.getDraftContent(memorialId);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error) };
  }

  if (!draft) {
    return { status: "draftAnomaly", memorial };
  }

  return { status: "resumable", memorial, draft };
}
