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

/**
 * VID-12 — diagnostic de recette, sans aucune valeur : quand l'hébergement est
 * DEMANDÉ (`enabled`) mais que la configuration est incomplète ou illisible,
 * les NOMS en cause sont journalisés une fois par instance (journaux des
 * fonctions Netlify). Sans cela, une clé mal collée retomberait en silence sur
 * la préparation locale, indiscernable d'un hébergement désactivé.
 */
let reportedIncomplete: string | null = null;

export function reportIncompleteVideoHosting(missing: readonly string[], log: (line: string) => void = console.warn): void {
  const key = [...missing].sort().join(",");
  if (reportedIncomplete === key) return;
  reportedIncomplete = key;
  log(JSON.stringify({ event: "video_hosting_config_incomplete", missing: [...missing].sort() }));
}

export function resetVideoHostingReportForTests(): void {
  reportedIncomplete = null;
}

export function videoHostingRuntime(env: Readonly<Record<string, string | undefined>> = process.env): VideoHostingRuntime | null {
  const read = readMuxHostingConfig(env);
  if (read.status === "incomplete") reportIncompleteVideoHosting(read.missing);
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

/**
 * VID-11 — la chaîne de NOTIFICATIONS Mux seule (route /api/mux/webhook).
 *
 * Identique à `videoHostingRuntime` quand l'hébergement est activé pour les
 * familles. Sinon, un interrupteur distinct et explicite,
 * `HERITAGE_VIDEO_NOTIFICATIONS=enabled`, permet de vérifier et de traiter
 * les notifications signées (avec la même configuration complète) AVANT de
 * mettre la vidéo à la disposition des familles : A16 et la page publique
 * restent fermés, car eux ne lisent que `videoHostingRuntime`.
 * Sans l'un ni l'autre interrupteur : `null` (la route répond 503).
 */
export function videoNotificationRuntime(env: Readonly<Record<string, string | undefined>> = process.env): VideoHostingRuntime | null {
  const hosting = videoHostingRuntime(env);
  if (hosting !== null) return hosting;
  if (env.HERITAGE_VIDEO_NOTIFICATIONS !== "enabled") return null;
  return videoHostingRuntime({ ...env, HERITAGE_VIDEO_HOSTING: "enabled" });
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
  // VID-10 — jeton Mux dédié, de basse priorité (recommandé) : la réconciliation
  // ne peut alors jamais consommer le débit des familles. Rythme d'un appel par
  // 1,1 s, sous la limite de 1 requête/s de ce type de jeton.
  const dedicated = Boolean(env.MUX_RECONCILE_TOKEN_ID && env.MUX_RECONCILE_TOKEN_SECRET);
  const effective = dedicated ? { ...env, MUX_TOKEN_ID: env.MUX_RECONCILE_TOKEN_ID, MUX_TOKEN_SECRET: env.MUX_RECONCILE_TOKEN_SECRET } : env;
  const read = readMuxHostingConfig(effective);
  if (read.status !== "configured") return { status: "disabled" };
  const runtime = videoHostingRuntime(effective);
  if (runtime === null) return { status: "disabled" };
  const repository = createSupabaseHostedVideoRepository(createServiceRoleSupabaseClient());
  const summary = await runGlobalVideoReconcile(
    {
      repository,
      reconcileOne: runtime.service.reconcileOne,
      releaseSuperseded: () => runtime.service.releaseSuperseded(null, 50),
      now: Date.now,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      newHolder: () => crypto.randomUUID(),
      log: (event) => console.info(JSON.stringify(event)),
    },
    dedicated ? { muxIntervalMs: 1100 } : {},
  );
  return { status: "ran", summary };
}
