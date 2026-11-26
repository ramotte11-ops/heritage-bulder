import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createHostedVideoService } from "./hosted-video-service";
import type { HostedVideoRepository, HostedVideoRow } from "./hosted-video-repository";
import type { MuxApi } from "./mux-api";

/**
 * VID-07 — orchestration, avec un dépôt et une API Mux SIMULÉS. Les règles de
 * capacité elles-mêmes sont prouvées en SQL (scripts/db/test-local.sh,
 * section VID-07) ; ici : l'ordre des opérations, le nettoyage chez Mux,
 * la réconciliation et l'absence de fausse réussite.
 */

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const NOW = Date.parse("2026-11-25T12:00:00.000Z");

function repo(overrides: Partial<HostedVideoRepository> = {}): HostedVideoRepository {
  return {
    reserve: vi.fn(async () => ({ outcome: "reserved" as const, videoId: "vid-1" })),
    attachUpload: vi.fn(async () => "attached" as const),
    failUpload: vi.fn(async () => {}),
    cancelUpload: vi.fn(async () => ({ outcome: "cancelled" as const, uploadId: "up-1" })),
    applyEvent: vi.fn(async () => ({ outcome: "applied" as const, videoId: "vid-1", assetToDelete: null, supersededAsset: null })),
    listForOwner: vi.fn(async () => []),
    listToReconcile: vi.fn(async () => []),
    requestRemoval: vi.fn(async () => ({ refused: false, rows: [] })),
    confirmDeleted: vi.fn(async () => {}),
    claimForReconcile: vi.fn(async () => []),
    finishReconcile: vi.fn(async () => {}),
    knownAssets: vi.fn(async () => new Set<string>()),
    releaseSuperseded: vi.fn(async () => []),
    ...overrides,
  };
}

function mux(overrides: Partial<MuxApi> = {}): MuxApi {
  return {
    createDirectUpload: vi.fn(async () => ({ uploadId: "up-1", url: "https://upload.example/up-1", expiresAt: "2026-11-25T13:00:00.000Z" })),
    getUpload: vi.fn(async () => ({ status: "waiting" as const, assetId: null })),
    cancelUpload: vi.fn(async () => {}),
    getAsset: vi.fn(async () => null),
    deleteAsset: vi.fn(async () => {}),
    listAssets: vi.fn(async () => []),
    ...overrides,
  };
}

function service(r = repo(), m = mux(), mp4Fallback = false) {
  return { r, m, s: createHostedVideoService({ repository: r, mux: m, playbackKey: { keyId: "k", privateKeyPem: pem }, corsOrigin: "https://heritage.example", mp4Fallback, now: () => NOW }) };
}

const row = (over: Partial<HostedVideoRow>): HostedVideoRow => ({
  videoId: "vid-1",
  draftVideoId: "v-a",
  status: "ready",
  declaredDurationMs: 100000,
  verifiedDurationMs: 100400,
  playbackId: "pb-1",
  uploadExpiresAt: null,
  failureReason: null,
  updatedAt: "2026-11-25T11:00:00.000Z",
  uploadId: "up-1",
  assetId: "as-1",
  ...over,
});

describe("VID-07 — demande d'envoi", () => {
  it("réservation sous verrou, PUIS adresse Mux (passthrough = ligne), PUIS rattachement ; durée annoncée en ms arrondies vers le haut", async () => {
    const { r, m, s } = service();
    await expect(s.requestUpload({ ownerId: "o", memorialId: "m", draftVideoId: "v-a", declaredDurationSeconds: 268.4001 })).resolves.toEqual({
      status: "granted",
      videoId: "vid-1",
      uploadUrl: "https://upload.example/up-1",
      expiresAt: "2026-11-25T13:00:00.000Z",
    });
    expect(r.reserve).toHaveBeenCalledWith({ ownerId: "o", memorialId: "m", draftVideoId: "v-a", declaredDurationMs: 268401 });
    expect(m.createDirectUpload).toHaveBeenCalledWith({ videoId: "vid-1", corsOrigin: "https://heritage.example", mp4Fallback: false });
    expect(r.attachUpload).toHaveBeenCalledWith({ videoId: "vid-1", uploadId: "up-1", expiresAt: "2026-11-25T13:00:00.000Z" });
  });

  it("durée inconnue transmise comme inconnue (jamais zéro)", async () => {
    const { r, s } = service();
    await s.requestUpload({ ownerId: "o", memorialId: "m", draftVideoId: "v-a", declaredDurationSeconds: null });
    expect(r.reserve).toHaveBeenCalledWith(expect.objectContaining({ declaredDurationMs: null }));
  });

  it.each(["refused_too_many", "refused_duration", "refused_offer", "refused", "refused_in_progress", "refused_unknown_pending"] as const)(
    "refus de la base (%s) : aucune adresse Mux n'est créée",
    async (outcome) => {
      const { m, s } = service(repo({ reserve: vi.fn(async () => ({ outcome, videoId: null })) }));
      await expect(s.requestUpload({ ownerId: "o", memorialId: "m", draftVideoId: "v-a", declaredDurationSeconds: 10 })).resolves.toEqual({ status: "refused", reason: outcome });
      expect(m.createDirectUpload).not.toHaveBeenCalled();
    },
  );

  it("Mux indisponible : la réservation est libérée, aucune fausse réussite", async () => {
    const { r, s } = service(repo(), mux({ createDirectUpload: vi.fn(async () => { throw new Error("down"); }) }));
    await expect(s.requestUpload({ ownerId: "o", memorialId: "m", draftVideoId: "v-a", declaredDurationSeconds: 10 })).resolves.toEqual({ status: "unavailable" });
    expect(r.failUpload).toHaveBeenCalledWith({ videoId: "vid-1", reason: "hosting_unavailable" });
  });

  it("rattachement refusé (course) : l'adresse Mux est annulée", async () => {
    const { m, s } = service(repo({ attachUpload: vi.fn(async () => "not_reserved" as const) }));
    await expect(s.requestUpload({ ownerId: "o", memorialId: "m", draftVideoId: "v-a", declaredDurationSeconds: 10 })).resolves.toEqual({ status: "unavailable" });
    expect(m.cancelUpload).toHaveBeenCalledWith("up-1");
  });
});

