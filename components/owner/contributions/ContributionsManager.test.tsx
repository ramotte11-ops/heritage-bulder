// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot 3 — the family's moderation screen, in a simulated browser (jsdom).
 * The E5 Server Actions are mocked: these tests prove what the SCREEN does
 * with each contract answer (no optimistic success, reconciliation with the
 * server's state, confirmation before deletion, pagination by the server's
 * cursor, photo URL renewal). The real actions on a real database are
 * proven separately (local Supabase, docs/espace-famille-lot3.md).
 */
const actions = vi.hoisted(() => ({
  getFamilyContributions: vi.fn(),
  getPendingContributionCounts: vi.fn(),
  moderateFamilyContribution: vi.fn(),
  deleteFamilyContribution: vi.fn(),
  getContributionSettings: vi.fn(),
  updateContributionCategories: vi.fn(),
}));
vi.mock("@/lib/memorial/contributions/family-contribution-actions", () => actions);

const { ContributionsManager } = await import("./ContributionsManager");
const { ContributionsWorkspace } = await import("./ContributionsWorkspace");

const MEMORIAL = "11111111-1111-4111-8111-111111111111";
let n = 0;
function item(over: Record<string, unknown> = {}) {
  n += 1;
  return {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    type: "testimonial",
    status: "pending",
    authorName: `Proche ${n}`,
    content: `Souvenir ${n}`,
    caption: null,
    createdAt: "2026-11-20T09:00:00.000Z",
    publishedAt: null,
    moderatedAt: null,
    photo: null,
    ...over,
  } as never;
}

function setup(view: "pending" | "published" | "hidden" | "rejected", items: unknown[], nextCursor: unknown = null) {
  const onPendingChange = vi.fn();
  render(<ContributionsManager memorialId={MEMORIAL} view={view} language="fr" initial={{ status: "ok", items, nextCursor } as never} onPendingChange={onPendingChange} />);
  return { onPendingChange };
}

function card(id: string) {
  return within(document.querySelector<HTMLElement>(`[data-contribution-id="${id}"]`)!);
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.getPendingContributionCounts.mockResolvedValue({ status: "ok", counts: [{ memorialId: MEMORIAL, pendingStories: 0, pendingPhotos: 0, pendingTotal: 0 }] });
});
afterEach(cleanup);

describe("ContributionsManager — what each status offers (mission § C)", () => {
  it("pending: Approve and Decline, nothing else", () => {
    const a = item();
    setup("pending", [a]);
    const c = card((a as { id: string }).id);
    expect(c.getAllByRole("button").map((b) => b.textContent)).toEqual(["Approuver", "Refuser"]);
  });

  it("published: Hide and Delete; hidden: Show again and Delete; a published condolence can be hidden", () => {
    const p = item({ status: "published", type: "condolence" });
    const h = item({ status: "hidden" });
    setup("published", [p, h]);
    expect(card((p as { id: string }).id).getAllByRole("button").map((b) => b.textContent)).toEqual(["Masquer", "Supprimer définitivement"]);
    expect(card((h as { id: string }).id).getAllByRole("button").map((b) => b.textContent)).toEqual(["Réafficher", "Supprimer définitivement"]);
  });

  it("declined: its status only, never a re-approval; historical messages: read-only", () => {
    const r = item({ status: "rejected" });
    const m = item({ status: "published", type: "memory_message" });
    setup("rejected", [r, m]);
    expect(card((r as { id: string }).id).queryAllByRole("button")).toEqual([]);
    expect(card((r as { id: string }).id).getByText("Refusée")).toBeTruthy();
    expect(card((m as { id: string }).id).queryAllByRole("button")).toEqual([]);
    expect(card((m as { id: string }).id).getByText(/lecture seule/)).toBeTruthy();
  });

  it("visitors' words are shown as text, never interpreted as HTML", () => {
    const a = item({ authorName: "<img src=x onerror=alert(1)>", content: "<b>gras</b>" });
    setup("pending", [a]);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>gras</b>")).toBeTruthy();
  });

  it("an empty view has a calm message", () => {
    setup("hidden", []);
    expect(screen.getByText("Aucune contribution masquée.")).toBeTruthy();
  });
});

