// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AccountFormState } from "@/lib/auth/account-state";
import { translate } from "@/lib/i18n/translate";
import { LANGUAGES } from "@/config/languages";
import { TRANSLATION_KEYS } from "@/lib/i18n/keys";

const { accountAction } = vi.hoisted(() => ({
  accountAction: vi.fn<(prev: AccountFormState, data: FormData) => Promise<AccountFormState>>(),
}));
vi.mock("@/app/auth/actions", () => ({ accountAction }));

const { AccountAccess } = await import("./AccountAccess");

const fr = (key: Parameters<typeof translate>[1]) => translate("fr", key);

async function submit(buttonName: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: buttonName }));
  });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function lastSent(): Record<string, string> {
  const data = accountAction.mock.calls.at(-1)![1];
  return Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
}

describe("AccountAccess (QG 003)", () => {
  beforeEach(() => accountAction.mockReset());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("offers exactly « Créer mon compte » and « J'ai déjà un compte », then « Mot de passe oublié »", () => {
    render(<AccountAccess language="fr" />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([fr("account.tabSignup"), fr("account.tabSignin")]);
    fireEvent.click(screen.getByRole("tab", { name: fr("account.tabSignin") }));
    expect(screen.getByRole("button", { name: fr("account.forgot") })).toBeTruthy();
    expect(screen.queryByText(/lien/i)).toBeNull();
  });

  it("creates the account, then asks for the code in this tab with address and return path", async () => {
    accountAction
      .mockResolvedValueOnce({ step: "confirm", email: "famille@example.com", notice: "code_sent", sentAt: Date.now() })
      .mockResolvedValueOnce({ step: "confirm", email: "famille@example.com", error: "invalid_or_expired_code" });
    const view = render(<AccountAccess language="fr" next="/brouillon/reprise" />);

    fill(fr("account.email"), "famille@example.com");

    fill(fr("account.emailConfirm"), "famille@example.com");
    fill(fr("account.password"), "les lilas du jardin");
    await submit(fr("account.signupSubmit"));
    expect(lastSent()).toMatchObject({ intent: "signup", email: "famille@example.com", password: "les lilas du jardin", next: "/brouillon/reprise" });

    expect(view.container.querySelector('[data-account-step="confirm"]')).not.toBeNull();
    expect(screen.getByText(/famille@example\.com/)).toBeTruthy();
    const code = screen.getByLabelText(fr("account.code"));
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect((screen.getByRole("button", { name: /Nouveau code possible/ }) as HTMLButtonElement).disabled).toBe(true);

    fill(fr("account.code"), "000000");
    await submit(fr("account.codeSubmit"));
    expect(lastSent()).toMatchObject({ intent: "confirm", email: "famille@example.com", code: "000000", next: "/brouillon/reprise" });
    expect(screen.getByRole("alert").textContent).toBe(fr("account.errorCode"));
  });

  it("enables « nouveau code » after Supabase's interval and resends to the same address", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    accountAction
      .mockResolvedValueOnce({ step: "confirm", email: "famille@example.com", notice: "code_sent", sentAt: Date.now() })
      .mockResolvedValueOnce({ step: "confirm", email: "famille@example.com", notice: "code_resent", sentAt: Date.now() + 61_000 });
    render(<AccountAccess language="fr" />);
    fill(fr("account.email"), "famille@example.com");
    fill(fr("account.emailConfirm"), "famille@example.com");
    fill(fr("account.password"), "les lilas du jardin");
    await submit(fr("account.signupSubmit"));

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await submit(fr("account.resend"));
    expect(lastSent()).toMatchObject({ intent: "resend_confirm", email: "famille@example.com" });
    expect(screen.getByText(new RegExp(fr("account.codeResent")))).toBeTruthy();
  });

  it("shows the neutral sign-in error and keeps the typed address", async () => {
    accountAction.mockResolvedValueOnce({ step: "signin", email: "famille@example.com", error: "invalid_credentials" });
    render(<AccountAccess language="fr" initialStep="signin" />);
    fill(fr("account.email"), "famille@example.com");
    fill(fr("account.password"), "mauvais mot");
    await submit(fr("account.signinSubmit"));

    expect(screen.getByRole("alert").textContent).toBe(fr("account.errorCredentials"));
    expect((screen.getByLabelText(fr("account.email")) as HTMLInputElement).value).toBe("famille@example.com");
  });

  it("runs « mot de passe oublié »: address, code, new password", async () => {
    accountAction
      .mockResolvedValueOnce({ step: "reset_code", email: "famille@example.com", notice: "code_sent", sentAt: Date.now() })
      .mockResolvedValueOnce({ step: "new_password", email: "famille@example.com" })
      .mockResolvedValueOnce({ step: "new_password", email: "famille@example.com", error: "password_too_common" });
    const view = render(<AccountAccess language="fr" initialStep="signin" next="/owner" />);

    fireEvent.click(screen.getByRole("button", { name: fr("account.forgot") }));
    fill(fr("account.email"), "famille@example.com");
    await submit(fr("account.forgotSubmit"));
    expect(lastSent()).toMatchObject({ intent: "forgot", email: "famille@example.com" });
    expect(view.container.querySelector('[data-account-step="reset_code"]')).not.toBeNull();

    fill(fr("account.code"), "123456");
    await submit(fr("account.codeSubmit"));
    expect(lastSent()).toMatchObject({ intent: "verify_reset", code: "123456" });

    fill(fr("account.newPassword"), "motdepasse");
    await submit(fr("account.newPasswordSubmit"));
    expect(lastSent()).toMatchObject({ intent: "new_password", password: "motdepasse", next: "/owner" });
    expect(screen.getByRole("alert").textContent).toBe(fr("account.errorPasswordCommon"));
  });

  it("returns from a code step to the entry forms with « Retour »", async () => {
    accountAction.mockResolvedValueOnce({ step: "confirm", email: "famille@example.com", notice: "code_sent", sentAt: Date.now() });
    const view = render(<AccountAccess language="fr" />);
    fill(fr("account.email"), "famille@example.com");
    fill(fr("account.emailConfirm"), "famille@example.com");
    fill(fr("account.password"), "les lilas du jardin");
    await submit(fr("account.signupSubmit"));
    fireEvent.click(screen.getByRole("button", { name: fr("account.back") }));
    expect(view.container.querySelector('[data-account-step="signin"]')).not.toBeNull();
  });

  it("has every account text in French, English and Spanish", () => {
    const accountKeys = TRANSLATION_KEYS.filter((key) => key.startsWith("account."));
    expect(accountKeys.length).toBeGreaterThanOrEqual(40);
    for (const language of LANGUAGES) {
      for (const key of accountKeys) {
        const text = translate(language, key);
        expect(text, `${language} ${key}`).not.toBe(key);
        expect(text.length, `${language} ${key}`).toBeGreaterThan(1);
      }
    }
    expect(translate("en", "account.tabSignin")).not.toBe(translate("fr", "account.tabSignin"));
    expect(translate("es", "account.tabSignin")).not.toBe(translate("fr", "account.tabSignin"));
  });
});
