"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VideoDraftItem } from "@/lib/memorial/video/video-content";
import type { VideoHommageItem } from "@/lib/memorial/video/video-hommage";
import { pageLocalVideoRegistry, type LocalVideoRegistry } from "@/lib/memorial/video/local-video-registry";
import type { HostedVideoView, VideoHostingLoad } from "@/lib/memorial/video/hosting/hosted-video-types";
import { latestHostedView } from "@/lib/memorial/video/hosting/hosted-video-views";
import { previewVideoItem } from "@/lib/memorial/video/video-section";

/**
 * VID-08 — l'hôte de la rubrique vidéo dans l'APERÇU du Builder (connecté
 * et invité).
 *
 * Il dit, pour chaque vidéo décrite par la famille, ce qui est vraiment
 * lisible dans cette session : le fichier encore sur l'appareil (registre de
 * la page, aucun réseau), sinon la version hébergée prête de SA famille
 * (lecture signée renvoyée par l'action serveur `load`, liée à l'hommage
 * autorisé), sinon un état clair. L'invité n'a pas de `load` : local seul.
 *
 * Sans cet hôte (ou celui de la page publique), la rubrique ne dessine rien.
 */
export interface VideoPreviewHostValue {
  resolve(items: readonly VideoDraftItem[]): VideoHommageItem[];
  /** Renouvelle les lectures signées expirées (connecté seulement). */
  reload?: () => void;
}

const VideoPreviewHostContext = createContext<VideoPreviewHostValue | null>(null);

export function useVideoPreviewHost(): VideoPreviewHostValue | null {
  return useContext(VideoPreviewHostContext);
}

export function VideoPreviewProvider({
  load,
  registry = pageLocalVideoRegistry(),
  children,
}: {
  /** L'action serveur `loadVideoHostingAction` liée à l'hommage autorisé ; absente pour l'invité. */
  load?: () => Promise<VideoHostingLoad>;
  registry?: LocalVideoRegistry;
  children: ReactNode;
}) {
  const [views, setViews] = useState<readonly HostedVideoView[]>([]);

  const refresh = useCallback(async () => {
    if (load === undefined) return;
    try {
      const result = await load();
      setViews(result.status === "available" ? result.videos : []);
    } catch {
      // Session expirée, réseau : l'aperçu garde ce qui est local.
      setViews([]);
    }
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture serveur asynchrone, une fois à l'ouverture de l'aperçu
    void refresh();
  }, [refresh]);

  const value = useMemo<VideoPreviewHostValue>(
    () => ({
      resolve: (items) => items.map((item) => previewVideoItem(item, registry.get(item.id), latestHostedView(views, item.id))),
      ...(load === undefined ? {} : { reload: () => void refresh() }),
    }),
    [views, registry, load, refresh],
  );

  return <VideoPreviewHostContext.Provider value={value}>{children}</VideoPreviewHostContext.Provider>;
}