describe("ContributionsManager — moderation and reconciliation with the server", () => {
  it("Approve: the button is disabled during the call, the item leaves « À examiner » only once the server says published, the counter is re-read", async () => {
    const a = item();
    let resolve: (v: unknown) => void = () => {};
    actions.moderateFamilyContribution.mockReturnValue(new Promise((r) => (resolve = r)));
    const { onPendingChange } = setup("pending", [a]);
    const id = (a as { id: string }).id;
    fireEvent.click(card(id).getByRole("button", { name: "Approuver" }));
    expect(actions.moderateFamilyContribution).toHaveBeenCalledWith(id, "approve");
    expect((card(id).getByRole("button", { name: "Approuver" }) as HTMLButtonElement).disabled).toBe(true);
    resolve({ status: "ok", outcome: "updated", contributionStatus: "published" });
    await waitFor(() => expect(document.querySelector(`[data-contribution-id="${id}"]`)).toBeNull());
    expect(screen.getByRole("status").textContent).toBe("La contribution est publiée dans l’hommage.");
    await waitFor(() => expect(onPendingChange).toHaveBeenCalledWith(0));
    expect(actions.getPendingContributionCounts).toHaveBeenCalledWith(MEMORIAL);
  });

  it("`unchanged` (done in another tab) is a success like any other", async () => {
    const a = item({ status: "published" });
    actions.moderateFamilyContribution.mockResolvedValue({ status: "ok", outcome: "unchanged", contributionStatus: "hidden" });
    setup("published", [a]);
    fireEvent.click(card((a as { id: string }).id).getByRole("button", { name: "Masquer" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("La contribution est masquée."));
  });

  it("Decline", async () => {
    const a = item();
    actions.moderateFamilyContribution.mockResolvedValue({ status: "ok", outcome: "updated", contributionStatus: "rejected" });
    setup("pending", [a]);
    fireEvent.click(card((a as { id: string }).id).getByRole("button", { name: "Refuser" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/refusée/));
    expect(actions.moderateFamilyContribution).toHaveBeenCalledWith((a as { id: string }).id, "reject");
  });

  it("Show again (hidden → published)", async () => {
    const a = item({ status: "hidden" });
    actions.moderateFamilyContribution.mockResolvedValue({ status: "ok", outcome: "updated", contributionStatus: "published" });
    setup("hidden", [a]);
    fireEvent.click(card((a as { id: string }).id).getByRole("button", { name: "Réafficher" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("La contribution est de nouveau visible dans l’hommage."));
  });

  it("invalid_transition (changed elsewhere): the REAL state replaces the display — it stays when still in this view, leaves otherwise", async () => {
    const stays = item({ status: "published" });
    const leaves = item({ status: "published" });
    const gone = item({ status: "published" });
    setup("published", [stays, leaves, gone]);
    actions.moderateFamilyContribution.mockResolvedValueOnce({ status: "invalid_transition", contributionStatus: "published" });
    fireEvent.click(card((stays as { id: string }).id).getByRole("button", { name: "Masquer" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/modifiée entre-temps/));
    expect(document.querySelector(`[data-contribution-id="${(stays as { id: string }).id}"]`)).not.toBeNull();

    actions.moderateFamilyContribution.mockResolvedValueOnce({ status: "invalid_transition", contributionStatus: "hidden" });
    fireEvent.click(card((leaves as { id: string }).id).getByRole("button", { name: "Masquer" }));
    await waitFor(() => expect(document.querySelector(`[data-contribution-id="${(leaves as { id: string }).id}"]`)).toBeNull());

    actions.moderateFamilyContribution.mockResolvedValueOnce({ status: "invalid_transition", contributionStatus: null });
    fireEvent.click(card((gone as { id: string }).id).getByRole("button", { name: "Masquer" }));
    await waitFor(() => expect(document.querySelector(`[data-contribution-id="${(gone as { id: string }).id}"]`)).toBeNull());
  });

  it("unavailable (or a thrown action): nothing changes locally, a calm message — never a false success", async () => {
    const a = item();
    setup("pending", [a]);
    actions.moderateFamilyContribution.mockResolvedValueOnce({ status: "unavailable" });
    fireEvent.click(card((a as { id: string }).id).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("L’action n’a pas pu aboutir. Réessayez dans un instant."));
    expect(document.querySelector(`[data-contribution-id="${(a as { id: string }).id}"]`)).not.toBeNull();
    actions.moderateFamilyContribution.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(card((a as { id: string }).id).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect((card((a as { id: string }).id).getByRole("button", { name: "Approuver" }) as HTMLButtonElement).disabled).toBe(false));
    expect(document.querySelector(`[data-contribution-id="${(a as { id: string }).id}"]`)).not.toBeNull();
  });

  it("denied: a neutral message (never « n'existe pas »), then the list is re-read from the server", async () => {
    const a = item();
    setup("pending", [a]);
    actions.moderateFamilyContribution.mockResolvedValue({ status: "denied" });
    actions.getFamilyContributions.mockResolvedValue({ status: "ok", items: [], nextCursor: null });
    fireEvent.click(card((a as { id: string }).id).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(actions.getFamilyContributions).toHaveBeenCalledWith({ memorialId: MEMORIAL, status: "pending", limit: 20 }));
    expect(screen.getByRole("status").textContent).toBe("Cette action n’est pas possible pour cette contribution.");
    await waitFor(() => expect(screen.getByText("Aucune contribution n’attend votre accord pour le moment.")).toBeTruthy());
  });
});

describe("ContributionsManager — permanent deletion", () => {
  it("asks for an explicit confirmation; Cancel deletes nothing and gives the focus back", async () => {
    const a = item({ status: "published" });
    const id = (a as { id: string }).id;
    setup("published", [a]);
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer définitivement" }));
    expect(screen.getByText("Supprimer définitivement cette contribution ? Elle ne pourra pas être récupérée.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.getAttribute("data-confirm-cancel")).toBe(id));
    fireEvent.click(card(id).getByRole("button", { name: "Annuler" }));
    expect(actions.deleteFamilyContribution).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement?.getAttribute("data-contribution-delete")).toBe(id));
  });

  it("confirmed: deleted by the server, then removed (every photoStorage value means deleted)", async () => {
    const a = item({ status: "hidden", type: "photo", photo: { url: "https://signed.example/x", width: 800, height: 600 } });
    const id = (a as { id: string }).id;
    actions.deleteFamilyContribution.mockResolvedValue({ status: "ok", photoStorage: "removed_claim_open" });
    setup("hidden", [a]);
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer définitivement" }));
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(document.querySelector(`[data-contribution-id="${id}"]`)).toBeNull());
    expect(actions.deleteFamilyContribution).toHaveBeenCalledWith(id);
    expect(screen.getByRole("status").textContent).toBe("La contribution est supprimée.");
  });

  it("already deleted elsewhere (`denied`): the item goes, with the neutral « changed » message", async () => {
    const a = item({ status: "published" });
    const id = (a as { id: string }).id;
    actions.deleteFamilyContribution.mockResolvedValue({ status: "denied" });
    setup("published", [a]);
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer définitivement" }));
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(document.querySelector(`[data-contribution-id="${id}"]`)).toBeNull());
  });

  it("unavailable: the item stays", async () => {
    const a = item({ status: "published" });
    const id = (a as { id: string }).id;
    actions.deleteFamilyContribution.mockResolvedValue({ status: "unavailable" });
    setup("published", [a]);
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer définitivement" }));
    fireEvent.click(card(id).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/n’a pas pu aboutir/));
    expect(document.querySelector(`[data-contribution-id="${id}"]`)).not.toBeNull();
  });
});

describe("ContributionsManager — pagination and photographs", () => {
  it("« plus anciennes » passes the server's cursor untouched and never duplicates an item", async () => {
    const first = [item(), item()];
    const cursor = { createdAt: "2026-11-20T09:00:00.000Z", id: (first[1] as { id: string }).id };
    const next = [first[1], item()];
    actions.getFamilyContributions.mockResolvedValue({ status: "ok", items: next, nextCursor: null });
    setup("pending", first, cursor);
    fireEvent.click(screen.getByRole("button", { name: "Afficher les contributions plus anciennes" }));
    await waitFor(() => expect(document.querySelectorAll("[data-contribution-id]")).toHaveLength(3));
    expect(actions.getFamilyContributions).toHaveBeenCalledWith({ memorialId: MEMORIAL, status: "pending", limit: 20, before: cursor });
    expect(screen.queryByRole("button", { name: "Afficher les contributions plus anciennes" })).toBeNull();
  });

  it("a photograph that fails to load (expired URL) is re-read ONCE for a fresh URL; a photo not yet processed shows no image", async () => {
    const p = item({ type: "photo", caption: "Été 1998", photo: { url: "https://signed.example/old", width: 800, height: 600 } });
    const q = item({ type: "photo", caption: "Noël", photo: null });
    actions.getFamilyContributions.mockResolvedValue({
      status: "ok",
      items: [{ ...(p as object), photo: { url: "https://signed.example/fresh", width: 800, height: 600 } }, q],
      nextCursor: null,
    });
    setup("pending", [p, q]);
    expect(card((q as { id: string }).id).queryByRole("img")).toBeNull();
    expect(card((q as { id: string }).id).getByText("La photographie est en cours de préparation.")).toBeTruthy();
    const img = card((p as { id: string }).id).getByRole("img", { name: "Photographie partagée par " + (p as { authorName: string }).authorName });
    fireEvent.error(img);
    fireEvent.error(img);
    await waitFor(() => expect(card((p as { id: string }).id).getByRole("img").getAttribute("src")).toBe("https://signed.example/fresh"));
    expect(actions.getFamilyContributions).toHaveBeenCalledTimes(1);
    expect(card((p as { id: string }).id).getByText("Été 1998")).toBeTruthy();
  });

  it("server unavailable at opening: a clear message and a retry that reads again", async () => {
    actions.getFamilyContributions.mockResolvedValue({ status: "ok", items: [item()], nextCursor: null });
    render(<ContributionsManager memorialId={MEMORIAL} view="pending" language="fr" initial={{ status: "unavailable" }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/n’ont pas pu être chargées/);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(document.querySelectorAll("[data-contribution-id]")).toHaveLength(1));
  });
});

describe("ContributionsWorkspace — views and the live pending total", () => {
  it("four views as links, the current one marked; the pending badge follows a moderation", async () => {
    const a = item();
    actions.moderateFamilyContribution.mockResolvedValue({ status: "ok", outcome: "updated", contributionStatus: "published" });
    render(
      <ContributionsWorkspace
        memorialId={MEMORIAL}
        view="pending"
        language="en"
        initial={{ status: "ok", items: [a], nextCursor: null } as never}
        initialPending={1}
        hrefFor={{ pending: "/p", published: "/pub", hidden: "/h", rejected: "/r" }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Contributions by status" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["To review1", "Published", "Hidden", "Declined"]);
    expect(within(nav).getByRole("link", { current: "page" }).textContent).toBe("To review1");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(document.querySelector("[data-pending-total]")).toBeNull());
  });
});