describe("VID-07 — notifications et nettoyage", () => {
  it("vidéo refusée (600 s dépassées une fois mesurée) : son asset est supprimé, puis la suppression confirmée", async () => {
    const { r, m, s } = service(repo({ applyEvent: vi.fn(async () => ({ outcome: "rejected" as const, videoId: "vid-2", assetToDelete: "as-2", supersededAsset: null })) }));
    await s.handleEvent({ eventId: "e", type: "asset_ready", videoId: "vid-2", uploadId: null, assetId: "as-2", playbackId: "pb", durationMs: 250000 });
    expect(m.deleteAsset).toHaveBeenCalledWith("as-2");
    expect(r.confirmDeleted).toHaveBeenCalledWith("vid-2");
  });

  it("remplacement accepté : l'ancienne vidéo est supprimée chez Mux seulement à ce moment", async () => {
    const { m, s } = service(repo({ applyEvent: vi.fn(async () => ({ outcome: "accepted" as const, videoId: "new", assetToDelete: null, supersededAsset: "as-old" })) }));
    await s.handleEvent({ eventId: "e", type: "asset_ready", videoId: "new", uploadId: null, assetId: "as-new", playbackId: "pb", durationMs: 1000 });
    expect(m.deleteAsset).toHaveBeenCalledTimes(1);
    expect(m.deleteAsset).toHaveBeenCalledWith("as-old");
  });

  it("événement rejoué (duplicate) : rien n'est supprimé deux fois", async () => {
    const { m, s } = service(repo({ applyEvent: vi.fn(async () => ({ outcome: "duplicate" as const, videoId: null, assetToDelete: null, supersededAsset: null })) }));
    await s.handleEvent({ eventId: "e", type: "asset_ready", videoId: "v", uploadId: null, assetId: "a", playbackId: "p", durationMs: 1 });
    expect(m.deleteAsset).not.toHaveBeenCalled();
  });

  it("suppression chez Mux en échec : rien n'est confirmé (la réconciliation reprendra)", async () => {
    const { r, s } = service(
      repo({ applyEvent: vi.fn(async () => ({ outcome: "rejected" as const, videoId: "v", assetToDelete: "a", supersededAsset: null })) }),
      mux({ deleteAsset: vi.fn(async () => { throw new Error("down"); }) }),
    );
    await s.handleEvent({ eventId: "e", type: "asset_ready", videoId: "v", uploadId: null, assetId: "a", playbackId: "p", durationMs: 1 });
    expect(r.confirmDeleted).not.toHaveBeenCalled();
  });
});

