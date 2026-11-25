import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { createSupabaseHostedVideoRepository } from "./hosted-video-repository";
import { createHostedVideoService, type HostedVideoService } from "./hosted-video-service";
import { createMuxApi } from "./mux-api";
import { readMuxHostingConfig, type MuxHostingConfig } from "./mux-config";

/**
 * SERVER ONLY. VID-07 — l'unique point où l'hébergement vidéo est assemblé
 * à partir de la configuration : client service_role, dépôt RPC, API Mux.
 * `null` tant que l'hébergement n'est pas configuré ET activé : chaque
 * appelant retombe alors sur la préparation locale de VID-06.
 *
 * Décision PO en attente : MP4 720p de secours (`HERITAGE_VIDEO_MP4_FALLBACK`).
 */
export interface VideoHostingRuntime {
  config: MuxHostingConfig;
  service: HostedVideoService;
}

export function videoHostingRuntime(env: Readonly<Record<string, string | undefined>> = process.env): VideoHostingRuntime | null {
  const read = readMuxHostingConfig(env);
  if (read.status !== "configured") return null;
  const { config } = read;
  const service = createHostedVideoService({
    repository: createSupabaseHostedVideoRepository(createServiceRoleSupabaseClient()),
    mux: createMuxApi({ tokenId: config.apiTokenId, tokenSecret: config.apiTokenSecret }),
    playbackKey: { keyId: config.signingKeyId, privateKeyPem: config.signingPrivateKeyPem },
    corsOrigin: config.corsOrigin,
    mp4Fallback: env.HERITAGE_VIDEO_MP4_FALLBACK === "enabled",
    now: Date.now,
  });
  return { config, service };
}

/** L'hébergement est-il configuré et activé ? (aucune valeur n'est lue au-delà des noms) */
export function isVideoHostingConfigured(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return readMuxHostingConfig(env).status === "configured";
}
