import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseSymbolicOfferingRepository } from "./symbolic-offering-repository";

function fakeRpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const INPUT = { slug: "jeanne-martin", kind: "bougie" as const, idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e" };

describe("SupabaseSymbolicOfferingRepository.record", () => {
  it("calls the C1 RPC with exactly its three parameters", async () => {
    const { client, rpc } = fakeRpcClient({ data: [{ outcome: "recorded" }], error: null });

    expect(await new SupabaseSymbolicOfferingRepository(client).record(INPUT)).toBe("recorded");
    expect(rpc).toHaveBeenCalledWith("record_symbolic_offering_v1", {
      p_slug: "jeanne-martin",
      p_kind: "bougie",
      p_idempotency_key: "0f8fad5b-d9cb-469f-a165-70867728950e",
    });
  });

  it.each(["recorded", "duplicate", "refused", "rate_limited"])("maps the %s outcome as is", async (outcome) => {
    const { client } = fakeRpcClient({ data: [{ outcome }], error: null });
    expect(await new SupabaseSymbolicOfferingRepository(client).record(INPUT)).toBe(outcome);
  });

  it("accepts a single-object response as well as a row set", async () => {
    const { client } = fakeRpcClient({ data: { outcome: "duplicate" }, error: null });
    expect(await new SupabaseSymbolicOfferingRepository(client).record(INPUT)).toBe("duplicate");
  });

  it("fails CLOSED (refused) on no row or an unknown outcome", async () => {
    for (const data of [[], null, [{ outcome: "accepted" }], [{}]]) {
      const { client } = fakeRpcClient({ data, error: null });
      expect(await new SupabaseSymbolicOfferingRepository(client).record(INPUT)).toBe("refused");
    }
  });

  it("rejects on an infrastructure error rather than inventing an outcome", async () => {
    const { client } = fakeRpcClient({ data: null, error: { code: "22023", message: "invalid symbolic offering request" } });
    await expect(new SupabaseSymbolicOfferingRepository(client).record(INPUT)).rejects.toBeTruthy();
  });
});

describe("SupabaseSymbolicOfferingRepository.sign (Lot 2)", () => {
  const SIGN = { slug: "jeanne-martin", idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e", signature: "Marie" };

  it("calls the Lot 2 RPC with exactly its three parameters", async () => {
    const { client, rpc } = fakeRpcClient({ data: [{ outcome: "signed" }], error: null });
    expect(await new SupabaseSymbolicOfferingRepository(client).sign(SIGN)).toBe("signed");
    expect(rpc).toHaveBeenCalledWith("sign_symbolic_offering_v1", {
      p_slug: "jeanne-martin",
      p_idempotency_key: "0f8fad5b-d9cb-469f-a165-70867728950e",
      p_signature: "Marie",
    });
  });

  it.each(["signed", "already_signed", "refused"])("maps the %s outcome as is", async (outcome) => {
    const { client } = fakeRpcClient({ data: { outcome }, error: null });
    expect(await new SupabaseSymbolicOfferingRepository(client).sign(SIGN)).toBe(outcome);
  });

  it("fails CLOSED (refused) on no row or an unknown outcome, and rethrows an RPC error", async () => {
    for (const data of [[], null, [{ outcome: "recorded" }]]) {
      const { client } = fakeRpcClient({ data, error: null });
      expect(await new SupabaseSymbolicOfferingRepository(client).sign(SIGN)).toBe("refused");
    }
    const { client } = fakeRpcClient({ data: null, error: new Error("permission denied") });
    await expect(new SupabaseSymbolicOfferingRepository(client).sign(SIGN)).rejects.toThrow("permission denied");
  });
});
