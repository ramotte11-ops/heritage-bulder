import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseEntitlementRepository } from "./entitlement-repository";

/**
 * Mission 011B — this adapter is the only place that knows Mission
 * 011A's SQLSTATEs exist. Everything below is about translating them,
 * and about never letting one travel further.
 */

function fakeReadClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as SupabaseClient, from, eq };
}

function fakeRpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const REDEEM_INPUT = {
  entitlementId: "entitlement-1",
  ownerId: "owner-1",
  memorialType: "person" as const,
  skinId: "intemporel" as const,
};

describe("SupabaseEntitlementRepository.findById", () => {
  it("maps the row to an Entitlement", async () => {
    const { client, from } = fakeReadClient({
      data: {
        id: "entitlement-1",
        source: "direct",
        external_order_id: null,
        offer_id: "occidental",
        status: "available",
        owner_id: null,
        created_at: "2026-09-01T10:00:00.000Z",
        redeemed_at: null,
        updated_at: "2026-09-01T10:00:00.000Z",
      },
      error: null,
    });

    const entitlement = await new SupabaseEntitlementRepository(client).findById("entitlement-1");

    expect(from).toHaveBeenCalledWith("entitlements");
    expect(entitlement).toMatchObject({
      id: "entitlement-1",
      offerId: "occidental",
      status: "available",
      ownerId: null,
      externalOrderId: null,
    });
  });

  it("returns null when there is no such entitlement", async () => {
    const { client } = fakeReadClient({ data: null, error: null });

    expect(await new SupabaseEntitlementRepository(client).findById("nope")).toBeNull();
  });
});

describe("SupabaseEntitlementRepository.redeem", () => {
  it("calls the Mission 011A function with the exact parameter names it declares", async () => {
    const { client, rpc } = fakeRpcClient({
      data: [{ memorial_id: "memorial-1", outcome: "redeemed" }],
      error: null,
    });

    const outcome = await new SupabaseEntitlementRepository(client).redeem(REDEEM_INPUT);

    expect(rpc).toHaveBeenCalledWith("redeem_entitlement", {
      p_entitlement_id: "entitlement-1",
      p_owner_id: "owner-1",
      p_memorial_type: "person",
      p_skin_id: "intemporel",
    });
    expect(outcome).toEqual({ status: "redeemed", memorialId: "memorial-1" });
  });

  it("distinguishes an idempotent retry from a fresh redemption", async () => {
    const { client } = fakeRpcClient({
      data: [{ memorial_id: "memorial-1", outcome: "already_redeemed" }],
      error: null,
    });

    expect(await new SupabaseEntitlementRepository(client).redeem(REDEEM_INPUT)).toEqual({
      status: "alreadyRedeemed",
      memorialId: "memorial-1",
    });
  });

  it("accepts a single-object response as well as a row set", async () => {
    const { client } = fakeRpcClient({
      data: { memorial_id: "memorial-1", outcome: "redeemed" },
      error: null,
    });

    expect(await new SupabaseEntitlementRepository(client).redeem(REDEEM_INPUT)).toEqual({
      status: "redeemed",
      memorialId: "memorial-1",
    });
  });

  it.each([
    ["HH404", "notFound"],
    ["HH403", "ownedByAnotherOwner"],
    ["HH409", "notAvailable"],
    ["HH500", "integrityAnomaly"],
  ])("maps SQLSTATE %s to %s, with no SQL detail attached", async (code, status) => {
    const { client } = fakeRpcClient({
      data: null,
      error: { code, message: `entitlement_not_available:revoked`, details: "PL/pgSQL function..." },
    });

    const outcome = await new SupabaseEntitlementRepository(client).redeem(REDEEM_INPUT);

    expect(outcome).toEqual({ status });
    // The raw message and details stop here.
    expect(JSON.stringify(outcome)).not.toMatch(/PL\/pgSQL|HH\d{3}|revoked/);
  });

  it("rejects on an unmapped error rather than inventing a business outcome", async () => {
    const { client } = fakeRpcClient({
      data: null,
      error: { code: "08006", message: "connection failure" },
    });

    await expect(
      new SupabaseEntitlementRepository(client).redeem(REDEEM_INPUT),
    ).rejects.toMatchObject({ code: "08006" });
  });

  it("treats a contract-breaking empty response as an integrity anomaly", async () => {
    const { client } = fakeRpcClient({ data: [], error: null });

    expect(await new SupabaseEntitlementRepository(client).redeem(REDEEM_INPUT)).toEqual({
      status: "integrityAnomaly",
    });
  });
});
