// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * M2 — parcours du pilote : cartes → geste → confirmation (ou échec et
 * « Réessayer ») → retour aux cartes. `transmit` est la seule sortie du
 * composant : aucune autre écriture n'est possible. jsdom n'a pas d'API Web
 * Animations ni de mise en page : on y vérifie la logique (états, focus,
 * annonces) avec la réduction des animations ; le mouvement lui-même est
 * vérifié dans Chromium (planches et vidéos de `docs/validation/offrandes-v1/`).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { SymbolicOfferingsV1 } = await import("./SymbolicOfferingsSceneV1");

afterEach(cleanup);

function mobile() {
  return within(screen.getByTestId("offerings-v1-mobile"));
}

function renderPilot(transmit: (k: string) => Promise<boolean>, extra: Record<string, unknown> = {}) {
  const states: string[] = [];
  render(
    <SymbolicOfferingsV1
      skinVariant="light"
      transmit={transmit}
      reducedMotion
      onStateChange={(s) => states.push(s.phase === "scene" ? `scene/${s.status}` : s.phase)}
      {...extra}
    />,
  );
  return states;
}

describe("Offrandes V1 — état « cartes »", () => {
  it("trois cartes-boutons dans l'ordre lys, bougie, cœur, intitulés lisibles", () => {
    renderPilot(async () => true);
    const names = mobile()
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Déposer une fleur — Une fleur pour exprimer votre affection.",
      "Allumer une bougie — Une lumière pour garder son souvenir vivant.",
      "Offrir un cœur — Un symbole d’amour toujours présent.",
    ]);
    expect(screen.getByTestId("offerings-v1-mobile").querySelector("[data-provisional=cards-state]")).not.toBeNull();
  });
});

describe("Offrandes V1 — un geste", () => {
  it("confirmation après la réponse favorable, annoncée et focalisée ; une seule transmission", async () => {
    const transmit = vi.fn(async () => true);
    const states = renderPilot(transmit);
    fireEvent.click(mobile().getByRole("button", { name: /Allumer une bougie/ }));
    const confirmation = await waitFor(() => {
      const p = screen.getByTestId("offerings-v1-mobile").querySelector<HTMLElement>("[data-focus=confirmation]")!;
      expect(p.hidden).toBe(false);
      return p;
    });
    expect(confirmation.textContent!.replace(/\s+/g, " ").trim()).toBe("Une lumière brille désormais en sa mémoire.");
    expect(transmit).toHaveBeenCalledTimes(1);
    expect(transmit).toHaveBeenCalledWith("bougie");
    expect(states).toContain("scene/pending");
    expect(states.at(-1)).toBe("scene/confirmed");
    expect(screen.getByText("Une lumière brille désormais en sa mémoire.", { selector: "[aria-live]" })).toBeTruthy();
    // Pendant la scène, les cartes ne sont plus atteignables.
    expect(mobile().queryByRole("button", { name: /Déposer une fleur/ })).toBeNull();
  });

  it("aucune confirmation tant que la transmission n'a pas répondu", async () => {
    let resolve: (v: boolean) => void = () => {};
    renderPilot(() => new Promise<boolean>((r) => (resolve = r)));
    fireEvent.click(mobile().getByRole("button", { name: /Déposer une fleur/ }));
    await act(async () => {});
    const p = screen.getByTestId("offerings-v1-mobile").querySelector<HTMLElement>("[data-focus=confirmation]")!;
    expect(p.hidden).toBe(true);
    expect(mobile().queryByRole("button", { name: "Poursuivre la visite" })).toBeNull();
    await act(async () => resolve(true));
    await waitFor(() => expect(p.hidden).toBe(false));
  });

  it("échec : l'offrande reste, aucune confirmation, « Réessayer » focalisé puis succès", async () => {
    const transmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const states = renderPilot(transmit);
    fireEvent.click(mobile().getByRole("button", { name: /Offrir un cœur/ }));
    const retry = await mobile().findByRole("button", { name: "Réessayer" });
    expect(document.activeElement === retry || retry.dataset.focus === "retry").toBe(true);
    expect(screen.getByTestId("offerings-v1-mobile").textContent).not.toContain("Une pensée d’amour offerte");
    expect(screen.getByTestId("offerings-v1-mobile").textContent).toContain("Votre geste n’a pas pu être enregistré.");
    expect(screen.getByTestId("offerings-v1-mobile").querySelector("img[src$='/objets/coeur.webp']")).not.toBeNull();
    fireEvent.click(retry);
    await mobile().findByRole("button", { name: "Poursuivre la visite" });
    expect(transmit).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("scene/confirmed");
  });

  it("une transmission qui échoue par exception est traitée comme un échec", async () => {
    renderPilot(async () => {
      throw new Error("réseau");
    });
    fireEvent.click(mobile().getByRole("button", { name: /Allumer une bougie/ }));
    expect(await mobile().findByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});

describe("Offrandes V1 — essais libres", () => {
  it("« Poursuivre la visite » ramène aux cartes, focus sur la carte jouée ; un autre geste est possible", async () => {
    const transmit = vi.fn<(kind: string) => Promise<boolean>>(async () => true);
    const states = renderPilot(transmit);
    fireEvent.click(mobile().getByRole("button", { name: /Déposer une fleur/ }));
    fireEvent.click(await mobile().findByRole("button", { name: "Poursuivre la visite" }));
    const lys = await mobile().findByRole("button", { name: /Déposer une fleur/ });
    expect(states.at(-1)).toBe("cards");
    expect(document.activeElement).toBe(lys);
    fireEvent.click(mobile().getByRole("button", { name: /Offrir un cœur/ }));
    await mobile().findByRole("button", { name: "Poursuivre la visite" });
    expect(transmit.mock.calls.map((c) => c[0])).toEqual(["lys", "coeur"]);
  });

  it("une action d'hôte remplace le retour aux cartes (mémorial publié, plus tard)", async () => {
    const onContinue = vi.fn();
    renderPilot(async () => true, { continueAction: onContinue });
    fireEvent.click(mobile().getByRole("button", { name: /Allumer une bougie/ }));
    fireEvent.click(await mobile().findByRole("button", { name: "Poursuivre la visite" }));
    expect(onContinue).toHaveBeenCalledWith("bougie");
    expect(mobile().queryByRole("button", { name: /Déposer une fleur/ })).toBeNull();
  });

  it("sans transmission fournie : aperçu, confirmation simulée immédiate", async () => {
    render(<SymbolicOfferingsV1 skinVariant="dark" reducedMotion />);
    fireEvent.click(mobile().getByRole("button", { name: /Déposer une fleur/ }));
    expect(await mobile().findByRole("button", { name: "Poursuivre la visite" })).toBeTruthy();
  });
});
