import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublicMemorialVideos } from "./public-video-playback";

/** VID-07 — lecture publique : seulement ce que la base autorise, toujours signé. */

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const client = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as unknown as SupabaseClient;

describe("VID-07 — lecture publique signée", () => {
  it("hommage publié en offre complète, vidéo dans la copie publiée : adresse signée 720p", async () => {
    const c = client([{ draft_video_id: "v-a", playback_id: "pb-a", verified_duration_ms: 12000 }]);
    const videos = await readPublicMemorialVideos({ client: c, slug: "elise", key: { keyId: "k", privateKeyPem: pem }, nowMs: 0, mp4Available: false });
    expect(c.rpc).toHaveBeenCalledWith("read_public_memorial_videos_v1", { p_slug: "elise" });
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ draftVideoId: "v-a", durationSeconds: 12 });
    expect(videos[0]!.playback.hlsUrl).toMatch(/^https:\/\/stream\.mux\.com\/pb-a\.m3u8\?token=/);
  });

  it("rien d'autorisé (offre gratuite, non publié, absent de la copie) : aucune adresse", async () => {
    await expect(readPublicMemorialVideos({ client: client([]), slug: "x", key: { keyId: "k", privateKeyPem: pem }, nowMs: 0, mp4Available: false })).resolves.toEqual([]);
  });

  it("ligne incomplète ignorée ; erreur de base sans détail", async () => {
    await expect(readPublicMemorialVideos({ client: client([{ draft_video_id: "v", playback_id: null, verified_duration_ms: 1 }]), slug: "x", key: { keyId: "k", privateKeyPem: pem }, nowMs: 0, mp4Available: false })).resolves.toEqual([]);
    await expect(readPublicMemorialVideos({ client: client(null, { message: "secret detail" }), slug: "x", key: { keyId: "k", privateKeyPem: pem }, nowMs: 0, mp4Available: false })).rejects.toThrow("Public video read failed.");
  });
});
