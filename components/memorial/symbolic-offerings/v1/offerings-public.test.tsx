// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * QG 016 — Offrandes symboliques sur la page publique : l'hôte public
 * (`PublicOfferingsProvider`) autour de la VRAIE rubrique et de la VRAIE
 * scène validée. Le dépôt serveur est injecté (l'action de la page est
 * testée à part). Réduction des animations active.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { SymbolicOfferingsV1Section } = await import("./SymbolicOfferingsV1Section");
const { OFFERINGS_V1_TEXTS } = await import("./texts");
const { PublicOfferingsProvider } = await import("./offerings-public");
const { MemorialAssembly } = await import("@/components/memorial/assembly/MemorialAssembly");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = "d7f78a1b1b16";
const fetchSpy = vi.fn();
const scrollIntoView = vi.fn();
const scrollTo = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("matchMedia", (query: string) =>
    ({ matches: query.includes("prefers-reduced-motion"), addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  vi.stubGlobal("scrollTo", scrollTo);
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
  scrollIntoView.mockReset();
  scrollTo.mockReset();
});

function mobile() {
  return within(screen.getByTestId("offerings-v1-mobile"));
}
function confirmationText() {
  // En échec, la scène ne dessine pas de confirmation du tout.
  const p = screen.getByTestId("offerings-v1-mobile").querySelector<HTMLElement>("[data-focus=confirmation]");
  return p === null || p.hidden ? null : p.textContent!.replace(/\s+/g, " ").trim();
}
function failureShown(language: "fr" | "en" | "es" = "fr") {
  return screen.getByTestId("offerings-v1-mobile").textContent!.includes(OFFERINGS_V1_TEXTS[language].failure);
}
function renderPublic(deposit: (slug: string, kind: string, key: string) => Promise<boolean>, language: "fr" | "en" | "es" = "fr", variant: "light" | "dark" = "light") {
  return render(
    <PublicOfferingsProvider slug={SLUG} deposit={deposit as never}>
      <SymbolicOfferingsV1Section skinVariant={variant} language={language} />
    </PublicOfferingsProvider>,
  );
}

describe("Offrandes V1 — page publique (QG 016)", () => {
  it("dessine la vraie composition, SANS mention d'aperçu", () => {
    renderPublic(vi.fn());
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.querySelector("[data-offerings-public]")).not.toBeNull();
    expect(document.querySelector("[data-offerings-preview]")).toBeNull();
    expect(mobile().getAllByRole("button")).toHaveLength(3);
  });

  it("un geste confirmé est transmis UNE fois au serveur : slug de la page, geste, clé d'idempotence (uuid v4)", async () => {
    const deposit = vi.fn(async () => true);
    renderPublic(deposit);
    fireEvent.click(mobile().getByRole("button", { name: /Allumer une bougie/ }));
    await waitFor(() => expect(confirmationText()).toBe("Une lumière brille désormais en sa mémoire."));
    expect(deposit).toHaveBeenCalledTimes(1);
    const [slug, kind, key] = deposit.mock.calls[0] as unknown as [string, string, string];
    expect(slug).toBe(SLUG);
    expect(kind).toBe("bougie");
    expect(key).toMatch(UUID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refus serveur : message d'échec validé, AUCUNE confirmation, puis « Réessayer » renvoie la MÊME clé", async () => {
    const deposit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPublic(deposit);
    fireEvent.click(mobile().getByRole("button", { name: /Déposer une fleur/ }));
    await waitFor(() => expect(failureShown()).toBe(true));
    expect(confirmationText()).toBeNull();
    fireEvent.click(mobile().getByRole("button", { name: OFFERINGS_V1_TEXTS.fr.retry }));
    await waitFor(() => expect(confirmationText()).toBe("Une fleur déposée en sa mémoire."));
    expect(deposit).toHaveBeenCalledTimes(2);
    expect(deposit.mock.calls[1]![2]).toBe(deposit.mock.calls[0]![2]);
  });

  it("erreur réseau ou exception de l'action : simple échec, jamais d'exception visible", async () => {
    const deposit = vi.fn(async () => { throw new Error("network down"); });
    renderPublic(deposit);
    fireEvent.click(mobile().getByRole("button", { name: /Offrir un cœur/ }));
    await waitFor(() => expect(failureShown()).toBe(true));
    expect(confirmationText()).toBeNull();
  });

  it("un geste par visite : « Poursuivre la visite » ne ramène PAS aux cartes, il fait défiler vers la suite", async () => {
    const deposit = vi.fn(async () => true);
    render(
      <PublicOfferingsProvider slug={SLUG} deposit={deposit}>
        <MemorialAssembly
          assembled={{
            status: "assembled",
            composition: { skin: "intemporel", skinVariant: "light", sections: [], renderable: [], archived: [] },
            skin: "intemporel",
            skinVariant: "light",
            language: "fr",
            sections: [{ sectionId: "symbolicOfferings", rendererKey: "SymbolicOfferingsV1Section", props: { skinVariant: "light", language: "fr" } }],
            archivedSections: [],
            failures: [],
          }}
        />
      </PublicOfferingsProvider>,
    );
    fireEvent.click(mobile().getByRole("button", { name: /Allumer une bougie/ }));
    await waitFor(() => expect(confirmationText()).not.toBeNull());
    fireEvent.click(mobile().getByRole("button", { name: "Poursuivre la visite" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mobile().queryByRole("button", { name: /Déposer une fleur/ })).toBeNull();
    expect(confirmationText()).not.toBeNull();
    expect(scrollIntoView.mock.calls.length + scrollTo.mock.calls.length).toBe(1);
    expect(deposit).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "es"] as const)("%s : cartes, confirmation et échec dans la langue du mémorial", async (language) => {
    const t = OFFERINGS_V1_TEXTS[language];
    const deposit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPublic(deposit, language, "dark");
    expect(screen.getByTestId("offerings-v1-mobile").closest("[lang]")?.getAttribute("lang")).toBe(language);
    fireEvent.click(mobile().getByRole("button", { name: new RegExp(t.cards.lys.title) }));
    await waitFor(() => expect(failureShown(language)).toBe(true));
    fireEvent.click(mobile().getByRole("button", { name: t.retry }));
    await waitFor(() => expect(confirmationText()).toBe(t.layouts.mobile.confirmations.lys.join(" ")));
  });
});
