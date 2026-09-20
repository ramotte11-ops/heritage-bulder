// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Mission 044 — contract tests for the combined "Quelques mots sur la
 * personne" sheet (A10 + A11 + A12 as ONE Builder screen). Replaces
 * PersonWordsStep.test.tsx (Mission 043's own A10-only tests). Same
 * discipline as TraditionsStep.test.tsx/DeathNoticePrecisionsStep.test.tsx:
 * STATE and RENDER CONTRACTS. Every `text` fixture below is deliberately
 * fictional — never real family content.
 */

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

const { PersonSheetStep } = await import("./PersonSheetStep");

afterEach(cleanup);

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A01: { status: "completed" }, A04: { status: "completed", answer: "no" }, A09: { status: "skipped" } },
  personWords: { text: null },
  lovedThings: { text: null },
  legacy: { text: null },
};

function baseProps(overrides: Partial<Parameters<typeof PersonSheetStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof PersonSheetStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
});

describe("PersonSheetStep — rendering", () => {
  it("shows the shared title and all three questions/helpers", () => {
    render(<PersonSheetStep {...baseProps()} />);

    expect(screen.getByText("Quelques mots sur la personne")).toBeTruthy();
    expect(screen.getByText("Comment aimeriez-vous présenter la personne qu'elle était ?")).toBeTruthy();
    expect(screen.getByText(/Quelques phrases suffisent/)).toBeTruthy();
    expect(screen.getByText("Qu'est-ce qu'elle aimait particulièrement ?")).toBeTruthy();
    expect(screen.getByText(/Une passion, un lieu, une musique/)).toBeTruthy();
    expect(screen.getByText("Qu'est-ce qu'elle laisse derrière elle ?")).toBeTruthy();
    expect(screen.getByText(/Une valeur, une expression, un geste/)).toBeTruthy();
  });

  it("Continue starts disabled — nothing has been entered in any of the three fields", () => {
    render(<PersonSheetStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("Passer cette étape is always available", () => {
    render(<PersonSheetStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
  });

  it("seeds all three fields with their already-confirmed texts", () => {
    const content = {
      ...CONTENT,
      personWords: { text: "Elle avait toujours le mot pour rire." },
      lovedThings: { text: "Les dimanches en famille." },
      legacy: { text: "Toujours dire merci." },
    };
    render(<PersonSheetStep {...baseProps({ content })} />);

    const a10 = screen.getByLabelText("Comment aimeriez-vous présenter la personne qu'elle était ?") as HTMLTextAreaElement;
    const a11 = screen.getByLabelText("Qu'est-ce qu'elle aimait particulièrement ?") as HTMLTextAreaElement;
    const a12 = screen.getByLabelText("Qu'est-ce qu'elle laisse derrière elle ?") as HTMLTextAreaElement;
    expect(a10.value).toBe("Elle avait toujours le mot pour rire.");
    expect(a11.value).toBe("Les dimanches en famille.");
    expect(a12.value).toBe("Toujours dire merci.");
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice instead of the form when any stored matière is corrupted", () => {
    const content = { ...CONTENT, personWords: { text: "x", title: "y" } };
    render(<PersonSheetStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Quelques mots sur la personne")).toBeNull();
  });
});

describe("PersonSheetStep — saisie", () => {
  it("typing in any single field enables Continue", () => {
    render(<PersonSheetStep {...baseProps()} />);

    fireEvent.change(screen.getByLabelText("Qu'est-ce qu'elle aimait particulièrement ?"), {
      target: { value: "Les longues promenades." },
    });

    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("clearing every field back to blank disables Continue again", () => {
    const content = { ...CONTENT, personWords: { text: "Un texte déjà confirmé." } };
    render(<PersonSheetStep {...baseProps({ content })} />);

    fireEvent.change(screen.getByLabelText("Comment aimeriez-vous présenter la personne qu'elle était ?"), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });
});

describe("PersonSheetStep — passer → les trois skipped, rien inventé", () => {
  it("clicking Passer cette étape with nothing entered marks A10/A11/A12 skipped, none of the three matières touched", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonSheetStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "skipped" });
    expect(persistedContent.guidedFlow.A11).toEqual({ status: "skipped" });
    expect(persistedContent.guidedFlow.A12).toEqual({ status: "skipped" });
    expect(persistedContent.personWords.text).toBe(null);
    expect(persistedContent.lovedThings.text).toBe(null);
    expect(persistedContent.legacy.text).toBe(null);
  });

  it("Passer cette étape preserves already-typed but unconfirmed drafts in all three fields, never discards them", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonSheetStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Comment aimeriez-vous présenter la personne qu'elle était ?"), {
      target: { value: "Brouillon A10." },
    });
    fireEvent.change(screen.getByLabelText("Qu'est-ce qu'elle laisse derrière elle ?"), {
      target: { value: "Brouillon A12." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "skipped" });
    expect(persistedContent.guidedFlow.A12).toEqual({ status: "skipped" });
    expect(persistedContent.personWords.text).toBe("Brouillon A10.");
    expect(persistedContent.legacy.text).toBe("Brouillon A12.");
  });
});

describe("PersonSheetStep — continue avec un ou plusieurs textes → completed", () => {
  it("Continue commits only the filled matières as completed, the rest as skipped", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonSheetStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Qu'est-ce qu'elle aimait particulièrement ?"), {
      target: { value: "Les dimanches en famille." },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "skipped" });
    expect(persistedContent.guidedFlow.A11).toEqual({ status: "completed" });
    expect(persistedContent.guidedFlow.A12).toEqual({ status: "skipped" });
    expect(persistedContent.lovedThings.text).toBe("Les dimanches en famille.");
  });

  it("Continue commits all three as completed when all three are filled", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonSheetStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Comment aimeriez-vous présenter la personne qu'elle était ?"), {
      target: { value: "Texte A10." },
    });
    fireEvent.change(screen.getByLabelText("Qu'est-ce qu'elle aimait particulièrement ?"), {
      target: { value: "Texte A11." },
    });
    fireEvent.change(screen.getByLabelText("Qu'est-ce qu'elle laisse derrière elle ?"), {
      target: { value: "Texte A12." },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "completed" });
    expect(persistedContent.guidedFlow.A11).toEqual({ status: "completed" });
    expect(persistedContent.guidedFlow.A12).toEqual({ status: "completed" });
  });

  it("persist échoue → incomplete: shows an error, never refreshes", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<PersonSheetStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Comment aimeriez-vous présenter la personne qu'elle était ?"), {
      target: { value: "Un texte de famille." },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
