"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LocalVideoRegistry } from "@/lib/memorial/video/local-video-registry";
import type { VideoDraftItem } from "@/lib/memorial/video/video-content";
import type {
  HostedVideoView,
  SignedVideoPlaybackView,
  VideoHostingActions,
  VideoUploadRefusalReason,
} from "@/lib/memorial/video/hosting/hosted-video-types";
import { isTransferActive, type VideoTransfer, type VideoTransferManager } from "@/lib/memorial/video/hosting/video-transfers";
import { hasPublishedPreviousVersion, latestHostedView } from "@/lib/memorial/video/hosting/hosted-video-views";

/**
 * VID-07 — le passage du local à l'hébergement premium, pour l'écran A16.
 *
 * Sans actions d'hébergement (invité), ou si le serveur répond « indisponible »
 * (offre gratuite, hébergement non configuré), l'écran reste exactement celui
 * de VID-06 : préparation locale, aucun envoi. Sinon, chaque vidéo choisie
 * part directement vers l'hébergeur, et l'écran suit ce que le SERVEUR sait
 * d'elle : seule une vidéo que le serveur déclare prête est dite conservée.
 */

export type HostedItemStatus =
  | { kind: "preparing" }
  | { kind: "sending"; percent: number }
  | { kind: "processing" }
  | { kind: "ready" }
  /** `unsuccessful` : le serveur a constaté l'échec de l'envoi (expiré, refusé par l'hébergeur, annulé). */
  | { kind: "interrupted"; canResume: boolean; unsuccessful?: boolean }
  | { kind: "failed"; failure: "over_total_duration" | "too_many_videos" | "duration_unavailable" | "asset_errored" }
  | { kind: "refused"; reason: VideoUploadRefusalReason; canResume: boolean };

export type VideoHostingMode = "local" | "checking" | "hosted";

export const DEFAULT_HOSTING_POLL_MS = 8000;

const RETRYABLE_REFUSALS: readonly VideoUploadRefusalReason[] = ["unknown_pending", "in_progress", "other"];
const FINAL_FAILURES = ["over_total_duration", "too_many_videos", "duration_unavailable", "asset_errored"] as const;

const latestView = latestHostedView;

function viewStatus(view: HostedVideoView, hasFile: boolean): HostedItemStatus {
  switch (view.state) {
    case "pending":
    case "uploading":
      return { kind: "interrupted", canResume: hasFile };
    case "processing":
      return { kind: "processing" };
    case "ready":
      return { kind: "ready" };
    default: {
      const failure = FINAL_FAILURES.find((f) => f === view.failure);
      return failure === undefined ? { kind: "interrupted", canResume: hasFile, unsuccessful: true } : { kind: "failed", failure };
    }
  }
}

export function hostedItemStatus(
  transfer: VideoTransfer | null,
  views: readonly HostedVideoView[],
  draftVideoId: string,
  hasFile: boolean,
): HostedItemStatus | null {
  const latest = latestView(views, draftVideoId);
  if (transfer !== null) {
    switch (transfer.phase) {
      case "preparing":
        return { kind: "preparing" };
      case "sending":
        return { kind: "sending", percent: transfer.percent };
      case "sent": {
        // Reçue par l'hébergeur : seul le serveur peut dire qu'elle est prête.
        const own = views.find((view) => view.videoId === transfer.videoId);
        return own !== undefined && own.state !== "pending" && own.state !== "uploading" && own.state !== "removing"
          ? viewStatus(own, hasFile)
          : { kind: "processing" };
      }
      case "interrupted":
      case "cancelled":
        return { kind: "interrupted", canResume: hasFile };
      case "refused":
        return { kind: "refused", reason: transfer.refusal ?? "other", canResume: hasFile && RETRYABLE_REFUSALS.includes(transfer.refusal ?? "other") };
    }
  }
  return latest === null ? null : viewStatus(latest, hasFile);
}

interface UseVideoHostingInput {
  hosting: VideoHostingActions | undefined;
  items: readonly VideoDraftItem[];
  registry: LocalVideoRegistry;
  transfers: VideoTransferManager;
  pollMs?: number;
  /** Durées vérifiées par l'hébergeur, reportées dans le brouillon. */
  onVerifiedDurations: (durations: ReadonlyMap<string, number>) => void;
}

