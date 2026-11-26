import { createSign } from "node:crypto";

/**
 * SERVER ONLY. VID-07 — lecture signée Mux.
 *
 * Documentation Mux actuelle (« Secure video playback », « Control playback
 * resolution ») : un JWT RS256 signé avec la clé de lecture de
 * l'environnement, revendications `sub` (identifiant de lecture), `aud`
 * (`v` vidéo, `t` vignette), `exp`, `kid` ; avec une lecture signée, les
 * modificateurs (ici `max_resolution: "720p"`) DOIVENT être dans le jeton.
 *
 * Un identifiant de lecture seul ne donne donc accès à rien. Les jetons sont
 * de courte durée ; les révoquer revient à supprimer l'asset (ou son
 * identifiant de lecture) chez Mux, ou à ne plus en émettre.
 */

export const VIDEO_PLAYBACK_MAX_RESOLUTION = "720p";

export interface SignedPlaybackKey {
  keyId: string;
  privateKeyPem: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/u, "").replace(/\+/gu, "-").replace(/\//gu, "_");
}

export function signMuxPlaybackToken(input: {
  key: SignedPlaybackKey;
  playbackId: string;
  audience: "v" | "t";
  expiresAtSeconds: number;
  claims?: Readonly<Record<string, string | number>>;
}): string {
  const header = { alg: "RS256", typ: "JWT", kid: input.key.keyId };
  const payload = { sub: input.playbackId, aud: input.audience, exp: input.expiresAtSeconds, kid: input.key.keyId, ...input.claims };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(input.key.privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

export interface SignedVideoPlayback {
  /** HLS plafonné à 720p par le jeton. */
  hlsUrl: string;
  /** Vignette de la vidéo (affiche du lecteur). */
  posterUrl: string;
  /** MP4 720p, seulement si l'asset en possède un (`static_renditions`). */
  mp4Url: string | null;
  expiresAt: string;
}

/**
 * Adresses de lecture signées d'une vidéo prête. La validité couvre la durée
 * de la vidéo plus une marge (exigence Mux : un jeton expiré interrompt la
 * lecture), avec un minimum de deux heures.
 */
export function signedVideoPlayback(input: {
  key: SignedPlaybackKey;
  playbackId: string;
  durationMs: number;
  nowMs: number;
  mp4Available: boolean;
}): SignedVideoPlayback {
  const lifetimeSeconds = Math.max(2 * 3600, Math.ceil(input.durationMs / 1000) + 3600);
  const exp = Math.floor(input.nowMs / 1000) + lifetimeSeconds;
  const video = signMuxPlaybackToken({
    key: input.key,
    playbackId: input.playbackId,
    audience: "v",
    expiresAtSeconds: exp,
    claims: { max_resolution: VIDEO_PLAYBACK_MAX_RESOLUTION },
  });
  const thumbnail = signMuxPlaybackToken({ key: input.key, playbackId: input.playbackId, audience: "t", expiresAtSeconds: exp, claims: { width: 1280 } });
  const id = encodeURIComponent(input.playbackId);
  return {
    hlsUrl: `https://stream.mux.com/${id}.m3u8?token=${video}`,
    posterUrl: `https://image.mux.com/${id}/thumbnail.webp?token=${thumbnail}`,
    mp4Url: input.mp4Available
      ? `https://stream.mux.com/${id}/720p.mp4?token=${signMuxPlaybackToken({ key: input.key, playbackId: input.playbackId, audience: "v", expiresAtSeconds: exp })}`
      : null,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}
