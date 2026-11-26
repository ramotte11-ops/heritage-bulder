"use client";

import { useState } from "react";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { VideoStep } from "@/components/builder/VideoStep";
import { createLocalVideoRegistry } from "@/lib/memorial/video/local-video-registry";
import { createVideoTransferManager } from "@/lib/memorial/video/hosting/video-transfers";
import type { HostedVideoView, VideoHostingActions } from "@/lib/memorial/video/hosting/hosted-video-types";

/** VID-09 — le vrai formulaire A16, alimenté par des doubles (développement seulement). */

const ITEMS = [
  { id: "v-pilote-1", title: "Son anniversaire", durationSeconds: 12 },
  { id: "v-pilote-2", title: null, durationSeconds: 12 },
  { id: "v-pilote-3", title: "Les vacances en famille", durationSeconds: 590 },
];

function content(withVideos: boolean): MemorialContent {
  return {
    hero: { displayName: "Élise Martin" },
    guidedFlow: { A13: { status: "skipped" }, A15: { status: "skipped" } },
    ...(withVideos ? { video: { items: ITEMS } } : {}),
  } as unknown as MemorialContent;
}

function view(index: number, patch: Partial<HostedVideoView>): HostedVideoView {
  return {
    videoId: `00000000-0000-4000-8000-00000000000${index}`,
    draftVideoId: `v-pilote-${index}`,
    state: "ready",
    durationSeconds: 12,
    durationVerified: true,
    failure: null,
    uploadExpiresAt: null,
    playback: null,
    ...patch,
  };
}

export function VideoFormPilot({ language, state, mediaBase }: { language: Language; state: "vide" | "local" | "premium"; mediaBase: string | null }) {
  const [pilot] = useState(() => {
    const registry = createLocalVideoRegistry();
    // L'envoi simulé s'arrête à 42 % et n'aboutit jamais : on voit la progression.
    const transfers = createVideoTransferManager({
      upload: (options) => {
        options.onProgress?.(420, 1000);
        return new Promise(() => {});
      },
    });
    let hosting: VideoHostingActions | undefined;
    if (state === "premium") {
      registry.set(
        "v-pilote-2",
        { url: mediaBase === null ? "" : `${mediaBase}souvenir-2.mp4`, metadata: { durationSeconds: 12, width: 1280, height: 720, playable: true }, release: () => {} },
        new Blob([new Uint8Array(1000)]),
      );
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
      hosting = {
        load: async () => ({
          status: "available",
          videos: [
            view(1, {
              playback:
                mediaBase === null
                  ? null
                  : { hlsUrl: `${mediaBase}souvenir-1/index.m3u8`, posterUrl: `${mediaBase}souvenir-1/poster.jpg`, mp4Url: null, expiresAt },
            }),
            view(3, { state: "failed", failure: "over_total_duration", durationSeconds: 590 }),
          ],
        }),
        request: async () => ({ status: "granted", videoId: "00000000-0000-4000-8000-000000000002", uploadUrl: "http://localhost/pilote-sans-envoi", expiresAt }),
        cancel: async () => ({ status: "cancelled" }),
        remove: async () => ({ status: "removed" }),
      };
    }
    return { registry, transfers, hosting };
  });

  return (
    <VideoStep
      language={language}
      content={content(state !== "vide")}
      persist={async () => ({ updatedAt: new Date().toISOString() })}
      registry={pilot.registry}
      transfers={pilot.transfers}
      hosting={pilot.hosting}
      hostingPollMs={60_000}
    />
  );
}
