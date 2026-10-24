import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseMemorialAccessRepository } from "./memorial-access-repository";

function fakeRpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const OWNER = "5b0f6c1e-6d0a-4a55-9a43-0c2b7f1d9e10";
const MEMORIAL = "9d2c1b4a-3e5f-4a6b-8c7d-0e1f2a3b4c5d";
const ANCHOR = {
  free_anchor_at: "2026-12-01T09:17:43.000Z",
  free_publish_until: "2026-12-08T09:17:43.000Z",
  free_draft_until: "2027-01-15T09:17:43.000Z",
};

describe("SupabaseMemorialAccessRepository.createFreeMemorial", () => {
  it("calls create_free_memorial_v1 for Intemporel only (D8), with no level of its own", async () => {
    const { client, rpc } = fakeRpcClient({ data: [{ outcome: "created", memorial_id: MEMORIAL }], error: null });

    expect(
      await new SupabaseMemorialAccessRepository(client).createFreeMemorial({ ownerId: OWNER, skinVariant: "light" }),
    ).toEqual({ outcome: "created", memorialId: MEMORIAL });
    expect(rpc).toHaveBeenCalledWith("create_free_memorial_v1", {
      p_owner_id: OWNER,
      p_skin_id: "intemporel",
      p_skin_variant: "light",
    });
  });

  it("maps B6's active-draft refusal", async () => {
    const { client } = fakeRpcClient({ data: [{ outcome: "free_draft_limit", memorial_id: null }], error: null });
    expect(
      await new SupabaseMemorialAccessRepository(client).createFreeMemorial({ ownerId: OWNER, skinVariant: "dark" }),
    ).toEqual({ outcome: "freeDraftLimit" });
  });

  it("fails CLOSED on no row, an unknown outcome, or a created row without id", async () => {
    for (const data of [[], null, [{ outcome: "accepted" }], [{ outcome: "created", memorial_id: null }]]) {
      const { client } = fakeRpcClient({ data, error: null });
      expect(
        await new SupabaseMemorialAccessRepository(client).createFreeMemorial({ ownerId: OWNER, skinVariant: "light" }),
      ).toEqual({ outcome: "refused" });
    }
  });

  it("rejects on a database error rather than inventing an outcome", async () => {
    const { client } = fakeRpcClient({ data: null, error: { code: "22023", message: "invalid free memorial request" } });
    await expect(
      new SupabaseMemorialAccessRepository(client).createFreeMemorial({ ownerId: OWNER, skinVariant: "light" }),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("SupabaseMemorialAccessRepository.anchorFreeMemorial", () => {
  it("returns the server's deadlines as is (B14, no client-side date)", async () => {
    const { client, rpc } = fakeRpcClient({ data: [{ outcome: "anchored", ...ANCHOR }], error: null });

    expect(
      await new SupabaseMemorialAccessRepository(client).anchorFreeMemorial({ memorialId: MEMORIAL, ownerId: OWNER }),
    ).toEqual({
      outcome: "anchored",
      freeAnchorAt: ANCHOR.free_anchor_at,
      freePublishUntil: ANCHOR.free_publish_until,
      freeDraftUntil: ANCHOR.free_draft_until,
    });
    expect(rpc).toHaveBeenCalledWith("anchor_free_memorial_v1", { p_memorial_id: MEMORIAL, p_owner_id: OWNER });
  });

  it("a second confirmation reports the original, unmoved deadlines (B1)", async () => {
    const { client } = fakeRpcClient({ data: { outcome: "already_anchored", ...ANCHOR }, error: null });
    expect(
      await new SupabaseMemorialAccessRepository(client).anchorFreeMemorial({ memorialId: MEMORIAL, ownerId: OWNER }),
    ).toMatchObject({ outcome: "alreadyAnchored", freeAnchorAt: ANCHOR.free_anchor_at });
  });

  it("maps a complete memorial to notFree", async () => {
    const { client } = fakeRpcClient({
      data: [{ outcome: "not_free", free_anchor_at: null, free_publish_until: null, free_draft_until: null }],
      error: null,
    });
    expect(
      await new SupabaseMemorialAccessRepository(client).anchorFreeMemorial({ memorialId: MEMORIAL, ownerId: OWNER }),
    ).toEqual({ outcome: "notFree" });
  });

  it("fails CLOSED on no row, an unknown outcome, or an anchor without its dates", async () => {
    for (const data of [[], null, [{ outcome: "ok" }], [{ outcome: "anchored", ...ANCHOR, free_draft_until: null }]]) {
      const { client } = fakeRpcClient({ data, error: null });
      expect(
        await new SupabaseMemorialAccessRepository(client).anchorFreeMemorial({ memorialId: MEMORIAL, ownerId: OWNER }),
      ).toEqual({ outcome: "refused" });
    }
  });
});

describe("SupabaseMemorialAccessRepository.upgradeMemorialAccess", () => {
  const INPUT = {
    memorialId: MEMORIAL,
    ownerId: OWNER,
    source: "direct_payment" as const,
    externalReference: "pay-42",
  };

  it("calls upgrade_memorial_access_v1 with exactly its four parameters", async () => {
    const { client, rpc } = fakeRpcClient({ data: [{ outcome: "upgraded" }], error: null });

    expect(await new SupabaseMemorialAccessRepository(client).upgradeMemorialAccess(INPUT)).toBe("upgraded");
    expect(rpc).toHaveBeenCalledWith("upgrade_memorial_access_v1", {
      p_memorial_id: MEMORIAL,
      p_owner_id: OWNER,
      p_source: "direct_payment",
      p_external_reference: "pay-42",
    });
  });

  it("maps an idempotent replay to alreadyComplete", async () => {
    const { client } = fakeRpcClient({ data: [{ outcome: "already_complete" }], error: null });
    expect(await new SupabaseMemorialAccessRepository(client).upgradeMemorialAccess(INPUT)).toBe("alreadyComplete");
  });

  it("maps a concurrently consumed reference (HD409) to referenceConflict", async () => {
    const { client } = fakeRpcClient({ data: null, error: { code: "HD409", message: "external reference already used" } });
    expect(await new SupabaseMemorialAccessRepository(client).upgradeMemorialAccess(INPUT)).toBe("referenceConflict");
  });

  it("fails CLOSED on no row or an unknown outcome", async () => {
    for (const data of [[], null, [{ outcome: "complete" }]]) {
      const { client } = fakeRpcClient({ data, error: null });
      expect(await new SupabaseMemorialAccessRepository(client).upgradeMemorialAccess(INPUT)).toBe("refused");
    }
  });

  it("rejects on any other database error", async () => {
    const { client } = fakeRpcClient({ data: null, error: { code: "22023", message: "invalid memorial upgrade request" } });
    await expect(new SupabaseMemorialAccessRepository(client).upgradeMemorialAccess(INPUT)).rejects.toMatchObject({
      code: "22023",
    });
  });
});
