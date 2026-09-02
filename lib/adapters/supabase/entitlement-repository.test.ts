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

/**
 * Mission 013 — the adapter's new surface: exact lookup by key hash,
 * issuance in one INSERT, the compare-and-swap, and the SQLSTATE
 * mapping for the lock-protected redemption.
 */

const ROW = {
  id: "entitlement-1",
  source: "direct",
  external_order_id: null,
  offer_id: "occidental",
  status: "available",
  owner_id: null,
  created_at: "2026-09-01T10:00:00.000Z",
  redeemed_at: null,
  updated_at: "2026-09-01T10:00:00.000Z",
};

const HASH = "a".repeat(64);

function fakeLookupClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn();
  eq.mockReturnValue({ maybeSingle, eq });
  const ilike = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq, ilike });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as SupabaseClient, select, eq, ilike };
}

function fakeInsertClient(result: { data: unknown; error: unknown }, lookup?: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const selectAfterInsert = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });
  const maybeSingle = vi.fn().mockResolvedValue(lookup ?? { data: null, error: null });
  const eq = vi.fn();
  eq.mockReturnValue({ maybeSingle, eq });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, select });
  return { client: { from } as unknown as SupabaseClient, insert, eq };
}

function fakeSwapClient(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  const is = vi.fn().mockReturnValue({ select });
  const eq = vi.fn();
  eq.mockReturnValue({ eq, is, select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseClient, update, eq, is };
}

describe("SupabaseEntitlementRepository.findByActivationKeyHash", () => {
  it("uses exact equality on the hash, never a pattern operator", async () => {
    const { client, eq, ilike } = fakeLookupClient({ data: ROW, error: null });

    const found = await new SupabaseEntitlementRepository(client).findByActivationKeyHash(HASH);

    expect(eq).toHaveBeenCalledWith("activation_key_hash", HASH);
    expect(ilike).not.toHaveBeenCalled();
    expect(found?.id).toBe("entitlement-1");
  });

  it("never selects the hash column back", async () => {
    const { client, select } = fakeLookupClient({ data: ROW, error: null });

    await new SupabaseEntitlementRepository(client).findByActivationKeyHash(HASH);

    expect(select.mock.calls[0][0]).not.toContain("activation_key_hash");
  });

  it("returns null for an unknown hash", async () => {
    const { client } = fakeLookupClient({ data: null, error: null });

    expect(await new SupabaseEntitlementRepository(client).findByActivationKeyHash(HASH)).toBeNull();
  });
});

describe("SupabaseEntitlementRepository.issueWithActivationKey", () => {
  it("writes the right and its hash in ONE insert", async () => {
    const { client, insert } = fakeInsertClient({ data: ROW, error: null });

    const outcome = await new SupabaseEntitlementRepository(client).issueWithActivationKey({
      offerId: "occidental",
      source: "etsy",
      externalOrderId: "order-1",
      activationKeyHash: HASH,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      offer_id: "occidental",
      source: "etsy",
      external_order_id: "order-1",
      activation_key_hash: HASH,
    });
    expect(outcome.status).toBe("issued");
  });

  it("explains a 23505 by READING the order, not by parsing a Postgres message", async () => {
    const { client, eq } = fakeInsertClient(
      { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { data: { ...ROW, external_order_id: "order-1" }, error: null },
    );

    const outcome = await new SupabaseEntitlementRepository(client).issueWithActivationKey({
      offerId: "occidental",
      source: "etsy",
      externalOrderId: "order-1",
      activationKeyHash: HASH,
    });

    expect(outcome).toEqual({
      status: "duplicateExternalOrder",
      entitlement: expect.objectContaining({ externalOrderId: "order-1" }),
    });
    expect(eq).toHaveBeenCalledWith("source", "etsy");
    expect(eq).toHaveBeenCalledWith("external_order_id", "order-1");
  });

  it("re-throws a 23505 that no existing order explains — never a silent key retry", async () => {
    // This is what a hash collision would look like. At 160 bits it means
    // a broken generator, and quietly issuing another key would hide it.
    const { client } = fakeInsertClient(
      { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { data: null, error: null },
    );

    await expect(
      new SupabaseEntitlementRepository(client).issueWithActivationKey({
        offerId: "occidental",
        source: "etsy",
        externalOrderId: "order-1",
        activationKeyHash: HASH,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("re-throws a 23505 outright when there is no external order to explain it", async () => {
    const { client, eq } = fakeInsertClient({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    await expect(
      new SupabaseEntitlementRepository(client).issueWithActivationKey({
        offerId: "occidental",
        source: "direct",
        externalOrderId: null,
        activationKeyHash: HASH,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    // No lookup at all: with no order reference there is nothing that
    // could legitimately have collided.
    expect(eq).not.toHaveBeenCalled();
  });
});

describe("SupabaseEntitlementRepository.swapActivationKey", () => {
  it("matches on id, status and the expected hash, in one statement", async () => {
    const { client, update, eq } = fakeSwapClient({ data: [{ id: "entitlement-1" }], error: null });

    const outcome = await new SupabaseEntitlementRepository(client).swapActivationKey({
      entitlementId: "entitlement-1",
      expectedActivationKeyHash: HASH,
      nextActivationKeyHash: "b".repeat(64),
    });

    expect(update).toHaveBeenCalledWith({ activation_key_hash: "b".repeat(64) });
    expect(eq).toHaveBeenCalledWith("id", "entitlement-1");
    expect(eq).toHaveBeenCalledWith("status", "available");
    expect(eq).toHaveBeenCalledWith("activation_key_hash", HASH);
    expect(outcome).toEqual({ status: "updated" });
  });

  it("uses IS NULL when the right is expected to have no key", async () => {
    const { client, is } = fakeSwapClient({ data: [{ id: "entitlement-1" }], error: null });

    await new SupabaseEntitlementRepository(client).swapActivationKey({
      entitlementId: "entitlement-1",
      expectedActivationKeyHash: null,
      nextActivationKeyHash: HASH,
    });

    expect(is).toHaveBeenCalledWith("activation_key_hash", null);
  });

  it("reports rejected — never a silent overwrite — when nothing matched", async () => {
    const { client } = fakeSwapClient({ data: [], error: null });

    expect(
      await new SupabaseEntitlementRepository(client).swapActivationKey({
        entitlementId: "entitlement-1",
        expectedActivationKeyHash: HASH,
        nextActivationKeyHash: null,
      }),
    ).toEqual({ status: "rejected" });
  });
});

describe("SupabaseEntitlementRepository.redeemWithActivationKey", () => {
  it("calls the Mission 013 wrapper with its exact parameter names", async () => {
    const { client, rpc } = fakeRpcClient({
      data: [{ memorial_id: "memorial-1", outcome: "redeemed" }],
      error: null,
    });

    const outcome = await new SupabaseEntitlementRepository(client).redeemWithActivationKey({
      entitlementId: "entitlement-1",
      expectedActivationKeyHash: HASH,
      ownerId: "owner-1",
      memorialType: "person",
      skinId: "intemporel",
    });

    expect(rpc).toHaveBeenCalledWith("redeem_entitlement_with_activation_key", {
      p_entitlement_id: "entitlement-1",
      p_expected_key_hash: HASH,
      p_owner_id: "owner-1",
      p_memorial_type: "person",
      p_skin_id: "intemporel",
    });
    expect(outcome).toEqual({ status: "redeemed", memorialId: "memorial-1" });
  });

  it("maps HH410 to activationKeySuperseded, with no SQL detail attached", async () => {
    const { client } = fakeRpcClient({
      data: null,
      error: { code: "HH410", message: "activation_key_superseded", details: "PL/pgSQL function..." },
    });

    const outcome = await new SupabaseEntitlementRepository(client).redeemWithActivationKey({
      entitlementId: "entitlement-1",
      expectedActivationKeyHash: HASH,
      ownerId: "owner-1",
      memorialType: "person",
      skinId: "intemporel",
    });

    expect(outcome).toEqual({ status: "activationKeySuperseded" });
    expect(JSON.stringify(outcome)).not.toMatch(/PL\/pgSQL|HH\d{3}|[0-9a-f]{64}/);
  });

  it("still rejects an unmapped error", async () => {
    const { client } = fakeRpcClient({ data: null, error: { code: "08006", message: "down" } });

    await expect(
      new SupabaseEntitlementRepository(client).redeemWithActivationKey({
        entitlementId: "entitlement-1",
        expectedActivationKeyHash: HASH,
        ownerId: "owner-1",
        memorialType: "person",
        skinId: "intemporel",
      }),
    ).rejects.toMatchObject({ code: "08006" });
  });
});
