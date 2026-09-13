// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Mission 039 — contract tests for A01 (l'annonce, quelques mots). Same
 * discipline as HeroPhraseStep/HeroCropStep's own tests: STATE and
 * RENDER CONTRACTS, and — reusing the Mission 034 QG micro-audit's own
 * durability coverage — that A01's `StepRecord` can never become durable
 * before the announcement text it corresponds to is itself durable.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

// Standard test-environment stub for next/font/google — every Guided
// Flow screen reaches it transitively through BuilderScreen.tsx.
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
}));

const { DeathNoticeAnnouncementStep } = await import("./DeathNoticeAnnouncementStep");

afterEach(cleanup);

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  deathNotice: { announcementText: null, precisions: {} },
};

function baseProps(overrides: Partial<Parameters<typeof DeathNoticeAnnouncementStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof DeathNoticeAnnouncementStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
});

describe("DeathNoticeAnnouncementStep — rendering", () => {
  it("shows the title/subtitle, a single textarea, and Continue", () => {
    render(<DeathNoticeAnnouncementStep {...baseProps()} />);

    expect(screen.getByText("Quelques mots pour annoncer son départ")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeTruthy();
    // Never a name, dates, photo, cause of death, or ceremony field.
    expect(screen.queryByText("Jean Dupont")).toBeNull();
    expect(screen.queryByLabelText(/date|photo|cérémonie/i)).toBeNull();
  });

  it("shows the neutral HERITAGE amorce as a placeholder only, never as an actual value", () => {
    render(<DeathNoticeAnnouncementStep {...baseProps()} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.placeholder).toContain("C'est avec une grande tristesse");
    expect(textarea.value).toBe("");
  });

  it("seeds the textarea from an already-saved announcement text, unchanged", () => {
    const content = { ...CONTENT, deathNotice: { announcementText: "Texte déjà écrit.", precisions: {} } };
    render(<DeathNoticeAnnouncementStep {...baseProps({ content })} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Texte déjà écrit.");
  });

  it("Continue is never disabled just because the field is empty", () => {
    render(<DeathNoticeAnnouncementStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice instead of the form when the stored Death Notice is corrupted", () => {
    const content = { ...CONTENT, deathNotice: "garbage" };
    render(<DeathNoticeAnnouncementStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Quelques mots pour annoncer son départ")).toBeNull();
  });
});

describe("DeathNoticeAnnouncementStep — vide → non completed", () => {
  it("submitting with no text shows the required error and never persists", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticeAnnouncementStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText("Merci d'écrire quelques mots pour continuer.")).toBeTruthy());
    expect(persist).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("DeathNoticeAnnouncementStep — texte + CTA → completed", () => {
  it("commits A01 as completed and persists the family's own text", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticeAnnouncementStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Elle s'en est allée paisiblement." },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.deathNotice.announcementText).toBe("Elle s'en est allée paisiblement.");
    expect(persistedContent.guidedFlow.A01).toEqual({ status: "completed" });
  });

  it("a short announcement is accepted exactly as typed — no artificial minimum", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticeAnnouncementStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Au revoir, Papa." } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.deathNotice.announcementText).toBe("Au revoir, Papa.");
    expect(persistedContent.guidedFlow.A01).toEqual({ status: "completed" });
  });

  it("persist échoue → incomplete: shows an error, never refreshes, A01 is not considered completed", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<DeathNoticeAnnouncementStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Un texte." } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
    // Continue is enabled again — the family can retry from the exact
    // same screen, nothing was silently marked done.
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });
});

/**
 * Mission 034 QG micro-audit, reused per this mission's own section 11
 * — proves, against the REAL (unmocked) useAutosave/autosave-
 * controller, that A01's `StepRecord` can never become durable before
 * the announcement text it corresponds to is itself durable.
 */
describe("DeathNoticeAnnouncementStep — durability: text persisted before A01 completed", () => {
  it("type then click Continue IMMEDIATELY: the pending autosave lands FIRST, the A01 commit lands LAST", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticeAnnouncementStep {...baseProps({ persist })} />);

    // Arms a pending, debounced autosave (real AUTOSAVE_DEBOUNCE_MS —
    // nowhere near elapsed by the time Continue is clicked below).
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte en cours." } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(persist).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = persist.mock.calls.map((call) => call[0]);
    expect(firstCall.deathNotice.announcementText).toBe("Texte en cours.");
    expect(firstCall.guidedFlow?.A01).toBeUndefined();
    expect(secondCall.deathNotice.announcementText).toBe("Texte en cours.");
    expect(secondCall.guidedFlow.A01).toEqual({ status: "completed" });
  });

  it("if flushing the pending autosave itself fails, A01 is NEVER committed", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("network down"));
    render(<DeathNoticeAnnouncementStep {...baseProps({ persist })} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte en cours." } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());

    // The failed flush is the ONLY call — commitA01's own explicit
    // persist was never even attempted on top of unconfirmed content.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].guidedFlow?.A01).toBeUndefined();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
