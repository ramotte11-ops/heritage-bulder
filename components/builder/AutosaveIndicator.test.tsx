// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { AUTOSAVE_DEBOUNCE_MS, INITIAL_AUTOSAVE_STATE, type AutosaveState } from "@/lib/builder/autosave-state";

/**
 * Builder continuity mission — the family must see what `useAutosave`
 * already knows: saving, saved, and above all a FAILED save.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function state(status: AutosaveState["status"]): AutosaveState {
  return { ...INITIAL_AUTOSAVE_STATE, status };
}

describe("AutosaveIndicator", () => {
  it("shows nothing while idle — the value on screen is the one just loaded", () => {
    render(<AutosaveIndicator language="fr" state={state("idle")} onRetry={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["pending", "saving"] as const)("shows 'Enregistrement…' while %s", (status) => {
    render(<AutosaveIndicator language="fr" state={state(status)} onRetry={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("Enregistrement…");
  });

  it("shows 'Enregistré' once saved", () => {
    render(<AutosaveIndicator language="fr" state={state("saved")} onRetry={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("Enregistré");
  });

  it("an error is an alert with a working 'Réessayer' wired to the hook's retry()", () => {
    const onRetry = vi.fn();
    render(<AutosaveIndicator language="fr" state={state("error")} onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Vos dernières modifications n'ont pas pu être enregistrées.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("an error while offline says so, and relies on the existing reconnect retry (no button)", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<AutosaveIndicator language="fr" state={state("error")} onRetry={() => {}} />);

    expect(screen.getByRole("alert").textContent).toContain("Vous êtes hors ligne.");
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
  });

  it("speaks the family's language", () => {
    render(<AutosaveIndicator language="es" state={state("saved")} onRetry={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("Guardado");
  });
});

describe("AutosaveIndicator — wired into a real Guided Flow screen", () => {
  it("a background autosave refused by the server becomes visible on the A10-A12 sheet", async () => {
    vi.useFakeTimers();
    const { PersonSheetStep } = await import("./PersonSheetStep");
    const persist = vi.fn().mockRejectedValue(new Error("Unauthorized"));

    render(
      <PersonSheetStep
        language="fr"
        editorialContext="announcement"
        content={{
          hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
          guidedFlow: { A01: { status: "completed" }, A04: { status: "completed", answer: "no" }, A09: { status: "skipped" } },
          personWords: { text: null },
          lovedThings: { text: null },
          legacy: { text: null },
        } as never}
        persist={persist}
      />,
    );

    fireEvent.change(screen.getByLabelText("Qu'est-ce qu'elle aimait particulièrement ?"), {
      target: { value: "Les longues promenades." },
    });
    expect(screen.getByRole("status").textContent).toBe("Enregistrement…");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    });

    expect(persist).toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("n'ont pas pu être enregistrées");
  });
});
