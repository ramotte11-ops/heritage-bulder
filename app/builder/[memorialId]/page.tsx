import { notFound, redirect } from "next/navigation";
import { getHeritageActor, authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { resumeBuilderSession } from "@/lib/builder/resume-session";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { isConfiguredMemorial } from "@/types/memorial";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { saveDraftAction } from "./actions";
import styles from "./page.module.css";

/**
 * Mission 021 — the real Builder entry point.
 *
 * This is the ONLY route that renders `BuilderShell` against real,
 * authorized, persistent data. The single real path it drives:
 *
 *   validated auth session (getHeritageActor)
 *     -> HERITAGE Owner (already inside the resolved actor)
 *     -> the Memorial this specific `memorialId` names, iff it belongs
 *        to that Owner (authorizeMemorialForRequest, Mission 014)
 *     -> resumeBuilderSession (Mission 009), against the SAME
 *        memorialId the authorization step just verified
 *     -> the real, persisted draft
 *     -> BuilderShell, wired to real autosave through the
 *        saveDraftAction Server Action (Mission 021B), which
 *        re-authorizes on every single save.
 *
 * `memorialId` is a URL segment — client-controlled, and treated as
 * exactly that: a claim, never a credential. It is never trusted to
 * pick a memorial on its own; `authorizeMemorialForRequest` is what
 * turns it into a verified fact, server-side, before anything below
 * this line reads a single row. There is no fixture fallback anywhere
 * in this file — `lib/builder/demo-memorials.ts` is not imported here,
 * and could not silently supply a memorial even if `memorialId` happens
 * to collide with one of its fixture keys, because those keys are not
 * UUIDs and no real Owner can ever own one.
 *
 * ## Why `getHeritageActor()` is also called directly here
 *
 * `authorizeMemorialForRequest` alone is sufficient for the actual
 * security decision — it collapses "no session", "session with no
 * Owner" and "Owner, but not this memorial's Owner" into the same
 * `denied`, on purpose (see lib/auth/memorial-access.ts), so that a
 * wrong id can never be used to learn whether it exists. That
 * indistinguishability is preserved below: every one of those cases
 * still ends at the same `notFound()`.
 *
 * The one exception is a plain visitor with no session at all, who gets
 * sent to `/login` instead of a 404 — ordinary, non-leaking UX (the
 * same thing `/owner` already does), decided from a SEPARATE call to
 * `getHeritageActor()` purely for that redirect, never used to grant
 * anything. The actual grant still comes from
 * `authorizeMemorialForRequest`'s own, independent session resolution,
 * exactly as lib/auth/heritage-session.ts documents: nothing here
 * passes an actor across that boundary.
 *
 * ## Why the memorial/draft reads use a session-scoped client
 *
 * `SupabaseMemorialConfigRepository`/`SupabaseDraftRepository` are built
 * on `createServerSupabaseClient()` (the cookie-bound, RLS-subject
 * client), never the service-role client — exactly what
 * `lib/adapters/supabase/draft-repository.ts` already documents. The
 * `memorials`/`memorial_drafts` RLS policies
 * (`memorials_select_own`/`_update_own`,
 * `memorial_drafts_select_own`/`_update_own`, both Mission 002) already
 * exist and already target `authenticated` via `current_owner_id()` —
 * this is the second, defense-in-depth layer behind the explicit
 * `authorizeMemorialForRequest` check above, not a replacement for it.
 *
 * Mission 013C left `anon`/`authenticated` holding no table privilege
 * at all, deferring the grant to "the mission that wires an owner-facing
 * screen". Mission 021B is that mission:
 * supabase/migrations/20260905160000_builder_owner_access.sql opens
 * exactly three privileges — `SELECT memorials`, `SELECT`/`UPDATE
 * memorial_drafts` for `authenticated` — and nothing else. Until it is
 * applied to a given project, a real request here resolves
 * `resumeBuilderSession`'s "error" case below rather than "resumable":
 * a controlled, non-leaking failure, never a crash and never a silent
 * fixture fallback.
 *
 * ## What this route deliberately never reads
 *
 * `memorial_published_snapshots`. The Builder displays nothing from it,
 * so the read path goes through the narrow `MemorialConfigRepository`
 * port (one row, one table) rather than
 * `SupabaseMemorialRepository.findById()`, which composes all three
 * memorial tables. That is why the migration above grants no privilege
 * on the snapshots table: no client role should hold one for a feature
 * nobody has built. A test guards this route against reintroducing
 * either (see page.test.tsx).
 */
export const dynamic = "force-dynamic";

export default async function BuilderMemorialPage({
  params,
}: {
  params: Promise<{ memorialId: string }>;
}) {
  const { memorialId } = await params;

  const actor = await getHeritageActor();
  if (actor.audience === "visitor") {
    redirect(`/login?next=/builder/${memorialId}`);
  }

  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") {
    // No HERITAGE Owner behind this session, this memorial does not
    // exist, or it belongs to a different Owner — deliberately the same
    // outcome for all three, never distinguished to the caller.
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const memorialConfigRepository = new SupabaseMemorialConfigRepository(supabase);
  const draftRepository = new SupabaseDraftRepository(supabase);

  const resumed = await resumeBuilderSession(
    { memorialConfigRepository, draftRepository },
    access.memorialId,
  );

  if (resumed.status === "notFoundOrForbidden") {
    notFound();
  }

  if (resumed.status === "error") {
    return (
      <main className={styles.main}>
        <p className={styles.notice}>
          Votre mémorial n&rsquo;a pas pu être chargé pour le moment. Merci de réessayer dans
          quelques instants.
        </p>
      </main>
    );
  }

  if (resumed.status === "draftAnomaly") {
    return (
      <main className={styles.main}>
        <p className={styles.notice}>
          Votre mémorial existe mais son contenu n&rsquo;a pas pu être retrouvé. L&rsquo;équipe
          HERITAGE a été informée.
        </p>
      </main>
    );
  }

  // resumed.status === "resumable" — Mission 011A: a memorial row exists
  // from the moment an entitlement is redeemed, before the family has
  // chosen its editorial context/language, so `slug` and the rest can
  // still be NULL here. The Builder needs the CONFIGURED shape
  // (MemorialConfig, not StoredMemorialConfig); choosing those values is
  // a Guided Flow the mission brief explicitly keeps out of scope, so an
  // unconfigured memorial gets a controlled notice rather than invented
  // data or a Builder rendered against NULLs.
  if (!isConfiguredMemorial(resumed.memorial)) {
    return (
      <main className={styles.main}>
        <p className={styles.notice}>
          Votre mémorial doit encore être configuré avant de pouvoir être édité ici.
        </p>
      </main>
    );
  }

  // The draft is passed alongside the configuration rather than grafted
  // into it: resumeBuilderSession read it once, through DraftRepository,
  // and that is the single authoritative copy (see BuilderMemorial).
  //
  // `persist` is a BOUND SERVER ACTION, never a closure over `supabase`
  // or `draftRepository` above: a Client Component cannot receive a live
  // server object, and — the real reason — every autosave must be
  // re-authorized server-side as its own request rather than inheriting
  // the decision this render made. See ./actions.ts.
  return (
    <BuilderShell
      memorial={{ ...resumed.memorial, draft: resumed.draft }}
      persist={saveDraftAction.bind(null, access.memorialId)}
    />
  );
}
