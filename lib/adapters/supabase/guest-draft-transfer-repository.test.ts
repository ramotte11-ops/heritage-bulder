import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseGuestDraftTransferRepository } from "./guest-draft-transfer-repository";

function client(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const BEGIN_INPUT = {
  ownerId: "owner",
  transferKey: "3f1c9a52-7d4e-4b8a-9c21-5e6f7a8b9c0d",
  sourceRevision: 4,
  skinVariant: "dark" as const,
  language: "es" as const,
};

describe("QG 008 Lot 2 — SupabaseGuestDraftTransferRepository", () => {
  it("passes the verified owner and the guest draft identity to begin_guest_draft_transfer_v1", async () => {
    const { client: c, rpc } = client({
      data: [{ outcome: "created", memorial_id: "m", transfer_status: "started", media_map: {}, draft_revision: 0, anchor_outcome: "anchored", free_publish_until: "p", free_draft_until: "d" }],
      error: null,
    });
    await expect(new SupabaseGuestDraftTransferRepository(c).begin(BEGIN_INPUT)).resolves.toMatchObject({
      outcome: "created", memorialId: "m", status: "started", mediaMap: {}, baseDraftRevision: 0,
    });
    expect(rpc).toHaveBeenCalledWith("begin_guest_draft_transfer_v1", {
      p_owner_id: "owner", p_transfer_key: BEGIN_INPUT.transferKey, p_source_revision: 4, p_skin_variant: "dark", p_language: "es",
    });
  });

  it("maps an existing active draft without inventing a memorial", async () => {
    const { client: c } = client({ data: [{ outcome: "active_draft_exists", memorial_id: "existing" }], error: null });
    await expect(new SupabaseGuestDraftTransferRepository(c).begin(BEGIN_INPUT)).resolves.toEqual({ outcome: "active_draft_exists", memorialId: "existing" });
  });

  it.each([
    [[]],
    [null],
    [[{ outcome: "created", memorial_id: "m", transfer_status: "weird", media_map: {}, draft_revision: 0 }]],
    [[{ outcome: "resumed", memorial_id: "m", transfer_status: "started", media_map: { a: 1 }, draft_revision: 0 }]],
    [[{ outcome: "something" }]],
  ])("fails CLOSED on a malformed begin answer (%o)", async (data) => {
    const { client: c } = client({ data, error: null });
    await expect(new SupabaseGuestDraftTransferRepository(c).begin(BEGIN_INPUT)).resolves.toEqual({ outcome: "refused" });
  });

  it("find returns null rather than a guessed transfer", async () => {
    const { client: c } = client({ data: [], error: null });
    await expect(new SupabaseGuestDraftTransferRepository(c).find({ ownerId: "o", transferKey: "k" })).resolves.toBeNull();
  });

  it("recordMedia: known outcomes pass, anything else (or an invalid request) is refused", async () => {
    for (const [data, error, expected] of [
      [[{ outcome: "recorded" }], null, "recorded"],
      [[{ outcome: "already_recorded" }], null, "already_recorded"],
      [[{ outcome: "conflict" }], null, "conflict"],
      [[{ outcome: "ok" }], null, "refused"],
      [null, { code: "22023", message: "invalid" }, "refused"],
    ] as const) {
      const { client: c } = client({ data, error });
      await expect(new SupabaseGuestDraftTransferRepository(c).recordMedia({
        ownerId: "o", transferKey: "k", localId: "l", mediaId: "m", purpose: "gallery",
      })).resolves.toBe(expected);
    }
  });

  it("rejects on an unexpected database error instead of inventing an outcome", async () => {
    const { client: c } = client({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(new SupabaseGuestDraftTransferRepository(c).complete({ ownerId: "o", transferKey: "k" })).rejects.toMatchObject({ code: "XX000" });
  });
});
