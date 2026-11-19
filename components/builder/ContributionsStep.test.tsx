// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translate } from "@/lib/i18n/translate";
import type { MemorialContent } from "@/types/memorial";

/** M7 — l'écran A15 : enregistrement des seuls choix, jamais des exemples. */

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
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
}));

const { ContributionsStep } = await import("./ContributionsStep");

const DRAFT = {
  hero: { displayName: "Élise Martin" },
  legacy: { text: "Conservé" },
  guidedFlow: { A13: { status: "skipped" } },
} as unknown as MemorialContent;

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const sw = (key: "condolences" | "stories" | "photos") => screen.getByRole("switch", { name: new RegExp(translate("fr", `contributionsStep.${key}`)) });

describe("M7 — ContributionsStep (A15)", () => {
  it("« Continuer » enregistre les trois choix et l'étape, puis passe à la suite", async () => {
    const persist = vi.fn(async () => ({ updatedAt: "2026-11-18T10:00:00.000Z" }));
    render(<ContributionsStep language="fr" content={DRAFT} skinVariant="light" persist={persist} />);
    fireEvent.click(sw("condolences"));
    fireEvent.click(sw("photos"));
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const saved = (persist.mock.calls[0] as unknown as [MemorialContent])[0] as unknown as Record<string, unknown>;
    expect(saved.contributions).toEqual({ features: { condolences: true, stories: false, photos: true } });
    expect((saved.guidedFlow as Record<string, unknown>).A15).toEqual({ status: "completed" });
    expect(saved.legacy).toEqual({ text: "Conservé" });
    expect(JSON.stringify(saved)).not.toMatch(/builder-demo|Marie et Pierre|Sophie|photo-demo/);
  });

  it("aucune écriture tant que la famille essaie les interrupteurs", () => {
    const persist = vi.fn();
    render(<ContributionsStep language="fr" content={DRAFT} skinVariant="dark" persist={persist} />);
    fireEvent.click(sw("stories"));
    fireEvent.click(sw("stories"));
    fireEvent.click(sw("photos"));
    expect(persist).not.toHaveBeenCalled();
  });

  it("« Passer cette étape » : skipped, sans toucher aux choix", async () => {
    const persist = vi.fn(async () => ({ updatedAt: "2026-11-18T10:00:00.000Z" }));
    const opened = { ...DRAFT, contributions: { features: { condolences: true, stories: false, photos: false } } } as unknown as MemorialContent;
    render(<ContributionsStep language="fr" content={opened} skinVariant="light" persist={persist} />);
    expect((sw("condolences") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "contributionsStep.skip") }));
    await waitFor(() => expect(persist).toHaveBeenCalled());
    const saved = (persist.mock.calls[0] as unknown as [MemorialContent])[0] as unknown as Record<string, unknown>;
    expect(saved.contributions).toEqual({ features: { condolences: true, stories: false, photos: false } });
    expect((saved.guidedFlow as Record<string, unknown>).A15).toEqual({ status: "skipped" });
  });

  it("des choix illisibles : un message calme, aucun écrasement possible", () => {
    const persist = vi.fn();
    render(<ContributionsStep language="fr" content={{ ...DRAFT, contributions: "tout" } as unknown as MemorialContent} skinVariant="light" persist={persist} />);
    expect(screen.getByRole("alert").textContent).toBe(translate("fr", "hero.dataUnavailable"));
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("un enregistrement refusé garde la famille sur l'écran, avec ses choix", async () => {
    const persist = vi.fn(async () => {
      throw new Error("réseau");
    });
    render(<ContributionsStep language="fr" content={DRAFT} skinVariant="light" persist={persist} />);
    fireEvent.click(sw("photos"));
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((sw("photos") as HTMLInputElement).checked).toBe(true);
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  describe("M8-E3 — hommage publié : effet immédiat (O9)", () => {
    it("après l'enregistrement, applique les choix avec la révision rendue (aucune republication)", async () => {
      const persist = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-11-21T10:00:00.000Z", revision: 12 }));
      const applyCategoriesNow = vi.fn(async () => ({ status: "ok" }));
      render(<ContributionsStep language="fr" content={DRAFT} skinVariant="light" persist={persist} applyCategoriesNow={applyCategoriesNow} />);
      fireEvent.click(sw("photos"));
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
      await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
      expect(applyCategoriesNow).toHaveBeenCalledWith({ condolences: false, stories: false, photos: true }, 12);
      expect(persist.mock.invocationCallOrder[0]).toBeLessThan(applyCategoriesNow.mock.invocationCallOrder[0]);
    });

    it("désactiver : l'interrupteur coupé est appliqué tel quel", async () => {
      const opened = { ...DRAFT, contributions: { features: { condolences: true, stories: true, photos: true } } } as unknown as MemorialContent;
      const persist = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-11-21T10:00:00.000Z", revision: 3 }));
      const applyCategoriesNow = vi.fn(async () => ({ status: "ok" }));
      render(<ContributionsStep language="fr" content={opened} skinVariant="dark" persist={persist} applyCategoriesNow={applyCategoriesNow} />);
      fireEvent.click(sw("photos"));
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
      await waitFor(() => expect(applyCategoriesNow).toHaveBeenCalledWith({ condolences: true, stories: true, photos: false }, 3));
    });

    it("« Passer » réapplique les choix déjà enregistrés (rattrapage idempotent)", async () => {
      const opened = { ...DRAFT, contributions: { features: { condolences: true, stories: false, photos: false } } } as unknown as MemorialContent;
      const persist = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-11-21T10:00:00.000Z", revision: 5 }));
      const applyCategoriesNow = vi.fn(async () => ({ status: "ok" }));
      render(<ContributionsStep language="fr" content={opened} skinVariant="light" persist={persist} applyCategoriesNow={applyCategoriesNow} />);
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "contributionsStep.skip") }));
      await waitFor(() => expect(applyCategoriesNow).toHaveBeenCalledWith({ condolences: true, stories: false, photos: false }, 5));
    });

    it("révision périmée (autre onglet) ou refus : la famille reste sur l'écran, rien n'est écrasé", async () => {
      for (const status of ["stale_revision", "denied", "unavailable"]) {
        const persist = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-11-21T10:00:00.000Z", revision: 7 }));
        const applyCategoriesNow = vi.fn(async () => ({ status }));
        render(<ContributionsStep language="fr" content={DRAFT} skinVariant="light" persist={persist} applyCategoriesNow={applyCategoriesNow} />);
        fireEvent.click(sw("condolences"));
        fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(routerRefresh).not.toHaveBeenCalled();
        cleanup();
      }
    });
  });
});
