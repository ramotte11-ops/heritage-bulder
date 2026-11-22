// @vitest-environment jsdom
/**
 * Mission 04-J — EXPERIMENT (local only). A06 « Où aura lieu ce moment ? »
 * end to end in the browser layer: the real step, the real revision
 * coordinator, the real combined server logic (saveTextThenStep) and a
 * historical transport built from the same pieces as saveDraftAction,
 * both against an in-memory database reproducing the RPC contract
 * (revision CAS, lifecycle check, audit only after publication).
 */
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { DraftRevisionProvider, useDraftRevisionCoordinator, type DraftSaveResponse } from "@/lib/builder/draft-revision";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/builder/autosave-state";
import { changedMemorialContentMutations } from "@/lib/memorial/edit-mutations";
import { commitAuthorizedDraftEdit } from "@/lib/memorial/persist-edit";
import { commitA06, writeCeremonyVenueName } from "@/lib/builder/guided-flow/ceremony-step";
import { withStoredPresentation } from "@/lib/memorial/section-visibility";
import { isMemorialEditConflict, saveTextThenStep } from "@/lib/memorial/save-text-then-step";
import { InMemoryEditRepository } from "@/lib/memorial/in-memory-edit-repository.test-helper";

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock("next/font/google", () => ({
  Allura: () => ({ variable: "", className: "" }),
  Playfair_Display: () => ({ variable: "", className: "" }),
  Inter: () => ({ variable: "", className: "" }),
  Cormorant_Garamond: () => ({ variable: "", className: "" }),
  La_Belle_Aurore: () => ({ variable: "", className: "" }),
  EB_Garamond: () => ({ variable: "", className: "" }),
}));

const { CeremonyVenueStep } = await import("./CeremonyVenueStep");

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A04: { status: "completed", answer: "yes" }, A05: { status: "skipped" } },
  ceremony: { date: null, time: null, venueName: null, address: null, access: null, note: null },
} as unknown as MemorialContent;
const ACCESS = { memorialId: "m-1", ownerId: "o-1" };

const venueOf = (c: MemorialContent) => (c as { ceremony: { venueName: string | null } }).ceremony.venueName;
const a06Of = (c: MemorialContent) => (c as { guidedFlow: { A06?: unknown } }).guidedFlow.A06;

function harness() {
  const repository = new InMemoryEditRepository(CONTENT, 7);
  const requests: string[] = [];

  /** saveDraftAction's own steps, against the same database. */
  const historical = vi.fn(async (content: MemorialContent, expectedRevision: number): Promise<DraftSaveResponse> => {
    requests.push("historical");
    const snapshot = await repository.load();
    const next = withStoredPresentation(content, snapshot.draft.content);
    try {
      const written = await commitAuthorizedDraftEdit({
        repository,
        access: ACCESS,
        snapshot,
        expectedRevision,
        content: next,
        operation: "content.saved",
        mutations: changedMemorialContentMutations(snapshot.draft.content, next),
      });
      return { status: "saved", ...written };
    } catch (error) {
      if (isMemorialEditConflict(error)) return { status: "conflict" };
      throw error;
    }
  });

  /** Network behaviour of the combined request, per call. */
  const network: Array<"ok" | "lostAfterServer" | "deniedBeforeServer"> = [];
  const combined = vi.fn(async (text: MemorialContent, final: MemorialContent, expectedRevision: number, attempt: "first" | "retry") => {
    requests.push(attempt === "retry" ? "combined:retry" : "combined");
    const behaviour = network.shift() ?? "ok";
    if (behaviour === "deniedBeforeServer") throw new Error("Draft save refused.");
    const response = await saveTextThenStep({ repository, access: ACCESS, text, final, expectedRevision, attempt });
    if (behaviour === "lostAfterServer") throw new Error("Failed to fetch"); // the server did its work
    return response;
  });

  return { repository, requests, historical, combined, network };
}

function renderStep(h: ReturnType<typeof harness>, { combined = true } = {}) {
  render(
    <DraftRevisionProvider initialRevision={7} initialContent={CONTENT}>
      <CeremonyVenueStep language="fr" content={CONTENT} persist={h.historical} persistCombined={combined ? h.combined : undefined} />
    </DraftRevisionProvider>,
  );
}

