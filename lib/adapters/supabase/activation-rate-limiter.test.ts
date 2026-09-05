import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseActivationRateLimiter } from "./activation-rate-limiter";

function fakeRpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("SupabaseActivationRateLimiter.recordAttempt", () => {
  it("calls the Mission 019C RPC with exactly the expected parameter name", async () => {
    const { client, rpc } = fakeRpcClient({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });

    const decision = await new SupabaseActivationRateLimiter(client).recordAttempt("auth-user-1");

    expect(rpc).toHaveBeenCalledWith("record_heritage_activation_attempt", {
      p_auth_user_id: "auth-user-1",
    });
    expect(decision).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("maps a refusal with a positive retryAfterSeconds", async () => {
    const { client } = fakeRpcClient({
      data: [{ allowed: false, retry_after_seconds: 842 }],
      error: null,
    });

    expect(await new SupabaseActivationRateLimiter(client).recordAttempt("auth-user-1")).toEqual({
      allowed: false,
      retryAfterSeconds: 842,
    });
  });

  it("accepts a single-object response as well as a row set", async () => {
    const { client } = fakeRpcClient({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });

    expect(await new SupabaseActivationRateLimiter(client).recordAttempt("auth-user-1")).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("fails CLOSED (refuses) when the RPC returns no row and no error", async () => {
    const { client } = fakeRpcClient({ data: [], error: null });

    expect(await new SupabaseActivationRateLimiter(client).recordAttempt("auth-user-1")).toEqual({
      allowed: false,
      retryAfterSeconds: 0,
    });
  });

  it("rejects on a genuine infrastructure error rather than treating it as a decision", async () => {
    const { client } = fakeRpcClient({ data: null, error: { code: "HH400", message: "boom" } });

    await expect(
      new SupabaseActivationRateLimiter(client).recordAttempt("auth-user-1"),
    ).rejects.toBeTruthy();
  });
});
