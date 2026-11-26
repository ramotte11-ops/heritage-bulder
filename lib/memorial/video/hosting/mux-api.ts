import { countedHostedDurationSeconds } from "../video-hommage";

/**
 * SERVER ONLY. VID-07 — le client de l'API Mux Video, réduit à ce dont
 * HERITAGE a besoin. Aucune dépendance : `fetch` injectable (tests sans
 * compte Mux, sans réseau). Les identifiants d'API ne quittent jamais ce
 * module et n'apparaissent dans aucune erreur.
 *
 * Réglages des envois directs (documentation Mux actuelle, « Upload files
 * directly » et « Secure video playback ») :
 *  - `cors_origin` limité à l'origine du site ;
 *  - `new_asset_settings.passthrough` = identifiant de la ligne
 *    `memorial_videos` (rattachement sûr à l'hommage, même si les
 *    notifications arrivent dans le désordre) ;
 *  - `playback_policies: ["signed"]` : aucune lecture sans jeton ;
 *  - `video_quality: "basic"`, `max_resolution_tier: "1080p"` (décision O1 :
 *    Master conservé jusqu'en 1080p ; lecture plafonnée à 720p par le jeton).
 *  - Rendu MP4 720p (`static_renditions`) seulement si `mp4Fallback` est
 *    demandé : facturé en plus par Mux, il sert les navigateurs qui ne
 *    lisent pas le HLS nativement (décision PO en attente, voir rapport).
 */

const API = "https://api.mux.com";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class MuxApiError extends Error {
  constructor(
    readonly operation: string,
    readonly httpStatus: number | null,
  ) {
    super(`Mux ${operation} failed${httpStatus === null ? "" : ` (HTTP ${httpStatus})`}.`);
    this.name = "MuxApiError";
  }
}

export interface MuxDirectUpload {
  uploadId: string;
  url: string;
  /** Fin de validité de l'adresse d'envoi. */
  expiresAt: string;
}

export interface MuxUploadState {
  status: "waiting" | "asset_created" | "errored" | "cancelled" | "timed_out" | "unknown";
  assetId: string | null;
}

export interface MuxAssetState {
  status: "preparing" | "ready" | "errored" | "unknown";
  /** Durée retenue (`countedHostedDurationSeconds`), en millisecondes entières, arrondie vers le haut. */
  durationMs: number | null;
  signedPlaybackId: string | null;
}

export interface MuxApi {
  createDirectUpload(input: { videoId: string; corsOrigin: string; mp4Fallback: boolean }): Promise<MuxDirectUpload>;
  getUpload(uploadId: string): Promise<MuxUploadState>;
  cancelUpload(uploadId: string): Promise<void>;
  getAsset(assetId: string): Promise<MuxAssetState | null>;
  /** Supprime l'asset ; un asset déjà absent (404) est un succès. */
  deleteAsset(assetId: string): Promise<void>;
  /** VID-08 — une page de la liste des assets (nettoyage des orphelins, option). */
  listAssets(input: { page: number; limit: number }): Promise<MuxAssetSummary[]>;
}

export interface MuxAssetSummary {
  id: string;
  /** Création chez Mux, en millisecondes ; `null` si illisible. */
  createdAtMs: number | null;
}

/** Durée d'un asset Mux (objet `data` de l'API ou d'un webhook) → millisecondes retenues. */
export function muxAssetDurationMs(asset: unknown): number | null {
  if (typeof asset !== "object" || asset === null) return null;
  const a = asset as { duration?: unknown; tracks?: unknown };
  if (typeof a.duration !== "number" || !Number.isFinite(a.duration) || a.duration <= 0) return null;
  const video = Array.isArray(a.tracks)
    ? (a.tracks as { type?: unknown; duration?: unknown; max_frame_rate?: unknown }[]).find((t) => t?.type === "video")
    : undefined;
  const seconds = countedHostedDurationSeconds({
    assetDurationSeconds: a.duration,
    videoTrackDurationSeconds: typeof video?.duration === "number" ? video.duration : undefined,
    frameRate: typeof video?.max_frame_rate === "number" ? video.max_frame_rate : undefined,
  });
  return Math.ceil(seconds * 1000 - 1e-6);
}