const PARTIAL = "Votre texte a bien été enregistré. Nous n'avons pas pu terminer cette étape. Vous pouvez réessayer sans perdre votre texte.";
const venueInput = () => screen.getByLabelText("Nom du lieu") as HTMLInputElement;
const clickContinue = () => fireEvent.click(screen.getByRole("button", { name: /continuer/i }));
const typeVenue = (value = "Église Saint-Martin") => fireEvent.change(venueInput(), { target: { value } });
const leavingIsGuarded = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  routerRefresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Mission 04-J — réussite complète", () => {
  it("saisie puis Continuer : UNE requête, deux écritures dans l'ordre (rév. 7 → 8 → 9), étape validée", async () => {
    const h = harness();
    renderStep(h);
    typeVenue();
    clickContinue();

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.requests).toEqual(["combined"]);
    expect(h.repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
    expect(venueOf(h.repository.content)).toBe("Église Saint-Martin");
    expect(a06Of(h.repository.content)).toEqual({ status: "completed" });

    await settle(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(h.requests).toEqual(["combined"]); // no stale autosave afterwards (Mission 034)
    expect(h.repository.commits).toHaveLength(2);
  });

  it("autosave déjà faite : une requête, une seule écriture réelle (l'étape), comme aujourd'hui", async () => {
    const h = harness();
    renderStep(h);
    typeVenue();
    await settle(AUTOSAVE_DEBOUNCE_MS + 50);
    expect(h.requests).toEqual(["historical"]);
    clickContinue();

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.requests).toEqual(["historical", "combined"]);
    expect(h.repository.commits.map((c) => [c.expectedRevision, a06Of(c.content) ?? null])).toEqual([
      [7, null],
      [8, { status: "completed" }],
    ]);
  });
});

