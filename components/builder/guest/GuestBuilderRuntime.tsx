"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { translate } from "@/lib/i18n/translate";
import { DraftRevisionProvider } from "@/lib/builder/draft-revision";
import type { DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  BuilderStepCompletionProvider,
} from "@/components/builder/journey/journey-context";
import { DraftConflictNotice } from "@/components/builder/DraftConflictNotice";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
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
import {
  GUEST_BUILDER_V1_SKIN,
  GuestBuilderRuntimeError,
  createGuestDraftSaveTransport,
  loadOrCreateGuestDraft,
  resolveGuestBuilderStage,
  resolveGuestPostHeroScreen,
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
import type { LocalPhotoSnapshot } from "@/lib/media/local-photo";

type GuestBuilderStore = GuestBuilderDraftStore & Pick<
  GuestDraftV3Store,
  "readPhoto" | "addPhoto" | "replacePhoto" | "updatePhotoPlacement"
>;

type RuntimeState =
  | { status: "loading" }
  | {
      status: "ready";
      store: GuestBuilderStore;
      draft: GuestDraftV3;
      heroPhoto: LocalPhotoSnapshot | null;
      heroReadUrl: string | null;
    }
  | { status: "error"; reason: string };

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
 * Non-routed entry for the existing Builder screens backed by the single
 * local guest draft. It reuses the existing T06/T07/T08, A01/A02/A03 and
 * A04-A09 and A14 screens, then stops before A10 or any later canonical screen.
 * No public route imports this component.
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

  useEffect(() => {
    let active = true;
    const store = createStore();
    void (async () => {
      try {
        const draft = await loadOrCreateGuestDraft({ store, createId, now });
        const heroPhoto = await loadGuestHeroPhoto(store, draft);
        const heroReadUrl = heroPhoto !== null && resolveGuestBuilderStage(draft) === "heroReveal"
          ? createObjectUrl(heroPhoto.blob)
          : null;
        if (!active) {
          if (heroReadUrl !== null) revokeObjectUrl(heroReadUrl);
          return;
        }
        draftRef.current = draft;
        heroPhotoRef.current = heroPhoto;
        heroReadUrlRef.current = heroReadUrl;
        setRuntime({ status: "ready", store, draft, heroPhoto, heroReadUrl });
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

  const acceptDraft = useCallback((draft: GuestDraftV3) => {
    draftRef.current = draft;
  }, []);

  const finishStep = useCallback(() => {
    const draft = draftRef.current;
    if (draft === null) return;
    const heroPhoto = heroPhotoRef.current;
    const nextStage = resolveGuestBuilderStage(draft);
    let heroReadUrl = heroReadUrlRef.current;
    if (nextStage === "heroReveal" && heroPhoto !== null && heroReadUrl === null) {
      heroReadUrl = createObjectUrl(heroPhoto.blob);
      heroReadUrlRef.current = heroReadUrl;
    } else if (nextStage !== "heroReveal" && heroReadUrl !== null) {
      revokeObjectUrl(heroReadUrl);
      heroReadUrl = null;
      heroReadUrlRef.current = null;
    }
    setRuntime((current) => current.status === "ready"
      ? { ...current, draft, heroPhoto, heroReadUrl }
      : current);
  }, [createObjectUrl, revokeObjectUrl]);

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

  const { draft } = runtime;
  const stage = resolveGuestBuilderStage(draft);
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

  const screen = (() => {
    switch (stage) {
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
                });
              }
              return saved.response;
            }}
          />
        );
      case "welcome":
        return <WelcomeStep language={draft.language!} content={draft.content} persist={persist} />;
      case "identity":
        return <HeroIdentityStep language={draft.language!} content={draft.content} persist={persist} />;
      case "announcementChoice":
        return <AnnouncementChoiceStep language={draft.language!} content={draft.content} persist={persist} />;
      case "phrase":
        return <HeroPhraseStep language={draft.language!} content={draft.content} persist={persist} />;
      case "heroPhoto":
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
      case "heroCrop":
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
      case "heroReveal":
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
      case "postRevealPending":
        switch (resolveGuestPostHeroScreen(draft)) {
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
          default:
            // A10 and every later canonical screen remain outside this lot.
            return <span hidden data-guest-builder-pending="post-reveal" />;
        }
    }
  })();

  const hosted = (
    <BuilderStepCompletionProvider finishStep={finishStep}>
      {screen}
    </BuilderStepCompletionProvider>
  );

  if (stage === "language") return hosted;

  return (
    <DraftRevisionProvider initialRevision={draft.revision} initialContent={draft.content}>
      <DraftConflictNotice language={draft.language} />
      {hosted}
    </DraftRevisionProvider>
  );
}
