// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContributionDepositWindow } from "./ContributionDepositWindow";
import type { ContributionDepositTransport, DepositStatus } from "./deposit-transport";

/** M8-E4 (proposition) — parcours de la fenêtre de dépôt, transport simulé. */

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== "function") proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
});
afterEach(cleanup);

const ALL = { condolences: true, stories: true, photos: true };

function transport(result: DepositStatus = { status: "published" }) {
  return {
    open: vi.fn(async () => ({ status: "ready" as const, formToken: `token-${Math.random()}` })),
    depositText: vi.fn(async () => result),
    depositPhoto: vi.fn(async () => result),
  } satisfies ContributionDepositTransport;
}

function draw(t: ContributionDepositTransport, categories = ALL, onClose = vi.fn()) {
  render(<ContributionDepositWindow language="fr" theme="light" categories={categories} transport={t} onClose={onClose} />);
  return onClose;
}

const dialog = () => document.querySelector<HTMLDialogElement>("dialog[data-contribution-deposit]")!;
const state = () => dialog().dataset.contributionDeposit;

describe("M8-E4 — fenêtre de dépôt (proposition PO)", () => {
  it("choisir → écrire → envoyer : condoléance publiée, puis « un autre souvenir » parmi les catégories restantes", async () => {
    const t = transport({ status: "published" });
    draw(t);
    expect(state()).toBe("choose");
    // M8-E6-A : la lettre garde son titre ; la question vient dessous (planche PO).
    expect(screen.getByRole("heading", { name: "Laisser un message" })).toBeTruthy();
    expect(screen.getByText("Que souhaitez-vous partager ?")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-choice="condolence"]')!);
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Toutes nos pensées." } });
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Marie" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(state()).toBe("done"));
    expect(t.depositText).toHaveBeenCalledWith(expect.objectContaining({ type: "condolence", authorName: "Marie", text: "Toutes nos pensées.", website: "" }));
    expect(screen.getByText("Merci. Votre message est désormais visible dans l’hommage.")).toBeTruthy();
    expect(screen.getByText("Souhaitez-vous partager un autre souvenir ?")).toBeTruthy();
    // La catégorie utilisée n'est pas reproposée ; un nouveau jeton est demandé pour le dépôt suivant.
    expect([...document.querySelectorAll<HTMLElement>("[data-choice]")].map((n) => n.dataset.choice)).toEqual(["testimonial", "photo"]);
    expect(t.open).toHaveBeenCalledTimes(2);
  });

  it("un récit est annoncé « en attente de validation »", async () => {
    const t = transport({ status: "pending" });
    draw(t, { condolences: false, stories: true, photos: false });
    // Une seule catégorie : l'étape du choix est sautée.
    expect(state()).toBe("write");
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre récit"), { target: { value: "Un été." } });
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Paul" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByText("Merci. Votre souvenir sera visible dès que la famille l’aura validé.")).toBeTruthy());
    expect(document.querySelectorAll("[data-choice]")).toHaveLength(0);
  });

  it("plafond atteint (R2/R3) : le message R5 validé", async () => {
    const t = transport({ status: "busy" });
    draw(t, { condolences: true, stories: false, photos: false });
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Pensées." } });
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Jean" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(state()).toBe("busy"));
    for (const line of ["Un petit moment de patience", "Nous recevons actuellement beaucoup de contributions pour cet hommage.", "Merci de réessayer un peu plus tard."]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
  });

  it("refus d'un champ par le serveur : message sur place, saisie conservée", async () => {
    const t = transport({ status: "invalid", field: "authorName" });
    draw(t, { condolences: true, stories: false, photos: false });
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Pensées." } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Indiquez votre nom, en 60 caractères au plus.");
    expect((screen.getByLabelText("Votre message") as HTMLTextAreaElement).value).toBe("Pensées.");
  });

  it("compteur en caractères visibles (un émoji composé = 1), identique au serveur", async () => {
    draw(transport(), { condolences: true, stories: false, photos: false });
    const kiss = "\u{1F469}\u{1F3FB}\u200D\u2764\uFE0F\u200D\u{1F48B}\u200D\u{1F468}\u{1F3FC}";
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: kiss.repeat(3) } });
    expect(screen.getByText("3 / 500")).toBeTruthy();
  });

  it("photo : une photographie est exigée avant l'envoi", async () => {
    const t = transport({ status: "pending" });
    draw(t, { condolences: false, stories: false, photos: true });
    await waitFor(() => expect((screen.getByRole("button", { name: "Envoyer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Votre nom"), { target: { value: "Marion" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choisissez une photographie.");
    expect(t.depositPhoto).not.toHaveBeenCalled();
  });

  it("champ piège hors du parcours ; « Fermer » et Échap ferment", async () => {
    const onClose = draw(transport());
    fireEvent.click(document.querySelector('[data-choice="condolence"]')!);
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Fermer/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("M8-Q6 — mention propre au type, statut « proposition », notice détaillée, contact jamais présenté comme joignable", async () => {
    const t = transport({ status: "pending" });
    draw(t);
    for (const [kind, needle] of [
      ["condolence", "publiés aussitôt"],
      ["testimonial", "d’abord transmis à la famille"],
      ["photo", "(lieu, appareil, date) sont retirées"],
    ] as const) {
      fireEvent.click(document.querySelector(`[data-choice="${kind}"]`)!);
      await waitFor(() => expect(document.querySelector(`[data-privacy-kind="${kind}"]`)).not.toBeNull());
      const box = document.querySelector<HTMLElement>(`[data-privacy-kind="${kind}"]`)!;
      expect(box.textContent).toContain(needle);
      expect(box.textContent).toContain("contact@herelys.com (adresse en cours de mise en service)");
      expect(box.querySelector('[data-privacy-status="proposal"]')?.textContent).toBe("Proposition de texte — non validée juridiquement.");
      const notice = box.querySelector("details[data-privacy-notice]")!;
      expect(notice.querySelector("summary")?.textContent).toBe("En savoir plus sur vos données");
      expect(notice.querySelectorAll("li")).toHaveLength(8);
      expect(box.innerHTML).not.toContain("mailto:");
      fireEvent.click(screen.getByRole("button", { name: "Retour" }));
      await waitFor(() => expect(state()).toBe("choose"));
    }
  });

  it("aucune catégorie en vigueur, ou jeton refusé : message calme, aucun formulaire", async () => {
    draw(transport(), { condolences: false, stories: false, photos: false });
    expect(state()).toBe("closed");
    cleanup();
    const t = transport();
    t.open.mockResolvedValueOnce({ status: "unavailable" } as never);
    draw(t);
    await waitFor(() => expect(state()).toBe("closed"));
    expect(screen.getByText("Cet hommage ne reçoit pas de contribution pour le moment.")).toBeTruthy();
  });
});
