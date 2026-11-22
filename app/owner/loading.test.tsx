// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { default: OwnerLoading } = await import("./loading");

afterEach(cleanup);

describe("Mission 04-G / L1.3 — family space loading boundary", () => {
  it("shows an accessible busy state with the existing « Un instant… » in the three Builder languages", () => {
    const { container } = render(<OwnerLoading />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector('[lang="fr"]')?.textContent).toContain("Un instant…");
    expect(container.querySelector('[lang="en"]')?.textContent).toContain("Just a moment…");
    expect(container.querySelector('[lang="es"]')?.textContent).toContain("Un momento…");
  });

  it("shows the family space's frame and nothing private (no data, no link, no account)", () => {
    const { container } = render(<OwnerLoading />);
    expect(screen.getByText("HERITAGE")).toBeTruthy();
    expect(screen.getByText("Hommage")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});
