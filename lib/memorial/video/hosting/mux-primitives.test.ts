import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readMuxHostingConfig } from "./mux-config";
import { createMuxApi, muxAssetDurationMs, MuxApiError } from "./mux-api";
import { parseMuxEvent, verifyMuxSignature } from "./mux-webhook";
import { signMuxPlaybackToken, signedVideoPlayback } from "./mux-playback";

/**
 * VID-07 — primitives Mux, testées SANS compte ni réseau (doubles de
 * `fetch`, clés RSA générées pour le test). Aucune de ces vérifications ne
 * remplace un essai réel sur Mux.
 */

const SECRET = "whsec_test_only";
const sign = (body: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("VID-07 — signature des webhooks Mux", () => {
  const body = JSON.stringify({ id: "evt-1", type: "video.asset.ready", data: {} });
  const now = 1_800_000_000;

  it("signature valide dans la tolérance de 5 minutes", () => {
    expect(verifyMuxSignature({ rawBody: body, header: sign(body, now - 299), secret: SECRET, nowSeconds: now })).toEqual({ ok: true });
  });

  it.each([
    ["absente", null, "missing"],
    ["vide", "", "missing"],
    ["mal formée", "v1=abc", "malformed"],
    ["horodatage non numérique", "t=abc,v1=00", "malformed"],
  ] as const)("en-tête %s → refus", (_label, header, reason) => {
    expect(verifyMuxSignature({ rawBody: body, header, secret: SECRET, nowSeconds: now })).toEqual({ ok: false, reason });
  });

  it("trop ancienne (rejeu) → refus", () => {
    expect(verifyMuxSignature({ rawBody: body, header: sign(body, now - 301), secret: SECRET, nowSeconds: now })).toEqual({ ok: false, reason: "stale" });
  });

  it("autre secret, ou corps modifié d'un seul caractère → refus", () => {
    expect(verifyMuxSignature({ rawBody: body, header: sign(body, now, "other"), secret: SECRET, nowSeconds: now })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyMuxSignature({ rawBody: body.replace("evt-1", "evt-2"), header: sign(body, now), secret: SECRET, nowSeconds: now })).toEqual({ ok: false, reason: "mismatch" });
  });
});

describe("VID-07 — lecture des notifications Mux", () => {
  const VIDEO = "0b7a2c3e-1f2a-4b5c-8d9e-0123456789ab";

  it("asset prêt : passthrough, identifiant de lecture SIGNÉ seulement, durée retenue en ms", () => {
    const event = parseMuxEvent({
      id: "evt-r",
      type: "video.asset.ready",
      data: {
        id: "asset-1",
        passthrough: VIDEO,
        upload_id: "up-1",
        duration: 268.48,
        tracks: [{ type: "video", duration: 268.4, max_frame_rate: 25 }, { type: "audio", duration: 268.48 }],
        playback_ids: [{ id: "public-1", policy: "public" }, { id: "signed-1", policy: "signed" }],
      },
    });
    expect(event).toEqual({ eventId: "evt-r", type: "asset_ready", videoId: VIDEO, uploadId: "up-1", assetId: "asset-1", playbackId: "signed-1", durationMs: 268400 });
  });

  it("aucun identifiant de lecture signé → null (jamais un identifiant public)", () => {
    expect(parseMuxEvent({ id: "e", type: "video.asset.ready", data: { id: "a", passthrough: VIDEO, duration: 3, playback_ids: [{ id: "p", policy: "public" }] } })?.playbackId).toBeNull();
  });

  it("envoi : asset créé, annulé, en erreur ; passthrough non UUID → null", () => {
    expect(parseMuxEvent({ id: "e1", type: "video.upload.asset_created", data: { id: "up", asset_id: "as", new_asset_settings: { passthrough: VIDEO } } })).toMatchObject({ type: "upload_asset_created", videoId: VIDEO, uploadId: "up", assetId: "as" });
    expect(parseMuxEvent({ id: "e2", type: "video.upload.cancelled", data: { id: "up", new_asset_settings: { passthrough: "x' or 1=1" } } })).toMatchObject({ type: "upload_cancelled", videoId: null });
    expect(parseMuxEvent({ id: "e3", type: "video.upload.errored", data: { id: "up" } })?.type).toBe("upload_errored");
    expect(parseMuxEvent({ id: "e4", type: "video.asset.deleted", data: { id: "as" } })?.type).toBe("asset_deleted");
  });

  it("types inutiles, forme inattendue ou identifiant invalide → null", () => {
    expect(parseMuxEvent({ id: "e", type: "video.asset.static_rendition.ready", data: {} })).toBeNull();
    expect(parseMuxEvent({ type: "video.asset.ready", data: {} })).toBeNull();
    expect(parseMuxEvent(null)).toBeNull();
    expect(parseMuxEvent({ id: "e", type: "video.asset.ready", data: { id: "a b c" } })?.assetId).toBeNull();
  });

  it("durée : piste vidéo moins deux images quand l'audio déborde ; absente → null", () => {
    expect(muxAssetDurationMs({ duration: 600.08, tracks: [{ type: "video", duration: 600, max_frame_rate: 25 }] })).toBe(600000);
    expect(muxAssetDurationMs({ duration: 0 })).toBeNull();
    expect(muxAssetDurationMs({})).toBeNull();
  });
});

describe("VID-07 — lecture signée (JWT RS256)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const key = { keyId: "key-test", privateKeyPem: pem };
  const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

  it("jeton vérifiable avec la clé publique ; sub, aud, exp, kid ; plafond 720p dans le jeton", () => {
    const token = signMuxPlaybackToken({ key, playbackId: "pb-1", audience: "v", expiresAtSeconds: 2_000_000_000, claims: { max_resolution: "720p" } });
    const [h, p, s] = token.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, "base64url"))).toBe(true);
    expect(decode(h!)).toEqual({ alg: "RS256", typ: "JWT", kid: "key-test" });
    expect(decode(p!)).toEqual({ sub: "pb-1", aud: "v", exp: 2_000_000_000, kid: "key-test", max_resolution: "720p" });
  });

  it("adresses : HLS et vignette signées, durée de validité ≥ durée + 1 h, MP4 seulement si demandé", () => {
    const now = 1_800_000_000_000;
    const playback = signedVideoPlayback({ key, playbackId: "pb-1", durationMs: 600000, nowMs: now, mp4Available: false });
    expect(playback.hlsUrl).toMatch(/^https:\/\/stream\.mux\.com\/pb-1\.m3u8\?token=[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(playback.posterUrl).toMatch(/^https:\/\/image\.mux\.com\/pb-1\/thumbnail\.webp\?token=/);
    expect(playback.mp4Url).toBeNull();
    expect(Date.parse(playback.expiresAt) - now).toBe(2 * 3600 * 1000);
    const claims = decode(playback.hlsUrl.split("token=")[1]!.split(".")[1]!);
    expect(claims).toMatchObject({ aud: "v", max_resolution: "720p" });
    expect(signedVideoPlayback({ key, playbackId: "pb-1", durationMs: 3 * 3600 * 1000, nowMs: now, mp4Available: true }).mp4Url).toMatch(/\/pb-1\/720p\.mp4\?token=/);
  });

  it("aucun secret dans les adresses : seule la signature est publique", () => {
    const playback = signedVideoPlayback({ key, playbackId: "pb-1", durationMs: 1000, nowMs: 0, mp4Available: true });
    const all = JSON.stringify(playback);
    expect(all).not.toContain("PRIVATE KEY");
    expect(all).not.toContain(pem.split("\n")[1]!.slice(0, 20));
  });
});

