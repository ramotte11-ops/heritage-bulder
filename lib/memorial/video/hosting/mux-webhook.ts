import { createHmac, timingSafeEqual } from "node:crypto";
import { muxAssetDurationMs, muxSignedPlaybackId } from "./mux-api";

/**
 * SERVER ONLY. VID-07 — notifications Mux : vérification cryptographique et
 * lecture défensive.
 *
 * Signature (documentation Mux actuelle, « Verify webhook signatures ») :
 * en-tête `mux-signature: t=<horodatage>,v1=<HMAC-SHA256 hex>` calculé sur
 * `<horodatage>.<corps brut>` avec le secret du point de notification ;
 * tolérance de 5 minutes. Toute requête non conforme est rejetée AVANT
 * d'être lue. La comparaison est en temps constant.
 */

export type MuxSignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

export const MUX_WEBHOOK_TOLERANCE_SECONDS = 300;

export function verifyMuxSignature(input: {
  rawBody: string;
  header: string | null;
  secret: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): MuxSignatureCheck {
  if (input.header === null || input.header === "") return { ok: false, reason: "missing" };
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of input.header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value !== undefined) timestamp = value;
    else if (key === "v1" && value !== undefined) signatures.push(value);
  }
  if (timestamp === null || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return { ok: false, reason: "malformed" };
  const age = Math.abs(input.nowSeconds - Number(timestamp));
  if (age > (input.toleranceSeconds ?? MUX_WEBHOOK_TOLERANCE_SECONDS)) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", input.secret).update(`${timestamp}.${input.rawBody}`).digest();
  for (const candidate of signatures) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    const received = Buffer.from(candidate, "hex");
    if (received.length === expected.length && timingSafeEqual(received, expected)) return { ok: true };
  }
  return { ok: false, reason: "mismatch" };
}

export type HostedVideoEventType =
  | "upload_asset_created"
  | "upload_cancelled"
  | "upload_errored"
  | "upload_expired"
  | "asset_ready"
  | "asset_errored"
  | "asset_deleted";

/** Une notification utile, prête pour `apply_memorial_video_event_v1`. */
export interface HostedVideoEventInput {
  eventId: string;
  type: HostedVideoEventType;
  /** `passthrough` de l'asset : identifiant `memorial_videos` (UUID), sinon null. */
  videoId: string | null;
  uploadId: string | null;
  assetId: string | null;
  playbackId: string | null;
  durationMs: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUX_ID = /^[A-Za-z0-9_-]{1,200}$/;

const id = (value: unknown): string | null => (typeof value === "string" && MUX_ID.test(value) ? value : null);
const passthrough = (value: unknown): string | null => (typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null);

/**
 * Corps JSON d'une notification → événement utile, ou `null` (type ignoré,
 * forme inattendue). Seuls les types utiles à HERITAGE sont retenus.
 */
export function parseMuxEvent(body: unknown): HostedVideoEventInput | null {
  if (typeof body !== "object" || body === null) return null;
  const event = body as { id?: unknown; type?: unknown; data?: unknown };
  const eventId = typeof event.id === "string" && event.id.length > 0 && event.id.length <= 200 ? event.id : null;
  if (eventId === null || typeof event.type !== "string" || typeof event.data !== "object" || event.data === null) return null;
  const data = event.data as Record<string, unknown>;
  const settings = (data.new_asset_settings ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "video.upload.asset_created":
      return { eventId, type: "upload_asset_created", videoId: passthrough(settings.passthrough), uploadId: id(data.id), assetId: id(data.asset_id), playbackId: null, durationMs: null };
    case "video.upload.cancelled":
      return { eventId, type: "upload_cancelled", videoId: passthrough(settings.passthrough), uploadId: id(data.id), assetId: null, playbackId: null, durationMs: null };
    case "video.upload.errored":
      return { eventId, type: "upload_errored", videoId: passthrough(settings.passthrough), uploadId: id(data.id), assetId: null, playbackId: null, durationMs: null };
    case "video.asset.ready":
      return {
        eventId,
        type: "asset_ready",
        videoId: passthrough(data.passthrough),
        uploadId: id(data.upload_id),
        assetId: id(data.id),
        playbackId: muxSignedPlaybackId(data),
        durationMs: muxAssetDurationMs(data),
      };
    case "video.asset.errored":
      return { eventId, type: "asset_errored", videoId: passthrough(data.passthrough), uploadId: id(data.upload_id), assetId: id(data.id), playbackId: null, durationMs: null };
    case "video.asset.deleted":
      return { eventId, type: "asset_deleted", videoId: passthrough(data.passthrough), uploadId: id(data.upload_id), assetId: id(data.id), playbackId: null, durationMs: null };
    default:
      return null;
  }
}
