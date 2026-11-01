// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PreviewPublication, PublishFromPreviewOutcome } from "@/lib/memorial/publication-preview-types";
import { PreviewPublicationPanel } from "./PreviewPublicationPanel";

/**
 * QG 008 Lot 3 — « Publier » in the private Preview: explicit
 * confirmation, one call at a time, the selection of the Preview shown,
 * every outcome said in the family's words.
 */

afterEach(cleanup);

const id = (n: number) => `5e0c2a4b-1f3d-4e6a-8b7c-${String(n).padStart(12, "0")}`;
const DIGEST = "c".repeat(64);

function publication(overrides: Partial<PreviewPublication> = {}): PreviewPublication {
  return {
    revision: 5,
    accessLevel: "avis",
    digest: DIGEST,
    gallery: { total: 2, limit: 6, selection: undefined, proposed: false, choices: [] },
    premiumSections: [],
    readiness: "publishable",
    ...overrides,
  };
}

function sevenPhotos(selection = [1, 2, 3, 4, 5, 6].map(id)): PreviewPublication["gallery"] {
  return {
    total: 7,
    limit: 6,
    selection,
    proposed: true,
    choices: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ mediaId: id(n), readUrl: `https://storage.test/${n}` })),
  };
}

function renderPanel(options: { publication?: PreviewPublication; outcome?: PublishFromPreviewOutcome } = {}) {
  const publish = vi.fn(async () => options.outcome ?? ("published" as PublishFromPreviewOutcome));
  const reload = vi.fn(async () => true);
  const onBackToCreation = vi.fn();
  render(
    <PreviewPublicationPanel
      language="fr"
      publication={options.publication ?? publication()}
      publish={publish}
      reload={reload}
      builderPath="/builder/memorial-a"
      onBackToCreation={onBackToCreation}
    />,
  );
  return { publish, reload, onBackToCreation };
}