describe("VID-07 — retrait et annulation", () => {
  it("retrait : base d'abord, puis annulation de l'envoi ou suppression de l'asset, puis confirmation", async () => {
    const rows = [
      { videoId: "a", uploadId: "up-a", assetId: null, previousStatus: "uploading" as const },
      { videoId: "b", uploadId: "up-b", assetId: "as-b", previousStatus: "ready" as const },
    ];
    const { r, m, s } = service(repo({ requestRemoval: vi.fn(async () => ({ refused: false, rows })) }));
    await expect(s.removeVideo({ ownerId: "o", memorialId: "m", draftVideoId: "v-a" })).resolves.toBe("removed");
    expect(m.cancelUpload).toHaveBeenCalledWith("up-a");
    expect(m.deleteAsset).toHaveBeenCalledWith("as-b");
    expect(r.confirmDeleted).toHaveBeenCalledWith("a");
    expect(r.confirmDeleted).toHaveBeenCalledWith("b");
  });

  it("retrait : asset impossible à supprimer → pending_cleanup, non confirmé", async () => {
    const { r, s } = service(
      repo({ requestRemoval: vi.fn(async () => ({ refused: false, rows: [{ videoId: "b", uploadId: null, assetId: "as-b", previousStatus: "ready" as const }] })) }),
      mux({ deleteAsset: vi.fn(async () => { throw new Error("down"); }) }),
    );
    await expect(s.removeVideo({ ownerId: "o", memorialId: "m", draftVideoId: "v-a" })).resolves.toBe("pending_cleanup");
    expect(r.confirmDeleted).not.toHaveBeenCalled();
  });

  it("retrait refusé par la base (autre famille) : Mux n'est pas touché", async () => {
    const { m, s } = service(repo({ requestRemoval: vi.fn(async () => ({ refused: true, rows: [] })) }));
    await expect(s.removeVideo({ ownerId: "x", memorialId: "m", draftVideoId: "v-a" })).resolves.toBe("refused");
    expect(m.deleteAsset).not.toHaveBeenCalled();
    expect(m.cancelUpload).not.toHaveBeenCalled();
  });

  it("annulation : la base d'abord, puis l'envoi chez Mux", async () => {
    const { m, s } = service();
    await expect(s.cancelUpload({ ownerId: "o", memorialId: "m", videoId: "vid-1" })).resolves.toBe("cancelled");
    expect(m.cancelUpload).toHaveBeenCalledWith("up-1");
  });
});

describe("VID-07 — reconnexion et lecture privée", () => {
  it("seule une vidéo prête reçoit une lecture signée ; aucune donnée Mux interne n'est exposée", async () => {
    const rows = [row({}), row({ videoId: "vid-2", draftVideoId: "v-b", status: "processing", verifiedDurationMs: null, playbackId: null }), row({ videoId: "vid-3", draftVideoId: "v-c", status: "rejected", failureReason: "over_total_duration", playbackId: null })];
    const { s } = service(repo({ listForOwner: vi.fn(async () => rows) }));
    const views = await s.listForOwner({ ownerId: "o", memorialId: "m" });
    expect(views.map((v) => [v.draftVideoId, v.state, v.playback === null])).toEqual([["v-a", "ready", false], ["v-b", "processing", true], ["v-c", "failed", true]]);
    expect(views[0]).toMatchObject({ durationSeconds: 100.4, durationVerified: true });
    expect(views[2]!.failure).toBe("over_total_duration");
    expect(views[0]!.playback!.hlsUrl).toMatch(/^https:\/\/stream\.mux\.com\/pb-1\.m3u8\?token=/);
    const serialized = JSON.stringify(views);
    expect(serialized).not.toMatch(/up-1|as-1|PRIVATE KEY/);
  });
});

