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

// QG 004-B — HERITAGE's proof store (service_role RPCs), mocked.
const { proofs } = vi.hoisted(() => ({
  proofs: {
    isOwnerVerified: vi.fn(),
    record: vi.fn(),
    isChangeAllowed: vi.fn(),
    applyChange: vi.fn(),
  },
}));
vi.mock("@/lib/auth/email-verification", () => ({ createEmailVerificationStore: () => proofs }));

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
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: "u", email: EMAIL } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    });
    proofs.record.mockResolvedValue("recorded");
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

describe("QG 004-B — inscription immédiate, adresse saisie deux fois", () => {
  it("opens the account at once (Confirm email off): session → redirect, no code step", async () => {
    auth({ signUp: vi.fn().mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null }) });
    await expect(accountAction(START, form({ intent: "signup", email: EMAIL, emailConfirm: EMAIL, password: GOOD_PASSWORD, next: "/brouillon/reprise" })))
      .rejects.toThrow("REDIRECT:/brouillon/reprise");
  });

  it("refuses two different addresses before calling Supabase", async () => {
    const a = auth({ signUp: vi.fn() });
    expect(await accountAction(START, form({ intent: "signup", email: EMAIL, emailConfirm: "famile@example.com", password: GOOD_PASSWORD })))
      .toMatchObject({ step: "signup", error: "emails_differ" });
    expect(a.signUp).not.toHaveBeenCalled();
  });
});

describe("QG 004-B — récupération : révocation des sessions non autorisées", () => {
  beforeEach(() => Object.values(proofs).forEach((fn) => fn.mockReset()));

  it("revokes every OTHER session as soon as the recovery code proves the mailbox, then records the proof", async () => {
    const order: string[] = [];
    const a = auth({
      verifyOtp: vi.fn().mockImplementation(async () => { order.push("verify"); return { data: { user: { id: "u1", email: EMAIL } }, error: null }; }),
      signOut: vi.fn().mockImplementation(async () => { order.push("revoke"); return { error: null }; }),
    });
    proofs.record.mockImplementation(async () => { order.push("proof"); return "recorded"; });

    expect(await accountAction(START, form({ intent: "verify_reset", email: EMAIL, code: "123456" })))
      .toMatchObject({ step: "new_password" });
    expect(a.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(order).toEqual(["verify", "revoke", "proof"]);
    expect(proofs.record).toHaveBeenCalledWith("u1", EMAIL, "password_recovery");
  });

  it("stops (no new password) when the revocation fails", async () => {
    auth({
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: EMAIL } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } }),
    });
    expect(await accountAction(START, form({ intent: "verify_reset", email: EMAIL, code: "123456" })))
      .toMatchObject({ step: "reset_code", error: "failed" });
    expect(proofs.record).not.toHaveBeenCalled();
  });

  it("revokes other sessions again once the new password is set", async () => {
    const a = auth({
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: EMAIL } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    });
    await expect(accountAction(START, form({ intent: "new_password", email: EMAIL, password: GOOD_PASSWORD, next: "/owner" })))
      .rejects.toThrow("REDIRECT:/owner");
    expect(a.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("a wrong recovery code creates no session revocation and no proof", async () => {
    const a = auth({
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", status: 403 } }),
      signOut: vi.fn(),
    });
    expect(await accountAction(START, form({ intent: "verify_reset", email: EMAIL, code: "000000" })))
      .toMatchObject({ error: "invalid_or_expired_code" });
    expect(a.signOut).not.toHaveBeenCalled();
    expect(proofs.record).not.toHaveBeenCalled();
  });
});

