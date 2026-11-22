import type { MemorialEditRepository, MemorialEditSnapshot } from "@/lib/adapters/memorial-edit-repository";
import type { MemorialContent } from "@/types/memorial";
import { changedMemorialContentMutations } from "./edit-mutations";
import { commitAuthorizedDraftEdit, type VerifiedMemorialOwner } from "./persist-edit";
import { withStoredPresentation } from "./section-visibility";

/**
 * Mission 04-J — EXPERIMENT (local only). « Deux écritures, une seule
 * requête »: a Guided Flow step's Continue, when the autosave still had
 * the typed text SCHEDULED, used to cost two requests — the text, then
 * the text plus the step. This runs the SAME two historical writes, in
 * the same order, inside one request:
 *
 *   1. the text, exactly like `saveDraftAction` (same stored-presentation
 *      rule, same server-computed diff, same Security V1 authorization,
 *      same atomic RPC with its revision CAS);
 *   2. then the final content (text + step), as a SEPARATE commit, with
 *      the revision write 1 returned — same diff, authorization and CAS.
 *
 * Not one transaction: write 1 is durable on its own. When write 2 is
 * refused or fails, the text stays saved and the result says so
 * (`text.saved`, `step.conflict|failed`).
 *
 * Only before any publication: once a memorial has been published, every
 * write carries a mandatory audit event (commit_memorial_draft_edit_v1)
 * and the historical two-request path is kept untouched — this returns
 * `unsupported` without writing anything.
 *
 * ## A lost response
 *
 * The browser may never receive this answer although both writes (or
 * only the first) were done. It then retries with the SAME expected
 * revision. Nothing is replayed blindly — the stored draft is compared,
 * with the server's own diff, to what this request wants:
 *   - already the final content → both writes are done: answer `saved`
 *     for both (`reconciled`), write nothing;
 *   - already the text → write 1 is done: answer it, run write 2 only;
 *   - anything else → somebody else wrote: `conflict`, write nothing.
 * Equality is semantic (`changedMemorialContentMutations` finds no
 * change), and Mission 04-K bounds it by the revision: only the exact
 * revisions this operation could have produced (r+1, r+2) are accepted
 * as « this operation »; anything else is a conflict.
 *
 * Mission 04-L — this reconciliation applies ONLY to a request the
 * browser marks `retry` (the same arguments of its own unconfirmed
 * operation). A `first` request never reconciles: write 1 is
 * saveDraftAction's write, decision for decision. Limit, documented: on
 * a retry, nothing on the server records WHO wrote r+1 / r+2 (no
 * operation id without a schema change), so another tab of the same
 * owner storing exactly the same content in that window is
 * indistinguishable from this operation. The stored draft is then
 * exactly what this operation wanted; nothing is overwritten.
 */

export type SavedWrite = { status: "saved"; updatedAt: string; revision: number; reconciled?: true };
export type StepWrite = SavedWrite | { status: "conflict" } | { status: "failed" } | { status: "notAttempted" };

export type TextThenStepResponse =
  | { status: "unsupported" }
  | { status: "done"; text: SavedWrite | { status: "conflict" }; step: StepWrite };

/**
 * Mission 04-L — which kind of request this is. `first`: a new operation;
 * write 1 then follows saveDraftAction to the letter (an identical stored
 * text is confirmed, any other change on a stale revision is a conflict)
 * and NOTHING is ever reconciled. `retry`: the browser re-sends the SAME
 * arguments of one of its own operations whose outcome it never learnt
 * (lost response) — only then is the revision-bounded reconciliation used.
 */
export type TextThenStepAttempt = "first" | "retry";

export function isMemorialEditConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "MEMORIAL_EDIT_CONFLICT"
  );
}

function unchanged(stored: MemorialContent, candidate: MemorialContent): boolean {
  return changedMemorialContentMutations(stored, candidate).length === 0;
}

