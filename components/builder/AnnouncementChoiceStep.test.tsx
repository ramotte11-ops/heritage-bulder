// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/keys";
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

const { AnnouncementChoiceStep } = await import("./AnnouncementChoiceStep");

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const AFTER_IDENTITY = {
  hero: { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { T04: { status: "skipped" } },
} as unknown as MemorialContent;

const ok = () => vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });

function renderStep(content: MemorialContent = AFTER_IDENTITY, persist = ok(), language: "fr" | "en" | "es" = "fr") {
  render(<AnnouncementChoiceStep language={language} editorialContext="announcement" content={content} persist={persist} />);
  return persist;
}

const KEYS: TranslationKey[] = [
  "announcementChoice.title",
  "announcementChoice.subtitle",
  "announcementChoice.yesTitle",
  "announcementChoice.yesDescription",
  "announcementChoice.noTitle",
  "announcementChoice.noDescription",
  "announcementChoice.laterTitle",
  "announcementChoice.laterDescription",
  "announcementChoice.changeLater",
];

describe("AnnouncementChoiceStep — content", () => {
  it("shows the validated French question, explanation, three cards and the hint", () => {
    renderStep();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Souhaitez-vous également publier une annonce de décès ?",
    );
    expect(
      screen.getByText("L'annonce permet d'informer vos proches du décès. Elle est facultative et peut être ajoutée plus tard."),
    ).toBeTruthy();
    expect(screen.getByText("Je souhaite préparer une annonce de décès.")).toBeTruthy();
    expect(screen.getByText("Je souhaite créer uniquement l'hommage pour le moment.")).toBeTruthy();
    expect(screen.getByText("Je préfère décider ultérieurement.")).toBeTruthy();
    expect(screen.getByText("Vous pourrez modifier votre choix ultérieurement.")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it.each(LANGUAGES)("is fully translated in %s", (language) => {
    renderStep(AFTER_IDENTITY, ok(), language);
    for (const key of KEYS) expect(screen.getAllByText(translate(language, key)).length).toBeGreaterThan(0);
  });
});

describe("AnnouncementChoiceStep — selection", () => {
  it("preselects nothing the first time and keeps Continue disabled until a choice is made", () => {
    renderStep();
    for (const radio of screen.getAllByRole("radio")) expect((radio as HTMLInputElement).checked).toBe(false);
    const cta = screen.getByRole("button", { name: /Continuer/ }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Plus tard/));
    expect(cta.disabled).toBe(false);
  });

  it.each([
    ["yes", { status: "completed", answer: "yes" }, /^Oui/],
    ["no", { status: "completed", answer: "no" }, /^Non/],
    ["later", { status: "skipped", answer: "later" }, /^Plus tard/],
  ] as const)("restores a recorded %s when the screen is shown again", (_answer, record, label) => {
    const content = { ...AFTER_IDENTITY, guidedFlow: { T04: { status: "skipped" }, A00: record } } as unknown as MemorialContent;
    renderStep(content);
    expect((screen.getByLabelText(label) as HTMLInputElement).checked).toBe(true);
  });
});

describe("AnnouncementChoiceStep — Continue", () => {
  it.each([
    [/Oui/, { status: "completed", answer: "yes" }],
    [/Non/, { status: "completed", answer: "no" }],
    [/Plus tard/, { status: "skipped", answer: "later" }],
  ] as const)("saves the chosen answer (%s) on top of the draft, then refreshes", async (label, record) => {
    const persist = renderStep();
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const saved = persist.mock.calls[0][0] as { hero: unknown; guidedFlow: Record<string, unknown> };
    expect(saved.guidedFlow.A00).toEqual(record);
    expect(saved.guidedFlow.T04).toEqual({ status: "skipped" });
    expect(saved.hero).toEqual((AFTER_IDENTITY as Record<string, unknown>).hero);
  });

  it("on a failed save: shows the generic error and never moves on", async () => {
    renderStep(AFTER_IDENTITY, vi.fn().mockRejectedValue(new Error("network")));
    fireEvent.click(screen.getByLabelText(/Non/));
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Une erreur est survenue."));
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
