import type { MemorialOwnershipRepository } from "@/lib/adapters/memorial-ownership-repository";
import type { HeritageActor } from "./heritage-actor";

/**
 * Mission 014 — the single place that decides whether an actor may touch
 * a given memorial.
 *
 * ## Why the actor is the parameter, and not an owner id
 *
 * The signature is `(deps, actor, memorialId)`. There is no `ownerId`
 * parameter, and that is the security property, not a style choice: a
 * caller holding a `HeritageActor` cannot pass an owner id at all, so
 * the classic mistake — trusting an `ownerId` that arrived in a form
 * field, a query string or a JSON body — is not something a caller can
 * make here. The only owner id in play is the one the server resolved
 * from the session (lib/auth/heritage-actor.ts).
 *
 * `memorialId` IS allowed to come from the browser — a URL segment, a
 * form field. That is fine and unavoidable: it is a claim, not a
 * credential. This function is what turns the claim into a verified
 * fact, by reading who actually owns that memorial and comparing.
 *
 * ## Why the application performs this check at all
 *
 * Until Mission 013C, the plan was for row-level security to decide it:
 * a session-scoped client would read `memorials` and the
 * `memorials_select_own` policy would return zero rows for somebody
 * else's memorial. Mission 013B measured why that never actually worked
 * against the real project — no HERITAGE migration had ever granted a
 * table privilege, so a client-role read failed with *permission denied*
 * rather than returning an empty set — and Mission 013C settled the
 * model deliberately: `anon` and `authenticated` hold NO privilege on
 * these tables, because nothing reads them as a client role yet.
 *
 * So the ownership rule has to live somewhere real, and today that is
 * here: a server-side read through the trusted role, then an explicit
 * equality against the session-derived owner. The RLS policies are
 * untouched and stay exactly as they are — inert while no grant exists,
 * and a genuine second layer the day a mission wires an owner-facing
 * screen and grants the read it needs.
 *
 * Because that makes this the only enforcing layer right now, it is one
 * function, in one file, with no alternate path around it.
 *
 * ## Staff get no bypass
 *
 * `actor.isHeritageAdmin` is not read. A HERITAGE Admin is staff, not a
 * super-owner, and Mission 014's brief is explicit that the Admin work
 * is a primitive for Mission 015 — not a key to every family's memorial.
 * If Mission 015 ever needs staff to reach a memorial, it must build
 * that as its own deliberate, audited path; it will not inherit one by
 * accident from here.
 */

export interface MemorialAccessDeps {
  memorialOwnershipRepository: MemorialOwnershipRepository;
}

export type MemorialAccessResult =
  | { status: "granted"; ownerId: string; memorialId: string }
  /**
   * One refusal for every reason: no session, a session with no Owner,
   * a memorial that belongs to somebody else, and a memorial that does
   * not exist at all.
   *
   * Collapsed on purpose. Distinguishing "not yours" from "no such
   * memorial" would turn this function into an oracle: anyone could walk
   * ids and learn which ones are real. The existing repositories already
   * hold this line (`DraftRepository.getDraftContent`'s `null`,
   * `resumeBuilderSession`'s `notFoundOrForbidden`); this keeps it.
   */
  | { status: "denied" };

export async function authorizeMemorialAccess(
  deps: MemorialAccessDeps,
  actor: HeritageActor,
  memorialId: string,
): Promise<MemorialAccessResult> {
  // Nothing but an owner can own something. Checked before any read, so
  // a visitor cannot even cause a database lookup with an id they made
  // up.
  if (actor.audience !== "owner") {
    return { status: "denied" };
  }

  // A blank or non-string id never reaches the repository: an empty
  // filter is exactly the kind of value that turns "find this row" into
  // "find any row" in a careless implementation.
  if (typeof memorialId !== "string" || memorialId.trim() === "") {
    return { status: "denied" };
  }

  // A genuine repository failure is deliberately NOT caught here. It
  // must not become `denied`: silently answering "no" to a question that
  // errored is how an outage turns into a wrong authorization answer.
  // The caller decides what to do with a thrown error.
  const ownerId = await deps.memorialOwnershipRepository.findOwnerIdForMemorial(memorialId);

  if (ownerId === null || ownerId !== actor.owner.id) {
    return { status: "denied" };
  }

  // Returned so a caller can pass the VERIFIED owner id onward without
  // re-deriving it — and never has to reach back into a request payload
  // for one.
  return { status: "granted", ownerId, memorialId };
}
