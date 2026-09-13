// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Mission 039 — contract tests for A02 (précisions facultatives). Same
 * discipline as DeathNoticeAnnouncementStep/HeroCropStep's own tests:
 * STATE and RENDER CONTRACTS, and the same Mission 034 durability
 * coverage reused for A02's own dual "Continuer"/"Passer cette étape"
 * outcomes.
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
}));

const { DeathNoticePrecisionsStep } = await import("./DeathNoticePrecisionsStep");

afterEach(cleanup);

const EMPTY_PRECISIONS = { generalLocation: null, familyMessage: null, thought: null, quote: null, other: null };

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  deathNotice: { announcementText: "Elle s'en est allée paisiblement.", precisions: { ...EMPTY_PRECISIONS } },
  guidedFlow: { A01: { status: "completed" } },
};

function baseProps(overrides: Partial<Parameters<typeof DeathNoticePrecisionsStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof DeathNoticePrecisionsStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
});

describe("DeathNoticePrecisionsStep — rendering: aucun champ ouvert", () => {
  it("shows the title/subtitle, five discreet 'Ajouter…' actions, and no open field", () => {
    render(<DeathNoticePrecisionsStep {...baseProps()} />);

    expect(screen.getByText("Souhaitez-vous ajouter quelques précisions ?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ajouter un lieu/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ajouter un mot de la famille/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ajouter une pensée/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ajouter une citation/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ajouter une autre précision/ })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Continue starts disabled — nothing has been entered yet", () => {
    render(<DeathNoticePrecisionsStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("Passer cette étape is always available", () => {
    render(<DeathNoticePrecisionsStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice instead of the form when the stored Death Notice is corrupted", () => {
    const content = { ...CONTENT, deathNotice: "garbage" };
    render(<DeathNoticePrecisionsStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Souhaitez-vous ajouter quelques précisions ?")).toBeNull();
  });
});

describe("DeathNoticePrecisionsStep — ouverture d'un champ / plusieurs champs", () => {
  it("clicking one 'Ajouter…' action opens only its own field", () => {
    render(<DeathNoticePrecisionsStep {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un lieu/ }));

    expect(screen.getByLabelText("Lieu")).toBeTruthy();
    expect(screen.queryByLabelText("Une pensée")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ajouter un lieu/ })).toBeNull();
  });

  it("opening several fields shows each independently, without closing the others", () => {
    render(<DeathNoticePrecisionsStep {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un lieu/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une citation/ }));

    expect(screen.getByLabelText("Lieu")).toBeTruthy();
    expect(screen.getByLabelText("Une citation")).toBeTruthy();
    expect(screen.queryByLabelText("Une pensée")).toBeNull();
  });

  it("a field already holding saved data (reprise) is shown open from the start, never hidden behind its button", () => {
    const content = {
      ...CONTENT,
      deathNotice: { ...CONTENT.deathNotice, precisions: { ...EMPTY_PRECISIONS, thought: "Une pensée déjà écrite." } },
    };
    render(<DeathNoticePrecisionsStep {...baseProps({ content })} />);

    const field = screen.getByLabelText("Une pensée") as HTMLTextAreaElement;
    expect(field.value).toBe("Une pensée déjà écrite.");
    expect(screen.queryByRole("button", { name: /Ajouter une pensée/ })).toBeNull();
  });
});

describe("DeathNoticePrecisionsStep — chaque précision individuelle", () => {
  const cases: { addLabel: RegExp; fieldLabel: string }[] = [
    { addLabel: /Ajouter un lieu/, fieldLabel: "Lieu" },
    { addLabel: /Ajouter un mot de la famille/, fieldLabel: "Un mot de la famille" },
    { addLabel: /Ajouter une pensée/, fieldLabel: "Une pensée" },
    { addLabel: /Ajouter une citation/, fieldLabel: "Une citation" },
    { addLabel: /Ajouter une autre précision/, fieldLabel: "Une autre précision" },
  ];

  for (const { addLabel, fieldLabel } of cases) {
    it(`writing into "${fieldLabel}" alone enables Continue`, () => {
      render(<DeathNoticePrecisionsStep {...baseProps()} />);

      fireEvent.click(screen.getByRole("button", { name: addLabel }));
      fireEvent.change(screen.getByLabelText(fieldLabel), { target: { value: "Texte de la famille." } });

      expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
    });
  }
});

describe("DeathNoticePrecisionsStep — passer → skipped, rien inventé, rien ajouté", () => {
  it("clicking Passer cette étape with nothing entered marks A02 skipped, precisions untouched", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A02).toEqual({ status: "skipped" });
    expect(persistedContent.deathNotice.precisions).toEqual(EMPTY_PRECISIONS);
  });

  it("Passer cette étape never invents or adds a precision even with some already opened/typed", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter une pensée/ }));
    fireEvent.change(screen.getByLabelText("Une pensée"), { target: { value: "Une pensée pour tous." } });

    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A02).toEqual({ status: "skipped" });
    // The already-typed thought is preserved exactly as autosaved — not
    // cleared, and never treated as newly "added" by the skip itself.
    expect(persistedContent.deathNotice.precisions.thought).toBe("Une pensée pour tous.");
  });
});

describe("DeathNoticePrecisionsStep — données + CTA → completed", () => {
  it("Continue commits A02 as completed once a precision is present", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un lieu/ }));
    fireEvent.change(screen.getByLabelText("Lieu"), { target: { value: "En Bretagne" } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A02).toEqual({ status: "completed" });
    expect(persistedContent.deathNotice.precisions.generalLocation).toBe("En Bretagne");
  });

  it("never forces every category to be filled — one is enough", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter une autre précision/ }));
    fireEvent.change(screen.getByLabelText("Une autre précision"), { target: { value: "Fleurs déclinées." } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A02).toEqual({ status: "completed" });
  });

  it("persist échoue → incomplete: shows an error, never refreshes", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un lieu/ }));
    fireEvent.change(screen.getByLabelText("Lieu"), { target: { value: "En Bretagne" } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

/**
 * Mission 034 QG micro-audit, reused per this mission's own section 11.
 */
describe("DeathNoticePrecisionsStep — durability: precisions persisted before A02 resolved", () => {
  it("type then click Continue IMMEDIATELY: the pending autosave lands FIRST, the A02 commit lands LAST", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un lieu/ }));
    fireEvent.change(screen.getByLabelText("Lieu"), { target: { value: "En Bretagne" } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(persist).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = persist.mock.calls.map((call) => call[0]);
    expect(firstCall.deathNotice.precisions.generalLocation).toBe("En Bretagne");
    expect(firstCall.guidedFlow?.A02).toBeUndefined();
    expect(secondCall.deathNotice.precisions.generalLocation).toBe("En Bretagne");
    expect(secondCall.guidedFlow.A02).toEqual({ status: "completed" });
  });

  it("if flushing the pending autosave itself fails, A02 is NEVER committed", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("network down"));
    render(<DeathNoticePrecisionsStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /Ajouter un lieu/ }));
    fireEvent.change(screen.getByLabelText("Lieu"), { target: { value: "En Bretagne" } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].guidedFlow?.A02).toBeUndefined();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