export async function saveTextThenStep(input: {
  repository: MemorialEditRepository;
  access: VerifiedMemorialOwner;
  text: MemorialContent;
  final: MemorialContent;
  expectedRevision: number;
  attempt?: TextThenStepAttempt;
}): Promise<TextThenStepResponse> {
  const { repository, access, text, final, expectedRevision } = input;
  const attempt = input.attempt ?? "first";

  const snapshot = await repository.load(access.memorialId);
  if (snapshot === null) throw new Error("Draft save refused.");
  if (snapshot.firstPublishedAt !== null) return { status: "unsupported" };

  const stored = snapshot.draft.content;
  const textNext = withStoredPresentation(text, stored);

  let base: MemorialEditSnapshot["draft"];
  let textWrite: SavedWrite;

  if (snapshot.draft.revision !== expectedRevision && attempt === "first" && !unchanged(stored, textNext)) {
    // Mission 04-L — a new operation on a stale revision: what
    // saveDraftAction(text) answers (the RPC's revision CAS would refuse
    // this write), without the pointless round trip. Never reconciled.
    return { status: "done", text: { status: "conflict" }, step: { status: "notAttempted" } };
  }

  if (snapshot.draft.revision === expectedRevision || attempt === "first") {
    // Write 1 — the text, exactly as saveDraftAction would write it
    // (including its empty-diff rule: an identical stored text is a
    // confirmation at the stored revision, with no write).
    let written: { updatedAt: string; revision: number };
    try {
      written = await commitAuthorizedDraftEdit({
        repository,
        access,
        snapshot,
        expectedRevision,
        content: textNext,
        operation: "content.saved",
        mutations: changedMemorialContentMutations(stored, textNext),
      });
    } catch (error) {
      if (isMemorialEditConflict(error)) return { status: "done", text: { status: "conflict" }, step: { status: "notAttempted" } };
      throw error; // nothing was written (the RPC is atomic): the request fails as a whole
    }
    textWrite = { status: "saved", updatedAt: written.updatedAt, revision: written.revision };
    base = { content: textNext, updatedAt: written.updatedAt, revision: written.revision };
  } else {
    // attempt === "retry" from here on.
    // A retry after a lost response, or another writer: reconcile, never
    // replay. Mission 04-K — content equality alone does not prove that
    // THIS operation produced the stored draft: it must also sit exactly
    // where this operation could have left it. From `expectedRevision`
    // (r), each of its writes moves the revision by one, and nothing
    // else may have written in between (revision CAS):
    //   r+2 and the final content  → write 1 then write 2 were done;
    //   r+1 and the final content  → write 1 was a no-op, write 2 done;
    //   r+1 and the text           → write 1 done, write 2 still owed.
    // Any other revision — another writer, before or after — is a
    // conflict, even when the content happens to be identical.
    const progressed = snapshot.draft.revision - expectedRevision;
    const finalOnStored = withStoredPresentation(final, stored);
    const current: SavedWrite = {
      status: "saved",
      updatedAt: snapshot.draft.updatedAt,
      revision: snapshot.draft.revision,
      reconciled: true,
    };
    const conflict: TextThenStepResponse = { status: "done", text: { status: "conflict" }, step: { status: "notAttempted" } };
    if (progressed !== 1 && progressed !== 2) return conflict;
    if (unchanged(stored, finalOnStored)) return { status: "done", text: current, step: current };
    if (progressed !== 1 || !unchanged(stored, textNext)) return conflict;
    textWrite = current;
    base = snapshot.draft;
  }

  // Write 2 — the final content, a separate commit on top of write 1.
  const finalNext = withStoredPresentation(final, base.content);
  try {
    const written = await commitAuthorizedDraftEdit({
      repository,
      access,
      snapshot: { ...snapshot, draft: base },
      expectedRevision: base.revision,
      content: finalNext,
      operation: "content.saved",
      mutations: changedMemorialContentMutations(base.content, finalNext),
    });
    return { status: "done", text: textWrite, step: { status: "saved", updatedAt: written.updatedAt, revision: written.revision } };
  } catch (error) {
    // The text stays saved: never a false failure for write 1.
    return { status: "done", text: textWrite, step: { status: isMemorialEditConflict(error) ? "conflict" : "failed" } };
  }
}
