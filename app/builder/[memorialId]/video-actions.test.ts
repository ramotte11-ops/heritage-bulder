import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VID-06 — le point d'entrée serveur du futur téléversement : la barrière
 * premium est en place, le téléversement ne l'est pas (lot Mux).
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

const { requestVideoUploadAction } = await import("./video-actions");

const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";
const snapshot = (accessLevel: unknown, status = "draft") => ({ status, accessLevel, firstPublishedAt: null, draft: { content: {}, updatedAt: "", revision: 1 } });

beforeEach(() => {
  authorizeMemorialForRequest.mockReset();
  load.mockReset();
  authorizeMemorialForRequest.mockResolvedValue({ status: "granted", ownerId: "owner-a", memorialId: MEMORIAL_ID });
});

describe("VID-06 — requestVideoUploadAction", () => {
  it("sans session ou sur le mémorial d'un autre : refus opaque (rejet), rien n'est lu", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-1")).rejects.toThrow("Video upload refused.");
    expect(load).not.toHaveBeenCalled();
  });

  it("identifiant de vidéo invalide : refus avant toute lecture", async () => {
    await expect(requestVideoUploadAction(MEMORIAL_ID, "../x")).rejects.toThrow("Video upload refused.");
    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
  });

  it.each([["avis"], [null], ["inconnu"]])("offre %s lue côté serveur : refus explicite, aucune adresse d'envoi", async (accessLevel) => {
    load.mockResolvedValue(snapshot(accessLevel));
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-1")).resolves.toEqual({ status: "refused", reason: "offer_not_complete" });
    // L'id lu est celui que l'autorisation a rendu.
    expect(load).toHaveBeenCalledWith(MEMORIAL_ID);
  });

  it("offre complète : la barrière s'ouvre, mais aucun téléversement n'est simulé (lot Mux non ouvert)", async () => {
    load.mockResolvedValue(snapshot("complet", "published"));
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-1")).resolves.toEqual({ status: "not_operational" });
  });

  it("mémorial archivé : refus", async () => {
    load.mockResolvedValue(snapshot("complet", "archived"));
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-1")).resolves.toEqual({ status: "refused", reason: "archived" });
  });

  it("mémorial introuvable : refus opaque", async () => {
    load.mockResolvedValue(null);
    await expect(requestVideoUploadAction(MEMORIAL_ID, "v-1")).rejects.toThrow("Video upload refused.");
  });
});