describe("Mission 04-J — échecs", () => {
  it("échec de la PREMIÈRE écriture : rien n'est enregistré ni affiché comme tel, l'alerte de sortie est active, Continuer à nouveau réussit", async () => {
    const h = harness();
    h.repository.inject(1, "before", () => new Error("connection reset"));
    renderStep(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(h.repository.commits).toEqual([]);
    expect(screen.queryByText(/Enregistré/)).toBeNull();
    expect(leavingIsGuarded()).toBe(true);
    expect(venueInput().value).toBe("Église Saint-Martin");

    clickContinue();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
  });

  it("échec de la SECONDE écriture : le texte est conservé sur le serveur, l'étape n'est pas validée, l'écran le dit et reste", async () => {
    const h = harness();
    h.repository.inject(2, "before", () => new Error("connection reset"));
    renderStep(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText(PARTIAL)).toBeTruthy(); // 04-K: its own message
    expect(screen.queryByText("Une erreur est survenue.")).toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(venueOf(h.repository.content)).toBe("Église Saint-Martin"); // text durable
    expect(a06Of(h.repository.content)).toBeUndefined(); // step not validated
    expect(h.repository.revision).toBe(8);
    expect(leavingIsGuarded()).toBe(false); // the text IS saved: nothing to lose

    clickContinue(); // retry: write 1 is a no-op, write 2 only
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
    expect(a06Of(h.repository.content)).toEqual({ status: "completed" });
  });

  it("conflit de révision (autre appareil) : rien n'est écrasé, aucune autre écriture, l'étape n'avance pas", async () => {
    const h = harness();
    h.repository.content = { ...CONTENT, ceremony: { ...(CONTENT as never as { ceremony: object }).ceremony, venueName: "Lieu saisi ailleurs" } } as MemorialContent;
    h.repository.revision = 8;
    renderStep(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    await settle(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(h.repository.commits).toEqual([]);
    expect(venueOf(h.repository.content)).toBe("Lieu saisi ailleurs");
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("accès refusé : la requête est rejetée avant toute écriture, rien n'est affiché comme enregistré", async () => {
    const h = harness();
    h.network.push("deniedBeforeServer");
    renderStep(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(h.repository.commits).toEqual([]);
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(leavingIsGuarded()).toBe(true);
  });
});

describe("Mission 04-J — réponse perdue et nouvelle tentative", () => {
  it("les deux écritures faites, réponse perdue : jamais « terminé » à tort ; Continuer à nouveau réconcilie SANS réécrire", async () => {
    const h = harness();
    h.network.push("lostAfterServer");
    renderStep(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(routerRefresh).not.toHaveBeenCalled(); // no false « étape terminée »
    expect(h.repository.commits).toHaveLength(2);

    clickContinue();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits).toHaveLength(2); // no double validation
    expect(h.requests).toEqual(["combined", "combined:retry"]); // 04-L: the settlement is marked « retry »
  });

  it("seule la première écriture faite, réponse perdue : la nouvelle tentative ne fait QUE la seconde", async () => {
    const h = harness();
    h.repository.inject(2, "before", () => new Error("server crashed"));
    h.network.push("lostAfterServer");
    renderStep(h);
    typeVenue();
    clickContinue();
    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(h.repository.commits.map((c) => c.expectedRevision)).toEqual([7]);

    clickContinue();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
    expect(a06Of(h.repository.content)).toEqual({ status: "completed" });
  });

  it("04-K — après une réponse perdue, « Réessayer » reprend la MÊME opération : réconciliée, rien de réécrit, étape terminée", async () => {
    const h = harness();
    h.network.push("lostAfterServer");
    renderStep(h);
    typeVenue();
    clickContinue();
    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits).toHaveLength(2);
    expect(a06Of(h.repository.content)).toEqual({ status: "completed" });
  });
});

describe("Mission 04-J — concurrence et historique", () => {
  it("autosave déjà en cours au clic : chemin historique, l'autosave d'abord puis l'écriture finale", async () => {
    const h = harness();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const original = h.historical.getMockImplementation()!;
    h.historical.mockImplementationOnce(async (content, revision) => {
      await held;
      return original(content, revision);
    });
    renderStep(h);
    typeVenue();
    await settle(AUTOSAVE_DEBOUNCE_MS + 50);
    clickContinue();
    await settle();
    expect(h.repository.commits).toEqual([]);

    release();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.requests).toEqual(["historical", "historical"]);
    expect(h.repository.commits.map((c) => [c.expectedRevision, a06Of(c.content) ?? null])).toEqual([
      [7, null],
      [8, { status: "completed" }],
    ]);
  });

  it("pendant l'opération, la saisie est verrouillée et la sortie de l'onglet est protégée", async () => {
    const h = harness();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    h.combined.mockImplementationOnce(async (text, final, revision) => {
      await held;
      return saveTextThenStep({ repository: h.repository, access: ACCESS, text, final, expectedRevision: revision });
    });
    renderStep(h);
    typeVenue();
    clickContinue();
    await settle();

    expect(venueInput().disabled).toBe(true);
    expect(leavingIsGuarded()).toBe(true);
    release();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
  });

  it("hommage publié depuis l'affichage : « unsupported », AUCUNE écriture combinée, chemin historique — refusé comme aujourd'hui", async () => {
    // Security V1 refuses ceremony content after publication: the historical
    // path is refused too. What matters: the combined request wrote nothing
    // and the outcome is exactly the historical one.
    const published = async (withCombined: boolean) => {
      const h = harness();
      h.repository.firstPublishedAt = "2026-10-01T10:00:00.000Z";
      h.repository.status = "published";
      renderStep(h, { combined: withCombined });
      typeVenue();
      clickContinue();
      expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
      await settle();
      const outcome = {
        commits: h.repository.commits.length,
        audit: h.repository.audit.length,
        refreshed: routerRefresh.mock.calls.length,
        stored: h.repository.content,
        historicalRequests: h.requests.filter((r) => r === "historical").length,
      };
      cleanup();
      routerRefresh.mockClear();
      return { outcome, requests: h.requests };
    };

    const experiment = await published(true);
    const reference = await published(false);
    expect(experiment.requests[0]).toBe("combined");
    expect(experiment.outcome).toEqual(reference.outcome);
    expect(experiment.outcome).toMatchObject({ commits: 0, audit: 0, refreshed: 0 });
  });

  it("sans transport combiné (hommage publié au rendu, parcours invité) : comportement historique inchangé", async () => {
    const h = harness();
    renderStep(h, { combined: false });
    typeVenue();
    clickContinue();

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.requests).toEqual(["historical", "historical"]);
    expect(h.combined).not.toHaveBeenCalled();
  });
});

describe("Mission 04-K — réponses perdues, cas par cas, côté interface", () => {
  it("première écriture faite, réponse perdue : message générique (rien de confirmé), « Réessayer » ne fait QUE la seconde", async () => {
    const h = harness();
    h.repository.inject(2, "before", () => new Error("server crashed"));
    h.network.push("lostAfterServer");
    renderStep(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(screen.queryByText(PARTIAL)).toBeNull(); // the text is NOT confirmed to the browser
    expect(screen.queryByText("Enregistré")).toBeNull();
    expect(leavingIsGuarded()).toBe(true);

    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits.map((c) => c.expectedRevision)).toEqual([7, 8]);
  });

  it("réponse perdue, puis nouveau texte saisi, puis Continuer : l'opération est d'abord réconciliée, puis le nouveau texte écrit AVEC l'étape (jamais retirée)", async () => {
    const h = harness();
    h.network.push("lostAfterServer");
    renderStep(h);
    typeVenue("Église Saint-Martin");
    clickContinue();
    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(h.repository.commits).toHaveLength(2); // the server did both

    typeVenue("Église Saint-Martin, chapelle nord");
    clickContinue();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());

    expect(h.repository.commits).toHaveLength(3);
    for (const commit of h.repository.commits.slice(1)) expect(a06Of(commit.content)).toEqual({ status: "completed" });
    expect(venueOf(h.repository.content)).toBe("Église Saint-Martin, chapelle nord");
    expect(h.repository.revision).toBe(10);
  });

  it("réponse perdue, puis modification dans un autre onglet : conflit, rien d'écrasé, l'autre version conservée", async () => {
    const h = harness();
    h.network.push("lostAfterServer");
    renderStep(h);
    typeVenue();
    clickContinue();
    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();

    h.repository.content = { ...h.repository.content, ceremony: { ...(h.repository.content as never as { ceremony: object }).ceremony, venueName: "Autre onglet" } } as MemorialContent;
    h.repository.revision += 1;
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    await settle(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(h.repository.commits).toHaveLength(2);
    expect(venueOf(h.repository.content)).toBe("Autre onglet");
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("échec partiel puis Continuer : le texte n'est PAS réécrit, une seule écriture de plus (l'étape), révisions cohérentes", async () => {
    const h = harness();
    h.repository.inject(2, "before", () => new Error("connection reset"));
    renderStep(h);
    typeVenue();
    clickContinue();
    expect(await screen.findByText(PARTIAL)).toBeTruthy();
    expect(await screen.findByText("Enregistré")).toBeTruthy(); // true: the text is confirmed

    clickContinue();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits.map((c) => [c.expectedRevision, a06Of(c.content) ?? null])).toEqual([
      [7, null],
      [8, { status: "completed" }],
    ]);
  });

  it("le message d'échec partiel n'apparaît jamais sans texte confirmé (échec de la première écriture)", async () => {
    const h = harness();
    h.repository.inject(1, "before", () => new Error("connection reset"));
    renderStep(h);
    typeVenue();
    clickContinue();
    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(screen.queryByText(PARTIAL)).toBeNull();
    expect(screen.queryByText("Enregistré")).toBeNull();
  });

  it("navigation rapide : double clic sur Continuer → une seule requête, une seule validation", async () => {
    const h = harness();
    renderStep(h);
    typeVenue();
    const button = screen.getByRole("button", { name: /continuer/i });
    fireEvent.click(button);
    fireEvent.click(button); // its name is now « Enregistrement… »: same element
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    await settle(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(h.requests).toEqual(["combined"]);
    expect(h.repository.commits).toHaveLength(2);
  });

  it.each([
    ["en", "Your text has been saved. We could not complete this step. You can try again without losing your text."],
    ["es", "Su texto se ha guardado correctamente. No hemos podido completar este paso. Puede volver a intentarlo sin perder su texto."],
  ] as const)("message d'échec partiel traduit (%s)", async (language, message) => {
    const h = harness();
    h.repository.inject(2, "before", () => new Error("connection reset"));
    render(
      <DraftRevisionProvider initialRevision={7} initialContent={CONTENT}>
        <CeremonyVenueStep language={language} content={CONTENT} persist={h.historical} persistCombined={h.combined} />
      </DraftRevisionProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Iglesia" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit")!);
    expect(await screen.findByText(message)).toBeTruthy();
  });
});

/**
 * Mission 04-L — final security review, interface side. `ConflictProbe`
 * reads what the conflict notice (DraftConflictNotice) would offer the
 * family to keep — the coordinator's conflict copy.
 */
const probe: { conflict: MemorialContent | null } = { conflict: null };
function ConflictProbe() {
  const coordinator = useDraftRevisionCoordinator();
  const conflict = coordinator?.conflictContent ?? null;
  useEffect(() => {
    probe.conflict = conflict;
  }, [conflict]);
  return null;
}

function renderWithProbe(h: ReturnType<typeof harness>) {
  probe.conflict = null;
  render(
    <DraftRevisionProvider initialRevision={7} initialContent={CONTENT}>
      <CeremonyVenueStep language="fr" content={CONTENT} persist={h.historical} persistCombined={h.combined} />
      <ConflictProbe />
    </DraftRevisionProvider>,
  );
}

const typed = (value: string) => {
  const result = writeCeremonyVenueName(CONTENT, value);
  if (!result.ok) throw new Error("fixture");
  return result.content;
};

describe("Mission 04-L — collisions de contenu et opérations concurrentes, côté interface", () => {
  it("deux auteurs, contenu IDENTIQUE : la première tentative n'est pas « réconciliée » — conflit, rien d'écrit, jamais « Enregistré »", async () => {
    const h = harness();
    // Another tab of the same owner did exactly the same Continue (7 → 8 → 9).
    const text = typed("Église Saint-Martin");
    const committed = commitA06(text);
    if (!committed.ok) throw new Error("fixture");
    h.repository.content = committed.content;
    h.repository.revision = 9;

    renderWithProbe(h);
    typeVenue("Église Saint-Martin");
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(screen.queryByText(PARTIAL)).toBeNull();
    expect(screen.queryByText("Enregistré")).toBeNull();
    expect(h.requests).toEqual(["combined"]);
    expect(h.repository.commits).toEqual([]);
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(probe.conflict).not.toBeNull(); // the conflict notice is shown
  });

  it("réponse perdue, nouveau texte saisi, puis conflit avec un autre onglet : la copie de secours est le DERNIER texte saisi (jamais l'ancien)", async () => {
    const h = harness();
    h.network.push("lostAfterServer");
    renderWithProbe(h);
    typeVenue("Église Saint-Martin");
    clickContinue();
    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();

    // Another tab changes the venue, then this tab types a newer text.
    h.repository.content = { ...h.repository.content, ceremony: { ...(h.repository.content as never as { ceremony: object }).ceremony, venueName: "Autre onglet" } } as MemorialContent;
    h.repository.revision += 1;
    typeVenue("Église Saint-Martin, chapelle nord");
    clickContinue();

    await vi.waitFor(() => expect(probe.conflict).not.toBeNull());
    expect(venueOf(probe.conflict!)).toBe("Église Saint-Martin, chapelle nord");
    expect(venueOf(h.repository.content)).toBe("Autre onglet");
    expect(h.repository.commits).toHaveLength(2);
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("seconde écriture FAITE mais sa réponse perdue dans le serveur : message partiel, puis Continuer réconcilie (retry) sans réécrire ni conflit", async () => {
    const h = harness();
    h.repository.inject(2, "after", () => new Error("timeout after commit"));
    renderWithProbe(h);
    typeVenue();
    clickContinue();
    expect(await screen.findByText(PARTIAL)).toBeTruthy();
    expect(h.repository.commits).toHaveLength(2); // the step IS stored

    clickContinue();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    expect(h.repository.commits).toHaveLength(2); // nothing rewritten
    expect(h.requests).toEqual(["combined", "combined:retry"]);
    expect(probe.conflict).toBeNull();
  });

  it("autre écrivain ENTRE les deux écritures : message générique (pas le message partiel), avis de conflit, son texte conservé", async () => {
    const h = harness();
    const commitDraft = h.repository.commitDraft.bind(h.repository);
    let calls = 0;
    h.repository.commitDraft = async (input) => {
      calls += 1;
      if (calls === 2) {
        h.repository.content = typed("Autre appareil");
        h.repository.revision += 1;
      }
      return commitDraft(input);
    };
    renderWithProbe(h);
    typeVenue();
    clickContinue();

    expect(await screen.findByText("Une erreur est survenue.")).toBeTruthy();
    expect(screen.queryByText(PARTIAL)).toBeNull();
    await vi.waitFor(() => expect(probe.conflict).not.toBeNull());
    expect(venueOf(probe.conflict!)).toBe("Église Saint-Martin");
    expect(venueOf(h.repository.content)).toBe("Autre appareil");
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("deux onglets, même révision, Continuer en même temps avec des textes différents : un seul gagne, l'autre est en conflit, rien d'écrasé", async () => {
    const h = harness();
    const { container: tabA } = render(
      <DraftRevisionProvider initialRevision={7} initialContent={CONTENT}>
        <CeremonyVenueStep language="fr" content={CONTENT} persist={h.historical} persistCombined={h.combined} />
      </DraftRevisionProvider>,
    );
    const { container: tabB } = render(
      <DraftRevisionProvider initialRevision={7} initialContent={CONTENT}>
        <CeremonyVenueStep language="fr" content={CONTENT} persist={h.historical} persistCombined={h.combined} />
      </DraftRevisionProvider>,
    );
    fireEvent.change(within(tabA).getByRole("textbox"), { target: { value: "Lieu A" } });
    fireEvent.change(within(tabB).getByRole("textbox"), { target: { value: "Lieu B" } });
    fireEvent.click(within(tabA).getByRole("button", { name: /continuer/i }));
    fireEvent.click(within(tabB).getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(screen.getByText("Une erreur est survenue.")).toBeTruthy());
    await settle(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(routerRefresh).toHaveBeenCalledOnce();
    expect(h.repository.commits).toHaveLength(2);
    expect(venueOf(h.repository.content)).toBe("Lieu A");
    expect(a06Of(h.repository.content)).toEqual({ status: "completed" });
  });
});
