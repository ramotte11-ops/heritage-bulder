// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Cérémonie V2 (B2) — contract tests for A14 « Le déroulement de la
 * cérémonie ». Same discipline as TraditionsStep.test.tsx: STATE and
 * RENDER CONTRACTS. Moment texts below are test fixtures only.
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

const { CeremonyProgrammeStep } = await import("./CeremonyProgrammeStep");

afterEach(cleanup);
beforeEach(() => routerRefresh.mockClear());

const SIX_FIELDS = { date: null, time: null, venueName: "Église", address: null, access: null, note: null };

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A04: { status: "completed", answer: "yes" } },
  ceremony: SIX_FIELDS,
};

const WITH_MOMENTS = {
  ...CONTENT,
  ceremony: {
    ...SIX_FIELDS,
    programme: [
      { id: "m1", time: "14:00", label: "Accueil", detail: "Salle paroissiale" },
      { id: "m2", time: null, label: "Cérémonie", detail: null },
      { id: "m3", time: "16:30", label: "Verre de l'amitié", detail: null },
    ],
  },
};

function baseProps(overrides: Partial<Parameters<typeof CeremonyProgrammeStep>[0]> = {}) {
  return {
    language: "fr" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof CeremonyProgrammeStep>[0];
}

function momentLabels(): string[] {
  const list = screen.getByRole("list", { name: "Moments de la cérémonie" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p:nth-of-type(1)")?.parentElement?.textContent ?? "");
}

function addMoment(label: string, time = "", detail = "") {
  fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
  if (time !== "") fireEvent.change(screen.getByLabelText("Heure (facultatif)"), { target: { value: time } });
  fireEvent.change(screen.getByLabelText("Intitulé"), { target: { value: label } });
  if (detail !== "") fireEvent.change(screen.getByLabelText("Précision (facultatif)"), { target: { value: detail } });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter ce moment" }));
}

describe("CeremonyProgrammeStep — rendu", () => {
  it("shows the validated title and accompanying text", () => {
    render(<CeremonyProgrammeStep {...baseProps()} />);
    expect(screen.getByRole("heading", { name: "Le déroulement de la cérémonie" })).toBeTruthy();
    expect(
      screen.getByText("Souhaitez-vous partager les moments de la cérémonie ? Cette étape est facultative."),
    ).toBeTruthy();
  });

  it("starts empty: Continue disabled, Skip available, composer closed", () => {
    render(<CeremonyProgrammeStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
    expect(screen.queryByLabelText("Intitulé")).toBeNull();
    expect(screen.queryByRole("list", { name: "Moments de la cérémonie" })).toBeNull();
  });

  it("examples are placeholders only — the opened composer holds no value", () => {
    render(<CeremonyProgrammeStep {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
    const label = screen.getByLabelText("Intitulé") as HTMLInputElement;
    const detail = screen.getByLabelText("Précision (facultatif)") as HTMLInputElement;
    expect(label.value).toBe("");
    expect(label.placeholder).toBe("Ex. : Accueil des proches");
    expect(detail.value).toBe("");
    expect(detail.placeholder).toBe("Ex. : Salle paroissiale");
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });

  it("renders stored moments in order, with their optional time and precision", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    const items = within(screen.getByRole("list", { name: "Moments de la cérémonie" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("14:00");
    expect(items[0].textContent).toContain("Accueil");
    expect(items[0].textContent).toContain("Salle paroissiale");
    expect(items[1].textContent).toContain("Cérémonie");
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice on a corrupted stored ceremony", () => {
    const content = { ...CONTENT, ceremony: { venueName: "Église", cause: "x" } };
    render(<CeremonyProgrammeStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Le déroulement de la cérémonie")).toBeNull();
  });

  it.each([
    ["en", "The order of the ceremony", "+ Add a moment", "Skip this step"],
    ["es", "El desarrollo de la ceremonia", "+ Añadir un momento", "Omitir este paso"],
  ] as const)("is translated (%s)", (language, title, add, skip) => {
    render(<CeremonyProgrammeStep {...baseProps({ language })} />);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: add })).toBeTruthy();
    expect(screen.getByRole("button", { name: skip })).toBeTruthy();
  });
});

describe("CeremonyProgrammeStep — Ajouter", () => {
  it("adds a confirmed moment: card appears, composer closes, Continue enables", () => {
    render(<CeremonyProgrammeStep {...baseProps()} />);
    addMoment("Accueil des proches", "14:30", "Salle paroissiale");

    const items = within(screen.getByRole("list", { name: "Moments de la cérémonie" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("14:30");
    expect(items[0].textContent).toContain("Accueil des proches");
    expect(items[0].textContent).toContain("Salle paroissiale");
    expect(screen.queryByLabelText("Intitulé")).toBeNull();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("the title is required: the confirm action stays disabled while it is blank", () => {
    render(<CeremonyProgrammeStep {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
    fireEvent.change(screen.getByLabelText("Précision (facultatif)"), { target: { value: "Une précision seule" } });
    expect(screen.getByRole("button", { name: "Ajouter ce moment" })).toHaveProperty("disabled", true);
  });

  it("Enter in a field confirms the moment — never the whole step", () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyProgrammeStep {...baseProps({ persist })} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
    fireEvent.change(screen.getByLabelText("Intitulé"), { target: { value: "Accueil" } });
    fireEvent.keyDown(screen.getByLabelText("Intitulé"), { key: "Enter" });

    expect(screen.getByText("Accueil")).toBeTruthy();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("Annuler discards the unconfirmed moment", () => {
    render(<CeremonyProgrammeStep {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
    fireEvent.change(screen.getByLabelText("Intitulé"), { target: { value: "Jamais confirmé" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Jamais confirmé")).toBeNull();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
  });
});

describe("CeremonyProgrammeStep — Modifier / Supprimer", () => {
  it("Modifier opens the moment prefilled; Enregistrer edits it in place", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier « Accueil »" }));

    const label = screen.getByLabelText("Intitulé") as HTMLInputElement;
    expect(label.value).toBe("Accueil");
    expect((screen.getByLabelText("Heure (facultatif)") as HTMLInputElement).value).toBe("14:00");
    fireEvent.change(label, { target: { value: "Accueil des proches" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    const items = within(screen.getByRole("list", { name: "Moments de la cérémonie" })).getAllByRole("listitem");
    expect(items[0].textContent).toContain("Accueil des proches");
    expect(items).toHaveLength(3);
  });

  it("other list actions wait while a moment is being edited — one action at a time", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier « Accueil »" }));
    expect(screen.getByRole("button", { name: "Supprimer « Cérémonie »" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Monter « Cérémonie »" })).toHaveProperty("disabled", true);
  });

  it("Supprimer removes the moment and announces it", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer « Cérémonie »" }));

    expect(screen.queryByText("Cérémonie")).toBeNull();
    expect(screen.getByText("« Cérémonie » a été retiré du déroulement.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Ajouter un moment" }));
  });
});

describe("CeremonyProgrammeStep — Monter / Descendre (sans glisser-déposer)", () => {
  it("each moment has named move buttons; the ends are disabled", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    expect(screen.getByRole("button", { name: "Monter « Accueil »" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Descendre « Accueil »" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Monter « Verre de l'amitié »" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Descendre « Verre de l'amitié »" })).toHaveProperty("disabled", true);
  });

  it("Descendre moves the moment one place, announces its position and keeps the focus on it", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    fireEvent.click(screen.getByRole("button", { name: "Descendre « Accueil »" }));

    expect(momentLabels().map((text) => text.replace(/\d\d:\d\d/, ""))).toEqual([
      "Cérémonie",
      "AccueilSalle paroissiale",
      "Verre de l'amitié",
    ]);
    expect(screen.getByText("« Accueil » est maintenant en position 2 sur 3.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Descendre « Accueil »" }));
  });

  it("reaching an end moves the focus to the other direction, never to nowhere", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />);
    fireEvent.click(screen.getByRole("button", { name: "Monter « Cérémonie »" }));

    expect(screen.getByText("« Cérémonie » est maintenant en position 1 sur 3.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Descendre « Cérémonie »" }));
  });

  it("Monter then Continue persists the family's order", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS, persist })} />);
    fireEvent.click(screen.getByRole("button", { name: "Monter « Verre de l'amitié »" }));
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persisted = persist.mock.calls.at(-1)?.[0];
    expect(persisted.ceremony.programme.map((moment: { id: string }) => moment.id)).toEqual(["m1", "m3", "m2"]);
  });
});

describe("CeremonyProgrammeStep — autosave et saisies non validées", () => {
  it("a confirmed moment reaches the existing autosave", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyProgrammeStep {...baseProps({ persist })} />);
    addMoment("Accueil");

    await vi.waitFor(() => expect(persist).toHaveBeenCalled(), { timeout: 4000 });
    const saved = persist.mock.calls[0][0];
    expect(saved.ceremony.programme).toEqual([
      { id: expect.any(String), time: null, label: "Accueil", detail: null },
    ]);
    expect(saved.ceremony.venueName).toBe("Église");
    expect(saved.guidedFlow.A14).toBeUndefined();
  });

  it("a moment being written is never autosaved", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyProgrammeStep {...baseProps({ persist })} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
    fireEvent.change(screen.getByLabelText("Intitulé"), { target: { value: "Pas encore validé" } });

    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(persist).not.toHaveBeenCalled();
  });

  it("unconfirmed text blocks Continue and Skip with a visible hint, and is reported to « Mon parcours »", async () => {
    const { createPendingInputRegistry, PendingInputRegistryContext } = await import("./journey/pending-input");
    const registry = createPendingInputRegistry();
    render(
      <PendingInputRegistryContext.Provider value={registry}>
        <CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />
      </PendingInputRegistryContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un moment" }));
    expect(registry.hasPending()).toBe(false); // an empty composer holds nothing
    fireEvent.change(screen.getByLabelText("Intitulé"), { target: { value: "En cours" } });

    expect(registry.hasPending()).toBe(true);
    expect(screen.getByText("Validez ou annulez le moment en cours avant de continuer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(registry.hasPending()).toBe(false);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });

  it("an opened but unchanged edit holds nothing to lose; a changed one does", async () => {
    const { createPendingInputRegistry, PendingInputRegistryContext } = await import("./journey/pending-input");
    const registry = createPendingInputRegistry();
    render(
      <PendingInputRegistryContext.Provider value={registry}>
        <CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS })} />
      </PendingInputRegistryContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Modifier « Cérémonie »" }));
    expect(registry.hasPending()).toBe(false);
    fireEvent.change(screen.getByLabelText("Précision (facultatif)"), { target: { value: "Église Saint-Martin" } });
    expect(registry.hasPending()).toBe(true);
  });
});

describe("CeremonyProgrammeStep — Continuer / Passer", () => {
  it("Continue commits A14 as completed with the confirmed moments", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyProgrammeStep {...baseProps({ persist })} />);
    addMoment("Accueil");
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persisted = persist.mock.calls.at(-1)?.[0];
    expect(persisted.guidedFlow.A14).toEqual({ status: "completed" });
    expect(persisted.ceremony.programme).toHaveLength(1);
  });

  it("Passer marks A14 skipped and writes no déroulement", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyProgrammeStep {...baseProps({ persist })} />);
    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persisted = persist.mock.calls.at(-1)?.[0];
    expect(persisted.guidedFlow.A14).toEqual({ status: "skipped" });
    expect(persisted.ceremony).toEqual(SIX_FIELDS);
  });

  it("a failed save shows an error and never leaves the step", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<CeremonyProgrammeStep {...baseProps({ content: WITH_MOMENTS, persist })} />);
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("CeremonyProgrammeStep — déroulement endommagé", () => {
  const DAMAGED = {
    ...CONTENT,
    ceremony: {
      ...SIX_FIELDS,
      programme: [
        { id: "m1", time: null, label: "Accueil", detail: null },
        { id: "m2", time: "25:99", label: "Illisible", detail: null },
      ],
    },
  };

  it("shows the readable moments, a calm notice and the explicit repair; editing waits", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: DAMAGED })} />);
    expect(screen.getByText("Accueil")).toBeTruthy();
    expect(screen.queryByText("Illisible")).toBeNull();
    expect(screen.getByRole("button", { name: "Retirer les moments illisibles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Ajouter un moment" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Supprimer « Accueil »" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
  });

  it("after the repair, the déroulement is editable again", () => {
    render(<CeremonyProgrammeStep {...baseProps({ content: DAMAGED })} />);
    fireEvent.click(screen.getByRole("button", { name: "Retirer les moments illisibles" }));

    expect(screen.queryByRole("button", { name: "Retirer les moments illisibles" })).toBeNull();
    expect(screen.getByRole("button", { name: "+ Ajouter un moment" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: /continuer/i })).toHaveProperty("disabled", false);
  });
});
