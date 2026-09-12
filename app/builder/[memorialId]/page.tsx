import { notFound, redirect } from "next/navigation";
import { getHeritageActor, authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { resumeBuilderSession } from "@/lib/builder/resume-session";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { isConfiguredMemorial } from "@/types/memorial";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { LanguageStep } from "@/components/builder/LanguageStep";
import { ContextStep } from "@/components/builder/ContextStep";
import { HeroIdentityStep } from "@/components/builder/HeroIdentityStep";
import { HeroPhraseStep } from "@/components/builder/HeroPhraseStep";
import { HeroPhotoStep } from "@/components/builder/HeroPhotoStep";
import { HeroCropStep } from "@/components/builder/HeroCropStep";
import { HeroRevealStep } from "@/components/builder/HeroRevealStep";
import { needsPageA, needsPageB, needsPageC, needsPageD, needsPageE } from "@/lib/builder/guided-flow/hero-step";
import {
  resolveHeroPhotoStepData,
  reconcileHeroMediaOnResume,
} from "@/lib/builder/guided-flow/resolve-hero-photo-step";
import { resolveHeroCropStepData } from "@/lib/builder/guided-flow/resolve-hero-crop-step";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { translate } from "@/lib/i18n/translate";
import { saveDraftAction, saveLanguageAction, saveEditorialContextAction } from "./actions";
import {
  reserveHeroPhotoUploadAction,
  finalizeHeroPhotoUploadAction,
  retireHeroPhotoUploadAction,
} from "./media-actions";
import { saveSkinVariantAction } from "./hero-reveal-actions";
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
 *
 * ## Mission 023 — T01 sits in front of the Builder proper
 *
 * A resumed memorial with `language === null` renders `LanguageStep`
 * instead of the "not configured" notice below — the family's very
 * first choice, gated on nothing but that one column. Once a language
 * IS recorded, this route never shows T01 again for that memorial.
 *
 * ## Mission 024 — T02 sits right after T01
 *
 * Once `language` is recorded but `editorialContext` is still NULL,
 * this route renders `ContextStep` (T02) instead of the "not
 * configured" notice — gated on nothing but that one column, exactly
 * the same discipline as T01's own gate. Once an editorial context IS
 * recorded, T02 is never shown again either; a memorial with both
 * `language` and `editorialContext` but still not fully configured (a
 * Guided Flow step no later mission has built yet) falls through to the
 * existing notice, shown in the family's own language.
 *
 * ## Mission 032 — PAGE A (T03 + T04) and PAGE B (T05) sit right after T02
 *
 * Unlike T01/T02, these two gates read `resumed.draft.content` — the
 * Hero (Mission 031's canonical model) lives at `draft.content.hero`,
 * not on a `memorials` column — through `needsPageA`/`needsPageB`
 * (lib/builder/guided-flow/hero-step.ts), which are the single source
 * of truth for "has this been done" (never a second, redundant flag
 * this route tracks itself). PAGE A (`HeroIdentityStep`) is T03's
 * `displayName` and T04's optional `birth`/`death` sharing one visible
 * page — two distinct Guided Flow steps (Mission 025) resolved from the
 * SAME Hero read, never a separate screen per step. PAGE B
 * (`HeroPhraseStep`) is T05's optional `shortPhrase`, shown once PAGE A
 * is behind the family and until T05 itself has been treated once
 * (completed or explicitly left blank). Both bind `saveDraftAction`
 * exactly like `BuilderShell`'s own autosave `persist` — no second
 * persistence path. A memorial past both, with nothing else configured
 * yet, falls through to the same notice T02 already falls through to.
 *
 * ## Mission 033 — PAGE C (T06, the Hero photo) sits right after PAGE B
 *
 * Shown once PAGE A and PAGE B are both behind the family and T06 itself
 * has not been explicitly completed (`needsPageC`,
 * lib/builder/guided-flow/hero-step.ts). Its data is resolved through
 * `resolveHeroPhotoStepData` (lib/builder/guided-flow/resolve-hero-photo-step.ts)
 * rather than read directly off `resumed.draft.content`, because PAGE C
 * alone needs the section-14 compensation pass — reconciling the Hero's
 * photo against Storage/DB's own `"hero"`/`"ready"` media before
 * deciding a photo is really missing — and a fresh, short-lived signed
 * read URL for whatever it finds (Mission 030's private-read mechanism;
 * never persisted). `reserveHeroPhotoUploadAction`/
 * `finalizeHeroPhotoUploadAction`/`retireHeroPhotoUploadAction`
 * (./media-actions.ts) are bound to `access.memorialId` exactly like
 * `saveDraftAction` above — the browser never holds a raw, unverified
 * memorial id for any of these calls either.
 *
 * ## Mission 033 QG follow-up — cleanup keeps retrying after T06 too
 *
 * `resolveHeroPhotoStepData` only runs while `needsPageC` is true, i.e.
 * before the family's Continue click — a retire that fails on their
 * very last replacement would otherwise never be retried again once T06
 * is `"completed"`. So every path reached past the PAGE C gate — PAGE D
 * (T07), the notice, and `BuilderShell` alike — first runs
 * `reconcileHeroMediaOnResume`, the exact same reconciliation +
 * durable-retry pass, minus PAGE C's own signed read URL, for as long as
 * any stale, non-canonical `"hero"`-purpose `"ready"` media remains for
 * this memorial.
 *
 * ## Mission 034 — PAGE D (T07, the Hero photo crop) sits right after PAGE C
 *
 * Shown once PAGE A, PAGE B and PAGE C are all behind the family and T07
 * itself has not been explicitly completed for the CURRENT photo
 * (`needsPageD`, lib/builder/guided-flow/hero-step.ts — that gate also
 * re-derives false the instant the photo changes, whether through PAGE
 * C's own "Changer la photo" or through the reconciliation pass above).
 * `resolveHeroCropStepData` (lib/builder/guided-flow/resolve-hero-crop-step.ts)
 * mints the one fresh signed read URL this page needs, against the
 * ALREADY-RECONCILED content — never the raw, pre-reconciliation draft.
 * `HeroCropStep` needs no upload actions of its own: its own "Changer la
 * photo" reopens PAGE C rather than duplicating T06's upload engine (see
 * `reopenPageC`'s own docstring). A memorial past PAGE D, with nothing
 * else configured yet, falls through to the same notice T02/PAGE A/PAGE
 * B/PAGE C already fall through to. `BuilderShell` receives the same
 * reconciled content PAGE D itself renders against, never the raw,
 * pre-reconciliation one.
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
  // still be NULL here.
  //
  // Mission 023 — T01. `language` is the first of those still-NULL
  // choices to get a real step: no language recorded yet means this
  // family has never completed T01, so it is shown NOW, unconditionally
  // — never gated behind anything else, never skipped by any signal
  // from the browser, the offer, or the culture (mission brief section
  // 5/7: no silent auto-detection). Once a language IS recorded, T01 is
  // never shown again for this Memorial — reached only through this
  // one condition, on a field that only `saveLanguageAction` (through
  // `LanguageStep`) ever sets, so a family that already chose resumes
  // straight past it on every future visit, including after a refresh.
  //
  // `saveLanguageAction.bind(null, access.memorialId)` mirrors
  // `saveDraftAction`'s own binding just below: the AUTHORIZED id, never
  // the raw URL segment, and a bound Server Action rather than a closure
  // over `supabase`/`memorialConfigRepository` — the same reasons
  // Mission 021B already documents for the draft's `persist`.
  if (resumed.memorial.language === null) {
    return <LanguageStep persist={saveLanguageAction.bind(null, access.memorialId)} />;
  }

  // Mission 024 — T02. Language is now guaranteed non-null (narrowed by
  // the `return` above), so T02's own copy can render fully resolved in
  // it. `editorialContext === null` means this family has completed T01
  // but never T02 — shown NOW, unconditionally, on nothing but this one
  // column: never deduced from a death date, an offer, a skin, or a
  // culture (mission brief section 3 — an absolute rule). Once an
  // editorial context IS recorded, T02 is never shown again for this
  // Memorial — reached only through this one condition, on a field only
  // `saveEditorialContextAction` (through `ContextStep`) ever sets.
  //
  // `saveEditorialContextAction.bind(null, access.memorialId)` mirrors
  // `saveLanguageAction`'s own binding above for the same reasons.
  if (resumed.memorial.editorialContext === null) {
    return (
      <ContextStep
        language={resumed.memorial.language}
        persist={saveEditorialContextAction.bind(null, access.memorialId)}
      />
    );
  }

  // Mission 032 — PAGE A: T03 (nom affiché, obligatoire) and T04
  // (dates, facultatives) sharing one visible page, gated on the Hero
  // itself (draft.content.hero) rather than on a memorial column — the
  // same "read the one real fact, nothing else" discipline as T01/T02's
  // own gates just above, applied to `draft.content` instead of
  // `memorials`. `needsPageA` is also what a corrupted stored Hero
  // routes through: HeroIdentityStep detects that itself and shows a
  // calm notice instead of a form, rather than this route trying to
  // tell the two cases apart.
  if (needsPageA(resumed.draft.content)) {
    return (
      <HeroIdentityStep
        language={resumed.memorial.language}
        editorialContext={resumed.memorial.editorialContext}
        content={resumed.draft.content}
        persist={saveDraftAction.bind(null, access.memorialId)}
      />
    );
  }

  // Mission 032 — PAGE B: T05, a short optional personal line. Shown
  // only once PAGE A is genuinely behind the family (never before —
  // see `needsPageB`'s own guard) and only until T05 itself has been
  // treated once, whichever way (mission brief section 9: absence of a
  // phrase must never re-trigger this page forever).
  if (needsPageB(resumed.draft.content)) {
    return (
      <HeroPhraseStep
        language={resumed.memorial.language}
        editorialContext={resumed.memorial.editorialContext}
        content={resumed.draft.content}
        persist={saveDraftAction.bind(null, access.memorialId)}
      />
    );
  }

  // Mission 033 — PAGE C: T06, the Hero's photo. Shown only once PAGE A
  // and PAGE B are genuinely behind the family (never before — see
  // `needsPageC`'s own guard) and only until T06 itself has been
  // explicitly completed via a real Continue click (mission brief
  // section 18/19 — a ready, autosaved photo is not by itself proof the
  // family left this page). `resolveHeroPhotoStepData` runs the
  // section-14 compensation pass and resolves the one display URL this
  // page needs before rendering — see this function's own docstring and
  // this file's Mission 033 section above.
  if (needsPageC(resumed.draft.content)) {
    const photoStepData = await resolveHeroPhotoStepData(
      { mediaEngine: createServerMediaEngineDeps(), draftRepository },
      actor,
      access.memorialId,
      resumed.draft.content,
    );

    return (
      <HeroPhotoStep
        language={resumed.memorial.language}
        editorialContext={resumed.memorial.editorialContext}
        content={photoStepData.content}
        initialPhoto={photoStepData.initialPhoto}
        persist={saveDraftAction.bind(null, access.memorialId)}
        reserveUpload={reserveHeroPhotoUploadAction.bind(null, access.memorialId)}
        finalizeUpload={finalizeHeroPhotoUploadAction.bind(null, access.memorialId)}
        retireUpload={retireHeroPhotoUploadAction.bind(null, access.memorialId)}
      />
    );
  }

  // Mission 033 QG follow-up — reachable only once PAGE A, PAGE B and
  // T06 are ALL genuinely behind the family (every earlier `return`
  // above has been passed): the one Builder loading path that already
  // runs after T06, and therefore the durable retry for a "Changer la
  // photo" retire that failed on the family's very last replacement,
  // right before their Continue click — see
  // lib/builder/guided-flow/resolve-hero-photo-step.ts's own docstring
  // on why cleanup must outlive T06 itself. Reuses the exact same
  // reconciliation `resolveHeroPhotoStepData` runs (adopt-and-persist an
  // eventual still-unadopted `ready` media FIRST, only then retire what
  // is left over) — never a second mechanism, never a sweep or a cron.
  // Run BEFORE the PAGE D gate below too: T07's own crop must always be
  // framed against the CANONICAL photo, never a stale/orphaned one this
  // pass would otherwise have silently fixed up a moment later.
  const heroReconciledContent = await reconcileHeroMediaOnResume(
    { mediaEngine: createServerMediaEngineDeps(), draftRepository },
    actor,
    access.memorialId,
    resumed.draft.content,
  );

  // Mission 034 — PAGE D: T07, the Hero photo's crop. Shown only once
  // PAGE A, PAGE B and PAGE C are genuinely behind the family (never
  // before — see `needsPageD`'s own guard) and only until T07 itself
  // has been explicitly completed for the CURRENT photo (mission brief
  // section 14/15/18/19 — an autosaved crop is not by itself proof the
  // family left this page, and a crop tied to a since-replaced photo
  // never counts). `resolveHeroCropStepData` mints the one signed read
  // URL this page needs, against the ALREADY-RECONCILED content above —
  // never the raw, pre-reconciliation draft.
  if (needsPageD(heroReconciledContent)) {
    const cropStepData = await resolveHeroCropStepData(
      { mediaEngine: createServerMediaEngineDeps() },
      actor,
      access.memorialId,
      heroReconciledContent,
    );

    // Defensive only: `needsPageD` being true already implies T06 is
    // complete, which requires a real, usable hero photo — a `null`
    // here would mean that photo stopped being readable between the
    // reconciliation above and this read. Rather than crash or silently
    // skip T07, fall through to the same notice every other
    // not-yet-resolvable state below already uses.
    if (cropStepData !== null) {
      return (
        <HeroCropStep
          language={resumed.memorial.language}
          editorialContext={resumed.memorial.editorialContext}
          content={heroReconciledContent}
          photo={cropStepData}
          persist={saveDraftAction.bind(null, access.memorialId)}
        />
      );
    }
  }

  // Mission 035 — PAGE E: T08, the Hero's first real reveal. Shown only
  // once PAGE A, PAGE B, PAGE C and PAGE D are all genuinely behind the
  // family (never before — see `needsPageE`'s own guard) and only until
  // T08 itself has been explicitly completed for a still-complete Hero
  // (mission brief section 20). Reuses `resolveHeroCropStepData` as-is
  // (the exact same "current photo + a fresh signed read URL" this
  // screen needs to actually RENDER the Hero, not merely crop it — no
  // second, near-identical resolver) against the already-reconciled
  // content from the retry above.
  if (needsPageE(heroReconciledContent)) {
    const revealStepData = await resolveHeroCropStepData(
      { mediaEngine: createServerMediaEngineDeps() },
      actor,
      access.memorialId,
      heroReconciledContent,
    );

    // Defensive only, exactly like PAGE D's own equivalent guard above:
    // `needsPageE` being true already implies T07 is complete, which
    // requires a real, usable hero photo.
    if (revealStepData !== null) {
      return (
        <HeroRevealStep
          language={resumed.memorial.language}
          editorialContext={resumed.memorial.editorialContext}
          content={heroReconciledContent}
          photo={revealStepData}
          initialSkinVariant={resumed.memorial.skinVariant}
          persist={saveDraftAction.bind(null, access.memorialId)}
          saveSkinVariant={saveSkinVariantAction.bind(null, access.memorialId)}
        />
      );
    }
  }

  // The Builder needs the fully CONFIGURED shape (MemorialConfig, not
  // StoredMemorialConfig); choosing `slug` is a Guided Flow step no
  // later mission has built yet, so — for now — a memorial past PAGE E
  // but with nothing else configured gets a controlled notice rather
  // than invented data or a Builder rendered against NULLs.
  // `resumed.memorial.language` is narrowed non-null by the earlier
  // `return`, so this notice can already speak the family's own
  // language rather than a hard-coded one.
  if (!isConfiguredMemorial(resumed.memorial)) {
    return (
      <main className={styles.main}>
        <p className={styles.notice}>
          {translate(resumed.memorial.language, "builder.notConfiguredYet")}
        </p>
      </main>
    );
  }

  // The draft is passed alongside the configuration rather than grafted
  // into it: resumeBuilderSession read it once, through DraftRepository,
  // and that is the single authoritative copy (see BuilderMemorial).
  // `content` reflects `heroReconciledContent` above rather than the
  // raw `resumed.draft.content` — the same reconciled truth the retry
  // above just confirmed and, if it changed, already persisted.
  //
  // `persist` is a BOUND SERVER ACTION, never a closure over `supabase`
  // or `draftRepository` above: a Client Component cannot receive a live
  // server object, and — the real reason — every autosave must be
  // re-authorized server-side as its own request rather than inheriting
  // the decision this render made. See ./actions.ts.
  return (
    <BuilderShell
      memorial={{ ...resumed.memorial, draft: { ...resumed.draft, content: heroReconciledContent } }}
      persist={saveDraftAction.bind(null, access.memorialId)}
    />
  );
}
