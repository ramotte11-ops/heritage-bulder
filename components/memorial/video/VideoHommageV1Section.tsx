"use client";

import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { VideoDraftItem } from "@/lib/memorial/video/video-content";
import { publicVideoItems, type PublicVideoPlaybackMap } from "@/lib/memorial/video/video-section";
import { VideoHommageV1 } from "./VideoHommageV1";
import { useVideoPreviewHost } from "./video-preview-host";

export interface VideoHommageV1SectionProps {
  skinVariant: SkinVariant;
  language: Language;
  /** Les vidéos décrites dans le contenu assemblé (copie publiée ou projection de l'aperçu), dans leur ordre. */
  items: readonly VideoDraftItem[];
  /**
   * Page publique seulement : les lectures signées par le serveur pour cette
   * visite, par identifiant de vidéo. Absent : la rubrique demande à l'hôte
   * de l'aperçu ; sans hôte, elle ne dessine rien.
   */
  publicPlayback?: PublicVideoPlaybackMap;
}

/**
 * VID-08 — la rubrique vidéo dans le mémorial assemblé (aperçu et page
 * publique). Elle réutilise telle quelle la rubrique VID-05A/05B
 * (`VideoHommageV1`, Master Light universel) : aucune nouvelle direction
 * artistique. Rien à lire réellement : rien n'est dessiné (jamais de lecteur
 * vide ni de fausse vidéo publiée).
 */
export function VideoHommageV1Section({ skinVariant, language, items, publicPlayback }: VideoHommageV1SectionProps) {
  const host = useVideoPreviewHost();
  const router = useRouter();

  if (publicPlayback !== undefined) {
    const shown = publicVideoItems(items, publicPlayback);
    if (shown.length === 0) return null;
    // Jetons expirés (visite longue) : la page publique, jamais mise en cache, signe de nouvelles adresses.
    return <VideoHommageV1 items={shown} skinVariant={skinVariant} language={language} onSourcesExpired={() => router.refresh()} />;
  }

  if (host === null) return null;
  const shown = host.resolve(items);
  if (shown.length === 0) return null;
  return <VideoHommageV1 items={shown} skinVariant={skinVariant} language={language} onSourcesExpired={host.reload} />;
}
