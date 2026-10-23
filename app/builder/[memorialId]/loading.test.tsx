// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { default: BuilderLoading } = await import("./loading");

afterEach(cleanup);

describe("Builder loading boundary", () => {
  it("shows an accessible busy state in the three Builder languages", () => {
    const { container } = render(<BuilderLoading />);

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Ouverture de votre hommage…");
    expect(screen.getByRole("status").textContent).toContain("Opening your tribute…");
    expect(screen.getByRole("status").textContent).toContain("Abriendo su homenaje…");
    expect(container.querySelector('[lang="fr"]')).toBeTruthy();
    expect(container.querySelector('[lang="en"]')).toBeTruthy();
    expect(container.querySelector('[lang="es"]')).toBeTruthy();
  });
});
