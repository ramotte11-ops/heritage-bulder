// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EmailCodeFormState, MagicLinkFormState } from "@/lib/auth/magic-link-state";

const { requestMagicLink, verifyEmailCode } = vi.hoisted(() => ({
  requestMagicLink: vi.fn<(prev: MagicLinkFormState, data: FormData) => Promise<MagicLinkFormState>>(),
  verifyEmailCode: vi.fn<(prev: EmailCodeFormState, data: FormData) => Promise<EmailCodeFormState>>(),
}));
vi.mock("@/app/auth/actions", () => ({ requestMagicLink, verifyEmailCode }));

const { EmailCodeSignIn } = await import("./EmailCodeSignIn");

const LABELS = {
  emailLabel: "Adresse",
  requestSubmit: "Recevoir mon code",
  requestSending: "Envoi…",
  codeSent: "Code envoyé à {email}.",
  codeLabel: "Code",
  codeSubmit: "Valider",
  codeVerifying: "Vérification…",
  resend: "Nouveau code",
  resendWait: "Patientez {seconds} s",
  resent: "Renvoyé.",
  changeEmail: "Modifier l'adresse",
  requestErrors: { invalid_email: "Adresse invalide", rate_limited: "Trop de demandes", send_failed: "Envoi impossible" },
  verifyErrors: {
    invalid_email: "Adresse invalide",
    invalid_format: "6 chiffres",
    invalid_or_expired: "Code incorrect ou expiré",
    rate_limited: "Trop de tentatives",
    failed: "Échec",
  },
};

async function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Adresse"), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" }));
  });
}

describe("EmailCodeSignIn (QG 003)", () => {
  beforeEach(() => {
    requestMagicLink.mockReset();
    verifyEmailCode.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("asks for the address, then for the code in the same tab, carrying address and return path", async () => {
    requestMagicLink.mockImplementation(async (_prev, data) => ({
      status: "success", message: "", email: String(data.get("email")),
    }));
    verifyEmailCode.mockResolvedValue({ status: "error", reason: "invalid_or_expired" });

    const view = render(<EmailCodeSignIn next="/brouillon/reprise" labels={LABELS} />);
    await submitEmail("famille@example.com");

    expect(await screen.findByText("Code envoyé à famille@example.com.")).toBeTruthy();
    expect(view.container.querySelector('[data-email-code-step="code"]')).not.toBeNull();
    const code = screen.getByLabelText("Code") as HTMLInputElement;
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");

    fireEvent.change(code, { target: { value: "000000" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    });

    const sent = verifyEmailCode.mock.calls[0][1];
    expect(sent.get("email")).toBe("famille@example.com");
    expect(sent.get("code")).toBe("000000");
    expect(sent.get("next")).toBe("/brouillon/reprise");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Code incorrect ou expiré");
  });

  it("holds « new code » during Supabase's interval, then resends to the same address", async () => {
    requestMagicLink.mockImplementation(async (_prev, data) => ({
      status: "success", message: "", email: String(data.get("email")),
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<EmailCodeSignIn labels={LABELS} />);
    await submitEmail("famille@example.com");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    const waiting = screen.getByRole("button", { name: /Patientez \d+ s/ });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    const resend = screen.getByRole("button", { name: "Nouveau code" });
    await act(async () => {
      fireEvent.click(resend);
    });
    expect(requestMagicLink).toHaveBeenCalledTimes(2);
    expect(requestMagicLink.mock.calls[1][1].get("email")).toBe("famille@example.com");
    expect(await screen.findByText(/Renvoyé\./)).toBeTruthy();
  });

  it("stays on the code step when a resend is refused, and shows why", async () => {
    requestMagicLink
      .mockResolvedValueOnce({ status: "success", message: "", email: "famille@example.com" })
      .mockResolvedValueOnce({ status: "error", message: "", reason: "rate_limited" });
    const view = render(<EmailCodeSignIn labels={LABELS} />);
    await submitEmail("famille@example.com");
    await screen.findByLabelText("Code");

    const resendForm = view.container.querySelector("[data-email-code-resend]")!.closest("form")!;
    await act(async () => {
      fireEvent.submit(resendForm);
    });

    expect(await screen.findByText("Trop de demandes")).toBeTruthy();
    expect(screen.getByLabelText("Code")).toBeTruthy();
  });

  it("lets the family change the address, keeping what was typed", async () => {
    requestMagicLink.mockImplementation(async (_prev, data) => ({
      status: "success", message: "", email: String(data.get("email")),
    }));
    render(<EmailCodeSignIn labels={LABELS} />);
    await submitEmail("famille@example.com");
    await screen.findByLabelText("Code");

    fireEvent.click(screen.getByRole("button", { name: "Modifier l'adresse" }));
    const email = screen.getByLabelText("Adresse") as HTMLInputElement;
    expect(email.value).toBe("famille@example.com");

    await submitEmail("autre@example.com");
    expect(await screen.findByText(/Code envoyé à autre@example\.com\./)).toBeTruthy();
  });

  it("shows why the code could not be sent and stays on the address step", async () => {
    requestMagicLink.mockResolvedValue({ status: "error", message: "", reason: "send_failed" });
    render(<EmailCodeSignIn labels={LABELS} />);
    await submitEmail("famille@example.com");

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Envoi impossible");
    expect(screen.getByLabelText("Adresse")).toBeTruthy();
  });
});