describe("PreviewPublicationPanel — confirmation", () => {
  it("« Publier » opens an explicit confirmation; nothing is sent before « Confirmer »", async () => {
    const { publish } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    const dialog = screen.getByRole("dialog", { name: "Publier votre hommage ?" });
    expect(dialog.textContent).toContain("tel que vous le voyez dans cet aperçu");
    expect(publish).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirmer la publication" })));
  });

  it("« Revenir à l'aperçu » and Escape close the confirmation without publishing", () => {
    const { publish } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Revenir à l'aperçu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  it("sends ONLY the revision, the fingerprint and the selection of the Preview shown, once — double clicks are ignored", async () => {
    let finish!: (value: PublishFromPreviewOutcome) => void;
    const publish = vi.fn(() => new Promise<PublishFromPreviewOutcome>((resolve) => (finish = resolve)));
    render(
      <PreviewPublicationPanel
        language="fr"
        publication={publication({ gallery: sevenPhotos() })}
        publish={publish}
        reload={vi.fn(async () => true)}
        builderPath="/builder/memorial-a"
        onBackToCreation={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    const confirm = screen.getByRole("button", { name: "Confirmer la publication" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(publish).toHaveBeenCalledExactlyOnceWith(5, DIGEST, [1, 2, 3, 4, 5, 6].map(id));
    expect(screen.getByRole("button", { name: "Publication en cours…" }).hasAttribute("disabled")).toBe(true);
    await act(async () => finish("published"));
    expect(await screen.findByText("Votre hommage est publié.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull();
  });

  it("no gallery choice (6 photos or fewer, complet) → no selection is sent", async () => {
    const { publish } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    await waitFor(() => expect(publish).toHaveBeenCalledExactlyOnceWith(5, DIGEST, undefined));
  });
});

describe("PreviewPublicationPanel — outcomes", () => {
  it("already_published (proved by the server) is shown as published, with the way back", async () => {
    const { onBackToCreation } = renderPanel({ outcome: "already_published" });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    expect(await screen.findByText("Votre hommage est déjà publié.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revenir à la création" }));
    expect(onBackToCreation).toHaveBeenCalledOnce();
  });

  it("preview_outdated → the Preview is reloaded and the family is told to check it", async () => {
    const { reload } = renderPanel({ outcome: "preview_outdated" });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    expect(await screen.findByText(/l'aperçu a été actualisé/)).toBeTruthy();
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Publier" })).toBeTruthy();
  });

  it.each([
    ["free_window_closed", "Le délai de publication gratuite est dépassé."],
    ["free_quota_reached", "Vous avez déjà utilisé votre publication gratuite."],
    ["failed", "La publication n'a pas pu aboutir. Votre brouillon est intact. Réessayez."],
  ] as const)("%s → its message, the draft untouched", async (outcome, message) => {
    renderPanel({ outcome });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("access_refused (signed in, but not this memorial's owner) → its own message, never « session expirée », no sign-in link", async () => {
    renderPanel({ outcome: "access_refused" });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ce compte n'a pas accès à cet hommage. Aucune publication n'a été faite.");
    expect(screen.queryByRole("link", { name: "Me reconnecter" })).toBeNull();
  });

  it("signed_out → a way to sign in again, back to this Builder", async () => {
    renderPanel({ outcome: "signed_out" });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    const link = await screen.findByRole("link", { name: "Me reconnecter" });
    expect(link.getAttribute("href")).toBe("/login?next=%2Fbuilder%2Fmemorial-a");
  });

  it("hero_photo_required (from the server) → the reason and a way to add the photo; « Publier » disappears", async () => {
    renderPanel({ outcome: "hero_photo_required" });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    expect((await screen.findByRole("alert")).textContent).toBe("La photo principale est nécessaire pour publier. Votre brouillon reste enregistré.");
    expect(screen.getByRole("link", { name: "Ajouter la photo principale" }).getAttribute("href")).toBe("/builder/memorial-a?etape=photo");
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull();
  });

  it("a Preview that says hero_photo_required never offers « Publier »", () => {
    renderPanel({ publication: publication({ readiness: "hero_photo_required" }) });
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Votre brouillon reste enregistré");
  });

  it("an already published memorial shows no « Publier »", () => {
    renderPanel({ publication: publication({ readiness: "published" }) });
    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull();
    expect(screen.getByText("Votre hommage est déjà publié.")).toBeTruthy();
  });

  it("an unavailable lifecycle state renders nothing", () => {
    const { container } = render(
      <PreviewPublicationPanel
        language="fr"
        publication={publication({ readiness: "unavailable" })}
        publish={vi.fn()}
        reload={vi.fn()}
        builderPath={null}
        onBackToCreation={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("PreviewPublicationPanel — avis gallery choice", () => {
  it("6 photos or fewer: no choice is offered", () => {
    renderPanel();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("7 photos: the six first are checked, the 7th cannot be added while six are chosen", () => {
    renderPanel({ publication: publication({ gallery: sevenPhotos() }) });
    expect(screen.getByText(/6 photos sur 7 seront publiées/)).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, true, true, true, true, true, false]);
    expect(boxes[6].disabled).toBe(true);
  });

  it("unchecking then checking reloads the Preview with the selection in the Builder's order", async () => {
    const reload = vi.fn(async () => true);
    const { rerender } = render(
      <PreviewPublicationPanel language="fr" publication={publication({ gallery: sevenPhotos() })} publish={vi.fn()} reload={reload} builderPath={null} onBackToCreation={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await waitFor(() => expect(reload).toHaveBeenLastCalledWith([1, 3, 4, 5, 6].map(id)));
    rerender(
      <PreviewPublicationPanel language="fr" publication={publication({ gallery: { ...sevenPhotos([1, 3, 4, 5, 6].map(id)), proposed: false } })} publish={vi.fn()} reload={reload} builderPath={null} onBackToCreation={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[6]);
    await waitFor(() => expect(reload).toHaveBeenLastCalledWith([1, 3, 4, 5, 6, 7].map(id)));
  });

  it("the last photo cannot be unchecked (an empty gallery choice is not a choice)", () => {
    const { reload } = renderPanel({ publication: publication({ gallery: sevenPhotos([id(3)]) }) });
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("a filled premium section is signalled discreetly", () => {
    renderPanel({ publication: publication({ premiumSections: ["video"] }) });
    expect(screen.getByText(/réservées à l'hommage complet/)).toBeTruthy();
  });
});
