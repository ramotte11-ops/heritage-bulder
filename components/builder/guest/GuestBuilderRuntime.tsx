"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { translate } from "@/lib/i18n/translate";
import { DraftRevisionProvider } from "@/lib/builder/draft-revision";
import type { DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  BuilderStepCompletionProvider,
} from "@/components/builder/journey/journey-context";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { GuidedFlowPause } from "@/components/builder/GuidedFlowPause";
import { BuilderPreviewHost } from "@/components/builder/preview/BuilderPreviewHost";
import { LanguageStep } from "@/components/builder/LanguageStep";
import { WelcomeStep } from "@/components/builder/WelcomeStep";
import { HeroIdentityStep } from "@/components/builder/HeroIdentityStep";
import { AnnouncementChoiceStep } from "@/components/builder/AnnouncementChoiceStep";
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
import { GuestGalleryStepAdapter } from "@/components/builder/guest/GuestGalleryStepAdapter";
import { GuestJourneyProvider, type GuestJourneyMoves } from "@/components/builder/guest/GuestJourneyProvider";
import {
  GUEST_BUILDER_V1_SKIN,
  GuestBuilderRuntimeError,
  createGuestDraftSaveTransport,
  loadOrCreateGuestDraft,
  resolveGuestBuilderStage,
  saveGuestDraftLanguage,
  type GuestBuilderDraftStore,
} from "@/lib/guest-draft/guest-builder-runtime";
import { createIndexedDbGuestDraftV3Store, type GuestDraftV3Store } from "@/lib/guest-draft/guest-draft-v3-store";
import type { GuestDraftV3 } from "@/lib/guest-draft/guest-draft-v3";
import {
  completeGuestHeroCrop,
  completeGuestHeroPhoto,
  completeGuestHeroReveal,
  guestHeroStepProgress,
  loadGuestHeroPhoto,
  reopenGuestHeroPhoto,
  saveGuestHeroCrop,
  savePreparedGuestHeroPhoto,
  type GuestHeroMediaOptions,
} from "@/lib/guest-draft/guest-hero-media";
import {
  loadGuestPreview,
  toMemorialPreviewResult,
  type GuestPreviewSession,
} from "@/lib/guest-draft/guest-preview";
import {
  guestCurrentJourneyScreen,
  hasGuestJourney,
  resolveGuestJourney,
  resolveGuestReviewingSection,
  resolveGuestRevisionTarget,
} from "@/lib/guest-draft/guest-journey";
import { journeySectionForScreen, type JourneyScreenId, type JourneySection } from "@/lib/builder/guided-flow/journey";
import type { LocalPhotoSnapshot } from "@/lib/media/local-photo";

type GuestBuilderStore = GuestBuilderDraftStore & Pick<
  GuestDraftV3Store,
  "readPhoto" | "addPhoto" | "replacePhoto" | "updatePhotoPlacement" | "removePhoto"
>;

/**
 * QG 005-B — the guest's stand-in for the route's URL: `revising` is its
 * `?etape=`, `reviewingSection` its `?rubrique=`, `returnToPreview` and
 * `reopenPreview` its `?apercu=1` (a screen opened from the Preview, and
 * the Preview to reopen on arrival).
 */
interface JourneyView {
  revising: JourneyScreenId | null;
  reviewingSection: JourneySection | null;
  returnToPreview: boolean;
  reopenPreview: boolean;
}

const NORMAL_VIEW: JourneyView = { revising: null, reviewingSection: null, returnToPreview: false, reopenPreview: false };

type RuntimeState =
  | { status: "loading" }
  | {
      status: "ready";
      store: GuestBuilderStore;
      draft: GuestDraftV3;
      heroPhoto: LocalPhotoSnapshot | null;
      heroReadUrl: string | null;
      view: JourneyView;
    }
  | { status: "error"; reason: string };

/** The view as the draft allows it: a revision target that is no longer
 * reopenable (and its way back to the Preview) is dropped, exactly like
 * the route ignores an invalid `?etape=`. */
