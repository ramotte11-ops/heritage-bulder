// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { resolveJourney } from "@/lib/builder/guided-flow/journey";
import { throughA02 } from "@/lib/memorial/assembly/test-fixtures";
import { createPreviewFlushRegistry, PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";
import { DraftRevisionProvider, useDraftRevisionCoordinator } from "@/lib/builder/draft-revision";
import { DraftConflictNotice } from "@/components/builder/DraftConflictNotice";

const { routerPush, routerReplace, routerRefresh, useRouter } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const refresh = vi.fn();
  return {
    routerPush: push,
    routerReplace: replace,
    routerRefresh: refresh,
    useRouter: vi.fn(() => ({ push, replace, refresh })),
  };
});
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { BuilderScreenNav } = await import("./BuilderScreenNav");
const { ChangeAmbianceLink } = await import("./JourneyEntry");
const { JourneyContext, RouteJourneyProvider, useStepDone } = await import("./journey-context");

afterEach(() => {
  cleanup();
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
  document.body.style.overflow = "";
});

/** A03 current: the Hero and A01/A02 done, the ceremony upcoming. */
const PARTIAL: MemorialContent = throughA02();

function renderWithRoute(
  revising: Parameters<typeof resolveJourney>[1] = null,
  registry = createPreviewFlushRegistry(),
  language: "fr" | "en" | "es" = "fr",
) {
  render(
    <PreviewFlushRegistryContext.Provider value={registry}>
      <RouteJourneyProvider language={language} snapshot={resolveJourney(PARTIAL, revising)} builderPath="/builder/m-1">
        <BuilderScreenNav />
      </RouteJourneyProvider>
    </PreviewFlushRegistryContext.Provider>,
  );
}

const openPanel = () => fireEvent.click(screen.getByRole("button", { name: /Mon parcours/ }));
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A rubrique's header button — closed by default (PO). */
const blockToggle = (title: string) => screen.getByRole("button", { name: new RegExp(`^${escapeRe(title)}`) });
const openBlock = (title: string) => fireEvent.click(blockToggle(title));
const ALL_BLOCKS = ["Votre proche", "L'annonce de décès", "La cérémonie", "Traditions & repères", "Quelques mots sur la personne", "Vos souvenirs en images"];

function ConflictTrigger() {
  const coordinator = useDraftRevisionCoordinator();
  return (
    <button type="button" onClick={() => coordinator?.reportConflict(PARTIAL)}>
      Déclarer un conflit
    </button>
  );
}

