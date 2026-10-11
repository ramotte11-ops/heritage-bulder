// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { translate } from "@/lib/i18n/translate";
import { LANGUAGES } from "@/config/languages";

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

// BuilderScreen's progress bar is `aria-hidden`, so it is spied on
// directly rather than looked up by role.
const { ProgressBar } = vi.hoisted(() => ({ ProgressBar: vi.fn(() => null) }));
vi.mock("./ProgressBar", () => ({ ProgressBar }));

const { WelcomeStep } = await import("./WelcomeStep");

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const ok = () => vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });

describe("WelcomeStep — real, translated interface", () => {
  it("renders the validated French copy as real text", () => {
    render(<WelcomeStep language="fr" content={{}} persist={ok()} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Chaque vie mérite d’être racontée.");
    expect(
      screen.getByText(
        "HERITAGE vous accompagne pas à pas pour créer un hommage personnel, à l’image de la personne que vous aimez.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Prenez votre temps. Vous pourrez revenir sur vos réponses et compléter votre hommage à votre rythme.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Commencer son hommage/ })).toBeTruthy();
    expect(screen.getByText("HERITAGE")).toBeTruthy();
  });

  it.each(LANGUAGES)("is fully translated in %s (no key falls back to another language)", (language) => {
    render(<WelcomeStep language={language} content={{}} persist={ok()} />);
    for (const key of ["welcome.title", "welcome.intro", "welcome.reassurance", "welcome.cta"] as const) {
      expect(screen.getAllByText(translate(language, key)).length).toBeGreaterThan(0);
    }
    expect(document.querySelector("main")?.getAttribute("lang")).toBe(language);
  });

  it("shows no progress bar and no language selector", () => {
    render(<WelcomeStep language="fr" content={{}} persist={ok()} />);
    expect(ProgressBar).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("keeps the decorative sprig out of the accessibility tree", () => {
    render(<WelcomeStep language="fr" content={{}} persist={ok()} />);
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});

describe("WelcomeStep — the CTA", () => {
  it("persists the Welcome marker on top of the existing content, then refreshes", async () => {
    const persist = ok();
    render(<WelcomeStep language="fr" content={{}} persist={persist} />);

    fireEvent.click(screen.getByRole("button", { name: /Commencer son hommage/ }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(persist).toHaveBeenCalledWith({ welcome: { status: "completed" } });
  });

  it("on a failed save: shows the generic error and never moves on", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network"));
    render(<WelcomeStep language="fr" content={{}} persist={persist} />);

    fireEvent.click(screen.getByRole("button", { name: /Commencer son hommage/ }));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Une erreur est survenue."));
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