/** Premier identifiant de lecture SIGNÉ d'un asset ; jamais un identifiant public. */
export function muxSignedPlaybackId(asset: unknown): string | null {
  if (typeof asset !== "object" || asset === null) return null;
  const ids = (asset as { playback_ids?: unknown }).playback_ids;
  if (!Array.isArray(ids)) return null;
  const signed = (ids as { id?: unknown; policy?: unknown }[]).find((p) => p?.policy === "signed" && typeof p.id === "string");
  return signed ? (signed.id as string) : null;
}

export function createMuxApi(options: { tokenId: string; tokenSecret: string; fetch?: FetchLike; now?: () => number }): MuxApi {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const authorization = `Basic ${Buffer.from(`${options.tokenId}:${options.tokenSecret}`).toString("base64")}`;

  async function call(operation: string, method: string, path: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${API}${path}`, {
        method,
        headers: { authorization, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new MuxApiError(operation, null);
    }
    return response;
  }

  async function data(operation: string, response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) throw new MuxApiError(operation, response.status);
    const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (json === null || typeof json.data !== "object" || json.data === null) throw new MuxApiError(operation, response.status);
    return json.data as Record<string, unknown>;
  }

  return {
    async createDirectUpload({ videoId, corsOrigin, mp4Fallback }) {
      const timeoutSeconds = 3600;
      const d = await data(
        "create_upload",
        await call("create_upload", "POST", "/video/v1/uploads", {
          cors_origin: corsOrigin,
          timeout: timeoutSeconds,
          new_asset_settings: {
            passthrough: videoId,
            playback_policies: ["signed"],
            video_quality: "basic",
            max_resolution_tier: "1080p",
            ...(mp4Fallback ? { static_renditions: [{ resolution: "720p" }] } : {}),
          },
        }),
      );
      if (typeof d.id !== "string" || typeof d.url !== "string") throw new MuxApiError("create_upload", null);
      const timeout = typeof d.timeout === "number" ? d.timeout : timeoutSeconds;
      return { uploadId: d.id, url: d.url, expiresAt: new Date(now() + timeout * 1000).toISOString() };
    },

    async getUpload(uploadId) {
      const d = await data("get_upload", await call("get_upload", "GET", `/video/v1/uploads/${encodeURIComponent(uploadId)}`));
      const status = d.status;
      const known = ["waiting", "asset_created", "errored", "cancelled", "timed_out"] as const;
      return {
        status: (known as readonly unknown[]).includes(status) ? (status as MuxUploadState["status"]) : "unknown",
        assetId: typeof d.asset_id === "string" ? d.asset_id : null,
      };
    },

    async cancelUpload(uploadId) {
      const response = await call("cancel_upload", "PUT", `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`);
      // Déjà terminé, annulé ou expiré : rien à annuler.
      if (!response.ok && response.status !== 404 && response.status !== 400 && response.status !== 409) {
        throw new MuxApiError("cancel_upload", response.status);
      }
    },

    async getAsset(assetId) {
      const response = await call("get_asset", "GET", `/video/v1/assets/${encodeURIComponent(assetId)}`);
      if (response.status === 404) return null;
      const d = await data("get_asset", response);
      const status = d.status === "ready" || d.status === "preparing" || d.status === "errored" ? d.status : "unknown";
      return { status, durationMs: muxAssetDurationMs(d), signedPlaybackId: muxSignedPlaybackId(d) };
    },

    async deleteAsset(assetId) {
      const response = await call("delete_asset", "DELETE", `/video/v1/assets/${encodeURIComponent(assetId)}`);
      if (!response.ok && response.status !== 404) throw new MuxApiError("delete_asset", response.status);
    },

    async listAssets({ page, limit }) {
      const safePage = Math.max(1, Math.floor(page));
      const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
      const response = await call("list_assets", "GET", `/video/v1/assets?limit=${safeLimit}&page=${safePage}`);
      if (!response.ok) throw new MuxApiError("list_assets", response.status);
      const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
      if (json === null || !Array.isArray(json.data)) throw new MuxApiError("list_assets", response.status);
      return json.data.flatMap((entry: unknown) => {
        if (typeof entry !== "object" || entry === null) return [];
        const { id, created_at: createdAt } = entry as { id?: unknown; created_at?: unknown };
        if (typeof id !== "string") return [];
        const seconds = typeof createdAt === "string" ? Number(createdAt) : typeof createdAt === "number" ? createdAt : Number.NaN;
        return [{ id, createdAtMs: Number.isFinite(seconds) ? seconds * 1000 : null }];
      });
    },
  };
}