describe("VID-07 — réconciliation (notification manquée)", () => {
  it("traitement terminé chez Mux sans webhook : rejoue « asset prêt » avec un identifiant stable", async () => {
    const applyEvent = vi.fn(async () => ({ outcome: "accepted" as const, videoId: "vid-1", assetToDelete: null, supersededAsset: null }));
    const { s } = service(
      repo({ applyEvent, listToReconcile: vi.fn(async () => [{ videoId: "vid-1", memorialId: "m", status: "processing" as const, uploadId: "up-1", assetId: "as-1", uploadExpiresAt: null }]) }),
      mux({ getAsset: vi.fn(async () => ({ status: "ready" as const, durationMs: 12000, signedPlaybackId: "pb" })) }),
    );
    await expect(s.reconcile({ staleBefore: "2026-11-25T11:58:00.000Z" })).resolves.toEqual({ examined: 1, applied: 1 });
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "reconcile:vid-1:asset_ready", type: "asset_ready", durationMs: 12000, playbackId: "pb" }));
  });

  it("envoi expiré chez Mux : rejoue upload_expired ; suppression demandée : supprime puis confirme", async () => {
    const applyEvent = vi.fn(async () => ({ outcome: "applied" as const, videoId: "x", assetToDelete: null, supersededAsset: null }));
    const r = repo({
      applyEvent,
      listToReconcile: vi.fn(async () => [
        { videoId: "u", memorialId: "m", status: "uploading" as const, uploadId: "up-u", assetId: null, uploadExpiresAt: "2026-11-25T10:00:00.000Z" },
        { videoId: "d", memorialId: "m", status: "deletion_requested" as const, uploadId: "up-d", assetId: "as-d", uploadExpiresAt: null },
      ]),
    });
    const m = mux({ getUpload: vi.fn(async () => ({ status: "timed_out" as const, assetId: null })) });
    const { s } = service(r, m);
    await expect(s.reconcile({ staleBefore: "2026-11-25T11:58:00.000Z" })).resolves.toEqual({ examined: 2, applied: 2 });
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "reconcile:u:upload_timed_out", type: "upload_expired" }));
    expect(m.deleteAsset).toHaveBeenCalledWith("as-d");
    expect(r.confirmDeleted).toHaveBeenCalledWith("d");
  });

  it("Mux indisponible : rien n'est perdu, la ligne reste à réconcilier", async () => {
    const { r, s } = service(
      repo({ listToReconcile: vi.fn(async () => [{ videoId: "p", memorialId: "m", status: "processing" as const, uploadId: "up", assetId: "as", uploadExpiresAt: null }]) }),
      mux({ getAsset: vi.fn(async () => { throw new Error("down"); }) }),
    );
    await expect(s.reconcile({ staleBefore: "2026-11-25T11:58:00.000Z" })).resolves.toEqual({ examined: 1, applied: 0 });
    expect(r.applyEvent).not.toHaveBeenCalled();
  });

  it("à l'ouverture de l'étape : seules les vidéos de cet hommage en attente depuis plus de 2 minutes sont réinterrogées", async () => {
    const rows = [
      row({ videoId: "old", status: "processing", updatedAt: "2026-11-25T11:50:00.000Z" }),
      row({ videoId: "fresh", status: "processing", updatedAt: "2026-11-25T11:59:30.000Z" }),
      row({ videoId: "done", status: "ready", updatedAt: "2026-11-25T10:00:00.000Z" }),
    ];
    const getAsset = vi.fn(async () => ({ status: "preparing" as const, durationMs: null, signedPlaybackId: null }));
    const { s } = service(repo({ listForOwner: vi.fn(async () => rows) }), mux({ getAsset }));
    await s.refreshForOwner({ ownerId: "o", memorialId: "m" });
    expect(getAsset).toHaveBeenCalledTimes(1);
  });
});

describe("VID-09 — remplacement d'une vidéo publiée", () => {
  it("remplaçante acceptée alors que l'ancienne est publiée : la base la garde (aucun asset rendu), rien n'est supprimé chez Mux", async () => {
    const { m, s } = service(repo({ applyEvent: vi.fn(async () => ({ outcome: "accepted" as const, videoId: "new", assetToDelete: null, supersededAsset: null })) }));
    await s.handleEvent({ eventId: "e", type: "asset_ready", videoId: "new", uploadId: null, assetId: "as-new", playbackId: "pb", durationMs: 1000 });
    expect(m.deleteAsset).not.toHaveBeenCalled();
  });

  it("la famille voit l'ancienne version comme « remplacée » (encore publique), sans lecture, et la nouvelle comme sa version", async () => {
    const rows = [row({ videoId: "old", status: "superseded" }), row({ videoId: "new" })];
    const { s } = service(repo({ listForOwner: vi.fn(async () => rows) }));
    const views = await s.listForOwner({ ownerId: "o", memorialId: "m" });
    expect(views.map((v) => [v.videoId, v.state])).toEqual([["old", "replaced"], ["new", "ready"]]);
    expect(views[0]!.playback).toBeNull();
    expect(views[1]!.playback).not.toBeNull();
  });

  it("libération après republication : asset supprimé chez Mux, puis suppression confirmée ; un échec Mux laisse la ligne à la réconciliation", async () => {
    const releaseSuperseded = vi.fn(async () => [
      { videoId: "old-1", uploadId: null, assetId: "as-1", previousStatus: "superseded" as const },
      { videoId: "old-2", uploadId: null, assetId: "as-2", previousStatus: "superseded" as const },
    ]);
    const deleteAsset = vi.fn(async (id: string) => {
      if (id === "as-2") throw new Error("Mux down");
    });
    const { r, s } = service(repo({ releaseSuperseded }), mux({ deleteAsset }));
    await expect(s.releaseSuperseded("m")).resolves.toBe(2);
    expect(releaseSuperseded).toHaveBeenCalledWith({ memorialId: "m", limit: 50 });
    expect(r.confirmDeleted).toHaveBeenCalledTimes(1);
    expect(r.confirmDeleted).toHaveBeenCalledWith("old-1");
  });

  it("à l'ouverture de A16 : les anciennes versions inutiles de CET hommage sont libérées d'abord ; un échec ne bloque pas la famille", async () => {
    const releaseSuperseded = vi.fn(async () => Promise.reject(new Error("db")));
    const { s } = service(repo({ releaseSuperseded }));
    await expect(s.refreshForOwner({ ownerId: "o", memorialId: "m" })).resolves.toBe(0);
    expect(releaseSuperseded).toHaveBeenCalledWith({ memorialId: "m", limit: 50 });
  });
});