describe("VID-07 — client de l'API Mux (doubles de fetch)", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("envoi direct : origine du site, passthrough, lecture signée, Master 1080p, aucun MP4 par défaut", async () => {
    const fetch = vi.fn(async () => json(201, { data: { id: "up-1", url: "https://storage.example/upload", timeout: 3600 } }));
    const api = createMuxApi({ tokenId: "id", tokenSecret: "secret", fetch, now: () => 0 });
    await expect(api.createDirectUpload({ videoId: "row-1", corsOrigin: "https://heritage.example", mp4Fallback: false })).resolves.toEqual({
      uploadId: "up-1",
      url: "https://storage.example/upload",
      expiresAt: new Date(3600 * 1000).toISOString(),
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mux.com/video/v1/uploads");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(JSON.parse(String(init.body))).toEqual({
      cors_origin: "https://heritage.example",
      timeout: 3600,
      new_asset_settings: { passthrough: "row-1", playback_policies: ["signed"], video_quality: "basic", max_resolution_tier: "1080p" },
    });
  });

  it("MP4 720p seulement sur demande explicite", async () => {
    const fetch = vi.fn(async () => json(201, { data: { id: "u", url: "https://x" } }));
    await createMuxApi({ tokenId: "i", tokenSecret: "s", fetch }).createDirectUpload({ videoId: "r", corsOrigin: "https://o", mp4Fallback: true });
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).new_asset_settings.static_renditions).toEqual([{ resolution: "720p" }]);
  });

  it("erreurs : aucune donnée sensible dans le message ; suppression d'un asset absent = succès", async () => {
    const api = createMuxApi({ tokenId: "id", tokenSecret: "very-secret-value", fetch: vi.fn(async () => json(401, { error: "unauthorized" })) });
    const error = await api.createDirectUpload({ videoId: "r", corsOrigin: "https://o", mp4Fallback: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MuxApiError);
    expect(String((error as Error).message)).not.toMatch(/very-secret-value|Basic/);
    await expect(createMuxApi({ tokenId: "i", tokenSecret: "s", fetch: vi.fn(async () => new Response(null, { status: 404 })) }).deleteAsset("a")).resolves.toBeUndefined();
    await expect(createMuxApi({ tokenId: "i", tokenSecret: "s", fetch: vi.fn(async () => { throw new TypeError("network"); }) }).getUpload("u")).rejects.toBeInstanceOf(MuxApiError);
  });

  it("asset : état, durée retenue et identifiant de lecture signé", async () => {
    const fetch = vi.fn(async () => json(200, { data: { status: "ready", duration: 12.04, tracks: [{ type: "video", duration: 12, max_frame_rate: 25 }], playback_ids: [{ id: "s", policy: "signed" }] } }));
    await expect(createMuxApi({ tokenId: "i", tokenSecret: "s", fetch }).getAsset("a")).resolves.toEqual({ status: "ready", durationMs: 12000, signedPlaybackId: "s" });
  });
});

