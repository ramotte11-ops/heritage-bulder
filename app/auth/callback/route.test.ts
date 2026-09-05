import { describe, expect, it, vi, beforeEach } from "vitest";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { unstable_rethrow } = vi.hoisted(() => ({
  unstable_rethrow: vi.fn(),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow }));

const { GET } = await import("./route");

function requestWith(params: Record<string, string>): Request {
  const url = new URL("https://heritage.example.test/auth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

beforeEach(() => {
  createServerSupabaseClient.mockReset();
});

describe("GET /auth/callback", () => {
  it("redirects to /owner by default on success (no next supplied)", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    });

    const response = await GET(requestWith({ code: "one-time-code" }));

    expect(response.headers.get("location")).toBe("https://heritage.example.test/owner");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
  });

  it("redirects to the sanitized next path on success (Mission 019C return-to-activate)", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    });

    const response = await GET(requestWith({ code: "one-time-code", next: "/activate" }));

    expect(response.headers.get("location")).toBe("https://heritage.example.test/activate");
  });

  it("falls back to /owner when next is an open-redirect attempt", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    });

    const response = await GET(
      requestWith({ code: "one-time-code", next: "https://evil.example.com" }),
    );

    expect(response.headers.get("location")).toBe("https://heritage.example.test/owner");
  });

  it("redirects to /login with error=auth and no code", async () => {
    const response = await GET(requestWith({}));

    expect(response.headers.get("location")).toBe(
      "https://heritage.example.test/login?error=auth&next=%2Fowner",
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("preserves a sanitized next through the failure redirect, so a retry returns to the same place", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: { message: "expired" } }),
      },
    });

    const response = await GET(requestWith({ code: "stale-code", next: "/activate" }));

    expect(response.headers.get("location")).toBe(
      "https://heritage.example.test/login?error=auth&next=%2Factivate",
    );
  });

  it("never puts the raw one-time code into any redirect location", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: { message: "expired" } }),
      },
    });

    const response = await GET(requestWith({ code: "super-secret-code" }));

    expect(response.headers.get("location")).not.toContain("super-secret-code");
  });
});
