import { describe, expect, it, vi, beforeEach } from "vitest";
import { requestMagicLink, signOut } from "./actions";
import { INITIAL_MAGIC_LINK_STATE } from "@/lib/auth/magic-link-state";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createServerSupabaseClient,
}));

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect,
  // No-op here: none of the errors these tests trigger are Next's own
  // internal control-flow errors, so the real implementation would also
  // be a no-op — this just avoids needing the real Next.js request
  // context that isn't present under Vitest.
  unstable_rethrow: vi.fn(),
}));

function formDataWith(email: string): FormData {
  const data = new FormData();
  data.set("email", email);
  return data;
}

describe("requestMagicLink", () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it("rejects an invalid email without ever calling Supabase", async () => {
    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("not-an-email"));

    expect(result.status).toBe("error");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns a generic error message when Supabase reports one, never the raw message", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({
      error: { message: "some internal Supabase implementation detail" },
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("rany@example.com"));

    expect(result.status).toBe("error");
    expect(result.message).not.toContain("internal Supabase implementation detail");
  });

  it("returns success and calls signInWithOtp with the submitted email once validated", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("rany@example.com"));

    expect(result.status).toBe("success");
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "rany@example.com" }),
    );
  });

  it("does not throw and returns a generic error if Supabase isn't configured", async () => {
    createServerSupabaseClient.mockRejectedValue(new Error("Missing environment variable"));

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("rany@example.com"));

    expect(result.status).toBe("error");
  });
});

describe("signOut", () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
    redirect.mockClear();
  });

  it("calls Supabase's signOut and redirects to /login", async () => {
    const supabaseSignOut = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { signOut: supabaseSignOut } });

    await expect(signOut()).rejects.toThrow("REDIRECT:/login");

    expect(supabaseSignOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("still redirects to /login even if sign-out itself fails", async () => {
    createServerSupabaseClient.mockRejectedValue(new Error("network error"));

    await expect(signOut()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
