// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AccountFormState } from "@/lib/auth/account-state";
import { translate } from "@/lib/i18n/translate";

const { accountAction } = vi.hoisted(() => ({
  accountAction: vi.fn<(prev: AccountFormState, data: FormData) => Promise<AccountFormState>>(),
}));
vi.mock("@/app/auth/actions", () => ({ accountAction }));

const { EmailVerificationStep } = await import("./EmailVerificationStep");
const { FirstSaveNotice } = await import("@/components/builder/FirstSaveNotice");

const fr = (key: Parameters<typeof translate>[1]) => translate("fr", key);
const sent = () => Object.fromEntries([...accountAction.mock.calls.at(-1)![1].entries()].map(([k, v]) => [k, String(v)]));

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("EmailVerificationStep (QG 004-B)", () => {
  beforeEach(() => accountAction.mockReset());
  afterEach(cleanup);

  it("asks for a code for the signed-in account (no address typed), then checks it and reports success", async () => {
    const onVerified = vi.fn();
    accountAction
      .mockResolvedValueOnce({ step: "verify_email", email: "famille@example.com", notice: "code_sent", sentAt: Date.now() })
      .mockResolvedValueOnce({ step: "verified", email: "famille@example.com" });
    const view = render(<EmailVerificationStep language="fr" onVerified={onVerified} />);

    expect(screen.getByText(fr("verify.title"))).toBeTruthy();
    await click(fr("verify.send"));
    expect(sent()).toEqual({ intent: "verify_email_send" });
    expect(screen.getByText(/famille@example\.com/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(fr("account.code")), { target: { value: "123456" } });
    await click(fr("account.codeSubmit"));
    expect(sent()).toEqual({ intent: "verify_email_check", code: "123456" });
    expect(onVerified).toHaveBeenCalled();
    expect(view.container.querySelector('[data-email-verification="verified"]')).not.toBeNull();
  });

  it("shows a wrong code, and lets the family correct the address with its password", async () => {
    accountAction
      .mockResolvedValueOnce({ step: "verify_email", email: "famile@example.com", notice: "code_sent", sentAt: Date.now() })
      .mockResolvedValueOnce({ step: "verify_email", email: "famile@example.com", error: "invalid_or_expired_code" })
      .mockResolvedValueOnce({ step: "change_email_code", email: "famille@example.com", notice: "code_sent", sentAt: Date.now() });
    render(<EmailVerificationStep language="fr" onVerified={vi.fn()} />);
    await click(fr("verify.send"));
    fireEvent.change(screen.getByLabelText(fr("account.code")), { target: { value: "000000" } });
    await click(fr("account.codeSubmit"));
    expect(screen.getByRole("alert").textContent).toBe(fr("account.errorCode"));

    fireEvent.click(screen.getByRole("button", { name: fr("verify.notMyAddress") }));
    fireEvent.change(screen.getByLabelText(fr("verify.newEmail")), { target: { value: "famille@example.com" } });
    fireEvent.change(screen.getByLabelText(fr("verify.currentPassword")), { target: { value: "les lilas du jardin" } });
    await click(fr("verify.changeSubmit"));
    expect(sent()).toEqual({ intent: "change_email_send", newEmail: "famille@example.com", password: "les lilas du jardin" });
    expect(screen.getByText(/famille@example\.com/)).toBeTruthy();
  });

  it("explains the locked address (anti-abuse rule) instead of failing silently", async () => {
    accountAction.mockResolvedValueOnce({ step: "change_email", email: "famile@example.com", error: "email_locked" });
    render(<EmailVerificationStep language="fr" onVerified={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: fr("verify.notMyAddress") }));
    fireEvent.change(screen.getByLabelText(fr("verify.newEmail")), { target: { value: "famille@example.com" } });
    fireEvent.change(screen.getByLabelText(fr("verify.currentPassword")), { target: { value: "x" } });
    await click(fr("verify.changeSubmit"));
    expect(screen.getByRole("alert").textContent).toBe(fr("verify.errorEmailLocked"));
  });
});

describe("FirstSaveNotice (QG 004-B)", () => {
  afterEach(cleanup);

  it("shows the PO's validated texts, then can be dismissed", () => {
    render(<FirstSaveNotice language="fr" />);
    expect(screen.getByText("Votre hommage est sauvegardé")).toBeTruthy();
    expect(screen.getByText("Vous pouvez revenir pour poursuivre sa création.")).toBeTruthy();
    expect(screen.getByText("Votre publication gratuite")).toBeTruthy();
    expect(screen.getByText("Vous disposez de 10 jours à compter de cette sauvegarde pour publier gratuitement votre avis.")).toBeTruthy();
    expect(screen.getByText("Votre temps de préparation")).toBeTruthy();
    expect(screen.getByText("Votre brouillon reste disponible pendant 45 jours pour préparer votre hommage complet, à votre rythme.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: fr("firstSave.dismiss") }));
    expect(screen.queryByText("Votre hommage est sauvegardé")).toBeNull();
  });
});
