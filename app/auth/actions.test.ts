import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { accountAction, signOut } from "./actions";
import type { AccountFormState } from "@/lib/auth/account-state";

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
  // No-op: none of these tests trigger Next's own control-flow errors.
  unstable_rethrow: vi.fn(),
}));

// getSiteUrl() reads next/headers; a stable value is enough here (its own
// coverage is lib/supabase/site-url.test.ts).
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}));

const START: AccountFormState = { step: "signup" };
const EMAIL = "famille@example.com";
const GOOD_PASSWORD = "les lilas du jardin";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function auth(overrides: Record<string, unknown>) {
  const client = { auth: overrides };
  createServerSupabaseClient.mockResolvedValue(client);
  return overrides as Record<string, ReturnType<typeof vi.fn>>;
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createServerSupabaseClient.mockReset();
  redirect.mockClear();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // No password and no code may ever reach the logs.
  const logged = JSON.stringify(errorLog.mock.calls);
  expect(logged).not.toContain(GOOD_PASSWORD);
  expect(logged).not.toContain("123456");
  expect(logged).not.toContain(EMAIL);
  errorLog.mockRestore();
});

describe("accountAction — créer mon compte", () => {
  it("creates the account and moves to the 6-digit code step, same answer for every address", async () => {
    const a = auth({ signUp: vi.fn().mockResolvedValue({ data: { user: {}, session: null }, error: null }) });

    const state = await accountAction(START, form({ intent: "signup", email: EMAIL, password: GOOD_PASSWORD, next: "/brouillon/reprise" }));

    expect(state).toMatchObject({ step: "confirm", email: EMAIL, notice: "code_sent" });
    expect(state.sentAt).toBeTypeOf("number");
    expect(a.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: GOOD_PASSWORD,
      options: { emailRedirectTo: expect.stringContaining("/auth/callback?next=%2Fbrouillon%2Freprise") },
    });
  });

  it("refuses a short, overlong or common password without calling Supabase", async () => {
    const a = auth({ signUp: vi.fn() });
    for (const [password, error] of [
      ["court", "password_too_short"],
      ["x".repeat(73), "password_too_long"],
      ["motdepasse", "password_too_common"],
      ["Password123", "password_too_common"],
      ["famille@example.com", "password_too_common"],
    ] as const) {
      const state = await accountAction(START, form({ intent: "signup", email: EMAIL, password }));
      expect(state).toMatchObject({ step: "signup", error });
    }
    expect(a.signUp).not.toHaveBeenCalled();
  });

  it("accepts 8 characters without composition rules", async () => {
    auth({ signUp: vi.fn().mockResolvedValue({ data: { user: {}, session: null }, error: null }) });
    const state = await accountAction(START, form({ intent: "signup", email: EMAIL, password: "lavandes" }));
    expect(state.step).toBe("confirm");
  });

  it("maps Supabase's leaked-password refusal to « compromised »", async () => {
    auth({ signUp: vi.fn().mockResolvedValue({ data: {}, error: { code: "weak_password", status: 422, reasons: ["pwned"] } }) });
    const state = await accountAction(START, form({ intent: "signup", email: EMAIL, password: GOOD_PASSWORD }));
    expect(state).toMatchObject({ step: "signup", error: "password_compromised" });
  });

  it("answers neutrally when the address cannot be used, and on rate limits", async () => {
    auth({ signUp: vi.fn().mockResolvedValue({ data: {}, error: { code: "user_already_exists", status: 422 } }) });
    expect(await accountAction(START, form({ intent: "signup", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "account_unavailable" });
    auth({ signUp: vi.fn().mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", status: 429 } }) });
    expect(await accountAction(START, form({ intent: "signup", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "rate_limited" });
  });

  it("goes straight on when the project returns a session (confirmation disabled)", async () => {
    auth({ signUp: vi.fn().mockResolvedValue({ data: { user: {}, session: {} }, error: null }) });
    await expect(accountAction(START, form({ intent: "signup", email: EMAIL, password: GOOD_PASSWORD, next: "/brouillon/reprise" })))
      .rejects.toThrow("REDIRECT:/brouillon/reprise");
  });
});

describe("accountAction — confirmation par code", () => {
  it("verifies the code in this tab and redirects to the sanitized return path", async () => {
    const a = auth({ verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    await expect(accountAction(START, form({ intent: "confirm", email: EMAIL, code: "123 456", next: "/brouillon/reprise" })))
      .rejects.toThrow("REDIRECT:/brouillon/reprise");
    expect(a.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
  });

  it("never redirects outside the site", async () => {
    auth({ verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    await expect(accountAction(START, form({ intent: "confirm", email: EMAIL, code: "123456", next: "https://evil.example.com" })))
      .rejects.toThrow("REDIRECT:/owner");
  });

  it("refuses a malformed code without calling Supabase, and a wrong/expired/used one as one reason", async () => {
    expect(await accountAction(START, form({ intent: "confirm", email: EMAIL, code: "12ab56" })))
      .toMatchObject({ step: "confirm", error: "invalid_code_format" });
    auth({ verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } }) });
    expect(await accountAction(START, form({ intent: "confirm", email: EMAIL, code: "000000" })))
      .toMatchObject({ step: "confirm", error: "invalid_or_expired_code" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("resends a confirmation code, keeping the family on the code step", async () => {
    const a = auth({ resend: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    expect(await accountAction(START, form({ intent: "resend_confirm", email: EMAIL })))
      .toMatchObject({ step: "confirm", notice: "code_resent" });
    expect(a.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: EMAIL }));
    auth({ resend: vi.fn().mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", status: 429 } }) });
    expect(await accountAction(START, form({ intent: "resend_confirm", email: EMAIL })))
      .toMatchObject({ step: "confirm", error: "rate_limited" });
  });
});

describe("accountAction — j'ai déjà un compte", () => {
  it("signs in with the password and redirects", async () => {
    const a = auth({ signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    await expect(accountAction(START, form({ intent: "signin", email: EMAIL, password: GOOD_PASSWORD, next: "/activate" })))
      .rejects.toThrow("REDIRECT:/activate");
    expect(a.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: GOOD_PASSWORD });
  });

  it("gives one neutral message for a wrong password or an unknown address", async () => {
    auth({ signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400 } }) });
    expect(await accountAction(START, form({ intent: "signin", email: EMAIL, password: "mauvais mot" })))
      .toMatchObject({ step: "signin", error: "invalid_credentials" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses an empty password locally and reports Supabase's attempt limit", async () => {
    expect(await accountAction(START, form({ intent: "signin", email: EMAIL, password: "" })))
      .toMatchObject({ error: "missing_password" });
    auth({ signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: { code: "over_request_rate_limit", status: 429 } }) });
    expect(await accountAction(START, form({ intent: "signin", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "rate_limited" });
  });

  it("sends a fresh code to an account never confirmed, and opens the code step", async () => {
    const a = auth({
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: { code: "email_not_confirmed", status: 400 } }),
      resend: vi.fn().mockResolvedValue({ data: {}, error: null }),
    });
    expect(await accountAction(START, form({ intent: "signin", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ step: "confirm", email: EMAIL, notice: "not_confirmed" });
    expect(a.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: EMAIL }));
  });
});

describe("accountAction — mot de passe oublié", () => {
  it("always answers with the code step, whether or not the account exists", async () => {
    const a = auth({ resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    expect(await accountAction(START, form({ intent: "forgot", email: EMAIL })))
      .toMatchObject({ step: "reset_code", email: EMAIL, notice: "code_sent" });
    expect(a.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ redirectTo: expect.any(String) }));
    auth({ resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: { code: "unexpected_failure", status: 500 } }) });
    expect(await accountAction(START, form({ intent: "forgot", email: EMAIL })))
      .toMatchObject({ step: "reset_code" });
  });

  it("verifies the recovery code, then accepts a new password and redirects", async () => {
    const a = auth({
      verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    });
    expect(await accountAction(START, form({ intent: "verify_reset", email: EMAIL, code: "123456" })))
      .toMatchObject({ step: "new_password", email: EMAIL });
    expect(a.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "recovery" });

    await expect(accountAction(START, form({ intent: "new_password", email: EMAIL, password: GOOD_PASSWORD, next: "/owner" })))
      .rejects.toThrow("REDIRECT:/owner");
    expect(a.updateUser).toHaveBeenCalledWith({ password: GOOD_PASSWORD });
  });

  it("refuses a weak new password before touching the account", async () => {
    const a = auth({ getUser: vi.fn(), updateUser: vi.fn() });
    expect(await accountAction(START, form({ intent: "new_password", email: EMAIL, password: "1234" })))
      .toMatchObject({ step: "new_password", error: "password_too_short" });
    expect(a.updateUser).not.toHaveBeenCalled();
  });

  it("sends the family back to « mot de passe oublié » when the recovery session is gone", async () => {
    const a = auth({ getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }), updateUser: vi.fn() });
    expect(await accountAction(START, form({ intent: "new_password", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ step: "forgot", error: "session_expired" });
    expect(a.updateUser).not.toHaveBeenCalled();
  });

  it("maps compromised and unchanged passwords on update", async () => {
    auth({
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: "weak_password", status: 422, reasons: ["pwned"] } }),
    });
    expect(await accountAction(START, form({ intent: "new_password", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "password_compromised" });
    auth({
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: "same_password", status: 422 } }),
    });
    expect(await accountAction(START, form({ intent: "new_password", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "password_same" });
  });

  it("refuses a wrong recovery code without opening the new-password step", async () => {
    auth({ verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } }) });
    expect(await accountAction(START, form({ intent: "verify_reset", email: EMAIL, code: "999999" })))
      .toMatchObject({ step: "reset_code", error: "invalid_or_expired_code" });
  });
});

describe("accountAction — robustness", () => {
  it("rejects an unknown intent and fails closed when Supabase is unreachable", async () => {
    expect(await accountAction(START, form({ intent: "drop_tables", email: EMAIL })))
      .toMatchObject({ error: "failed" });
    createServerSupabaseClient.mockRejectedValue(new Error("network down"));
    expect(await accountAction(START, form({ intent: "signin", email: EMAIL, password: GOOD_PASSWORD })))
      .toMatchObject({ step: "signin", error: "failed" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects an invalid address on every entry form", async () => {
    for (const intent of ["signup", "signin", "forgot"]) {
      const state = await accountAction(START, form({ intent, email: "pas-une-adresse", password: GOOD_PASSWORD }));
      expect(state.error).toBe("invalid_email");
    }
  });
});

describe("signOut", () => {
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
