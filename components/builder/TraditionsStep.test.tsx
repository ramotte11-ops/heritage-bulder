// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TraditionSuggestion } from "@/config/tradition-suggestions";

/**
 * Mission 042 — contract tests for A09 (Traditions & repères). Same
 * discipline as DeathNoticePrecisionsStep.test.tsx: STATE and RENDER
 * CONTRACTS. Fixtures used below (suggestion ids/texts) are deliberately
 * fictional — never a real tradition's name or content (mission brief
 * section 6).
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

const FIXTURE_SUGGESTION: TraditionSuggestion = {
  id: "fixture:lantern",
  labels: { en: "Fixture suggestion", fr: "Suggestion fictive", es: "Sugerencia ficticia" },
  texts: {
    en: "Fixture suggestion text.",
    fr: "Texte de suggestion fictif.",
    es: "Texto de sugerencia ficticio.",
  },
};

const { resolveAvailableTraditionSuggestions } = vi.hoisted(() => ({
  resolveAvailableTraditionSuggestions: vi.fn((): TraditionSuggestion[] => []),
}));
vi.mock("@/config/tradition-suggestions", () => ({ resolveAvailableTraditionSuggestions }));

const { TraditionsStep } = await import("./TraditionsStep");

afterEach(cleanup);

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A01: { status: "completed" }, A04: { status: "completed", answer: "no" } },
  traditions: { entries: [] },
};

function baseProps(overrides: Partial<Parameters<typeof TraditionsStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: CONTENT,
    skin: "intemporel" as const,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof TraditionsStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
  resolveAvailableTraditionSuggestions.mockReset();
  resolveAvailableTraditionSuggestions.mockReturnValue([]);
});

describe("TraditionsStep — rendering: catalogue vide", () => {
  it("shows the title/subtitle and no suggestion section when the catalog is empty", () => {
    render(<TraditionsStep {...baseProps()} />);

    expect(screen.getByText("Traditions & repères")).toBeTruthy();
    expect(
      screen.getByText("Souhaitez-vous partager une tradition, une pratique ou une consigne particulière avec les proches ?"),
    ).toBeTruthy();
    expect(screen.queryByText("Quelques suggestions")).toBeNull();
  });

  it("Continue starts disabled — nothing has been added yet", () => {
    render(<TraditionsStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("Passer cette étape is always available", () => {
    render(<TraditionsStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice instead of the form when the stored Traditions list is corrupted", () => {
    const content = { ...CONTENT, traditions: { entries: "garbage" } };
    render(<TraditionsStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Traditions & repères")).toBeNull();
  });
});

describe("TraditionsStep — repère personnalisé", () => {
  it("the composer is closed by default — one action at a time", () => {
    render(<TraditionsStep {...baseProps()} />);
    expect(screen.queryByLabelText("Votre texte")).toBeNull();
    expect(screen.getByRole("button", { name: /Ajouter un repère personnalisé/ })).toBeTruthy();
  });

  it("opens the composer, types text, and confirms — entry appears, Continue enables", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<TraditionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un repère personnalisé/ }));
    fireEvent.change(screen.getByLabelText("Votre texte"), {
      target: { value: "Nous souhaitons que chacun porte une touche de bleu." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(screen.getByText("Nous souhaitons que chacun porte une touche de bleu.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
    // The composer closes and never leaves a stray draft field behind.
    expect(screen.queryByLabelText("Votre texte")).toBeNull();
  });

  it("Annuler discards the draft without ever adding an entry", () => {
    render(<TraditionsStep {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un repère personnalisé/ }));
    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Un brouillon jamais confirmé." } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Un brouillon jamais confirmé.")).toBeNull();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("the confirm action stays disabled while the draft text is blank", () => {
    render(<TraditionsStep {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un repère personnalisé/ }));
    expect(screen.getByRole("button", { name: "Ajouter" })).toHaveProperty("disabled", true);
  });
});

describe("TraditionsStep — suggestions: jamais présélectionnées", () => {
  it("shows a suggestion card with its own explicit add action, never pre-added", () => {
    resolveAvailableTraditionSuggestions.mockReturnValue([FIXTURE_SUGGESTION]);
    render(<TraditionsStep {...baseProps()} />);

    expect(screen.getByText("Quelques suggestions")).toBeTruthy();
    expect(screen.getByText("Suggestion fictive")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajouter cette suggestion" })).toBeTruthy();
    // No entry exists yet — merely showing the card confirms nothing.
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("picking a suggestion opens the SAME editable composer, pre-filled — never an immediate silent add", () => {
    resolveAvailableTraditionSuggestions.mockReturnValue([FIXTURE_SUGGESTION]);
    render(<TraditionsStep {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ajouter cette suggestion" }));

    const textField = screen.getByLabelText("Votre texte") as HTMLTextAreaElement;
    expect(textField.value).toBe("Texte de suggestion fictif.");
    // Still not confirmed — Continue stays disabled until "Ajouter".
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("the family can edit the suggestion's text before confirming it", () => {
    resolveAvailableTraditionSuggestions.mockReturnValue([FIXTURE_SUGGESTION]);
    render(<TraditionsStep {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ajouter cette suggestion" }));
    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Texte modifié par la famille." } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(screen.getByText("Texte modifié par la famille.")).toBeTruthy();
    expect(screen.queryByText("Texte de suggestion fictif.")).toBeNull();
  });
});

describe("TraditionsStep — modification / suppression", () => {
  const CONTENT_WITH_ENTRY = {
    ...CONTENT,
    traditions: {
      entries: [
        { id: "e1", origin: "custom" as const, suggestionId: null, title: "Premier", text: "Texte initial." },
      ],
    },
  };

  it("renders an already-confirmed entry with Modifier/Supprimer controls", () => {
    render(<TraditionsStep {...baseProps({ content: CONTENT_WITH_ENTRY })} />);

    expect(screen.getByText("Premier")).toBeTruthy();
    expect(screen.getByText("Texte initial.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modifier" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeTruthy();
  });

  it("Modifier opens an inline edit, Enregistrer confirms the change", () => {
    render(<TraditionsStep {...baseProps({ content: CONTENT_WITH_ENTRY })} />);

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Texte corrigé." } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(screen.getByText("Texte corrigé.")).toBeTruthy();
    expect(screen.queryByText("Texte initial.")).toBeNull();
  });

  it("Supprimer removes the entry immediately", () => {
    render(<TraditionsStep {...baseProps({ content: CONTENT_WITH_ENTRY })} />);

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(screen.queryByText("Texte initial.")).toBeNull();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });
});

describe("TraditionsStep — passer → skipped, rien inventé", () => {
  it("clicking Passer cette étape with nothing entered marks A09 skipped, traditions untouched", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<TraditionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A09).toEqual({ status: "skipped" });
    expect(persistedContent.traditions.entries).toEqual([]);
  });
});

describe("TraditionsStep — continue avec un repère → completed", () => {
  it("Continue commits A09 as completed once an entry has been confirmed", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<TraditionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un repère personnalisé/ }));
    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Un texte de famille." } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A09).toEqual({ status: "completed" });
    expect(persistedContent.traditions.entries).toHaveLength(1);
    expect(persistedContent.traditions.entries[0].text).toBe("Un texte de famille.");
  });

  it("persist échoue → incomplete: shows an error, never refreshes", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<TraditionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un repère personnalisé/ }));
    fireEvent.change(screen.getByLabelText("Votre texte"), { target: { value: "Un texte de famille." } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