describe("VID-07 — configuration", () => {
  const full = {
    HERITAGE_VIDEO_HOSTING: "enabled",
    MUX_TOKEN_ID: "id",
    MUX_TOKEN_SECRET: "secret",
    MUX_WEBHOOK_SECRET: "wh",
    MUX_SIGNING_KEY_ID: "kid",
    MUX_SIGNING_KEY_PRIVATE: Buffer.from("-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----").toString("base64"),
    NEXT_PUBLIC_SITE_URL: "https://heritage.example/path",
  };

  it("désactivé par défaut, même avec toutes les valeurs, sans l'interrupteur explicite", () => {
    expect(readMuxHostingConfig({})).toEqual({ status: "disabled" });
    expect(readMuxHostingConfig({ ...full, HERITAGE_VIDEO_HOSTING: "true" })).toEqual({ status: "disabled" });
  });

  it("incomplet : seuls les NOMS manquants sont rendus, jamais une valeur", () => {
    const read = readMuxHostingConfig({ ...full, MUX_WEBHOOK_SECRET: undefined, MUX_TOKEN_SECRET: "" });
    expect(read).toEqual({ status: "incomplete", missing: ["MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET"] });
    expect(JSON.stringify(read)).not.toContain("secret");
  });

  it("configuré : origine réduite au schéma et à l'hôte, clé décodée", () => {
    const read = readMuxHostingConfig(full);
    expect(read.status).toBe("configured");
    expect(read.status === "configured" && read.config.corsOrigin).toBe("https://heritage.example");
    expect(read.status === "configured" && read.config.signingPrivateKeyPem).toContain("BEGIN PRIVATE KEY");
  });
});
