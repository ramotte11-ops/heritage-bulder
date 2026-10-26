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
import {
  GuestBuilderRuntimeError,
  createGuestDraftSaveTransport,
  loadOrCreateGuestDraft,
  resolveGuestBuilderStage,
  saveGuestDraftLanguage,
  type GuestBuilderDraftStore,
} from "@/lib/guest-draft/guest-builder-runtime";
import { createIndexedDbGuestDraftV3Store } from "@/lib/guest-draft/guest-draft-v3-store";
import type { GuestDraftV3 } from "@/lib/guest-draft/guest-draft-v3";

type RuntimeState =
  | { status: "loading" }
  | { status: "ready"; store: GuestBuilderDraftStore; draft: GuestDraftV3 }
  | { status: "error"; reason: string };

export interface GuestBuilderRuntimeProps {
  /** Injection points exist for deterministic browser-contract tests only. */
  createStore?: () => GuestBuilderDraftStore;
  createId?: () => string;
  now?: () => string;
}

function defaultCreateStore(): GuestBuilderDraftStore {
  return createIndexedDbGuestDraftV3Store();
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

/**
 * Non-routed entry for the existing Builder screens backed by the single
 * local guest draft. It intentionally stops before T06: media and Preview
 * remain Lot 2-C. No public route imports this component in Lot 2-B.
 */
export function GuestBuilderRuntime({
  createStore = defaultCreateStore,
  createId = defaultCreateId,
  now = defaultNow,
}: GuestBuilderRuntimeProps) {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: "loading" });
  const draftRef = useRef<GuestDraftV3 | null>(null);

  useEffect(() => {
    let active = true;
    const store = createStore();
    void loadOrCreateGuestDraft({ store, createId, now }).then(
      (draft) => {
        if (!active) return;
        draftRef.current = draft;
        setRuntime({ status: "ready", store, draft });
      },
      (error: unknown) => {
        if (!active) return;
        setRuntime({
          status: "error",
          reason: error instanceof GuestBuilderRuntimeError ? error.reason : "unavailable",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [createId, createStore, now]);

  const acceptDraft = useCallback((draft: GuestDraftV3) => {
    draftRef.current = draft;
  }, []);

  const finishStep = useCallback(() => {
    const draft = draftRef.current;
    if (draft === null) return;
    setRuntime((current) => current.status === "ready" ? { ...current, draft } : current);
  }, []);

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
                setRuntime({ status: "ready", store: runtime.store, draft: saved.draft });
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
      case "mediaPending":
        // Deliberately no visible fallback and no route: T06/media is Lot 2-C.
        return <span hidden data-guest-builder-pending="media" />;
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
