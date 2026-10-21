// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * M3 — la rubrique Offrandes symboliques dans le Memorial assemblé :
 * dessinée dans la Preview du Builder seulement, avec une réponse serveur
 * simulée ; rien hors de la Preview. Réduction des animations active (le
 * mouvement est contrôlé dans Chromium).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { SymbolicOfferingsV1Section, OFFERINGS_PREVIEW_NOTICE_FR } = await import("./SymbolicOfferingsV1Section");
const { OfferingsPreviewProvider, simulatedOfferingTransmit, SIMULATED_RESPONSE_MS } = await import("./offerings-preview");
const { MemorialAssembly } = await import("@/components/memorial/assembly/MemorialAssembly");
const { RENDERER_COMPONENTS } = await import("@/components/memorial/assembly/renderer-registry");

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
});

function mobile() {
  return within(screen.getByTestId("offerings-v1-mobile"));
}

function confirmationText() {
  const p = screen.getByTestId("offerings-v1-mobile").querySelector<HTMLElement>("[data-focus=confirmation]")!;
  return p.hidden ? null : p.textContent!.replace(/\s+/g, " ").trim();
}

describe("Offrandes V1 — hors de la Preview du Builder", () => {
  it("ne dessine rien : ni carte, ni scène, ni mention", () => {
    const { container } = render(<SymbolicOfferingsV1Section skinVariant="light" />);
    expect(container.innerHTML).toBe("");
  });

  it("dans un Memorial assemblé hors Preview, la rubrique reste vide", () => {
    const { container } = render(
      <MemorialAssembly
        assembled={{
          status: "assembled",
          composition: { skin: "intemporel", skinVariant: "dark", sections: [], renderable: [], archived: [] },
          skin: "intemporel",
          skinVariant: "dark",
          language: "fr",
          sections: [{ sectionId: "symbolicOfferings", rendererKey: "SymbolicOfferingsV1Section", props: { skinVariant: "dark" } }],
          archivedSections: [],
          failures: [],
        }}
      />,
    );
    expect(container.querySelector("[data-memorial-section=symbolicOfferings]")!.innerHTML).toBe("");
  });

  it("le registre dessine la rubrique par ce portail", () => {
    expect(RENDERER_COMPONENTS.SymbolicOfferingsV1Section).toBe(SymbolicOfferingsV1Section);
  });
});

describe("Offrandes V1 — dans la Preview du Builder", () => {
  function renderPreview(variant: "light" | "dark" = "light") {
    render(
      <OfferingsPreviewProvider>
        <SymbolicOfferingsV1Section skinVariant={variant} />
      </OfferingsPreviewProvider>,
    );
  }

  it("annonce la réponse simulée au-dessus de la composition", () => {
    renderPreview("dark");
    const note = screen.getByRole("note");
    expect(note.textContent).toBe(OFFERINGS_PREVIEW_NOTICE_FR);
    expect(note.dataset.variant).toBe("dark");
    expect(note.textContent).toMatch(/simulée/);
    expect(note.textContent).toMatch(/aucun geste n’est enregistré/);
    // La mention précède la composition, hors des Masters.
    expect(note.nextElementSibling?.querySelector("[data-testid=offerings-v1-mobile]")).not.toBeNull();
  });

  it("essais libres : les trois gestes à la suite, retour aux cartes, aucune requête", async () => {
    renderPreview();
    const tries: [RegExp, string][] = [
      [/Allumer une bougie/, "Une lumière brille désormais en sa mémoire."],
      [/Déposer une fleur/, "Une fleur déposée en sa mémoire."],
      [/Offrir un cœur/, "Une pensée d’amour offerte en sa mémoire."],
      [/Allumer une bougie/, "Une lumière brille désormais en sa mémoire."],
    ];
    for (const [card, confirmation] of tries) {
      fireEvent.click(mobile().getByRole("button", { name: card }));
      expect(confirmationText()).toBeNull();
      await waitFor(() => expect(confirmationText()).toBe(confirmation));
      fireEvent.click(mobile().getByRole("button", { name: "Poursuivre la visite" }));
      await waitFor(() => expect(mobile().getAllByRole("button")).toHaveLength(3));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Offrandes V1 — réponse serveur simulée", () => {
  it("favorable après un court délai, sans réseau", async () => {
    vi.useFakeTimers();
    try {
      let settled: boolean | null = null;
      void simulatedOfferingTransmit().then((v) => (settled = v));
      await vi.advanceTimersByTimeAsync(SIMULATED_RESPONSE_MS - 1);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
