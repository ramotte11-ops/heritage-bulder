// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Lot 3 — the categories section: the SAME action as the Builder's A15
 * (`updateContributionCategories`), always three booleans and the revision
 * read; `stale_revision` re-reads and lets the family choose again, never a
 * silent re-send. Actions mocked (jsdom); the real immediate effect (O9) is
 * proven on the local Supabase and by the SQL harness.
 */
const actions = vi.hoisted(() => ({
  getContributionSettings: vi.fn(),
  updateContributionCategories: vi.fn(),
}));
vi.mock("@/lib/memorial/contributions/family-contribution-actions", () => actions);

const { ContributionCategories } = await import("./ContributionCategories");

const MEMORIAL = "11111111-1111-4111-8111-111111111111";
const SETTINGS = { features: { condolences: true, stories: true, photos: true }, corrupted: false, firstPublished: true, draftRevision: 7, contributionsDigest: false };

beforeEach(() => {
  actions.getContributionSettings.mockReset();
  actions.updateContributionCategories.mockReset();
});
afterEach(cleanup);

function box(name: RegExp) {
  return screen.getByRole("checkbox", { name }) as HTMLInputElement;
}

describe("ContributionCategories", () => {
  it("shows the three A15 categories as read, and saves the three booleans with the revision read", async () => {
    actions.updateContributionCategories.mockResolvedValue({ status: "ok", outcome: "updated", draftRevision: 8 });
    render(<ContributionCategories memorialId={MEMORIAL} language="fr" initial={{ status: "ok", settings: SETTINGS }} />);
    expect([box(/Condoléances/).checked, box(/Récits/).checked, box(/Photographies/).checked]).toEqual([true, true, true]);
    fireEvent.click(box(/Photographies/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ces choix" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Vos choix sont enregistrés."));
    expect(actions.updateContributionCategories).toHaveBeenCalledWith(MEMORIAL, { condolences: true, stories: true, photos: false }, 7);

    // The next save carries the NEW revision.
    fireEvent.click(box(/Photographies/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ces choix" }));
    await waitFor(() => expect(actions.updateContributionCategories).toHaveBeenLastCalledWith(MEMORIAL, { condolences: true, stories: true, photos: true }, 8));
  });

  it("stale_revision: re-reads, shows the REAL settings, explains, and does NOT re-send", async () => {
    actions.updateContributionCategories.mockResolvedValue({ status: "stale_revision", draftRevision: 9 });
    actions.getContributionSettings.mockResolvedValue({
      status: "ok",
      settings: { ...SETTINGS, features: { condolences: true, stories: false, photos: false }, draftRevision: 9 },
    });
    render(<ContributionCategories memorialId={MEMORIAL} language="fr" initial={{ status: "ok", settings: SETTINGS }} />);
    fireEvent.click(box(/Condoléances/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ces choix" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/modifié ailleurs/));
    expect(actions.getContributionSettings).toHaveBeenCalledWith(MEMORIAL);
    expect([box(/Condoléances/).checked, box(/Récits/).checked, box(/Photographies/).checked]).toEqual([true, false, false]);
    expect(actions.updateContributionCategories).toHaveBeenCalledTimes(1);
  });

  it("corrupted choices: the calm message, everything shown closed, the family chooses again", () => {
    render(
      <ContributionCategories
        memorialId={MEMORIAL}
        language="fr"
        initial={{ status: "ok", settings: { ...SETTINGS, corrupted: true, features: { condolences: false, stories: false, photos: false } } }}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/n’ont pas pu être relus/);
    expect([box(/Condoléances/).checked, box(/Récits/).checked, box(/Photographies/).checked]).toEqual([false, false, false]);
  });

  it("before publication: says the choices apply at publication", () => {
    render(<ContributionCategories memorialId={MEMORIAL} language="en" initial={{ status: "ok", settings: { ...SETTINGS, firstPublished: false } }} />);
    expect(screen.getByText("These choices will apply when the tribute is published.")).toBeTruthy();
  });

  it("a failed save changes nothing and says so; unreadable settings show no form", async () => {
    actions.updateContributionCategories.mockResolvedValue({ status: "unavailable" });
    const { unmount } = render(<ContributionCategories memorialId={MEMORIAL} language="es" initial={{ status: "ok", settings: SETTINGS }} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar estas opciones" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/no ha podido completarse/));
    unmount();
    render(<ContributionCategories memorialId={MEMORIAL} language="fr" initial={{ status: "denied" }} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("Les réglages n’ont pas pu être chargés pour le moment.")).toBeTruthy();
  });

  it("offers no daily digest: no e-mail is sent yet", () => {
    render(<ContributionCategories memorialId={MEMORIAL} language="fr" initial={{ status: "ok", settings: SETTINGS }} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/récapitulatif|e-mail|Brevo/i);
  });
});
