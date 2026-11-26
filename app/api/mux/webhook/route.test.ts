import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** VID-07 — le point de notification Mux : signature d'abord, puis base idempotente. */

const { videoNotificationRuntime, handleEvent } = vi.hoisted(() => ({ videoNotificationRuntime: vi.fn(), handleEvent: vi.fn() }));
vi.mock("@/lib/memorial/video/hosting/hosting-runtime", () => ({ videoNotificationRuntime }));

const { POST } = await import("./route");

const SECRET = "whsec_route_test";
const VIDEO = "0b7a2c3e-1f2a-4b5c-8d9e-0123456789ab";
const BODY = JSON.stringify({
  id: "evt-1",
  type: "video.asset.ready",
  data: { id: "as-1", passthrough: VIDEO, duration: 12, playback_ids: [{ id: "pb", policy: "signed" }] },
});
const signature = (body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const post = (body: string, header?: string) =>
  POST(new Request("https://heritage.example/api/mux/webhook", { method: "POST", body, headers: header === undefined ? {} : { "mux-signature": header } }));

beforeEach(() => {
  vi.clearAllMocks();
  videoNotificationRuntime.mockReturnValue({ config: { webhookSecret: SECRET }, service: { handleEvent } });
  handleEvent.mockResolvedValue({ outcome: "accepted" });
});

describe("VID-07 — POST /api/mux/webhook", () => {
  it("hébergement non configuré : 503, rien n'est lu", async () => {
    videoNotificationRuntime.mockReturnValue(null);
    expect((await post(BODY, signature(BODY))).status).toBe(503);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it("non signé, mal signé, ou corps modifié : 401, aucun traitement, aucun détail", async () => {
    for (const response of [await post(BODY), await post(BODY, "t=1,v1=00"), await post(BODY, signature(BODY, "other")), await post(BODY.replace("as-1", "as-2"), signature(BODY))]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false });
    }
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it("signature trop ancienne (rejeu) : 401", async () => {
    expect((await post(BODY, signature(BODY, SECRET, Math.floor(Date.now() / 1000) - 3600))).status).toBe(401);
  });

  it("authentique : l'événement lu est transmis une fois ; réponse 200 sans donnée", async () => {
    const response = await post(BODY, signature(BODY));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt-1", type: "asset_ready", videoId: VIDEO, assetId: "as-1", playbackId: "pb", durationMs: 12000 }));
  });

  it("livré deux fois : chaque livraison est transmise ; l'idempotence est celle de la base (duplicate)", async () => {
    handleEvent.mockResolvedValueOnce({ outcome: "accepted" }).mockResolvedValueOnce({ outcome: "duplicate" });
    expect((await post(BODY, signature(BODY))).status).toBe(200);
    expect((await post(BODY, signature(BODY))).status).toBe(200);
    expect(handleEvent).toHaveBeenCalledTimes(2);
  });

  it("type non utile ou JSON invalide (mais signé) : 200, ignoré", async () => {
    const other = JSON.stringify({ id: "e", type: "video.asset.track.ready", data: {} });
    expect((await post(other, signature(other))).status).toBe(200);
    expect((await post("{not json", signature("{not json"))).status).toBe(200);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it("base indisponible : 500 (Mux réessaiera)", async () => {
    handleEvent.mockRejectedValue(new Error("db down"));
    const response = await post(BODY, signature(BODY));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });

  it("corps trop volumineux : 413", async () => {
    const big = "x".repeat(1_000_001);
    expect((await post(big, signature(big))).status).toBe(413);
  });
});