describe("QG 004-B — vérification de l'adresse avant publication", () => {
  beforeEach(() => Object.values(proofs).forEach((fn) => fn.mockReset()));
  const signedIn = { data: { user: { id: "u1", email: EMAIL } }, error: null };

  it("sends the code to the SIGNED-IN account's address, never to a typed one, without creating users", async () => {
    const a = auth({ getUser: vi.fn().mockResolvedValue(signedIn), signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    expect(await accountAction(START, form({ intent: "verify_email_send", email: "attaquant@example.com" })))
      .toMatchObject({ step: "verify_email", email: EMAIL, notice: "code_sent" });
    expect(a.signInWithOtp).toHaveBeenCalledWith({ email: EMAIL, options: { shouldCreateUser: false } });
  });

  it("refuses without a session", async () => {
    const a = auth({ getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }), signInWithOtp: vi.fn() });
    expect(await accountAction(START, form({ intent: "verify_email_send" }))).toMatchObject({ error: "signed_out" });
    expect(a.signInWithOtp).not.toHaveBeenCalled();
  });

  it("records the proof only after Supabase verified the code for THIS account", async () => {
    const a = auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: EMAIL } }, error: null }),
    });
    proofs.record.mockResolvedValue("recorded");
    expect(await accountAction(START, form({ intent: "verify_email_check", code: "123456", email: "autre@example.com" })))
      .toEqual({ step: "verified", email: EMAIL });
    expect(a.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
    expect(proofs.record).toHaveBeenCalledWith("u1", EMAIL, "email_otp");
  });

  it("never records a proof when the code proved ANOTHER account, and closes that session", async () => {
    const a = auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: "someone-else", email: EMAIL } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    });
    expect(await accountAction(START, form({ intent: "verify_email_check", code: "123456" })))
      .toMatchObject({ step: "signin", error: "session_expired" });
    expect(a.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(proofs.record).not.toHaveBeenCalled();
  });

  it("a wrong, expired or reused code records nothing", async () => {
    auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", status: 403 } }),
    });
    expect(await accountAction(START, form({ intent: "verify_email_check", code: "999999" })))
      .toMatchObject({ step: "verify_email", error: "invalid_or_expired_code" });
    expect(proofs.record).not.toHaveBeenCalled();
  });
});

describe("QG 004-B — changement d'adresse", () => {
  beforeEach(() => Object.values(proofs).forEach((fn) => fn.mockReset()));
  const signedIn = { data: { user: { id: "u1", email: EMAIL } }, error: null };
  const NEW = "nouvelle@example.com";

  it("requires the current password, checks the lock, then asks Supabase to send a code to the NEW address", async () => {
    const a = auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    });
    proofs.isChangeAllowed.mockResolvedValue(true);
    expect(await accountAction(START, form({ intent: "change_email_send", newEmail: NEW, password: GOOD_PASSWORD })))
      .toMatchObject({ step: "change_email_code", email: NEW });
    expect(a.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: GOOD_PASSWORD });
    expect(a.updateUser).toHaveBeenCalledWith({ email: NEW });
  });

  it("a stolen session without the password cannot move the account", async () => {
    const a = auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400 } }),
      updateUser: vi.fn(),
    });
    expect(await accountAction(START, form({ intent: "change_email_send", newEmail: NEW, password: "faux mot de passe" })))
      .toMatchObject({ error: "invalid_credentials" });
    expect(a.updateUser).not.toHaveBeenCalled();
  });

  it("keeps the anti-abuse lock: an address bound to a free history is not changed online", async () => {
    const a = auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      updateUser: vi.fn(),
    });
    proofs.isChangeAllowed.mockResolvedValue(false);
    expect(await accountAction(START, form({ intent: "change_email_send", newEmail: NEW, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "email_locked" });
    expect(a.updateUser).not.toHaveBeenCalled();
  });

  it("refuses the same address and an address already used", async () => {
    auth({ getUser: vi.fn().mockResolvedValue(signedIn) });
    expect(await accountAction(START, form({ intent: "change_email_send", newEmail: EMAIL.toUpperCase(), password: GOOD_PASSWORD })))
      .toMatchObject({ error: "same_email" });
    auth({
      getUser: vi.fn().mockResolvedValue(signedIn),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: { code: "email_exists", status: 422 } }),
    });
    proofs.isChangeAllowed.mockResolvedValue(true);
    expect(await accountAction(START, form({ intent: "change_email_send", newEmail: NEW, password: GOOD_PASSWORD })))
      .toMatchObject({ error: "email_taken" });
  });

  it("after the code sent to the new address, moves owners.email and the proof together", async () => {
    const getUser = vi.fn()
      .mockResolvedValueOnce(signedIn)
      .mockResolvedValueOnce({ data: { user: { id: "u1", email: NEW } }, error: null });
    const a = auth({ getUser, verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    proofs.applyChange.mockResolvedValue("changed");
    expect(await accountAction(START, form({ intent: "change_email_check", newEmail: NEW, code: "123456" })))
      .toEqual({ step: "verified", email: NEW });
    expect(a.verifyOtp).toHaveBeenCalledWith({ email: NEW, token: "123456", type: "email_change" });
    expect(proofs.applyChange).toHaveBeenCalledWith("u1", NEW);
  });

  it("changes nothing on HERITAGE's side while Supabase has not switched the address", async () => {
    const getUser = vi.fn().mockResolvedValue(signedIn);
    auth({ getUser, verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) });
    expect(await accountAction(START, form({ intent: "change_email_check", newEmail: NEW, code: "123456" })))
      .toMatchObject({ error: "failed" });
    expect(proofs.applyChange).not.toHaveBeenCalled();
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