function validView(draft: GuestDraftV3, view: JourneyView): JourneyView {
  if (!hasGuestJourney(draft)) return NORMAL_VIEW;
  const revising = resolveGuestRevisionTarget(draft, view.revising);
  return {
    revising,
    reviewingSection: resolveGuestReviewingSection(draft, view.reviewingSection),
    returnToPreview: revising !== null && view.returnToPreview,
    reopenPreview: view.reopenPreview,
  };
}

/** The catalog screen shown: the revised one, else where the family stopped. */
function shownScreen(draft: GuestDraftV3, view: JourneyView): JourneyScreenId | null {
  return view.revising ?? guestCurrentJourneyScreen(draft);
}

/** Only T08 renders the Hero from a `blob:` read URL. */
function showsReveal(draft: GuestDraftV3, view: JourneyView): boolean {
  return hasGuestJourney(draft) && shownScreen(draft, view) === "reveal";
}

export interface GuestBuilderRuntimeProps {
  /** Injection points exist for deterministic browser-contract tests only. */
  createStore?: () => GuestBuilderStore;
  createId?: () => string;
  now?: () => string;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

function defaultCreateStore(): GuestBuilderStore {
  return createIndexedDbGuestDraftV3Store();
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function defaultRevokeObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Entry for the existing Builder screens backed by the single local guest
 * draft. It reuses the existing T06/T07/T08, A01/A02/A03 and A04-A14
 * screens through the existing A13 Gallery, then rests on the existing
 * Guided Flow pause (without the owner space a guest does not have yet).
 *
 * QG 003 — from T08 on, every screen sits in the one `BuilderPreviewHost`,
 * exactly like the authenticated route: « Voir l'aperçu » drains the
 * step's local autosave, then `loadGuestPreview` re-reads the SAVED local
 * draft and its blobs and assembles the real Memorial — no network, no
 * Supabase. Each opening's `blob:` URLs are revoked when the Preview
 * closes, before the next opening, and on unmount.
 *
 * QG 005-B — from the first Hero question on, « Mon parcours » works as on
 * the authenticated route (`GuestJourneyProvider`, the journey computed
 * from the local draft by `resolveGuestJourney`): any reached screen can be
 * reopened with « Revoir », its Continue leads back to the rubrique, then
 * the normal progression resumes; « Changer l'ambiance » leads from the
 * Preview to T08 and back to the Preview.
 *
 * Only a development page routes it (`app/pilote/builder-invite/page.dev.tsx`);
 * no production route imports this component.
 */
export function GuestBuilderRuntime({
  createStore = defaultCreateStore,
  createId = defaultCreateId,
  now = defaultNow,
  createObjectUrl = defaultCreateObjectUrl,
  revokeObjectUrl = defaultRevokeObjectUrl,
}: GuestBuilderRuntimeProps) {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: "loading" });
  const draftRef = useRef<GuestDraftV3 | null>(null);
  const heroPhotoRef = useRef<LocalPhotoSnapshot | null>(null);
  const heroReadUrlRef = useRef<string | null>(null);
  const viewRef = useRef<JourneyView>(NORMAL_VIEW);
  const previewSessionRef = useRef<GuestPreviewSession | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    let active = true;
    const store = createStore();
    void (async () => {
      try {
        const draft = await loadOrCreateGuestDraft({ store, createId, now });
        const heroPhoto = await loadGuestHeroPhoto(store, draft);
        const heroReadUrl = heroPhoto !== null && showsReveal(draft, NORMAL_VIEW)
          ? createObjectUrl(heroPhoto.blob)
          : null;
        if (!active) {
          if (heroReadUrl !== null) revokeObjectUrl(heroReadUrl);
          return;
        }
        draftRef.current = draft;
        heroPhotoRef.current = heroPhoto;
        heroReadUrlRef.current = heroReadUrl;
        viewRef.current = NORMAL_VIEW;
        setRuntime({ status: "ready", store, draft, heroPhoto, heroReadUrl, view: NORMAL_VIEW });
      } catch (error: unknown) {
        if (!active) return;
        setRuntime({
          status: "error",
          reason: error instanceof GuestBuilderRuntimeError || (error instanceof Error && "reason" in error)
            ? String((error as { reason: string }).reason)
            : "unavailable",
        });
      }
    })();
    return () => {
      active = false;
      if (heroReadUrlRef.current !== null) {
        revokeObjectUrl(heroReadUrlRef.current);
        heroReadUrlRef.current = null;
      }
    };
  }, [createId, createObjectUrl, createStore, now, revokeObjectUrl]);

  const releasePreview = useCallback(() => {
    previewSessionRef.current?.release();
    previewSessionRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releasePreview();
    };
  }, [releasePreview]);

  const acceptDraft = useCallback((draft: GuestDraftV3) => {
    draftRef.current = draft;
  }, []);

  /** Shows the latest saved draft under `view` — the one place the
   * displayed screen changes. */
  const show = useCallback((nextView: (view: JourneyView) => JourneyView) => {
    const draft = draftRef.current;
    if (draft === null) return;
    const view = validView(draft, nextView(viewRef.current));
    viewRef.current = view;
    const heroPhoto = heroPhotoRef.current;
    const onReveal = showsReveal(draft, view);
    let heroReadUrl = heroReadUrlRef.current;
    if (onReveal && heroPhoto !== null && heroReadUrl === null) {
      heroReadUrl = createObjectUrl(heroPhoto.blob);
      heroReadUrlRef.current = heroReadUrl;
    } else if (!onReveal && heroReadUrl !== null) {
      revokeObjectUrl(heroReadUrl);
      heroReadUrl = null;
      heroReadUrlRef.current = null;
    }
    setRuntime((current) => current.status === "ready"
      ? { ...current, draft, heroPhoto, heroReadUrl, view }
      : current);
  }, [createObjectUrl, revokeObjectUrl]);

  // A step's Continue is saved. On the normal progression: the next open
  // screen. On a revised screen (the route's `finishStep`): back to the
  // Preview when opened from it, otherwise back to the rubrique's list.
  const finishStep = useCallback(() => {
    show((view) => {
      if (view.revising === null) return view;
      if (view.returnToPreview) return { ...NORMAL_VIEW, reopenPreview: true };
      return { ...NORMAL_VIEW, reviewingSection: view.reviewingSection ?? journeySectionForScreen(view.revising) };
    });
  }, [show]);

  const journeyMoves = useMemo<GuestJourneyMoves>(() => ({
    openScreen: (id, returnToPreview) => show(() => ({
      revising: id,
      reviewingSection: journeySectionForScreen(id),
      returnToPreview,
      reopenPreview: false,
    })),
    resume: () => show((view) => (view.returnToPreview ? { ...NORMAL_VIEW, reopenPreview: true } : NORMAL_VIEW)),
    finishReview: () => show(() => NORMAL_VIEW),
    finishStep,
  }), [finishStep, show]);

  const previewClosed = useCallback(() => {
    releasePreview();
    if (viewRef.current.reopenPreview) show((view) => ({ ...view, reopenPreview: false }));
  }, [releasePreview, show]);

  const store = runtime.status === "ready" ? runtime.store : null;
  const persist = useCallback<DraftSaveTransport>(async (content, expectedRevision) => {
    if (store === null) throw new GuestBuilderRuntimeError("unavailable");
    const transport = createGuestDraftSaveTransport({
      store,
      getDraft: () => {
        const current = draftRef.current;
        if (current === null) throw new GuestBuilderRuntimeError("unavailable");
        return current;
      },
      acceptDraft,
      now,
    });
    return transport(content, expectedRevision);
  }, [acceptDraft, now, store]);

  const loadPreview = useCallback(async () => {
    if (store === null) return { status: "unavailable" as const };
    // The previous opening is closed (or was never shown): its URLs go now.
    releasePreview();
    const result = await loadGuestPreview({ store, createObjectUrl, revokeObjectUrl });
    if (result.status === "ready") {
      if (!mountedRef.current) {
        result.session.release();
        return { status: "unavailable" as const };
      }
      previewSessionRef.current = result.session;
    }
    return toMemorialPreviewResult(result);
  }, [createObjectUrl, releasePreview, revokeObjectUrl, store]);

  if (runtime.status === "loading") return null;
  if (runtime.status === "error") {
    return (
      <BuilderScreen progress={0}>
        <p role="alert" data-guest-builder-error={runtime.reason}>
          {translate("en", "errors.generic")}
        </p>
      </BuilderScreen>
    );
  }

  const { draft, view } = runtime;
  const stage = resolveGuestBuilderStage(draft);
  const journeyOn = hasGuestJourney(draft);
  const shown = journeyOn ? shownScreen(draft, view) : null;
  // The authenticated rule: from T08 on, never on a Reveal (T08, A03).
  const previewAvailable = stage === "postRevealPending" && shown !== "reveal" && shown !== "announcementPreview";
  const mediaOptions = (): GuestHeroMediaOptions => ({
    store: runtime.store,
    getDraft: () => {
      const current = draftRef.current;
      if (current === null) throw new GuestBuilderRuntimeError("unavailable");
      return current;
    },
    acceptDraft,
    createId,
    now,
  });

  const screenId = stage === "language" || stage === "welcome" ? stage : shown;
  const screen = (() => {
    switch (screenId) {
      case "language":
        return (
          <LanguageStep
            persist={async (language) => {
              const saved = await saveGuestDraftLanguage({
                store: runtime.store,
                getDraft: () => draftRef.current ?? draft,
                acceptDraft,
                now,
              }, language);
              if (saved.draft !== undefined) {
                draftRef.current = saved.draft;
                setRuntime({
                  status: "ready",
                  store: runtime.store,
                  draft: saved.draft,
                  heroPhoto: heroPhotoRef.current,
                  heroReadUrl: heroReadUrlRef.current,
                  view: NORMAL_VIEW,
                });
              }
              return saved.response;
            }}
          />
        );
      case "welcome":
        return <WelcomeStep language={draft.language!} content={draft.content} persist={persist} />;
      case "identity":
        return <HeroIdentityStep language={draft.language!} content={draft.content} persist={persist} progress={guestHeroStepProgress(draft)} />;
      case "announcementChoice":
        return (
          <AnnouncementChoiceStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "phrase":
        return <HeroPhraseStep language={draft.language!} content={draft.content} persist={persist} progress={guestHeroStepProgress(draft)} />;
      case "photo":
        return (
          <HeroPhotoStep
            mode="local"
            language={draft.language!}
            content={draft.content}
            localMedia={{
              initialPhoto: runtime.heroPhoto,
              async savePreparedPhoto(photo, expectedRevision) {
                const result = await savePreparedGuestHeroPhoto(mediaOptions(), photo, expectedRevision);
                if (result.status === "saved" && result.photo !== undefined) heroPhotoRef.current = result.photo;
                return result;
              },
              completePhoto: (expectedRevision) => completeGuestHeroPhoto(mediaOptions(), expectedRevision),
            }}
          />
        );
      case "crop":
        if (runtime.heroPhoto === null) return <span hidden data-guest-builder-error="missing-hero-photo" />;
        return (
          <HeroCropStep
            mode="local"
            language={draft.language!}
            content={draft.content}
            localMedia={{
              photo: runtime.heroPhoto,
              async saveCrop(crop, expectedRevision) {
                const result = await saveGuestHeroCrop(mediaOptions(), crop, expectedRevision);
                if (result.status === "saved" && heroPhotoRef.current !== null) {
                  heroPhotoRef.current = { ...heroPhotoRef.current, crop };
                }
                return result;
              },
              async completeCrop(crop, expectedRevision) {
                const result = await completeGuestHeroCrop(mediaOptions(), crop, expectedRevision);
                if (result.status === "saved" && heroPhotoRef.current !== null) {
                  heroPhotoRef.current = { ...heroPhotoRef.current, crop };
                }
                return result;
              },
              reopenPhoto: (expectedRevision) => reopenGuestHeroPhoto(mediaOptions(), expectedRevision),
            }}
          />
        );
      case "reveal":
        if (runtime.heroPhoto?.crop == null || runtime.heroReadUrl === null) {
          return <span hidden data-guest-builder-error="missing-hero-reveal-photo" />;
        }
        return (
          <HeroRevealStep
            mode="local"
            language={draft.language!}
            content={draft.content}
            initialSkinVariant={draft.skinVariant ?? "light"}
            localMedia={{
              photo: { ...runtime.heroPhoto, crop: runtime.heroPhoto.crop, readUrl: runtime.heroReadUrl },
              progress: guestHeroStepProgress(draft),
              completeReveal: (skinVariant, expectedRevision) =>
                completeGuestHeroReveal(mediaOptions(), skinVariant, expectedRevision),
            }}
          />
        );
      case "announcementText":
        return (
          <DeathNoticeAnnouncementStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "announcementDetails":
        return (
          <DeathNoticePrecisionsStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "announcementPreview":
        if (draft.skinVariant === null) {
          return <span hidden data-guest-builder-error="missing-skin-variant" />;
        }
        return (
          <DeathNoticePreviewStep
            language={draft.language!}
            content={draft.content}
            skin={GUEST_BUILDER_V1_SKIN}
            skinVariant={draft.skinVariant}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "ceremonyMoment":
        return (
          <CeremonyMomentStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "ceremonyDateTime":
        return (
          <CeremonyDateTimeStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "ceremonyVenue":
        return (
          <CeremonyVenueStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "ceremonyAddress":
        return (
          <CeremonyAddressStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "ceremonyProgramme":
        return (
          <CeremonyProgrammeStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "ceremonyNote":
        return (
          <CeremonyNoteStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "traditions":
        return (
          <TraditionsStep
            language={draft.language!}
            content={draft.content}
            skin={GUEST_BUILDER_V1_SKIN}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "personSheet":
        return (
          <PersonSheetStep
            language={draft.language!}
            content={draft.content}
            persist={persist}
            progress={guestHeroStepProgress(draft)}
          />
        );
      case "gallery":
        return (
          <GuestGalleryStepAdapter
            language={draft.language!}
            draft={draft}
            store={runtime.store}
            getDraft={() => draftRef.current ?? draft}
            acceptDraft={acceptDraft}
            createId={createId}
            now={now}
            progress={guestHeroStepProgress(draft)}
          />
        );
      default:
        // Every built step is behind the family: the existing pause, with
        // « Mon parcours » and « Voir l'aperçu » (QG 005-B). Account and
        // publication stages remain outside QG 003.
        return (
          <div data-guest-builder-pending="post-reveal">
            <GuidedFlowPause language={draft.language!} progress={guestHeroStepProgress(draft)} ownerSpace={false} />
          </div>
        );
    }
  })();

  if (stage === "language") {
    return (
      <BuilderStepCompletionProvider finishStep={finishStep}>
        {screen}
      </BuilderStepCompletionProvider>
    );
  }

  // Keyed like the route's revised screens (`revision-<id>`): a revised
  // screen always mounts fresh from the saved draft, and the host closes an
  // open Preview when the screen changes.
  const screenKey = `${view.revising !== null ? "revision-" : ""}${screenId ?? "pause"}`;
  const keyedScreen = isValidElement(screen) ? cloneElement(screen, { key: screenKey }) : screen;

  // The host renders the draft conflict notice inside its Builder wrapper.
  return (
    <DraftRevisionProvider initialRevision={draft.revision} initialContent={draft.content}>
      <BuilderStepCompletionProvider finishStep={finishStep}>
        <BuilderPreviewHost
          available={previewAvailable}
          language={draft.language}
          loadPreview={loadPreview}
          onClosed={previewClosed}
          openOnArrival={view.reopenPreview && previewAvailable}
          localJourney={journeyOn && draft.language !== null
            ? (content) => (
                <GuestJourneyProvider
                  language={draft.language!}
                  snapshot={resolveGuestJourney(draft, view.revising, view.reviewingSection)}
                  skinVariant={draft.skinVariant}
                  returnToPreview={view.returnToPreview}
                  moves={journeyMoves}
                >
                  {content}
                </GuestJourneyProvider>
              )
            : undefined}
        >
          {keyedScreen}
        </BuilderPreviewHost>
      </BuilderStepCompletionProvider>
    </DraftRevisionProvider>
  );
}