export function useVideoHosting({ hosting, items, registry, transfers, pollMs = DEFAULT_HOSTING_POLL_MS, onVerifiedDurations }: UseVideoHostingInput) {
  const [mode, setMode] = useState<VideoHostingMode>(hosting === undefined ? "local" : "checking");
  const [views, setViews] = useState<readonly HostedVideoView[]>([]);
  const transferState = useSyncExternalStore(transfers.subscribe, transfers.snapshot, transfers.snapshot);
  const itemsRef = useRef(items);
  const viewsRef = useRef(views);
  const durationsRef = useRef(onVerifiedDurations);
  // Dernières valeurs, lues par les effets asynchrones et les gestionnaires d'événements.
  useEffect(() => {
    itemsRef.current = items;
    viewsRef.current = views;
    durationsRef.current = onVerifiedDurations;
  });

  const start = useCallback(
    (draftVideoId: string, declaredDurationSeconds: number | null, previousVideoId: string | null = null) => {
      if (hosting === undefined) return;
      const file = registry.get(draftVideoId)?.file ?? null;
      if (file === null) return;
      void transfers.start({ draftVideoId, file, declaredDurationSeconds, hosting, previousVideoId }).then(() => undefined);
    },
    [hosting, registry, transfers],
  );

  const refresh = useCallback(async () => {
    if (hosting === undefined) return null;
    try {
      const load = await hosting.load();
      if (load.status === "unavailable") {
        setMode("local");
        return null;
      }
      setViews(load.videos);
      setMode("hosted");
      return load.videos;
    } catch {
      // Session expirée, réseau : l'écran garde ce qu'il sait ; à l'ouverture, il reste local.
      setMode((current) => (current === "checking" ? "local" : current));
      return null;
    }
  }, [hosting]);

  // Ouverture : ce que le serveur sait, puis envoi des vidéos choisies et jamais envoyées.
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture serveur asynchrone, une fois à l'ouverture de l'écran
    void refresh().then((loaded) => {
      if (!alive || loaded === null) return;
      for (const item of itemsRef.current) {
        if (transfers.get(item.id) !== null || latestView(loaded, item.id) !== null) continue;
        if (registry.get(item.id)?.file) start(item.id, item.durationSeconds);
      }
    });
    return () => {
      alive = false;
    };
  }, [refresh, registry, start, transfers]);

  const statusOf = useCallback(
    (draftVideoId: string): HostedItemStatus | null =>
      mode !== "hosted" ? null : hostedItemStatus(transferState.get(draftVideoId) ?? null, views, draftVideoId, registry.get(draftVideoId)?.file != null),
    [mode, transferState, views, registry],
  );

  const waiting = mode === "hosted" && items.some((item) => statusOf(item.id)?.kind === "processing");
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [waiting, refresh, pollMs]);

  // Le serveur a mesuré la durée : elle remplace la durée lue par le navigateur.
  useEffect(() => {
    const verified = new Map<string, number>();
    for (const item of itemsRef.current) {
      const latest = latestView(views, item.id);
      if (latest?.state === "ready" && latest.durationVerified && latest.durationSeconds !== null && latest.durationSeconds !== item.durationSeconds) {
        verified.set(item.id, latest.durationSeconds);
      }
    }
    if (verified.size > 0) durationsRef.current(verified);
  }, [views]);

  function send(draftVideoId: string, durationSeconds: number | null) {
    if (mode !== "hosted") return;
    const latest = latestView(viewsRef.current, draftVideoId);
    const inFlight = latest !== null && (latest.state === "pending" || latest.state === "uploading") ? latest.videoId : null;
    const previous = transfers.get(draftVideoId)?.videoId ?? inFlight;
    transfers.forget(draftVideoId);
    start(draftVideoId, durationSeconds, previous);
  }

  return {
    mode,
    statusOf,
    /** Lecture signée de la dernière version prête, pour l'aperçu quand le fichier n'est plus sur l'appareil. */
    playbackOf(draftVideoId: string): SignedVideoPlaybackView | null {
      if (mode !== "hosted") return null;
      const latest = latestView(views, draftVideoId);
      return latest?.state === "ready" ? latest.playback : null;
    },
    /** VID-09 — la version que la famille prépare (hébergement actif seulement). */
    viewOf: (draftVideoId: string): HostedVideoView | null => (mode === "hosted" ? latestView(views, draftVideoId) : null),
    isActive: (draftVideoId: string) => isTransferActive(transferState.get(draftVideoId)),
    /** VID-09 — l'ancienne version de cette vidéo est encore celle de la page publique. */
    previousStillPublic: (draftVideoId: string) => mode === "hosted" && hasPublishedPreviousVersion(views, draftVideoId),
    /** Après un ajout ou un remplacement local réussi. */
    send,
    /** Nouvel envoi après une interruption (l'envoi précédent est annulé côté serveur). */
    resume: send,
    async cancel(draftVideoId: string) {
      if (hosting === undefined) return;
      await transfers.cancel(draftVideoId, hosting);
      await refresh();
    },
    /** Retrait : arrêt de l'envoi et suppression côté hébergeur avant de retirer du brouillon. */
    async remove(draftVideoId: string): Promise<boolean> {
      transfers.forget(draftVideoId);
      if (hosting === undefined || mode === "local") return true;
      try {
        await hosting.remove(draftVideoId);
      } catch {
        return false;
      }
      await refresh();
      return true;
    },
  };
}
