"use server";

import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { buildFounderAtelierContent, resolveFounderAtelierMedia } from "@/lib/admin/founder-atelier-fixture";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { setSectionVisibility } from "@/lib/memorial/section-visibility";
import { SECTION_IDS, type SectionId } from "@/config/sections";
import type { MemorialContent } from "@/types/memorial";
import type { MemorialPreviewResult } from "@/components/builder/preview/BuilderPreviewHost";
import { commitA15 } from "@/lib/builder/guided-flow/contributions-step";
import { commitA16 } from "@/lib/builder/guided-flow/video-step";
import type { VideoHostingLoad } from "@/lib/memorial/video/hosting/hosted-video-types";

/** VID-08 — vidéos du pilote : deux souvenirs décrits par la famille (A15 et A16 traitées). */
const PILOT_VIDEOS = [
  { id: "v-pilote-1", title: "Son anniversaire", durationSeconds: 12 },
  { id: "v-pilote-2", title: null, durationSeconds: 12 },
];

function withPilotVideos(content: MemorialContent): MemorialContent {
  const a15 = commitA15(content, { condolences: true, stories: true, photos: true });
  const base = a15.ok ? a15.content : content;
  const a16 = commitA16(base, PILOT_VIDEOS);
  return a16.ok ? a16.content : base;
}

/**
 * Pilote de la Preview du Builder (développement seulement) : la même
 * assemblée que `loadMemorialPreviewAction`, sur le jeu de données
 * déterministe de l'Atelier fondateur au lieu d'un brouillon Supabase.
 * Ne lit ni n'écrit rien en base.
 *
 * `hidden` : rubriques masquées appliquées au jeu de données par la vraie
 * règle `setSectionVisibility` — contrôle de fidélité de la Preview, pas
 * une sauvegarde (la persistance réelle est `saveSectionVisibilityAction`).
 */
export async function loadPreviewPilotAction(
  skinVariant: SkinVariant,
  language: Language,
  hidden: readonly string[] = [],
  videos = false,
): Promise<MemorialPreviewResult> {
  if (process.env.NODE_ENV === "production") return { status: "unavailable" };
  let content: MemorialContent = buildFounderAtelierContent();
  if (videos) content = withPilotVideos(content);
  for (const id of hidden) {
    if (!(SECTION_IDS as readonly string[]).includes(id)) continue;
    const next = setSectionVisibility(content, id as SectionId, false, "intemporel");
    if (next.ok) content = next.content;
  }
  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant, language, content },
    { resolveMedia: resolveFounderAtelierMedia },
  );
  return assembled.status === "assembled" ? { status: "ready", assembled } : { status: "unavailable" };
}

/**
 * VID-08 — l'hôte vidéo du pilote : les deux souvenirs « hébergés », lus
 * depuis un flux HLS LOCAL de test (`hlsBase`, par exemple un serveur
 * statique sur localhost). Aucun appel à Mux : ce n'est pas une validation
 * sur Mux, seulement du lecteur et de l'aperçu.
 */
export async function loadVideoHostingPilotAction(hlsBase: string): Promise<VideoHostingLoad> {
  if (process.env.NODE_ENV === "production") return { status: "unavailable" };
  const base = new URL(hlsBase);
  if (base.hostname !== "localhost" && base.hostname !== "127.0.0.1") return { status: "unavailable" };
  const expiresAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
  return {
    status: "available",
    videos: PILOT_VIDEOS.map((video, index) => ({
      videoId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      draftVideoId: video.id,
      state: "ready" as const,
      durationSeconds: video.durationSeconds,
      durationVerified: true,
      failure: null,
      uploadExpiresAt: null,
      playback: {
        hlsUrl: new URL(`souvenir-${index + 1}/index.m3u8`, base).toString(),
        posterUrl: new URL(`souvenir-${index + 1}/poster.jpg`, base).toString(),
        mp4Url: null,
        expiresAt,
      },
    })),
  };
}
