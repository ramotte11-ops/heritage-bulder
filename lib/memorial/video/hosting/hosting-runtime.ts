import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { createSupabaseHostedVideoRepository } from "./hosted-video-repository";
import { createHostedVideoService, type HostedVideoService } from "./hosted-video-service";
import { createMuxApi } from "./mux-api";
import { readMuxHostingConfig, type MuxHostingConfig } from "./mux-config";
import { runGlobalVideoReconcile, type GlobalReconcileSummary } from "./global-reconcile";

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

/**
 * VID-08 — point d'entrée de la réconciliation GLOBALE, pour une future
 * fonction planifiée. INACTIF par défaut, à deux niveaux : il faut
 * l'hébergement configuré ET activé, puis `HERITAGE_VIDEO_RECONCILE=enabled`.
 * Aucune fonction Netlify ne l'appelle dans ce dépôt (mise en service : GO PO).
 */
export async function scheduledVideoReconcile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ status: "disabled" } | { status: "ran"; summary: GlobalReconcileSummary }> {
  if (env.HERITAGE_VIDEO_RECONCILE !== "enabled") return { status: "disabled" };
  const read = readMuxHostingConfig(env);
  if (read.status !== "configured") return { status: "disabled" };
  const repository = createSupabaseHostedVideoRepository(createServiceRoleSupabaseClient());
  const runtime = videoHostingRuntime(env);
  if (runtime === null) return { status: "disabled" };
  const summary = await runGlobalVideoReconcile({
    repository,
    reconcileOne: runtime.service.reconcileOne,
    now: Date.now,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    newHolder: () => crypto.randomUUID(),
    log: (event) => console.info(JSON.stringify(event)),
  });
  return { status: "ran", summary };
}
