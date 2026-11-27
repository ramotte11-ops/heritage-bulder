"use client";

import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { VideoDraftItem } from "@/lib/memorial/video/video-content";
import { publicVideoItems, type PublicVideoPlaybackMap } from "@/lib/memorial/video/video-section";
import { VideoHommageV1 } from "./VideoHommageV1";
import { useVideoPreviewHost } from "./video-preview-host";
import { VIDEO_HOMMAGE_TEXTS } from "./texts";
import styles from "./VideoHommageV1Section.module.css";

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
  /**
   * VID-15 — aperçu du Builder d'un hommage en offre gratuite : la rubrique
   * est montrée pour être découverte, mais ne sera publiée qu'avec l'hommage
   * complet. Une mention discrète le dit, HORS du Master. Jamais posé sur la
   * page publique.
   */
  requiresCompleteOffer?: boolean;
}

/**
 * VID-08 — la rubrique vidéo dans le mémorial assemblé (aperçu et page
 * publique). Elle réutilise telle quelle la rubrique VID-05A/05B
 * (`VideoHommageV1`, Master Light universel) : aucune nouvelle direction
 * artistique. Rien à lire réellement : rien n'est dessiné (jamais de lecteur
 * vide ni de fausse vidéo publiée).
 */
export function VideoHommageV1Section({ skinVariant, language, items, publicPlayback, requiresCompleteOffer = false }: VideoHommageV1SectionProps) {
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
  const rubrique = <VideoHommageV1 items={shown} skinVariant={skinVariant} language={language} onSourcesExpired={host.reload} />;
  if (!requiresCompleteOffer) return rubrique;
  return (
    <>
      <p className={styles.previewOnlyNote} data-video-preview-only="">
        {VIDEO_HOMMAGE_TEXTS[language].requiresComplete}
      </p>
      {rubrique}
    </>
  );
}
