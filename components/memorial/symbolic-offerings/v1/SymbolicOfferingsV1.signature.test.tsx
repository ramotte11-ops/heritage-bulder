// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot 2 — la signature facultative dans la scène de confirmation (V2
 * validée par la PO) : proposée seulement APRÈS le geste confirmé, jamais
 * obligatoire, envoyée par « Poursuivre la visite » ou Entrée, jamais en
 * Preview. jsdom n'a pas de mise en page : la composition elle-même est
 * vérifiée dans Chromium (captures de docs/validation/offrandes-signature-lot2/).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { SymbolicOfferingsV1, SIGNATURE_MAX_LENGTH } = await import("./SymbolicOfferingsSceneV1");
const { OFFERINGS_V1_TEXTS } = await import("./texts");

afterEach(cleanup);

const T = OFFERINGS_V1_TEXTS.fr;
function scene(layout: "mobile" | "desktop" = "mobile") {
  return within(screen.getByTestId(`offerings-v1-${layout}`));
}
async function confirmBougie() {
  fireEvent.click(scene().getByRole("button", { name: /Allumer une bougie/ }));
  await waitFor(() => expect(scene().getByLabelText(T.signInvite)).toBeTruthy());
}

describe("Offrandes V1 — signature facultative (Lot 2)", () => {
  it("rien sur l'état « cartes » : la signature n'est proposée qu'après le geste", () => {
    render(<SymbolicOfferingsV1 skinVariant="light" transmit={async () => true} reducedMotion />);
    expect(scene().queryByLabelText(T.signInvite)).toBeNull();
    expect(scene().queryByPlaceholderText(T.signPlaceholder)).toBeNull();
  });

  it("après le geste : invitation libellant le champ, indication, 40 caractères au plus, saisie compatible mobile", async () => {
    render(<SymbolicOfferingsV1 skinVariant="light" transmit={async () => true} reducedMotion />);
    await confirmBougie();
    const input = scene().getByLabelText(T.signInvite) as HTMLInputElement;
    expect(input.placeholder).toBe("Prénom ou surnom (facultatif)");
    expect(input.maxLength).toBe(SIGNATURE_MAX_LENGTH);
    expect(SIGNATURE_MAX_LENGTH).toBe(40);
    expect(input.type).toBe("text");
    expect(input.required).toBe(false);
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("enterkeyhint")).toBe("go");
    // Aucune mention « Visible uniquement par la famille » dans la scène (décision PO).
    expect(screen.getByTestId("offerings-v1-mobile").textContent).not.toMatch(/famille|family|familia/i);
    // Le bouton reste un vrai bouton, après le champ dans l'ordre de tabulation.
    const button = scene().getByRole("button", { name: T.continue });
    expect(input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Mobile empilé, Desktop côte à côte", async () => {
    render(<SymbolicOfferingsV1 skinVariant="dark" transmit={async () => true} reducedMotion />);
    await confirmBougie();
    expect(screen.getByTestId("offerings-v1-mobile").querySelector("[data-arrangement]")!.getAttribute("data-arrangement")).toBe("column");
    expect(screen.getByTestId("offerings-v1-desktop").querySelector("[data-arrangement]")!.getAttribute("data-arrangement")).toBe("row");
  });

  it("Entrée dans le champ vaut « Poursuivre la visite » (raccourci, le bouton reste)", async () => {
    const sign = vi.fn(async () => true);
    const onContinue = vi.fn();
    render(<SymbolicOfferingsV1 skinVariant="light" transmit={async () => true} sign={sign} continueAction={onContinue} reducedMotion />);
    await confirmBougie();
    const input = scene().getByLabelText(T.signInvite) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Marie" } });
    fireEvent.submit(input.form!);
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith("bougie"));
    expect(sign).toHaveBeenCalledWith("bougie", "Marie");
  });

  it("Preview (retour aux cartes, aucun `sign`) : le champ s'essaie, rien n'est envoyé, il est vidé au retour", async () => {
    const transmit = vi.fn(async () => true);
    render(<SymbolicOfferingsV1 skinVariant="light" transmit={transmit} reducedMotion />);
    await confirmBougie();
    fireEvent.change(scene().getByLabelText(T.signInvite), { target: { value: "Marie" } });
    fireEvent.click(scene().getByRole("button", { name: T.continue }));
    await waitFor(() => expect(scene().getByRole("button", { name: /Allumer une bougie/ })).toBeTruthy());
    await confirmBougie();
    expect((scene().getByLabelText(T.signInvite) as HTMLInputElement).value).toBe("");
    expect(transmit).toHaveBeenCalledTimes(2);
  });

  it("une seule tentative : pendant l'envoi le champ est figé et un second clic n'envoie rien de plus", async () => {
    let resolve: (v: boolean) => void = () => {};
    const sign = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const onContinue = vi.fn();
    render(<SymbolicOfferingsV1 skinVariant="light" transmit={async () => true} sign={sign} continueAction={onContinue} reducedMotion />);
    await confirmBougie();
    const input = scene().getByLabelText(T.signInvite) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Marie" } });
    fireEvent.click(scene().getByRole("button", { name: T.continue }));
    await waitFor(() => expect(input.readOnly).toBe(true));
    fireEvent.click(scene().getByRole("button", { name: T.continue }));
    resolve(true);
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "es"] as const)("%s : invitation, indication et échec traduits", async (language) => {
    const t = OFFERINGS_V1_TEXTS[language];
    render(<SymbolicOfferingsV1 skinVariant="light" language={language} transmit={async () => true} sign={async () => false} continueAction={() => {}} reducedMotion />);
    fireEvent.click(scene().getByRole("button", { name: new RegExp(t.cards.bougie.title) }));
    const input = await waitFor(() => scene().getByLabelText(t.signInvite) as HTMLInputElement);
    expect(input.placeholder).toBe(t.signPlaceholder);
    fireEvent.change(input, { target: { value: "Ana" } });
    fireEvent.click(scene().getByRole("button", { name: t.continue }));
    await waitFor(() => expect(screen.getByTestId("offerings-v1-mobile").textContent).toContain(t.signFailure));
  });
});
