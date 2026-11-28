import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublicMemorialVideos } from "./public-video-playback";

/** VID-07 — lecture publique : seulement ce que la base autorise, toujours signé. */

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const VIDEO = { draft_video_id: "v-a", playback_id: "pb-a", verified_duration_ms: 12_000 };
const key = { keyId: "k", privateKeyPem: pem };
const deadline = Date.parse("2036-11-28T12:00:00.123Z");
const client = (data: unknown, error: unknown = null, term: unknown = [{ complete_until: null }]) => ({
  rpc: vi.fn(async (name: string) => name === "read_public_media_term_v1" ? { data: term, error: null } : { data, error }),
}) as unknown as SupabaseClient;

describe("VID-07 — lecture publique signée", () => {
  it("hommage publié en offre complète, vidéo dans la copie publiée : adresse signée 720p", async () => {
    const c = client([VIDEO]);
    const videos = await readPublicMemorialVideos({ client: c, slug: "elise", key, now: () => 0, mp4Available: false });
    expect(c.rpc).toHaveBeenCalledWith("read_public_memorial_videos_v1", { p_slug: "elise" });
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ draftVideoId: "v-a", durationSeconds: 12 });
    expect(videos[0]!.playback.hlsUrl).toMatch(/^https:\/\/stream\.mux\.com\/pb-a\.m3u8\?token=/);
    expect(videos[0]!.playback.expiresAt).toBe(new Date(7_200_000).toISOString());
  });

  it("rien d'autorisé (offre gratuite, non publié, absent de la copie) : aucune adresse", async () => {
    await expect(readPublicMemorialVideos({ client: client([]), slug: "x", key, now: () => 0, mp4Available: false })).resolves.toEqual([]);
  });

  it("ligne incomplète ignorée ; erreur de base sans détail", async () => {
    await expect(readPublicMemorialVideos({ client: client([{ ...VIDEO, playback_id: null }]), slug: "x", key, now: () => 0, mp4Available: false })).resolves.toEqual([]);
    await expect(readPublicMemorialVideos({ client: client(null, { message: "secret detail" }), slug: "x", key, now: () => 0, mp4Available: false })).rejects.toThrow("Public video read failed.");
  });

  it("bounds the HLS, poster and MP4 JWTs to the last whole second before the contract deadline", async () => {
    const c = client([VIDEO], null, [{ complete_until: new Date(deadline).toISOString() }]);
    const [video] = await readPublicMemorialVideos({ client: c, slug: "x", key, now: () => deadline - 1000, mp4Available: true });
    expect(c.rpc).toHaveBeenLastCalledWith("read_public_media_term_v1", { p_slug: "x" });
    const { hlsUrl, posterUrl, mp4Url, expiresAt } = video.playback;
    const expiry = Math.floor(deadline / 1000);
    for (const url of [hlsUrl, posterUrl, mp4Url!]) {
      const payload = new URL(url).searchParams.get("token")!.split(".")[1];
      expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toMatchObject({ exp: expiry });
    }
    // A fresh HLS segment request at the cutoff cannot use a still-valid JWT.
    expect(Date.parse(expiresAt)).toBe(expiry * 1000);
    expect(Date.parse(expiresAt)).toBeLessThan(deadline);
  });

  it.each([-1, 0, 1])("returns no playback when the current time is %i ms from the deadline", async (offset) => {
    const c = client([VIDEO], null, [{ complete_until: new Date(deadline).toISOString() }]);
    await expect(readPublicMemorialVideos({ client: c, slug: "x", key, now: () => deadline + offset, mp4Available: true })).resolves.toEqual([]);
  });

  it("refuses a stale candidate when its fresh database authorization is empty", async () => {
    const c = client([VIDEO], null, []);
    await expect(readPublicMemorialVideos({ client: c, slug: "x", key, now: () => 0, mp4Available: true })).resolves.toEqual([]);
  });
});
