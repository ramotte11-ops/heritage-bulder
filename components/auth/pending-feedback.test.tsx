// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Recette Builder V1 — every action that makes the family wait says so at
 * once: opening a memorial's Builder from the owner space, signing out.
 */
const linkStatus = vi.hoisted(() => ({ pending: false }));
const formStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => linkStatus }));
vi.mock("react-dom", async (original) => ({ ...(await original<typeof import("react-dom")>()), useFormStatus: () => formStatus }));

const { PendingLinkLabel } = await import("./PendingLinkLabel");
const { LogoutSubmit } = await import("./LogoutSubmit");

afterEach(() => {
  cleanup();
  linkStatus.pending = false;
  formStatus.pending = false;
});

describe("PendingLinkLabel", () => {
  it("shows the link label, then the pending label with a polite status while the navigation runs", () => {
    const { rerender } = render(<PendingLinkLabel pendingLabel="Ouverture de l’atelier…">Ouvrir l’atelier</PendingLinkLabel>);
    expect(screen.getByText("Ouvrir l’atelier")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    linkStatus.pending = true;
    rerender(<PendingLinkLabel pendingLabel="Ouverture de l’atelier…">Ouvrir l’atelier</PendingLinkLabel>);
    expect(screen.getByRole("status").textContent).toBe("Ouverture de l’atelier…");
  });
});

describe("LogoutSubmit", () => {
  it("is a real submit button, disabled and labelled « Déconnexion… » while signing out", () => {
    const { rerender } = render(<LogoutSubmit />);
    const button = screen.getByRole("button", { name: "Se déconnecter" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.hasAttribute("disabled")).toBe(false);
    formStatus.pending = true;
    rerender(<LogoutSubmit />);
    const busy = screen.getByRole("button");
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.textContent).toBe("Déconnexion…");
  });
});
