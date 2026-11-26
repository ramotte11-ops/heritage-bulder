import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VID-07 — les points d'entrée serveur de l'hébergement vidéo : session
 * rejouée, configuration, offre lue côté serveur, puis service (simulé ici ;
 * ses règles sont prouvées en SQL et dans hosted-video-service.test.ts).
 */

const { authorizeMemorialForRequest } = vi.hoisted(() => ({ authorizeMemorialForRequest: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(() => Promise.resolve({ fake: "supabase" })),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { load, createSupabaseMemorialPublicationRepository } = vi.hoisted(() => {
  const load = vi.fn();
  return { load, createSupabaseMemorialPublicationRepository: vi.fn(() => ({ load })) };
});
vi.mock("@/lib/adapters/supabase/memorial-publication-repository", () => ({ createSupabaseMemorialPublicationRepository }));

const { videoHostingRuntime, service } = vi.hoisted(() => {
  const service = {
    requestUpload: vi.fn(),
    cancelUpload: vi.fn(),
    removeVideo: vi.fn(),
    listForOwner: vi.fn(),
    refreshForOwner: vi.fn(async () => 0),
  };
  return { service, videoHostingRuntime: vi.fn() };
});
vi.mock("@/lib/memorial/video/hosting/hosting-runtime", () => ({ videoHostingRuntime }));

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: new Map<string, string>() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => requestHeaders.get(name) ?? null }) }));

const { requestVideoUploadAction, loadVideoHostingAction, cancelVideoUploadAction, removeHostedVideoAction } = await import("./video-actions");

const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ROW = "22222222-2222-4222-8222-222222222222";
const snapshot = (accessLevel: unknown, status = "draft") => ({ status, accessLevel, firstPublishedAt: null, draft: { content: {}, updatedAt: "", revision: 1 } });

beforeEach(() => {
  vi.clearAllMocks();
  authorizeMemorialForRequest.mockResolvedValue({ status: "granted", ownerId: "owner-a", memorialId: MEMORIAL_ID });
  videoHostingRuntime.mockReturnValue({ config: { webhookSecret: "never-sent", corsOrigin: "https://hommages.netlify.app", allowDeployOrigins: true }, service });
  requestHeaders.clear();
  load.mockResolvedValue(snapshot("complet"));
});

describe("VID-07 — requestVideoUploadAction", () => {
  it("invité non authentifié, ou hommage d'une autre famille : refus opaque, rien n'est lu ni réservé", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-a", 10)).rejects.toThrow("Video hosting refused.");
    expect(load).not.toHaveBeenCalled();
    expect(service.requestUpload).not.toHaveBeenCalled();
  });

  it.each([["../x", 10], ["v-a", 0], ["v-a", -1], ["v-a", Number.NaN]])("entrées invalides (%s, %s) : refus avant toute lecture", async (id, duration) => {
    await expect(requestVideoUploadAction(MEMORIAL_ID, id as string, duration as number)).rejects.toThrow("Video hosting refused.");
    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
  });

  it("hébergement non configuré : unavailable (le formulaire reste local), aucune lecture de l'offre", async () => {
    videoHostingRuntime.mockReturnValue(null);
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-a", 10)).resolves.toEqual({ status: "unavailable" });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([["avis"], [null], ["complet "]] as const)("sans offre complète lue côté serveur (%s) : refus, aucun envoi", async (level) => {
    load.mockResolvedValue(snapshot(level));
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-a", 10)).resolves.toEqual({ status: "refused", reason: "offer" });
    expect(service.requestUpload).not.toHaveBeenCalled();
  });

  it("offre complète : l'identifiant AUTORISÉ et le propriétaire de la session sont transmis, jamais ceux du navigateur", async () => {
    service.requestUpload.mockResolvedValue({ status: "granted", videoId: VIDEO_ROW, uploadUrl: "https://upload.example/u", expiresAt: "2026-11-25T13:00:00.000Z" });
    await expect(requestVideoUploadAction("forged-id", "v-a", 268.4)).resolves.toEqual({
      status: "granted",
      videoId: VIDEO_ROW,
      uploadUrl: "https://upload.example/u",
      expiresAt: "2026-11-25T13:00:00.000Z",
    });
    expect(service.requestUpload).toHaveBeenCalledWith({ ownerId: "owner-a", memorialId: MEMORIAL_ID, draftVideoId: "v-a", declaredDurationSeconds: 268.4, corsOrigin: "https://hommages.netlify.app" });
  });

  it("VID-10 — envoi depuis un déploiement non publié du même site (recette permise) : son origine est déclarée à Mux ; une autre origine, jamais", async () => {
    service.requestUpload.mockResolvedValue({ status: "granted", videoId: VIDEO_ROW, uploadUrl: "https://upload.example/u", expiresAt: "x" });
    requestHeaders.set("origin", "https://6b03311329c08193f8771ee2--hommages.netlify.app");
    await requestVideoUploadAction(MEMORIAL_ID, "v-a", 10);
    expect(service.requestUpload).toHaveBeenLastCalledWith(expect.objectContaining({ corsOrigin: "https://6b03311329c08193f8771ee2--hommages.netlify.app" }));
    requestHeaders.set("origin", "https://evil.example");
    await requestVideoUploadAction(MEMORIAL_ID, "v-a", 10);
    expect(service.requestUpload).toHaveBeenLastCalledWith(expect.objectContaining({ corsOrigin: "https://hommages.netlify.app" }));
  });

  it.each([
    ["refused_too_many", "too_many"],
    ["refused_duration", "duration"],
    ["refused_unknown_pending", "unknown_pending"],
    ["refused_in_progress", "in_progress"],
    ["refused", "other"],
  ])("refus de la base %s → %s (sans détail technique)", async (outcome, reason) => {
    service.requestUpload.mockResolvedValue({ status: "refused", reason: outcome });
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-a", 10)).resolves.toEqual({ status: "refused", reason });
  });

  it("aucune réponse ne contient de secret", async () => {
    service.requestUpload.mockResolvedValue({ status: "granted", videoId: VIDEO_ROW, uploadUrl: "https://upload.example/u", expiresAt: "x" });
    expect(JSON.stringify(await requestVideoUploadAction(MEMORIAL_ID, "v-a", 10))).not.toContain("never-sent");
  });
});

