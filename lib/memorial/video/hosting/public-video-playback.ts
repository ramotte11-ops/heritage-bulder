import type { SupabaseClient } from "@supabase/supabase-js";
import { signedVideoPlayback, type SignedPlaybackKey, type SignedVideoPlayback } from "./mux-playback";
import { readMuxHostingConfig } from "./mux-config";
import type { PublicVideoPlaybackMap } from "../video-section";

/**
 * SERVER ONLY. VID-07 — lecture PUBLIQUE des vidéos d'un hommage.
 * VID-08 — branchée à la page publique `/hommage/[slug]`.
 *
 * La base ne rend une vidéo que si l'hommage est PUBLIÉ, en offre COMPLÈTE,
 * publiquement visible, si la vidéo est dans la copie publiée ET si sa
 * version était déjà prête au moment de cette publication
 * (read_public_memorial_videos_v1, règle VID-08) : une vidéo devenue prête
 * plus tard n'est jamais publiée d'elle-même. Chaque adresse est signée,
 * plafonnée à 720p et de courte durée. Une vidéo non publiée n'a aucune
 * adresse.
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

/**
 * VID-08 — les lectures signées d'UNE visite de la page publique, par
 * identifiant de vidéo. Hébergement non configuré, erreur de lecture : aucune
 * vidéo (la rubrique n'est pas dessinée), sans détail dans les journaux.
 */
export async function loadPublicVideoPlayback(input: {
  slug: string;
  client: SupabaseClient;
  env?: Readonly<Record<string, string | undefined>>;
  nowMs?: number;
}): Promise<PublicVideoPlaybackMap> {
  const env = input.env ?? process.env;
  const config = readMuxHostingConfig(env);
  if (config.status !== "configured") return {};
  try {
    const videos = await readPublicMemorialVideos({
      client: input.client,
      slug: input.slug,
      key: { keyId: config.config.signingKeyId, privateKeyPem: config.config.signingPrivateKeyPem },
      nowMs: input.nowMs ?? Date.now(),
      mp4Available: env.HERITAGE_VIDEO_MP4_FALLBACK === "enabled",
    });
    return Object.fromEntries(videos.map((video) => [video.draftVideoId, { ...video.playback, durationSeconds: video.durationSeconds }]));
  } catch {
    console.error("Video: public read unavailable");
    return {};
  }
}
