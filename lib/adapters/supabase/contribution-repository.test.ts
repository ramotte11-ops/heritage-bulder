import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseContributionRepository, SupabaseFamilyContributionReader } from "./contribution-repository";

/** Le résultat d'un appel RPC : attendable, et `.select()` pour une projection. */
function fakeRpc(result: { data: unknown; error: unknown }) {
  const select = vi.fn(() => Promise.resolve(result));
  const rpc = vi.fn(() => Object.assign(Promise.resolve(result), { select }));
  return { client: { rpc } as unknown as SupabaseClient, rpc, select };
}

const KEY = "44444444-4444-4444-8444-444444444444";

describe("M8-E2 — SupabaseContributionRepository", () => {
  it("submit : exactement les paramètres de submit_contribution_v1", async () => {
    const { client, rpc } = fakeRpc({ data: [{ outcome: "published", contribution_id: "c1", contribution_status: "published" }], error: null });
    expect(await new SupabaseContributionRepository(client).submit({ slug: "s", type: "condolence", authorName: "A", content: "B", idempotencyKey: KEY })).toEqual({
      outcome: "published", contributionId: "c1", status: "published",
    });
    expect(rpc).toHaveBeenCalledWith("submit_contribution_v1", { p_slug: "s", p_message_type: "condolence", p_author_name: "A", p_content: "B", p_idempotency_key: KEY });
  });

  it("échec fermé : pas de ligne ou résultat inconnu → refused", async () => {
    for (const data of [[], null, [{ outcome: "accepted" }], [{}]]) {
      const { client } = fakeRpc({ data, error: null });
      const repo = new SupabaseContributionRepository(client);
      expect((await repo.submit({ slug: "s", type: "condolence", authorName: "A", content: "B", idempotencyKey: KEY })).outcome).toBe("refused");
      expect(await repo.reservePhoto({ slug: "s", mediaId: "m", storagePath: "p", declaredMimeType: "image/png" })).toBe("refused");
      expect((await repo.moderate({ ownerId: "o", contributionId: "c", action: "approve" })).outcome).toBe("refused");
      expect((await repo.remove({ ownerId: "o", contributionId: "c" })).outcome).toBe("refused");
      expect((await repo.setCategories({ ownerId: "o", memorialId: "m", features: { condolences: true, stories: true, photos: true }, expectedRevision: null })).outcome).toBe("refused");
      expect((await repo.readOwnerSettings({ ownerId: "o", memorialId: "m" })).outcome).toBe("refused");
    }
  });

  it("une erreur de la base remonte (jamais lue comme un succès)", async () => {
    const { client } = fakeRpc({ data: null, error: { message: "boom" } });
    await expect(new SupabaseContributionRepository(client).submit({ slug: "s", type: "condolence", authorName: "A", content: "B", idempotencyKey: KEY })).rejects.toEqual({ message: "boom" });
  });

  it("findPublicMemorialId : seule la colonne memorial_id est demandée", async () => {
    const { client, rpc, select } = fakeRpc({ data: [{ memorial_id: "m1" }], error: null });
    expect(await new SupabaseContributionRepository(client).findPublicMemorialId("abc")).toBe("m1");
    expect(rpc).toHaveBeenCalledWith("read_public_memorial_v1", { p_slug: "abc" });
    expect(select).toHaveBeenCalledWith("memorial_id");
    const none = fakeRpc({ data: [], error: null });
    expect(await new SupabaseContributionRepository(none.client).findPublicMemorialId("abc")).toBeNull();
  });

  it("finalizePhoto et readPublic : paramètres et lignes validées (une photo sans média est écartée)", async () => {
    const a = fakeRpc({ data: [{ outcome: "pending", contribution_id: "c", contribution_status: "pending" }], error: null });
    await new SupabaseContributionRepository(a.client).finalizePhoto({ slug: "s", mediaId: "m", authorName: "A", caption: null, idempotencyKey: KEY, mimeType: "image/webp", sizeBytes: 10, width: 2, height: 3 });
    expect(a.rpc).toHaveBeenCalledWith("finalize_contribution_photo_v1", {
      p_slug: "s", p_media_id: "m", p_author_name: "A", p_caption: null, p_idempotency_key: KEY, p_mime_type: "image/webp", p_size_bytes: 10, p_width: 2, p_height: 3,
    });
    const b = fakeRpc({
      data: [
        { contribution_id: "1", message_type: "photo", author_name: "A", content: null, caption: "c", published_at: "2026-11-01T00:00:00Z", media: { media_id: "m", storage_path: "x/m/original.webp", width: 2, height: 3 } },
        { contribution_id: "2", message_type: "photo", author_name: "B", content: null, caption: null, published_at: "2026-11-01T00:00:00Z", media: null },
        { contribution_id: "3", message_type: "memory_message", author_name: "C", content: "t", caption: null, published_at: "2026-11-01T00:00:00Z", media: null },
        { contribution_id: "4", message_type: "testimonial", author_name: "D", content: "t", caption: null, published_at: "2026-11-01T00:00:00Z", media: null },
      ],
      error: null,
    });
    const rows = await new SupabaseContributionRepository(b.client).readPublic({ slug: "s", limit: 24, before: { publishedAt: "2026-11-02T00:00:00Z", id: "z" } });
    expect(rows.map((r) => r.id)).toEqual(["1", "4"]);
    expect(b.rpc).toHaveBeenCalledWith("read_public_contributions_v1", { p_slug: "s", p_limit: 24, p_before_published_at: "2026-11-02T00:00:00Z", p_before_id: "z" });
  });

  it("opérations familiales : p_owner_id transmis tel que vérifié par le serveur", async () => {
    const { client, rpc } = fakeRpc({ data: [{ outcome: "updated", draft_revision: "12" }], error: null });
    const repo = new SupabaseContributionRepository(client);
    expect(await repo.setCategories({ ownerId: "o", memorialId: "m", features: { condolences: true, stories: false, photos: true }, expectedRevision: 11 })).toEqual({ outcome: "updated", draftRevision: 12 });
    expect(rpc).toHaveBeenCalledWith("set_contribution_categories_v1", { p_owner_id: "o", p_memorial_id: "m", p_condolences: true, p_stories: false, p_photos: true, p_expected_revision: 11 });
  });
});

describe("M8-E2 — SupabaseFamilyContributionReader (session, RLS)", () => {
  it("ne demande jamais idempotency_key ; filtre l'hommage, le statut et la page", async () => {
    const calls: [string, ...unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "lt", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return m === "limit" ? Promise.resolve({ data: [{ id: "1", message_type: "photo", status: "pending", author_name: "A", content: null, caption: null, media_id: "m", created_at: "2026-11-01T00:00:00Z", published_at: null, moderated_at: null }], error: null }) : builder;
      };
    }
    const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
    const rows = await new SupabaseFamilyContributionReader(client).list({ memorialId: "mem", status: "pending", limit: 50, beforeCreatedAt: "2026-11-02T00:00:00Z" });
    expect(rows).toHaveLength(1);
    const select = calls.find((c) => c[0] === "select")![1] as string;
    expect(select).not.toContain("idempotency_key");
    expect(calls).toContainEqual(["eq", "memorial_id", "mem"]);
    expect(calls).toContainEqual(["eq", "status", "pending"]);
    expect(calls).toContainEqual(["lt", "created_at", "2026-11-02T00:00:00Z"]);
  });
});
