"use client";

import { useEffect, useMemo, useState } from "react";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { GalleryStep } from "@/components/builder/GalleryStep";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import {
  createGuestGalleryPort,
  GuestGalleryMediaError,
  loadGuestGalleryPhotos,
  type GuestGalleryMediaOptions,
  type GuestGalleryMediaStore,
} from "@/lib/guest-draft/guest-gallery-media";
import type { GuestDraftV3 } from "@/lib/guest-draft/guest-draft-v3";
import type { LocalGalleryPhotoSnapshot } from "@/lib/media/local-photo";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; photos: LocalGalleryPhotoSnapshot[] }
  | { status: "error"; reason: string };

interface GuestGalleryStepAdapterProps {
  language: Language;
  draft: GuestDraftV3;
  store: GuestGalleryMediaStore;
  getDraft: () => GuestDraftV3;
  acceptDraft: (draft: GuestDraftV3) => void;
  createId: () => string;
  now: () => string;
  progress: number;
}

/**
 * Loads the IndexedDB V3 Gallery blobs only when A13 is actually reached,
 * then hands the existing Gallery screen its already-tested local media port.
 * Object URLs remain owned by GalleryWorkshop/LocalBlobImage and are revoked
 * by those components; this adapter never manufactures a server media id.
 */
export function GuestGalleryStepAdapter({
  language,
  draft,
  store,
  getDraft,
  acceptDraft,
  createId,
  now,
  progress,
}: GuestGalleryStepAdapterProps) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void loadGuestGalleryPhotos(store, draft).then(
      (photos) => {
        if (active) setLoad({ status: "ready", photos });
      },
      (error: unknown) => {
        if (!active) return;
        setLoad({
          status: "error",
          reason: error instanceof GuestGalleryMediaError ? error.reason : "unavailable",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [draft, store]);

  const options = useMemo<GuestGalleryMediaOptions>(() => ({
    store,
    getDraft,
    acceptDraft,
    createId,
    now,
  }), [acceptDraft, createId, getDraft, now, store]);

  if (load.status === "loading") return null;
  if (load.status === "error") {
    return (
      <BuilderScreen progress={progress}>
        <p role="alert" data-guest-gallery-error={load.reason}>
          {translate(language, "errors.generic")}
        </p>
      </BuilderScreen>
    );
  }

  return (
    <GalleryStep
      mode="local"
      language={language}
      content={draft.content}
      localMedia={createGuestGalleryPort(options, load.photos)}
      progress={progress}
    />
  );
}
