import type { SupabaseClient } from "@supabase/supabase-js";
import { signedVideoPlayback, type SignedPlaybackKey, type SignedVideoPlayback } from "./mux-playback";

/**
 * SERVER ONLY. VID-07 — lecture PUBLIQUE des vidéos d'un hommage, préparée
 * pour le lot de publication (NON branchée à la page publique : la rubrique
 * vidéo n'a pas encore de rendu public, et l'ordre des rubriques attend sa
 * décision QG).
 *
 * La base ne rend une vidéo que si l'hommage est PUBLIÉ, en offre COMPLÈTE,
 * publiquement visible, et si la vidéo est dans la copie publiée
 * (read_public_memorial_videos_v1). Chaque adresse est signée, plafonnée à
 * 720p et de courte durée. Une vidéo non publiée n'a aucune adresse.
 */

export interface PublicMemorialVideo {
  draftVideoId: string;
  durationSeconds: number;
  playback: SignedVideoPlayback;
}

export async function readPublicMemorialVideos(input: {
  client: SupabaseClient;
  slug: string;
  key: SignedPlaybackKey;
  nowMs: number;
  mp4Available: boolean;
}): Promise<PublicMemorialVideo[]> {
  const { data, error } = await input.client.rpc("read_public_memorial_videos_v1", { p_slug: input.slug });
  if (error) throw new Error("Public video read failed.");
  const rows = Array.isArray(data) ? (data as { draft_video_id: unknown; playback_id: unknown; verified_duration_ms: unknown }[]) : [];
  return rows.flatMap((row) => {
    if (typeof row.draft_video_id !== "string" || typeof row.playback_id !== "string") return [];
    const durationMs = Number(row.verified_duration_ms);
    if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
    return [{
      draftVideoId: row.draft_video_id,
      durationSeconds: durationMs / 1000,
      playback: signedVideoPlayback({ key: input.key, playbackId: row.playback_id, durationMs, nowMs: input.nowMs, mp4Available: input.mp4Available }),
    }];
  });
}
