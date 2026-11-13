import { describe, expect, it, vi, beforeEach } from "vitest";
import { requestMagicLink, signOut, verifyEmailCode } from "./actions";
import { INITIAL_EMAIL_CODE_STATE, INITIAL_MAGIC_LINK_STATE } from "@/lib/auth/magic-link-state";

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

// getSiteUrl() (used inside requestMagicLink) reads next/headers directly —
// see lib/supabase/site-url.test.ts for its own dedicated coverage. Here it
// only needs a stable, harmless value so requestMagicLink's own tests don't
// depend on header-resolution behaviour.
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}));

function formDataWith(email: string, next?: string): FormData {
  const data = new FormData();
  data.set("email", email);
  if (next !== undefined) data.set("next", next);
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

  it("surfaces Supabase's own AuthError message on the page — deliberate, see actions.ts's docstring", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({
      error: { message: "Email rate limit exceeded", status: 429 },
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("rany@example.com"));

    expect(result.status).toBe("error");
    expect(result.message).toContain("Email rate limit exceeded");
  });

  it("surfaces the safe env.ts message distinctly when Supabase isn't configured", async () => {
    createServerSupabaseClient.mockRejectedValue(
      new Error(
        "Missing environment variable NEXT_PUBLIC_SUPABASE_URL. Supabase is not configured yet — see .env.example.",
      ),
    );

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("rany@example.com"));

    expect(result.status).toBe("error");
    expect(result.message).toContain("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
    expect(createServerSupabaseClient).toHaveBeenCalled();
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

  it("embeds a submitted 'next' path into emailRedirectTo (Mission 019C return-to-activate)", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("rany@example.com", "/activate"));

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining("next=%2Factivate"),
        }),
      }),
    );
  });

  it("never lets an unsafe 'next' value reach emailRedirectTo", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    await requestMagicLink(
      INITIAL_MAGIC_LINK_STATE,
      formDataWith("rany@example.com", "https://evil.example.com"),
    );

    const [[{ options }]] = signInWithOtp.mock.calls;
    expect(options.emailRedirectTo).not.toContain("evil.example.com");
    expect(options.emailRedirectTo).toContain("next=%2Fowner");
  });

  it("QG 003 — returns the address on success so the code step can show it", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("famille@example.com"));

    expect(result).toMatchObject({ status: "success", email: "famille@example.com" });
  });

  it("QG 003 — classifies Supabase's send limit as rate_limited", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({
      error: { message: "For security purposes, you can only request this after 42 seconds.", status: 429, code: "over_email_send_rate_limit" },
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { signInWithOtp } });

    const result = await requestMagicLink(INITIAL_MAGIC_LINK_STATE, formDataWith("famille@example.com"));

    expect(result).toMatchObject({ status: "error", reason: "rate_limited" });
  });
});

describe("verifyEmailCode (QG 003)", () => {
  function codeForm(email: string, code: string, next?: string): FormData {
    const data = formDataWith(email, next);
    data.set("code", code);
    return data;
  }

  beforeEach(() => {
    createServerSupabaseClient.mockReset();
    redirect.mockClear();
  });

  it("verifies a valid code in this tab, then redirects to the sanitized return path", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });

    await expect(
      verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "123456", "/brouillon/reprise")),
    ).rejects.toThrow("REDIRECT:/brouillon/reprise");

    expect(verifyOtp).toHaveBeenCalledWith({ email: "famille@example.com", token: "123456", type: "email" });
  });

  it("accepts a code typed with spaces", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });

    await expect(
      verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "123 456", "/owner")),
    ).rejects.toThrow("REDIRECT:/owner");
    expect(verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: "123456" }));
  });

  it("never redirects to an unsafe return path", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });

    await expect(
      verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "123456", "https://evil.example.com")),
    ).rejects.toThrow("REDIRECT:/owner");
  });

  it("refuses a malformed code or address without calling Supabase", async () => {
    expect(await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "12345")))
      .toEqual({ status: "error", reason: "invalid_format" });
    expect(await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "abcdef")))
      .toEqual({ status: "error", reason: "invalid_format" });
    expect(await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("not-an-email", "123456")))
      .toEqual({ status: "error", reason: "invalid_email" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("reports a wrong, expired or already used code as one reason, without redirecting", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: {},
      error: { message: "Token has expired or is invalid", status: 403, code: "otp_expired" },
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });

    const result = await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "000000"));

    expect(result).toEqual({ status: "error", reason: "invalid_or_expired" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports Supabase's attempt limit as rate_limited", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: {},
      error: { message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" },
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });

    expect(await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "123456")))
      .toEqual({ status: "error", reason: "rate_limited" });
  });

  it("never logs the address or the code", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const verifyOtp = vi.fn().mockResolvedValue({
      data: {},
      error: { message: "Token has expired or is invalid", status: 403, code: "otp_expired" },
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });

    await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "987654"));

    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain("famille@example.com");
    expect(logged).not.toContain("987654");
    errorLog.mockRestore();
  });

  it("fails closed when Supabase is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createServerSupabaseClient.mockRejectedValue(new Error("network down"));

    expect(await verifyEmailCode(INITIAL_EMAIL_CODE_STATE, codeForm("famille@example.com", "123456")))
      .toEqual({ status: "error", reason: "failed" });
    expect(redirect).not.toHaveBeenCalled();
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