function renderConflictedRoute({
  revising = null,
  visibility,
}: {
  revising?: Parameters<typeof resolveJourney>[1];
  visibility?: Parameters<typeof RouteJourneyProvider>[0]["visibility"];
} = {}) {
  render(
    <DraftRevisionProvider initialRevision={4} initialContent={PARTIAL}>
      <PreviewFlushRegistryContext.Provider value={createPreviewFlushRegistry()}>
        <RouteJourneyProvider
          language="fr"
          snapshot={resolveJourney(PARTIAL, revising)}
          visibility={visibility}
          builderPath="/builder/m-1"
        >
          <DraftConflictNotice language="fr" />
          <BuilderScreenNav />
          <ConflictTrigger />
        </RouteJourneyProvider>
      </PreviewFlushRegistryContext.Provider>
    </DraftRevisionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Déclarer un conflit" }));
}

describe("« Mon parcours » — the entry", () => {
  it("renders nothing outside a journey (T01, the Welcome)", () => {
    const { container } = render(<BuilderScreenNav />);
    expect(container.innerHTML).toBe("");
  });

  it("is a labelled button announcing a dialog, translated", () => {
    renderWithRoute(null, createPreviewFlushRegistry(), "es");
    const button = screen.getByRole("button", { name: /Mi recorrido/ });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("opening the panel navigates nowhere and writes nothing", () => {
    renderWithRoute();
    openPanel();
    expect(screen.getByRole("dialog", { name: "Mon parcours" })).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("closes with Escape and with « Fermer », giving focus back to the entry", () => {
    renderWithRoute();
    openPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Mon parcours/ }));
  });
});

describe("« Mon parcours » — the panel's content", () => {
  it("lists the sections with family-readable titles and statuses", () => {
    renderWithRoute();
    openPanel();
    for (const title of ALL_BLOCKS) {
      expect(screen.getByRole("heading", { level: 3, name: new RegExp(`^${escapeRe(title)}`) })).toBeTruthy();
    }
    const row = (id: string) => document.querySelector(`[data-screen="${id}"]`) as HTMLElement;
    expect(row("identity").dataset.status).toBe("done");
    expect(row("announcementPreview").dataset.status).toBe("current");
    expect(row("ceremonyMoment").dataset.status).toBe("upcoming");
    expect(row("identity").textContent).toContain("Terminée");
    expect(row("announcementPreview").textContent).toContain("En cours");
    expect(row("ceremonyMoment").textContent).toContain("À venir");
  });

  it("offers « Revoir » only on reached screens — never on a future one, nor on the current one", () => {
    renderWithRoute();
    openPanel();
    for (const title of ALL_BLOCKS) openBlock(title);
    expect(screen.getByRole("button", { name: "Revoir — Nom et dates" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoir — Le texte de l'annonce" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Revoir — L'aperçu de l'avis/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Revoir — Un moment est-il prévu/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Revoir — Vos souvenirs en images/ })).toBeNull();
  });
});

describe("« Mon parcours » — navigation", () => {
  it("a declared conflict blocks Revoir and keeps the export action on the current screen", async () => {
    renderConflictedRoute();
    openPanel();
    openBlock("Votre proche");
    const review = screen.getByRole("button", { name: "Revoir — Nom et dates" });
    fireEvent.click(review);

    await waitFor(() => expect(review).toHaveProperty("disabled", false));
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Télécharger mes modifications" })).toBeTruthy();
  });

  it("a declared conflict blocks Reprendre without reloading or discarding local values", async () => {
    renderConflictedRoute({ revising: "identity" });
    const resume = screen.getByRole("button", { name: "Reprendre où j'en étais" });
    fireEvent.click(resume);

    await waitFor(() => expect(resume).toHaveProperty("disabled", false));
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Télécharger mes modifications" })).toBeTruthy();
  });

  it("shows feedback on the activated « Revoir » while the autosave drain is pending", async () => {
    let release: () => void = () => {};
    const registry = createPreviewFlushRegistry();
    registry.register(() => new Promise<void>((resolve) => (release = resolve)));
    renderWithRoute(null, registry);
    openPanel();
    openBlock("Votre proche");

    const review = screen.getByRole("button", { name: "Revoir — Nom et dates" });
    fireEvent.click(review);

    expect(review.textContent).toBe("Un instant…");
    expect(review.getAttribute("aria-busy")).toBe("true");
    expect(review).toHaveProperty("disabled", true);

    await act(async () => release());
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1?etape=identity"));
  });

  it("« Revoir » drains the autosave first, then opens ?etape= on the route's own path", async () => {
    const registry = createPreviewFlushRegistry();
    const order: string[] = [];
    registry.register(async () => {
      order.push("flush");
    });
    routerPush.mockImplementation(() => order.push("push"));
    renderWithRoute(null, registry);
    openPanel();
    openBlock("Votre proche");
    fireEvent.click(screen.getByRole("button", { name: "Revoir — Nom et dates" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1?etape=identity"));
    expect(order).toEqual(["flush", "push"]);
    routerPush.mockReset();
  });

  it("a failed save keeps the family where they are, with a calm alert", async () => {
    const registry = createPreviewFlushRegistry();
    registry.register(() => Promise.reject(new Error("offline")));
    renderWithRoute(null, registry);
    openPanel();
    openBlock("Votre proche");
    fireEvent.click(screen.getByRole("button", { name: "Revoir — Nom et dates" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/pas encore enregistrées/));
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("while revising: a notice, « Reprendre où j'en étais », and « Continuer ici » on the current screen", async () => {
    renderWithRoute("identity");
    expect(screen.getByText(/Vous modifiez une étape déjà remplie/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reprendre où j'en étais" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1"));

    routerPush.mockClear();
    openPanel();
    expect((document.querySelector('[data-screen="identity"]') as HTMLElement).textContent).toContain("En cours");
    openBlock("L'annonce de décès");
    fireEvent.click(screen.getByRole("button", { name: "Continuer ici" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1"));
  });
});

describe("useStepDone — what a step does once its Continue is saved", () => {
  function Probe() {
    const done = useStepDone();
    return (
      <button type="button" onClick={done}>
        done
      </button>
    );
  }

  it("without a journey: the historical router.refresh()", () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("on the normal route: router.refresh() — the route's gates move on", () => {
    render(
      <RouteJourneyProvider language="fr" snapshot={resolveJourney(PARTIAL)} builderPath="/builder/m-1">
        <Probe />
      </RouteJourneyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(routerRefresh).toHaveBeenCalledOnce();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("on a revised screen: back to the route without ?etape= (resume where the family stopped)", () => {
    render(
      <RouteJourneyProvider language="fr" snapshot={resolveJourney(PARTIAL, "identity")} builderPath="/builder/m-1">
        <Probe />
      </RouteJourneyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(routerReplace).toHaveBeenCalledWith("/builder/m-1");
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("uses a custom provider's finishStep when one is given (the QG demo)", () => {
    const finishStep = vi.fn();
    render(
      <JourneyContext.Provider
        value={{
          language: "fr",
          snapshot: resolveJourney(PARTIAL),
          skinVariant: null,
          openScreen: async () => true,
          resume: async () => true,
          finishStep,
          hasPendingInput: () => false,
        }}
      >
        <Probe />
      </JourneyContext.Provider>,
    );
    act(() => fireEvent.click(screen.getByRole("button", { name: "done" })));
    expect(finishStep).toHaveBeenCalledOnce();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("a real step opened for revision (A00: Oui → Non)", () => {
  it("saves the new answer on top of the draft, keeps the notice, then goes back to the route", async () => {
    const { AnnouncementChoiceStep } = await import("../AnnouncementChoiceStep");
    const draft = throughA02(); // an old draft: notice written, yes derived from A01
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(
      <RouteJourneyProvider language="fr" snapshot={resolveJourney(draft, "announcementChoice")} builderPath="/builder/m-1">
        <AnnouncementChoiceStep language="fr" content={draft} persist={persist} />
      </RouteJourneyProvider>,
    );

    // The derived answer is preselected: the family sees what is in force.
    expect((screen.getByLabelText(/^Oui/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/^Non/));
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/builder/m-1"));
    const saved = persist.mock.calls[0][0] as { deathNotice: unknown; guidedFlow: Record<string, unknown> };
    expect(saved.guidedFlow.A00).toEqual({ status: "completed", answer: "no" });
    expect(saved.deathNotice).toEqual((draft as { deathNotice: unknown }).deathNotice);
    expect(saved.guidedFlow.A01).toEqual((draft as { guidedFlow: Record<string, unknown> }).guidedFlow.A01);
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("B03 — incomplete input: never a silent loss", () => {
  async function renderWithPending(revising: Parameters<typeof resolveJourney>[1] = null) {
    const { usePendingInput } = await import("./pending-input");
    function Unfinished() {
      usePendingInput(true);
      return null;
    }
    render(
      <PreviewFlushRegistryContext.Provider value={createPreviewFlushRegistry()}>
        <RouteJourneyProvider language="fr" snapshot={resolveJourney(PARTIAL, revising)} builderPath="/builder/m-1">
          <BuilderScreenNav />
          <Unfinished />
        </RouteJourneyProvider>
      </PreviewFlushRegistryContext.Provider>,
    );
  }

  it("« Revoir » asks first; « Rester pour la compléter » goes back to the screen without navigating", async () => {
    await renderWithPending();
    openPanel();
    openBlock("Votre proche");
    fireEvent.click(screen.getByRole("button", { name: "Revoir — Nom et dates" }));
    expect(screen.getByRole("alert").textContent).toMatch(/n'est pas terminée/);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rester pour la compléter" }));
    fireEvent.click(screen.getByRole("button", { name: "Rester pour la compléter" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("« Quitter sans cette réponse » then navigates, exactly as asked", async () => {
    await renderWithPending();
    openPanel();
    openBlock("Votre proche");
    fireEvent.click(screen.getByRole("button", { name: "Revoir — Nom et dates" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitter sans cette réponse" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1?etape=identity"));
  });

  it("the revision notice's « Reprendre où j'en étais » asks too", async () => {
    await renderWithPending("identity");
    fireEvent.click(screen.getByRole("button", { name: "Reprendre où j'en étais" }));
    expect(screen.getByRole("alert").textContent).toMatch(/n'est pas terminée/);
    expect(routerPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quitter sans cette réponse" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1"));
  });

  it("closing the tab with incomplete input triggers the browser's own warning; without, nothing", async () => {
    await renderWithPending();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    cleanup();

    renderWithRoute();
    const quiet = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
  });
});

describe("B03 — A00 « Plus tard » reads « À décider »", () => {
  it("the notice and traditions sections show « À décider » with their note, never « Non concernée »", async () => {
    const { commitA00 } = await import("@/lib/builder/guided-flow/announcement-choice-step");
    const later = commitA00(PARTIAL, "later");
    if (!later.ok) throw new Error("fixture");
    render(
      <RouteJourneyProvider language="fr" snapshot={resolveJourney(later.content)} builderPath="/builder/m-1">
        <BuilderScreenNav />
      </RouteJourneyProvider>,
    );
    openPanel();
    const section = (title: string) => blockToggle(title).closest("li") as HTMLElement;
    for (const title of ["L'annonce de décès", "Traditions & repères"]) {
      expect(section(title).dataset.status).toBe("deferred");
      expect(section(title).textContent).toContain("À décider");
      expect(section(title).textContent).not.toContain("Non concernée");
      expect(section(title).textContent).toMatch(/choisi de décider plus tard/);
    }
  });

  it.each([
    ["en", "To decide"],
    ["es", "Por decidir"],
  ] as const)("is translated (%s)", async (language, label) => {
    const { commitA00 } = await import("@/lib/builder/guided-flow/announcement-choice-step");
    const later = commitA00(PARTIAL, "later");
    if (!later.ok) throw new Error("fixture");
    render(
      <RouteJourneyProvider language={language} snapshot={resolveJourney(later.content)} builderPath="/builder/m-1">
        <BuilderScreenNav />
      </RouteJourneyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: language === "en" ? /My journey/ : /Mi recorrido/ }));
    expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2);
  });
});

describe("correction Light / Dark — the saved ambiance, and « Changer l'ambiance »", () => {
  const AFTER_IDENTITY = {
    hero: { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null },
    guidedFlow: { T04: { status: "skipped" } },
  } as unknown as MemorialContent;

  function renderJourney(content: MemorialContent, skinVariant: "light" | "dark" | null, children = <BuilderScreenNav />) {
    render(
      <PreviewFlushRegistryContext.Provider value={createPreviewFlushRegistry()}>
        <RouteJourneyProvider language="fr" snapshot={resolveJourney(content)} skinVariant={skinVariant} builderPath="/builder/m-1">
          {children}
        </RouteJourneyProvider>
      </PreviewFlushRegistryContext.Provider>,
    );
  }
  const revealRow = () => document.querySelector('[data-screen="reveal"]') as HTMLElement;

  it.each([
    ["light", "Ambiance : Claire"],
    ["dark", "Ambiance : Sombre"],
  ] as const)("T08 done: its row shows the saved ambiance (%s)", (variant, text) => {
    renderJourney(PARTIAL, variant);
    openPanel();
    expect(revealRow().textContent).toContain("L'ambiance de l'hommage");
    expect(revealRow().textContent).toContain(text);
    openBlock("Votre proche");
    expect(screen.getByRole("button", { name: "Revoir — L'ambiance de l'hommage" })).toBeTruthy();
  });

  it("T08 not reached yet: no ambiance shown (the default is not a family choice)", () => {
    renderJourney(AFTER_IDENTITY, "light");
    openPanel();
    expect(revealRow().textContent).not.toContain("Ambiance :");
  });

  it("« Changer l'ambiance » opens T08 for revision, after draining the autosave", async () => {
    renderJourney(PARTIAL, "light", <ChangeAmbianceLink />);
    fireEvent.click(screen.getByRole("button", { name: "Changer l'ambiance" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1?etape=reveal"));
  });

  it("« Changer l'ambiance » asks first when the screen holds incomplete input", async () => {
    const { usePendingInput } = await import("./pending-input");
    function Unfinished() {
      usePendingInput(true);
      return null;
    }
    renderJourney(
      PARTIAL,
      "light",
      <>
        <ChangeAmbianceLink />
        <Unfinished />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Changer l'ambiance" }));
    expect(screen.getByRole("alert").textContent).toMatch(/n'est pas terminée/);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("is absent while T08 is not reopenable, and outside any journey", () => {
    renderJourney(AFTER_IDENTITY, "light", <ChangeAmbianceLink />);
    expect(screen.queryByRole("button", { name: "Changer l'ambiance" })).toBeNull();
    cleanup();
    render(<ChangeAmbianceLink />);
    expect(screen.queryByRole("button", { name: "Changer l'ambiance" })).toBeNull();
  });
});

describe("« Mon parcours » simplifié — rubriques repliables", () => {
  it("every rubrique is a closed block: a title and ONE status, its steps out of reach until opened", () => {
    renderWithRoute();
    openPanel();
    for (const title of ALL_BLOCKS) {
      expect(blockToggle(title).getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.queryByRole("button", { name: /^Revoir/ })).toBeNull();
    expect(blockToggle("Votre proche").textContent).toContain("Terminée");
    expect(blockToggle("La cérémonie").textContent).toContain("À venir");
  });

  it("opening a block shows its steps with the existing « Revoir »; closing hides them again", () => {
    renderWithRoute();
    openPanel();
    openBlock("Votre proche");
    expect(blockToggle("Votre proche").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Revoir — Nom et dates" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoir — Le texte de l'annonce" })).toBeNull();
    openBlock("Votre proche");
    expect(screen.queryByRole("button", { name: "Revoir — Nom et dates" })).toBeNull();
  });

  it("a finished step no longer repeats « Terminée » on screen — its ✓ says it, screen readers still hear it", () => {
    renderWithRoute();
    openPanel();
    openBlock("Votre proche");
    const row = document.querySelector('[data-screen="identity"]') as HTMLElement;
    const status = [...row.querySelectorAll("span")].find((el) => el.textContent === "Terminée") as HTMLElement;
    expect(status).toBeTruthy();
    expect(status.className).toMatch(/srOnly/);
    expect(row.textContent).toContain("✓");
  });
});

describe("« Gérer les rubriques visibles »", () => {
  const ENTRIES = [
    { sectionId: "deathNotice" as const, hidden: false, ready: true, archivable: true },
    { sectionId: "ceremony" as const, hidden: true, ready: true, archivable: true },
    { sectionId: "story" as const, hidden: false, ready: false, archivable: false },
    { sectionId: "gallery" as const, hidden: true, ready: true, archivable: false },
  ];

  function renderVisibility(save = vi.fn().mockResolvedValue(undefined), registry = createPreviewFlushRegistry()) {
    render(
      <PreviewFlushRegistryContext.Provider value={registry}>
        <RouteJourneyProvider
          language="fr"
          snapshot={resolveJourney(PARTIAL)}
          visibility={{ sections: ENTRIES, save }}
          builderPath="/builder/m-1"
        >
          <BuilderScreenNav />
        </RouteJourneyProvider>
      </PreviewFlushRegistryContext.Provider>,
    );
    openPanel();
    return save;
  }
  const manage = () => fireEvent.click(screen.getByRole("button", { name: "Gérer les rubriques visibles" }));
  const row = (id: string) => document.querySelector(`[data-visibility-section="${id}"]`) as HTMLElement;

  it("is a distinct entry of « Mon parcours », absent when the host does not provide it", () => {
    renderVisibility();
    expect(screen.getByRole("button", { name: "Gérer les rubriques visibles" })).toBeTruthy();
    cleanup();
    renderWithRoute();
    openPanel();
    expect(screen.queryByRole("button", { name: "Gérer les rubriques visibles" })).toBeNull();
  });

  it("lists the Hero as always visible, then each section with its state and one action", () => {
    renderVisibility();
    manage();
    expect(screen.getByRole("heading", { level: 2, name: "Rubriques visibles" })).toBeTruthy();
    expect(row("hero").textContent).toContain("Toujours visible");
    expect(row("hero").querySelector("button")).toBeNull();
    expect(row("deathNotice").textContent).toContain("Visible");
    expect(screen.getByRole("button", { name: "Masquer — L'annonce de décès" })).toBeTruthy();
    expect(row("ceremony").textContent).toContain("Masquée");
    expect(screen.getByRole("button", { name: "Réafficher — La cérémonie" })).toBeTruthy();
    expect(row("ceremony").textContent).toMatch(/lien discret/);
    expect(row("gallery").textContent).toMatch(/contenu est conservé/);
    expect(row("story").textContent).toMatch(/une fois complétée/);
  });

  it("« Masquer » drains the screen's autosave, saves (section, false), then refreshes the route", async () => {
    const registry = createPreviewFlushRegistry();
    const order: string[] = [];
    registry.register(async () => {
      order.push("flush");
    });
    const save = vi.fn().mockImplementation(async () => {
      order.push("save");
    });
    routerRefresh.mockImplementation(() => order.push("refresh"));
    renderVisibility(save, registry);
    manage();
    fireEvent.click(screen.getByRole("button", { name: "Masquer — L'annonce de décès" }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith("deathNotice", false, 0);
    expect(order).toEqual(["flush", "save", "refresh"]);
    expect(routerPush).not.toHaveBeenCalled();
    routerRefresh.mockReset();
  });

  it("« Réafficher » saves (section, true)", async () => {
    const save = renderVisibility();
    manage();
    fireEvent.click(screen.getByRole("button", { name: "Réafficher — La cérémonie" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("ceremony", true, 0));
  });

  it("a declared conflict blocks visibility writes and never refreshes the route", async () => {
    const save = vi.fn();
    renderConflictedRoute({ visibility: { sections: ENTRIES, save } });
    openPanel();
    manage();
    const hide = screen.getByRole("button", { name: "Masquer — L'annonce de décès" });
    fireEvent.click(hide);

    await waitFor(() => expect(hide).toHaveProperty("disabled", false));
    expect(save).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Télécharger mes modifications" })).toBeTruthy();
  });

  it("a failed save changes nothing and says so calmly", async () => {
    renderVisibility(vi.fn().mockRejectedValue(new Error("offline")));
    manage();
    fireEvent.click(screen.getByRole("button", { name: "Masquer — L'annonce de décès" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/n'a pas pu être enregistré/));
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("« Retour à mon parcours » comes back to the blocks; a hidden section's block says « Masquée de l'hommage »", () => {
    renderVisibility();
    manage();
    fireEvent.click(screen.getByRole("button", { name: "Retour à mon parcours" }));
    expect(screen.getByRole("heading", { level: 2, name: "Mon parcours" })).toBeTruthy();
    expect(blockToggle("La cérémonie").textContent).toContain("Masquée de l'hommage");
    expect(blockToggle("Vos souvenirs en images").textContent).toContain("Masquée de l'hommage");
    expect(blockToggle("L'annonce de décès").textContent).not.toContain("Masquée de l'hommage");
  });

  it("is translated (en, es)", () => {
    for (const [language, label] of [
      ["en", "Manage visible sections"],
      ["es", "Gestionar las secciones visibles"],
    ] as const) {
      render(
        <RouteJourneyProvider
          language={language}
          snapshot={resolveJourney(PARTIAL)}
          visibility={{ sections: ENTRIES, save: vi.fn() }}
          builderPath="/builder/m-1"
        >
          <BuilderScreenNav />
        </RouteJourneyProvider>,
      );
      fireEvent.click(screen.getAllByRole("button")[0]);
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
      cleanup();
    }
  });
});
