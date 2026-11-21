// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PublicContribution, PublicContributionsInitial } from "@/lib/memorial/contributions/public-contribution-types";
import type { ContributionDepositActions } from "./deposit-transport";

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--a", className: "" }),
  Inter: () => ({ variable: "--b", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--c", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--d", className: "" }),
  EB_Garamond: () => ({ variable: "--e", className: "" }),
  Allura: () => ({ variable: "--f", className: "" }),
}));

const { ContributionsV1Section } = await import("./ContributionsV1Section");
const { PublicContributionsProvider } = await import("./contributions-host");

/** M8-E6-F — « Laisser un message » sur la page publique : la lettre, le dépôt réel (E2) et la rubrique rafraîchie. */

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== "function") proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  // jsdom ne dessine pas : le décor (canvas) est sans objet ici.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(cleanup);

const ALL = { condolences: true, stories: true, photos: true };
const SLUG = "a1b2c3d4e5f6";
const cond = (id: string, author: string): PublicContribution => ({ id, type: "condolence", authorName: author, text: `Pensées de ${author}`, caption: null, publishedAt: "2026-11-20T10:00:00Z", photo: null });
const initial = (items: PublicContribution[]): PublicContributionsInitial => ({ categories: ALL, total: items.length, items, sceneExtras: [], complete: true, nextCursor: null });

function actions(status: "published" | "pending"): ContributionDepositActions & Record<string, ReturnType<typeof vi.fn>> {
  return {
    openContributionWindow: vi.fn(async () => ({ status: "ready", formToken: "token" })),
    depositContributionText: vi.fn(async () => ({ status })),
    beginContributionPhoto: vi.fn(async () => ({ status: "unavailable" })),
    completeContributionPhoto: vi.fn(async () => ({ status: "unavailable" })),
  } as never;
}

function draw(init: PublicContributionsInitial, deposit?: { slug: string; actions: ContributionDepositActions }, loadMore = vi.fn(async () => ({ items: [] as PublicContribution[], nextCursor: null }))) {
  const wrap = ({ children }: { children: ReactNode }) => (
    <PublicContributionsProvider initial={init} loadMore={loadMore} deposit={deposit}>
      {children}
    </PublicContributionsProvider>
  );
  const view = render(<ContributionsV1Section skinVariant="light" language="fr" displayName="Élise Martin" features={ALL} />, { wrapper: wrap });
  return { view, loadMore };
}

const leave = () => document.querySelector<HTMLElement>('[data-action="leave-message"]')!;

describe("M8-E6-F — dépôt depuis la page publique", () => {
  it("sans dépôt transmis (verrou fermé) : le bouton n'ouvre rien", async () => {
    const { view } = draw(initial([]));
    expect(view.container.querySelector('[data-contributions-deposit="none"]')).not.toBeNull();
    fireEvent.click(leave());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector("dialog[data-contribution-deposit]")).toBeNull();
  });

  it("« Laisser un message » ouvre la lettre ; une condoléance publiée apparaît aussitôt dans la rubrique (état vide → carte)", async () => {
    const a = actions("published");
    const loadMore = vi.fn(async () => ({ items: [cond("11111111-1111-4111-8111-111111111111", "Marie")], nextCursor: null }));
    const { view } = draw(initial([]), { slug: SLUG, actions: a }, loadMore);
    expect(view.container.querySelector('[data-contributions-state="empty"]')).not.toBeNull();
    fireEvent.click(leave());
    await waitFor(() => expect(document.querySelector('dialog[data-contribution-deposit="choose"]')).not.toBeNull());
    expect(a.openContributionWindow).toHaveBeenCalledWith(SLUG);
    fireEvent.click(document.querySelector('[data-choice="condolence"]')!);
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Toutes nos pensées." } });
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Marie" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(document.querySelector('dialog[data-contribution-deposit="done"]')).not.toBeNull());
    expect(a.depositContributionText).toHaveBeenCalledWith(expect.objectContaining({ slug: SLUG, type: "condolence", authorName: "Marie", text: "Toutes nos pensées." }));
    // La rubrique relit sa première page : la condoléance publiée est là, sans recharger.
    await waitFor(() => expect(loadMore).toHaveBeenCalledWith(""));
    await waitFor(() => expect(view.container.querySelector('[data-contributions-state="empty"]')).toBeNull());
    // Fermer : la lettre disparaît, le focus revient au bouton d'origine.
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(document.querySelector("dialog[data-contribution-deposit]")).toBeNull());
    // La scène a changé (état vide → cartes) : le focus va au « Laisser un message » de la nouvelle scène.
    await waitFor(() => expect(document.activeElement?.getAttribute("data-action")).toBe("leave-message"));
  });

  it("un récit en attente ne relit rien (il n'est pas public avant validation familiale)", async () => {
    const a = actions("pending");
    const { loadMore } = draw(initial([cond("22222222-2222-4222-8222-222222222222", "Paul")]), { slug: SLUG, actions: a });
    fireEvent.click(leave());
    await waitFor(() => expect(document.querySelector('dialog[data-contribution-deposit="choose"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-choice="testimonial"]')!);
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre récit"), { target: { value: "Un été." } });
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Jeanne" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByText("Merci. Votre souvenir sera visible dès que la famille l’aura validé.")).toBeTruthy());
    expect(loadMore).not.toHaveBeenCalled();
  });
});
