// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Mission 043 — contract tests for A10 (Quelques mots sur la personne).
 * Same discipline as TraditionsStep.test.tsx/DeathNoticePrecisionsStep.test.tsx:
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

const { PersonWordsStep } = await import("./PersonWordsStep");

afterEach(cleanup);

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A01: { status: "completed" }, A04: { status: "completed", answer: "no" }, A09: { status: "skipped" } },
  personWords: { text: null },
};

function baseProps(overrides: Partial<Parameters<typeof PersonWordsStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof PersonWordsStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
});

describe("PersonWordsStep — rendering", () => {
  it("shows the title, subtitle and helper text", () => {
    render(<PersonWordsStep {...baseProps()} />);

    expect(screen.getByText("Quelques mots sur la personne")).toBeTruthy();
    expect(screen.getByText("Comment aimeriez-vous présenter la personne qu'elle était ?")).toBeTruthy();
    expect(screen.getByText(/Quelques phrases suffisent/)).toBeTruthy();
  });

  it("Continue starts disabled — nothing has been entered yet", () => {
    render(<PersonWordsStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("Passer cette étape is always available", () => {
    render(<PersonWordsStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
  });

  it("seeds the field with an already-confirmed text", () => {
    const content = { ...CONTENT, personWords: { text: "Elle avait toujours le mot pour rire." } };
    render(<PersonWordsStep {...baseProps({ content })} />);

    const field = screen.getByLabelText("Votre texte") as HTMLTextAreaElement;
    expect(field.value).toBe("Elle avait toujours le mot pour rire.");
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice instead of the form when the stored PersonWords is corrupted", () => {
    const content = { ...CONTENT, personWords: { text: "x", title: "y" } };
    render(<PersonWordsStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Quelques mots sur la personne")).toBeNull();
  });
});

describe("PersonWordsStep — saisie", () => {
  it("typing text enables Continue", () => {
    render(<PersonWordsStep {...baseProps()} />);

    fireEvent.change(screen.getByLabelText("Votre texte"), {
      target: { value: "Elle avait toujours le mot pour rire." },
    });

    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("clearing the field back to blank disables Continue again", () => {
    const content = { ...CONTENT, personWords: { text: "Un texte déjà confirmé." } };
    render(<PersonWordsStep {...baseProps({ content })} />);

    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });
});

describe("PersonWordsStep — passer → skipped, rien inventé", () => {
  it("clicking Passer cette étape with nothing entered marks A10 skipped, personWords untouched", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonWordsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "skipped" });
    expect(persistedContent.personWords.text).toBe(null);
  });

  it("Passer cette étape preserves an already-typed but unconfirmed draft, never discards it", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonWordsStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Un brouillon non confirmé." } });
    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "skipped" });
    expect(persistedContent.personWords.text).toBe("Un brouillon non confirmé.");
  });
});

describe("PersonWordsStep — continue avec un texte → completed", () => {
  it("Continue commits A10 as completed once text has been entered", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<PersonWordsStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Votre texte"), {
      target: { value: "Elle avait toujours le mot pour rire." },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A10).toEqual({ status: "completed" });
    expect(persistedContent.personWords.text).toBe("Elle avait toujours le mot pour rire.");
  });

  it("persist échoue → incomplete: shows an error, never refreshes", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<PersonWordsStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Un texte de famille." } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