describe("VID-07 — loadVideoHostingAction", () => {
  it("offre gratuite ou hébergement non configuré : unavailable", async () => {
    load.mockResolvedValue(snapshot("avis", "published"));
    await expect(loadVideoHostingAction(MEMORIAL_ID)).resolves.toEqual({ status: "unavailable" });
    videoHostingRuntime.mockReturnValue(null);
    await expect(loadVideoHostingAction(MEMORIAL_ID)).resolves.toEqual({ status: "unavailable" });
    expect(service.listForOwner).not.toHaveBeenCalled();
  });

  it("offre complète : réconciliation ciblée, puis liste du propriétaire", async () => {
    service.listForOwner.mockResolvedValue([{ draftVideoId: "v-a", state: "ready" }]);
    await expect(loadVideoHostingAction(MEMORIAL_ID)).resolves.toEqual({ status: "available", videos: [{ draftVideoId: "v-a", state: "ready" }] });
    expect(service.refreshForOwner).toHaveBeenCalledWith({ ownerId: "owner-a", memorialId: MEMORIAL_ID });
  });

  it("sans session : refus opaque", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(loadVideoHostingAction(MEMORIAL_ID)).rejects.toThrow("Video hosting refused.");
  });
});

describe("VID-07 — annulation et retrait", () => {
  it("annulation : identifiant de ligne validé ; refus de la base → rejet", async () => {
    await expect(cancelVideoUploadAction(MEMORIAL_ID, "not-a-uuid")).rejects.toThrow();
    service.cancelUpload.mockResolvedValue("cancelled");
    await expect(cancelVideoUploadAction(MEMORIAL_ID, VIDEO_ROW)).resolves.toEqual({ status: "cancelled" });
    service.cancelUpload.mockResolvedValue("refused");
    await expect(cancelVideoUploadAction(MEMORIAL_ID, VIDEO_ROW)).rejects.toThrow("Video hosting refused.");
  });

  it("retrait permis quelle que soit l'offre (retirer ne publie rien) ; suppression différée signalée", async () => {
    load.mockResolvedValue(snapshot("avis"));
    service.removeVideo.mockResolvedValue("pending_cleanup");
    await expect(removeHostedVideoAction(MEMORIAL_ID, "v-a")).resolves.toEqual({ status: "pending_cleanup" });
    expect(service.removeVideo).toHaveBeenCalledWith({ ownerId: "owner-a", memorialId: MEMORIAL_ID, draftVideoId: "v-a" });
  });
});
