// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ceremonyStepProgress } from "@/lib/builder/guided-flow/ceremony-step";
import { translate } from "@/lib/i18n/translate";
import type { MemorialContent } from "@/types/memorial";

const { routerRefresh, useRouter } = vi.hoisted(() => {
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

const { CeremonyMomentStep } = await import("./CeremonyMomentStep");

const CEREMONY = {
  date: "2027-04-12",
  time: "14:30",
  venueName: "Lieu conservé",
  address: "Adresse conservée",
  access: "Accès conservé",
  note: "Note conservée",
};

const CONTENT = {
  hero: {
    displayName: "Jeanne Dupont",
    birth: null,
    death: null,
    shortPhrase: "Toujours dans nos cœurs",
    photo: null,
  },
  ceremony: CEREMONY,
  guidedFlow: {
    A04: { status: "completed", answer: "yes" },
    A05: { status: "completed" },
  },
} as unknown as MemorialContent;

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

describe("CeremonyMomentStep", () => {
  it("keeps the authenticated progress calculation when no host override is provided", () => {
    const view = render(
      <CeremonyMomentStep
        language="fr"
        content={CONTENT}
        persist={vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" })}
      />,
    );

    const expected = `${ceremonyStepProgress(CONTENT) * 100}%`;
    expect(view.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style")).toContain(expected);
  });

  it("accepts a guest progress override without changing the saved A04 contract", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const view = render(
      <CeremonyMomentStep language="fr" content={CONTENT} persist={persist} progress={0.42} />,
    );

    expect(view.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style")).toContain("42%");
    expect((screen.getByRole("radio", { name: translate("fr", "ceremony.momentYes") }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: translate("fr", "ceremony.momentNo") }));
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    const noContent = persist.mock.calls[0][0] as unknown as MemorialContent;
    const saved = noContent as unknown as {
      guidedFlow: Record<string, unknown>;
      ceremony: unknown;
    };
    expect(saved.guidedFlow).toMatchObject({
      A04: { status: "completed", answer: "no" },
      A05: { status: "completed" },
    });
    expect(saved.ceremony).toEqual(CEREMONY);

    view.unmount();
    routerRefresh.mockClear();
    const persistAgain = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:01:00.000Z" });
    render(<CeremonyMomentStep language="fr" content={noContent} persist={persistAgain} />);
    fireEvent.click(screen.getByRole("radio", { name: translate("fr", "ceremony.momentYes") }));
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    const restored = persistAgain.mock.calls[0][0] as unknown as {
      guidedFlow: Record<string, unknown>;
      ceremony: unknown;
    };
    expect(restored.guidedFlow).toMatchObject({
      A04: { status: "completed", answer: "yes" },
      A05: { status: "completed" },
    });
    expect(restored.ceremony).toEqual(CEREMONY);
  });
});
