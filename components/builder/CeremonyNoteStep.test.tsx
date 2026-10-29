// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const { CeremonyNoteStep } = await import("./CeremonyNoteStep");

afterEach(cleanup);
beforeEach(() => routerRefresh.mockClear());

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: {
    A04: { status: "completed", answer: "yes" },
    A14: { status: "skipped" },
  },
  ceremony: { date: null, time: null, venueName: null, address: null, access: null, note: null },
};

function baseProps(overrides: Partial<Parameters<typeof CeremonyNoteStep>[0]> = {}) {
  return {
    language: "fr" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof CeremonyNoteStep>[0];
}

function noteInput(): HTMLTextAreaElement {
  return screen.getByLabelText("Note pratique") as HTMLTextAreaElement;
}

describe("CeremonyNoteStep — A08", () => {
  it("renders the existing optional-note contract without inventing a character limit", () => {
    render(<CeremonyNoteStep {...baseProps()} />);

    expect(screen.getByRole("heading", { name: "Une note pratique ?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
    expect(noteInput().hasAttribute("maxlength")).toBe(false);
  });

  it("normalizes blank text to null and keeps Continue disabled", () => {
    const content = { ...CONTENT, ceremony: { ...CONTENT.ceremony, note: "Accès par la cour" } };
    render(<CeremonyNoteStep {...baseProps({ content })} />);

    fireEvent.change(noteInput(), { target: { value: "   \n  " } });

    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("persists the normalized note and completes A08", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyNoteStep {...baseProps({ persist })} />);

    fireEvent.change(noteInput(), { target: { value: "  Entrée par la cour  " } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(persist.mock.calls[0][0].ceremony.note).toBe("Entrée par la cour");
    expect(persist.mock.calls.at(-1)?.[0].guidedFlow.A08).toEqual({ status: "completed" });
  });

  it("skips A08 without deleting an already stored note", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const content = { ...CONTENT, ceremony: { ...CONTENT.ceremony, note: "Note conservée" } };
    render(<CeremonyNoteStep {...baseProps({ content, persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(persist.mock.calls.at(-1)?.[0].ceremony.note).toBe("Note conservée");
    expect(persist.mock.calls.at(-1)?.[0].guidedFlow.A08).toEqual({ status: "skipped" });
  });

  it("reloads the exact persisted note", () => {
    const content = { ...CONTENT, ceremony: { ...CONTENT.ceremony, note: "Parking derrière le bâtiment" } };
    render(<CeremonyNoteStep {...baseProps({ content })} />);

    expect(noteInput().value).toBe("Parking derrière le bâtiment");
  });

  it("accepts guest Hero progress without changing the authenticated default", () => {
    const { container, rerender } = render(<CeremonyNoteStep {...baseProps()} progress={0.73} />);
    expect(container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style")).toContain("73%");

    rerender(<CeremonyNoteStep {...baseProps()} />);
    expect(container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style")).not.toContain("73%");
  });

  it("keeps the existing data-unavailable response for damaged ceremony data", () => {
    const content = { ...CONTENT, ceremony: { note: 42 } };
    render(<CeremonyNoteStep {...baseProps({ content: content as never })} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Une note pratique ?" })).toBeNull();
  });
});
