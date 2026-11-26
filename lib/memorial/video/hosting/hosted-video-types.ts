/**
 * VID-07 — ce que voit la famille d'une vidéo hébergée. Types seulement :
 * importable par le navigateur (formulaire A16) sans tirer le moindre code
 * serveur. Aucun identifiant Mux interne (envoi, asset) n'y figure ; une
 * lecture signée n'existe que pour une vidéo prête de SA famille.
 */

export interface SignedVideoPlaybackView {
  hlsUrl: string;
  posterUrl: string;
  mp4Url: string | null;
  expiresAt: string;
}

/** Ce que voit la famille d'une vidéo hébergée (sans détail technique Mux). */
/**
 * `replaced` (VID-09) : ancienne version d'une vidéo publiée, encore servie
 * aux visiteurs jusqu'à la prochaine publication ; la famille voit et
 * prévisualise la nouvelle.
 */
export type HostedVideoState = "pending" | "uploading" | "processing" | "ready" | "replaced" | "failed" | "removing";

export interface HostedVideoView {
  videoId: string;
  draftVideoId: string;
  state: HostedVideoState;
  /** Durée vérifiée par l'hébergeur ; sinon la durée annoncée ; sinon null. */
  durationSeconds: number | null;
  durationVerified: boolean;
  failure: "over_total_duration" | "too_many_videos" | "duration_unavailable" | "upload_expired" | "upload_failed" | "upload_cancelled" | "asset_errored" | "hosting_unavailable" | null;
  uploadExpiresAt: string | null;
  /** Lecture du propriétaire : seulement pour une vidéo prête. */
  playback: SignedVideoPlaybackView | null;
}


/** Ouverture de l'étape A16 : hébergement indisponible (préparation locale) ou vidéos de la famille. */
export type VideoHostingLoad = { status: "unavailable" } | { status: "available"; videos: HostedVideoView[] };

export type VideoUploadRefusalReason = "too_many" | "duration" | "unknown_pending" | "in_progress" | "offer" | "other";

export type VideoUploadRequestResult =
  | { status: "granted"; videoId: string; uploadUrl: string; expiresAt: string }
  | { status: "refused"; reason: VideoUploadRefusalReason }
  | { status: "unavailable" };

/**
 * Les actions serveur liées à l'hommage AUTORISÉ, telles que le formulaire
 * A16 les reçoit (route du Builder). Absentes : parcours invité, préparation
 * locale seulement.
 */
export interface VideoHostingActions {
  load(): Promise<VideoHostingLoad>;
  request(draftVideoId: string, declaredDurationSeconds: number | null): Promise<VideoUploadRequestResult>;
  cancel(videoId: string): Promise<{ status: "cancelled" | "ignored" | "unavailable" }>;
  remove(draftVideoId: string): Promise<{ status: "removed" | "pending_cleanup" | "unavailable" }>;
}
