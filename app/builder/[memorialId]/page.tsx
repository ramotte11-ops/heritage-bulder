import { notFound, redirect } from "next/navigation";
import { getHeritageActor, authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { resumeBuilderSession } from "@/lib/builder/resume-session";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import type { ReactElement } from "react";
import { isConfiguredMemorial, type MemorialContent } from "@/types/memorial";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { LanguageStep } from "@/components/builder/LanguageStep";
import { WelcomeStep } from "@/components/builder/WelcomeStep";
import { AnnouncementChoiceStep } from "@/components/builder/AnnouncementChoiceStep";
import { HeroIdentityStep } from "@/components/builder/HeroIdentityStep";
import { HeroPhraseStep } from "@/components/builder/HeroPhraseStep";
import { HeroPhotoStep } from "@/components/builder/HeroPhotoStep";
import { HeroCropStep } from "@/components/builder/HeroCropStep";
import { HeroRevealStep } from "@/components/builder/HeroRevealStep";
import { DeathNoticeAnnouncementStep } from "@/components/builder/DeathNoticeAnnouncementStep";
import { DeathNoticePrecisionsStep } from "@/components/builder/DeathNoticePrecisionsStep";
import { DeathNoticePreviewStep } from "@/components/builder/DeathNoticePreviewStep";
import { CeremonyMomentStep } from "@/components/builder/CeremonyMomentStep";
import { CeremonyDateTimeStep } from "@/components/builder/CeremonyDateTimeStep";
import { CeremonyVenueStep } from "@/components/builder/CeremonyVenueStep";
import { CeremonyAddressStep } from "@/components/builder/CeremonyAddressStep";
import { CeremonyProgrammeStep } from "@/components/builder/CeremonyProgrammeStep";
import { CeremonyNoteStep } from "@/components/builder/CeremonyNoteStep";
import { TraditionsStep } from "@/components/builder/TraditionsStep";
import { PersonSheetStep } from "@/components/builder/PersonSheetStep";
import { GalleryStep } from "@/components/builder/GalleryStep";
import { GuidedFlowPause } from "@/components/builder/GuidedFlowPause";
import { BuilderPreviewHost } from "@/components/builder/preview/BuilderPreviewHost";
import { isPreviewUnlocked } from "@/lib/builder/guided-flow/preview-lock";
import { resolveSkinRuntime } from "@/lib/memorial/skin-runtime";
import { resolveSectionRenderer } from "@/config/memorial-section-renderers";
import {
  heroStepProgress,
  needsPageA,
  needsPageB,
  needsPageC,
  needsPageD,
  needsPageE,
  resolveHeroFlowState,
} from "@/lib/builder/guided-flow/hero-step";
import { needsWelcome } from "@/lib/builder/guided-flow/welcome-step";
import { isAnnouncementChosen, needsA00 } from "@/lib/builder/guided-flow/announcement-choice-step";
import { needsA01, needsA02, needsA03 } from "@/lib/builder/guided-flow/death-notice-step";
import { needsA04, needsA05, needsA06, needsA07, needsA08, needsA14 } from "@/lib/builder/guided-flow/ceremony-step";
import { needsA09 } from "@/lib/builder/guided-flow/traditions-step";
import { needsPersonSheet } from "@/lib/builder/guided-flow/person-sheet-step";
import { needsA13 } from "@/lib/builder/guided-flow/gallery-step";
import {
  resolveJourney,
  resolveRevisionContext,
  resolveReviewingSection,
  type JourneyScreenId,
  type JourneySection,
} from "@/lib/builder/guided-flow/journey";
import { resolveGalleryStepData } from "@/lib/builder/guided-flow/resolve-gallery-step";
import {
  resolveHeroPhotoStepData,
  reconcileHeroMediaOnResume,
} from "@/lib/builder/guided-flow/resolve-hero-photo-step";
import { resolveHeroCropStepData } from "@/lib/builder/guided-flow/resolve-hero-crop-step";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { readHero } from "@/lib/memorial/hero";
import { saveDraftAction, saveLanguageAction } from "./actions";
import {
  reserveHeroPhotoUploadAction,
  finalizeHeroPhotoUploadAction,
  retireHeroPhotoUploadAction,
} from "./media-actions";
import {
  reserveGalleryPhotoUploadAction,
  finalizeGalleryPhotoUploadAction,
  retireGalleryPhotoAction,
} from "./gallery-media-actions";
import { saveSkinVariantAction } from "./hero-reveal-actions";
import { saveSectionVisibilityAction } from "./visibility-actions";
import { composeMemorial } from "@/lib/memorial/composition/compose-memorial";
import { resolveVisibilityEntries } from "@/lib/memorial/visibility-entries";
import { loadMemorialPreviewAction } from "./preview-actions";
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
 * ## B02-L2 — one single route, no editorial-context choice
 *
 * Mission 024's T02 ("Annonce & Hommage" / "Mémoire & Hommage") is gone:
 * the route is T01 → Welcome (new drafts only) → PAGE A → A00 → Hero →
 * the following sections, for every family. Whether the death notice is
 * offered is A00's answer alone (lib/builder/guided-flow/announcement-choice-step.ts).
 * `memorials.editorial_context` is never written and never read for
 * routing any more; it stays in the database as historical data only.
 *
 * ## Mission 032 — PAGE A (T03 + T04) and PAGE B (T05) sit right after T01
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
 *
 * ## Mission 042 — A09 (Traditions & repères) sits right after the Ceremony block
 *
 * Shown once the whole A04-A08 Ceremony block is genuinely behind the
 * family (`needsA09`, lib/builder/guided-flow/traditions-step.ts —
 * reuses `needsA04`..`needsA08` verbatim, never a Ceremony field
 * itself), reached the exact same way whether A04 was answered "yes",
 * "no" or "undecided" (mission brief section 2 — A09 is independent of
 * whether a ceremony is actually planned). `skin` is passed through
 * RE-VALIDATED, exactly like A03's own `skin` prop above, used only to
 * narrow which catalog suggestions `TraditionsStep` may offer — never to
 * infer or pre-select a practice for the family.
 *
 * ## Mission 043/044 — the combined A10+A11+A12 sheet sits right after A09
 *
 * Mission 043 built A10 ("Quelques mots sur la personne") as its own
 * single screen. A QG Produit/UX decision (Mission 044) merged it with
 * A11 ("Ce qu'elle aimait") and A12 ("Ce qu'elle laisse") into ONE
 * screen — three open, entirely facultative invitations on a single
 * sheet, three still-distinct content matières
 * (`content.personWords`/`lovedThings`/`legacy`), never three successive
 * screens. Shown once A09 is genuinely behind the family (`needsPersonSheet`,
 * lib/builder/guided-flow/person-sheet-step.ts — gates on
 * `isA09Resolved`, never on `needsA09`: `needsA09 === false` is
 * ambiguous for a skippable step, so the real gate is A09's own
 * resolved-or-not fact) and only until the sheet itself has been treated
 * once, whichever way (all three matières resolved together, by one
 * Continue/Skip click). No `skin`/culture input at all (this sheet never
 * narrows or infers anything from either).
 *
 * ## A13 — the Gallery ("Vos souvenirs en images") sits right after the sheet
 *
 * Shown once the A10+A11+A12 sheet is resolved (`needsA13`,
 * lib/builder/guided-flow/gallery-step.ts) and until A13's own
 * `StepRecord` exists. `resolveGalleryStepData` mints the thumbnails'
 * short-lived read URLs through the Preview's Owner draft resolver
 * (purpose `"gallery"`), and the three Gallery actions
 * (./gallery-media-actions.ts) are bound to `access.memorialId` — the
 * purpose is fixed server-side, never chosen by the browser.
 *
 * ## B03 — « Mon parcours » and revision
 *
 * Every Guided Flow screen is built by one `renderScreen(id, content)`,
 * used both by the gates (unchanged, same order) and by a revision
 * opened from « Mon parcours » through `?etape=<screen>`. That query is
 * a client claim: `resolveRevisionTarget` (lib/builder/guided-flow/journey.ts)
 * honors it only for a screen already reached and still applicable,
 * never a future one. Opening a revision writes nothing; the screen's
 * own Continue commits through the same functions and the same bound
 * `saveDraftAction`, then returns to this route without `?etape=`
 * (`useStepDone`), where the gates recompute every conditional step
 * and resume where the family stopped. Authorization, publication and
 * the draft's storage are untouched.
 */
export const dynamic = "force-dynamic";

export default async function BuilderMemorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ memorialId: string }>;
  /** B03/#59 — `etape` and `rubrique` are navigation claims, validated below;
   * so is `apercu` (recette Builder V1: back to the Preview after T08). */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
  const query = await searchParams;
  // Recette Builder V1 — « Changer l'ambiance » from the Preview: T08 leads
  // back to the Preview (`?apercu=1`). A plain navigation claim: it opens
  // nothing the family could not open with « Voir l'aperçu », writes
  // nothing, and is honored only where the route says so below.
  const fromPreview = query.apercu === "1";
  // Étape 3 — Preview réel. Every Guided Flow screen below is returned
  // inside the SAME `BuilderPreviewHost` wrapper (`withPreview`), locked
  // or not, so the tree's shape never changes and the host can hide —
  // never unmount — the current screen while the Preview is open.
  // `available` is decided here, the one place that knows which screen
  // is shown: T08 done (`isPreviewUnlocked`, the existing rule, on the
  // very content that screen renders), a Hero renderer exists for this
  // memorial's skin (QG Q1 — the existing registry; no Intemporel
  // fallback for another skin), and never on a Reveal screen (T08 Hero,
  // A03 Avis — passed `false` explicitly below). The bound
  // `loadMemorialPreviewAction` re-reads the saved draft server-side;
  // nothing here is handed to it but the authorized id.
  const memorialLanguage = resumed.memorial.language;
  const initialDraft = resumed.draft;
  let activeReviewingSection: JourneySection | null = null;
  const memorialSkinVariant = resumed.memorial.skinVariant;
  const memorialSkinId = resumed.memorial.skin;
  const saveVisibility = saveSectionVisibilityAction.bind(null, access.memorialId);
  const memorialSkin = resolveSkinRuntime(resumed.memorial.skin);
  const heroRendererExists =
    resolveSectionRenderer("hero", memorialSkin.status === "resolved" ? memorialSkin.skin : null) !== null;
  const loadPreview = loadMemorialPreviewAction.bind(null, access.memorialId);
  // B03 — the route's own path, built from the AUTHORIZED id only: where
  // « Mon parcours » sends the family back to resume (and, with
  // `?etape=`, to revise one screen).
  const builderPath = `/builder/${access.memorialId}`;

  function previewAvailable(content: MemorialContent): boolean {
    if (memorialLanguage === null || !heroRendererExists) return false;
    return isPreviewUnlocked(resolveHeroFlowState(content, readHero(content)));
  }

  /** `journeyContent` — the content the screen renders, from which
   * « Mon parcours » is computed (B03); `null` before identity (T01, the
   * Welcome), where there is no journey to show yet. */
  function withPreview(
    screen: ReactElement,
    available: boolean,
    journeyContent: MemorialContent | null = null,
    revising: JourneyScreenId | null = null,
  ) {
    return (
      <BuilderPreviewHost
        available={available}
        // Back from T08 opened from the Preview: the normal route reopens it.
        openOnArrival={fromPreview && revising === null && available}
        language={memorialLanguage}
        loadPreview={loadPreview}
        draftRevision={initialDraft.revision ?? 0}
        draftContent={journeyContent ?? initialDraft.content}
        journey={
          journeyContent === null
            ? null
            : {
                snapshot: resolveJourney(journeyContent, revising, activeReviewingSection),
                builderPath,
                skinVariant: memorialSkinVariant,
                // Only T08, only when opened from the Preview, leads back to it.
                returnToPreview: fromPreview && revising === "reveal",
                // « Gérer les rubriques visibles »: the rows come from the
                // same composition the Preview assembles.
                visibility: {
                  sections: resolveVisibilityEntries(
                    composeMemorial({ skin: memorialSkinId, skinVariant: memorialSkinVariant, content: journeyContent }),
                  ),
                  save: saveVisibility,
                },
              }
        }
      >
        {screen}
      </BuilderPreviewHost>
    );
  }

  if (resumed.memorial.language === null) {
    return withPreview(
      <LanguageStep persist={saveLanguageAction.bind(null, access.memorialId, null)} />,
      false,
    );
  }
  const language = resumed.memorial.language;

  /**
   * B03 — every Guided Flow screen, built in ONE place for both the
   * normal route (the gates below, in order) and a revision opened from
   * « Mon parcours » (`?etape=`). `available` is the Preview's own
   * availability on that screen (never on a Reveal). `null` only when a
   * screen's own data cannot be resolved (PAGE D/E without a usable
   * photo) — the caller then falls through, exactly as before.
   */
  const renderScreen = async (
    id: JourneyScreenId,
    content: MemorialContent,
    key?: string,
  ): Promise<{ element: ReactElement; available: boolean } | null> => {
    switch (id) {
      case "identity":
        return {
          element: (
            <HeroIdentityStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "announcementChoice":
        return {
          element: (
            <AnnouncementChoiceStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "phrase":
        return {
          element: (
            <HeroPhraseStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "photo": {
        // `resolveHeroPhotoStepData` runs the section-14 compensation pass
        // and resolves the one display URL this page needs before
        // rendering — see this function's own docstring and this file's
        // Mission 033 section above.
        const photoStepData = await resolveHeroPhotoStepData(
          { mediaEngine: createServerMediaEngineDeps(), draftRepository },
          actor,
          access.memorialId,
          content,
        );
        return {
          element: (
            <HeroPhotoStep
              key={key}
              language={language}
              content={photoStepData.content}
              initialPhoto={photoStepData.initialPhoto}
              persist={saveDraftAction.bind(null, access.memorialId)}
              reserveUpload={reserveHeroPhotoUploadAction.bind(null, access.memorialId)}
              finalizeUpload={finalizeHeroPhotoUploadAction.bind(null, access.memorialId)}
              retireUpload={retireHeroPhotoUploadAction.bind(null, access.memorialId)}
            />
          ),
          available: previewAvailable(photoStepData.content),
        };
      }
      case "crop": {
        // `resolveHeroCropStepData` mints the one signed read URL this page
        // needs, against the ALREADY-RECONCILED content — never the raw,
        // pre-reconciliation draft.
        const cropStepData = await resolveHeroCropStepData(
          { mediaEngine: createServerMediaEngineDeps() },
          actor,
          access.memorialId,
          content,
        );
        // Defensive only: a `null` here would mean the photo stopped being
        // readable between the reconciliation and this read. Rather than
        // crash or silently skip T07, the caller falls through to the same
        // fallback every other not-yet-resolvable state already uses.
        if (cropStepData === null) return null;
        return {
          element: (
            <HeroCropStep
              key={key}
              language={language}
              content={content}
              photo={cropStepData}
              persist={saveDraftAction.bind(null, access.memorialId)}
            />
          ),
          available: previewAvailable(content),
        };
      }
      case "reveal": {
        // Reuses `resolveHeroCropStepData` as-is (the exact same "current
        // photo + a fresh signed read URL" this screen needs to actually
        // RENDER the Hero, not merely crop it — no second resolver).
        const revealStepData = await resolveHeroCropStepData(
          { mediaEngine: createServerMediaEngineDeps() },
          actor,
          access.memorialId,
          content,
        );
        // Defensive only, exactly like PAGE D's own equivalent guard above.
        if (revealStepData === null) return null;
        return {
          element: (
            <HeroRevealStep
              key={key}
              language={language}
              content={content}
              photo={revealStepData}
              initialSkinVariant={resumed.memorial.skinVariant}
              persist={saveDraftAction.bind(null, access.memorialId)}
              saveSkinVariant={saveSkinVariantAction.bind(
                null,
                access.memorialId,
                resumed.memorial.skinVariant,
              )}
            />
          ),
          available: false /* Reveal */,
        };
      }
      case "announcementText":
        return {
          element: (
            <DeathNoticeAnnouncementStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "announcementDetails":
        return {
          element: (
            <DeathNoticePrecisionsStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "announcementPreview":
        // `resumed.memorial.skin` is passed through RE-VALIDATED (never
        // trusted as a bare TS type crossing the DB boundary) —
        // `DeathNoticePreviewStep`'s own skin guard is what decides whether
        // the real Intemporel renderer shows or an honest "not yet
        // available for this style" notice.
        return {
          element: (
            <DeathNoticePreviewStep
              key={key}
              language={language}
              content={content}
              skin={resumed.memorial.skin}
              skinVariant={resumed.memorial.skinVariant}
              persist={saveDraftAction.bind(null, access.memorialId)}
            />
          ),
          available: false /* Reveal */,
        };
      case "ceremonyMoment":
        return {
          element: (
            <CeremonyMomentStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "ceremonyDateTime":
        return {
          element: (
            <CeremonyDateTimeStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "ceremonyVenue":
        return {
          element: (
            <CeremonyVenueStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "ceremonyAddress":
        return {
          element: (
            <CeremonyAddressStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "ceremonyProgramme":
        return {
          element: (
            <CeremonyProgrammeStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "ceremonyNote":
        return {
          element: (
            <CeremonyNoteStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "traditions":
        // `skin` is passed through RE-VALIDATED, used ONLY to narrow which
        // catalog suggestions may be shown — never to infer or pre-select
        // a practice.
        return {
          element: (
            <TraditionsStep
              key={key}
              language={language}
              content={content}
              skin={resumed.memorial.skin}
              persist={saveDraftAction.bind(null, access.memorialId)}
            />
          ),
          available: previewAvailable(content),
        };
      case "personSheet":
        return {
          element: (
            <PersonSheetStep key={key} language={language} content={content} persist={saveDraftAction.bind(null, access.memorialId)} />
          ),
          available: previewAvailable(content),
        };
      case "gallery": {
        // The thumbnails are resolved here, server-side, through the
        // Preview's own Owner draft resolver (purpose "gallery"); the three
        // Gallery actions are bound to the AUTHORIZED id exactly like the
        // Hero's — the browser never picks a memorial or a purpose.
        const galleryStepData = await resolveGalleryStepData(
          { mediaEngine: createServerMediaEngineDeps() },
          actor,
          access.memorialId,
          content,
        );
        return {
          element: (
            <GalleryStep
              key={key}
              language={language}
              content={content}
              thumbnails={galleryStepData.status === "ready" ? galleryStepData.thumbnails : {}}
              persist={saveDraftAction.bind(null, access.memorialId)}
              reserveUpload={reserveGalleryPhotoUploadAction.bind(null, access.memorialId)}
              finalizeUpload={finalizeGalleryPhotoUploadAction.bind(null, access.memorialId)}
              retirePhoto={retireGalleryPhotoAction.bind(null, access.memorialId)}
            />
          ),
          available: previewAvailable(content),
        };
      }
    }
  };

  /** The current screen of the normal route, wrapped. */
  const showCurrent = async (id: JourneyScreenId, content: MemorialContent) => {
    const screen = await renderScreen(id, content);
    return screen === null ? null : withPreview(screen.element, screen.available, content);
  };

  // Builder Welcome — right after T01, before anything else: only for a
  // draft nobody has started (no editorial context, empty content), so a
  // resumed draft never sees it again (lib/builder/guided-flow/welcome-step.ts).
  // No Preview: there is nothing to preview yet.
  if (needsWelcome(resumed.memorial.editorialContext, resumed.draft.content)) {
    return withPreview(
      <WelcomeStep
        language={resumed.memorial.language}
        content={resumed.draft.content}
        persist={saveDraftAction.bind(null, access.memorialId)}
      />,
      false,
    );
  }

  // B03 — revision from « Mon parcours ». `?etape=` is a client claim:
  // `resolveRevisionTarget` honors it only for a screen the family has
  // genuinely reached (resolved or current, and applicable), never a
  // future one, and never the current one (shown below anyway). Opening a
  // screen writes nothing: it shows what is stored, and only the screen's
  // own Continue commits, through the same commit functions as the first
  // time; the step then returns to this route without `?etape=`
  // (`useStepDone`), where the gates below recompute every conditional
  // step and resume where the family stopped. The `key` remounts the
  // screen fresh. PAGE C keeps its own compensation pass on the raw
  // draft; every other screen renders the reconciled content, exactly
  // like the route below.
  const revisionContext = resolveRevisionContext(resumed.draft.content, query.etape, query.rubrique);
  activeReviewingSection =
    query.etape === undefined
      ? resolveReviewingSection(resumed.draft.content, query.rubrique)
      : revisionContext?.section ?? null;
  if (revisionContext !== null) {
    const revisionTarget = revisionContext.screen;
    const revisionContent =
      revisionTarget === "photo"
        ? resumed.draft.content
        : await reconcileHeroMediaOnResume(
            { mediaEngine: createServerMediaEngineDeps(), draftRepository },
            actor,
            access.memorialId,
            resumed.draft.content,
          );
    const revision = await renderScreen(revisionTarget, revisionContent, `revision-${revisionTarget}`);
    if (revision !== null) {
      return withPreview(revision.element, revision.available, revisionContent, revisionTarget);
    }
  }

  // Mission 032 — PAGE A: T03 (nom affiché, obligatoire) and T04
  // (dates, facultatives) sharing one visible page, gated on the Hero
  // itself (draft.content.hero) rather than on a memorial column — the
  // same "read the one real fact, nothing else" discipline as T01's own
  // gate just above, applied to `draft.content` instead of `memorials`.
  // `needsPageA` is also what a corrupted stored Hero routes through:
  // HeroIdentityStep detects that itself and shows a calm notice instead
  // of a form, rather than this route trying to tell the two cases apart.
  //
  // B03 — the order of the gates below is mirrored by
  // `JOURNEY_SCREENS` (lib/builder/guided-flow/journey.ts), which
  // computes « Mon parcours » from the same predicates; journey.test.ts
  // guards that both agree.
  if (needsPageA(resumed.draft.content)) {
    return (await showCurrent("identity", resumed.draft.content))!;
  }

  // A00 — "Souhaitez-vous également publier une annonce de décès ?":
  // right after identity (PAGE A), before the Hero, for every family
  // whatever its historical editorial context (B02-L2). A pre-A00 draft
  // that already validated its announcement reads as "yes" and is never
  // asked (lib/builder/guided-flow/announcement-choice-step.ts).
  if (needsA00(resumed.draft.content)) {
    return (await showCurrent("announcementChoice", resumed.draft.content))!;
  }

  // Mission 032 — PAGE B: T05, a short optional personal line. Shown
  // only once PAGE A is genuinely behind the family (never before —
  // see `needsPageB`'s own guard) and only until T05 itself has been
  // treated once, whichever way (mission brief section 9: absence of a
  // phrase must never re-trigger this page forever).
  if (needsPageB(resumed.draft.content)) {
    return (await showCurrent("phrase", resumed.draft.content))!;
  }

  // Mission 033 — PAGE C: T06, the Hero's photo. Shown only once PAGE A
  // and PAGE B are genuinely behind the family (never before — see
  // `needsPageC`'s own guard) and only until T06 itself has been
  // explicitly completed via a real Continue click (mission brief
  // section 18/19 — a ready, autosaved photo is not by itself proof the
  // family left this page).
  if (needsPageC(resumed.draft.content)) {
    return (await showCurrent("photo", resumed.draft.content))!;
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
  // never counts). Without a usable photo (defensive), falls through.
  if (needsPageD(heroReconciledContent)) {
    const crop = await showCurrent("crop", heroReconciledContent);
    if (crop !== null) return crop;
  }

  // Mission 035 — PAGE E: T08, the Hero's first real reveal. Shown only
  // once PAGE A, PAGE B, PAGE C and PAGE D are all genuinely behind the
  // family (never before — see `needsPageE`'s own guard) and only until
  // T08 itself has been explicitly completed for a still-complete Hero
  // (mission brief section 20). Without a usable photo (defensive, like
  // PAGE D), falls through.
  if (needsPageE(heroReconciledContent)) {
    const reveal = await showCurrent("reveal", heroReconciledContent);
    if (reveal !== null) return reveal;
  }

  // Mission 039 — A01 (l'annonce) and A02 (précisions facultatives) sit
  // right after PAGE E. B02-L2 — the death notice (A01-A03) is offered
  // only when A00 was answered "yes". "Non"/"Plus tard" go straight on to
  // the ceremony question (A04), which never depends on this choice; any
  // notice content already written is kept untouched, never read or
  // cleared here (lib/memorial/death-notice.ts's "context safety"
  // doctrine — changing a choice never destroys data).
  const announcementChosen = isAnnouncementChosen(heroReconciledContent);

  if (announcementChosen && needsA01(heroReconciledContent)) {
    return (await showCurrent("announcementText", heroReconciledContent))!;
  }

  // A02 is shown only once A01 is genuinely behind the family (never
  // before — see `needsA02`'s own guard) and only until A02 itself has
  // been treated once, whichever way (mission brief section 8/9).
  if (announcementChosen && needsA02(heroReconciledContent)) {
    return (await showCurrent("announcementDetails", heroReconciledContent))!;
  }

  // Mission 039B — A03: the Death Notice preview. Shown only once A01
  // AND A02 are both genuinely behind the family (never before — see
  // `needsA03`'s own guard) and until A03 itself has been verified for
  // the CURRENT content (its own deterministic fingerprint —
  // `deathNoticePreviewFingerprint`).
  if (announcementChosen && needsA03(heroReconciledContent)) {
    return (await showCurrent("announcementPreview", heroReconciledContent))!;
  }

  // Mission 040 — A04: "Un moment est-il prévu ?", obligatoire et
  // non-passable, shown only once A01/A02/A03 are all genuinely behind
  // the family (never before — see `needsA04`'s own guard, which also
  // routes back here on a corrupted stored Ceremony).
  if (needsA04(heroReconciledContent)) {
    return (await showCurrent("ceremonyMoment", heroReconciledContent))!;
  }

  // Mission 040 — A05-A08: the ceremony's own information, shown only
  // when A04 was answered "yes" (never for "non"/"pas encore décidé" —
  // `needsA05`..`needsA08` each read that answer themselves) and only
  // until each one has been treated once, whichever way. Every one of
  // the four is facultatif and passable (human-steps.ts).
  if (needsA05(heroReconciledContent)) {
    return (await showCurrent("ceremonyDateTime", heroReconciledContent))!;
  }

  if (needsA06(heroReconciledContent)) {
    return (await showCurrent("ceremonyVenue", heroReconciledContent))!;
  }

  if (needsA07(heroReconciledContent)) {
    return (await showCurrent("ceremonyAddress", heroReconciledContent))!;
  }

  // C5 — A14: the ordered programme, after the address/access step and
  // before the final practical note. It is optional and persists through
  // the same draft action as every other Guided Flow screen.
  if (needsA14(heroReconciledContent)) {
    return (await showCurrent("ceremonyProgramme", heroReconciledContent))!;
  }

  if (needsA08(heroReconciledContent)) {
    return (await showCurrent("ceremonyNote", heroReconciledContent))!;
  }

  // Mission 042 — A09: "Traditions & repères". Shown once the whole
  // Ceremony block is genuinely behind the family — A04 resolved, and
  // A05-A08 resolved too whenever A04 was answered "yes" (never
  // before: `needsA09` reuses `needsA04`..`needsA08` verbatim) — and
  // reached exactly the same way whether A04 was "yes", "no" or
  // "undecided". B02-L2 — A09 belongs with the death notice (PO
  // doctrine): `needsA09` itself is false unless A00 = "yes"; entries
  // already written stay in the draft.
  if (needsA09(heroReconciledContent)) {
    return (await showCurrent("traditions", heroReconciledContent))!;
  }

  // Mission 044 — the combined A10+A11+A12 sheet ("Quelques mots sur
  // la personne" / "Ce qu'elle aimait" / "Ce qu'elle laisse"). Shown
  // only once A09 is genuinely behind the family (never before — see
  // `needsPersonSheet`'s own guard, which gates on `isA09Resolved`,
  // never on `needsA09` — `needsA09 === false` is ambiguous for a
  // skippable step), or once the Ceremony block is when A09 is not part
  // of the route (A00 not "yes") and only until the sheet itself has been treated
  // once, whichever way. Entirely facultative and passable, three
  // free-text matières resolved together.
  if (needsPersonSheet(heroReconciledContent)) {
    return (await showCurrent("personSheet", heroReconciledContent))!;
  }

  // A13 — "Vos souvenirs en images". Shown once the A10–A12 sheet is
  // genuinely behind the family (never before — `needsA13` gates on
  // `isPersonSheetResolved`) and only until A13 itself has been treated
  // once, whichever way. A corrupted stored Gallery still renders the
  // step, which shows its own calm notice instead of an editor (same as
  // every other step).
  if (needsA13(heroReconciledContent)) {
    return (await showCurrent("gallery", heroReconciledContent))!;
  }

  // The Builder needs the fully CONFIGURED shape (MemorialConfig, not
  // StoredMemorialConfig), and `slug` is generated by the publication
  // flow, which no mission has built yet — so `isConfiguredMemorial`
  // keeps its exact meaning and BuilderShell stays unreachable without a
  // real slug (never invented data, never a Builder rendered against
  // NULLs).
  //
  // Builder continuity mission — what a memorial past every BUILT gate
  // above reaches instead (today: past A13). This used to be a
  // bare "your memorial still needs to be configured" notice: a dead end
  // that asked the family for a step no screen offers. It is now the
  // Guided Flow's own resting screen — same chrome, the real engine's
  // progress (never 1 while unbuilt steps remain on the route), a
  // confirmation that the answers are stored, and the way back to the
  // owner space — and, since B03, « Mon parcours » to revise any screen.
  // It decides nothing about publication or `slug`, and simulates no
  // later step: when a later step is built, its own `needsX` gate goes
  // right above this line, exactly like every gate before it, and this
  // screen moves one step further down on its own.
  if (!isConfiguredMemorial(resumed.memorial)) {
    return withPreview(
      <GuidedFlowPause
        language={resumed.memorial.language}
        progress={heroStepProgress(heroReconciledContent, readHero(heroReconciledContent))}
      />,
      previewAvailable(heroReconciledContent),
      heroReconciledContent,
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
