// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ContributionDepositTransport, DepositStatus } from "./deposit-transport";
import { useContributionDeposit } from "./use-contribution-deposit";

/** M8-E4 — le moteur du parcours, testé SANS interface (indépendant du prototype visuel). */

const ALL = { condolences: true, stories: true, photos: true };

function transport(...results: DepositStatus[]) {
  let i = 0;
  const next = async () => results[Math.min(i++, results.length - 1)] ?? { status: "published" as const };
  return {
    open: vi.fn(async () => ({ status: "ready" as const, formToken: `token-${Math.random()}` })),
    depositText: vi.fn(next),
    depositPhoto: vi.fn(next),
  } satisfies ContributionDepositTransport;
}

async function ready(categories = ALL, t: ContributionDepositTransport = transport()) {
  const h = renderHook(() => useContributionDeposit(categories, t));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  return h;
}

const input = { authorName: "Marie", text: "Pensées.", website: "" };

describe("M8-E4 — moteur du dépôt (useContributionDeposit)", () => {
  it("étape initiale : choix, écriture directe s'il n'y a qu'une catégorie, fermé s'il n'y en a aucune", () => {
    const t = transport();
    expect(renderHook(() => useContributionDeposit(ALL, t)).result.current.step).toEqual({ name: "choose" });
    expect(renderHook(() => useContributionDeposit({ condolences: false, stories: false, photos: true }, t)).result.current.step).toEqual({ name: "write", kind: "photo" });
    expect(renderHook(() => useContributionDeposit({ condolences: false, stories: false, photos: false }, t)).result.current.step).toEqual({ name: "closed" });
  });

  it("aucun envoi sans jeton ; publié → confirmation, catégorie retirée, nouveau jeton", async () => {
    const t = transport({ status: "published" });
    const { result } = await ready(ALL, t);
    act(() => result.current.choose("condolence"));
    await act(() => result.current.submit("condolence", input));
    expect(t.depositText).toHaveBeenCalledWith(expect.objectContaining({ type: "condolence", authorName: "Marie", text: "Pensées.", website: "" }));
    expect(result.current.step).toEqual({ name: "done", kind: "condolence", status: "published" });
    expect(result.current.remaining).toEqual(["testimonial", "photo"]);
    expect(t.open).toHaveBeenCalledTimes(2);
  });

  it("plafond atteint (busy) et hommage fermé (refused) changent d'étape", async () => {
    const busy = await ready(ALL, transport({ status: "busy" }));
    await act(() => busy.result.current.submit("testimonial", input));
    expect(busy.result.current.step).toEqual({ name: "busy" });
    const refused = await ready(ALL, transport({ status: "refused" }));
    await act(() => refused.result.current.submit("testimonial", input));
    expect(refused.result.current.step).toEqual({ name: "closed" });
  });

  it("champ invalide, jeton expiré, panne réseau : message, saisie conservée (étape inchangée)", async () => {
    const t = transport({ status: "invalid", field: "authorName" }, { status: "expired" });
    const { result } = await ready(ALL, t);
    act(() => result.current.choose("condolence"));
    await act(() => result.current.submit("condolence", input));
    expect(result.current.error).toBe("authorName");
    expect(result.current.step).toEqual({ name: "write", kind: "condolence" });
    await act(() => result.current.submit("condolence", input));
    expect(result.current.error).toBe("generic");
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(t.open).toHaveBeenCalledTimes(2);
    t.depositText.mockRejectedValueOnce(new Error("réseau"));
    await act(() => result.current.submit("condolence", input));
    expect(result.current.error).toBe("generic");
    expect(result.current.sending).toBe(false);
  });

  it("photo absente : refus local, rien n'est envoyé", async () => {
    const t = transport();
    const { result } = await ready(ALL, t);
    await act(() => result.current.submit("photo", { authorName: "A", caption: "", file: null, website: "" }));
    expect(result.current.error).toBe("photoMissing");
    expect(t.depositPhoto).not.toHaveBeenCalled();
  });

  it("fenêtre indisponible à l'ouverture : étape fermée", async () => {
    const t = { ...transport(), open: vi.fn(async () => ({ status: "closed" })) };
    const { result } = renderHook(() => useContributionDeposit(ALL, t));
    await waitFor(() => expect(result.current.step).toEqual({ name: "closed" }));
  });
});
