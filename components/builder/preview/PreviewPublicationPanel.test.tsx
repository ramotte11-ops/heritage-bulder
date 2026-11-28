// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Language } from "@/config/languages";
import type { PreviewPublication, PublishFromPreviewOutcome } from "@/lib/memorial/publication-preview-types";
import type { PublicationRecap } from "@/lib/memorial/publication-recap";
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
    otherActiveFreeDrafts: 0,
    ...overrides,
  };
}

/** 05-R1 — a free recap as the host derives it (lib/memorial/publication-recap.ts). */
function recap(overrides: Partial<PublicationRecap> = {}): PublicationRecap {
  return {
    offer: "free",
    visible: [
      { sectionId: "hero", archived: false },
      { sectionId: "deathNotice", archived: false },
      { sectionId: "gallery", archived: false },
    ],
    galleryCount: 2,
    videoCount: null,
    previewOnlyVideoCount: 0,
    contributions: null,
    hiddenSections: [],
    ...overrides,
  };
}
const FREE_RECAP = recap();

function sevenPhotos(selection = [1, 2, 3, 4, 5, 6].map(id)): PreviewPublication["gallery"] {
  return {
    total: 7,
    limit: 6,
    selection,
    proposed: true,
    choices: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ mediaId: id(n), readUrl: `https://storage.test/${n}` })),
  };
}

/** VID-15 — the gallery choice lives in the publication step, opened by « Publier ». */
function openPublication() {
  const cta = document.querySelector<HTMLButtonElement>("[data-publication-cta]");
  if (cta === null) throw new Error("no « Publier »");
  fireEvent.click(cta);
}

function renderPanel(options: { publication?: PreviewPublication; outcome?: PublishFromPreviewOutcome; recap?: PublicationRecap; language?: Language } = {}) {
  const publish = vi.fn(async () => options.outcome ?? ("published" as PublishFromPreviewOutcome));
  const reload = vi.fn(async () => true);
  const onBackToCreation = vi.fn();
  render(
    <PreviewPublicationPanel
      language={options.language ?? "fr"}
      publication={options.publication ?? publication()}
      recap={options.recap ?? FREE_RECAP}
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
    const dialog = screen.getByRole("dialog", { name: "Publier votre hommage gratuit ?" });
    // 05-R1 — the free tribute is not published « tel que vous le voyez » any more.
    expect(dialog.textContent).toContain("Seul ce qui figure dans « Ce qui sera visible publiquement » sera publié.");
    expect(dialog.textContent).not.toContain("tel que vous le voyez");
    expect(publish).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirmer la publication" })));
  });

  it("warns before a free publication when another free draft is being prepared", () => {
    renderPanel({
      publication: publication({ accessLevel: "avis", otherActiveFreeDrafts: 2 }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    expect(screen.getByText(/utilisez la publication gratuite de votre compte pour douze mois/)).toBeTruthy();
  });

  it("does not show the account warning without another free draft", () => {
    renderPanel({ publication: publication({ accessLevel: "avis", otherActiveFreeDrafts: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    expect(document.querySelector("[data-free-publication-warning]")).toBeNull();
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
        recap={FREE_RECAP}
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
        recap={FREE_RECAP}
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
  it("6 photos or fewer: no choice is offered, even in the publication step", () => {
    renderPanel();
    openPublication();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("VID-15 — no photo choice and no form above the memorial: the choice appears only once « Publier » is clicked", () => {
    const { container } = render(
      <PreviewPublicationPanel language="fr" recap={FREE_RECAP} publication={publication({ gallery: sevenPhotos() })} publish={vi.fn()} reload={vi.fn()} builderPath={null} onBackToCreation={vi.fn()} />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(container.querySelector("[data-publication-gallery]")).toBeNull();
    openPublication();
    const dialog = screen.getByRole("dialog", { name: "Publier votre hommage gratuit ?" });
    expect(dialog.querySelector("[data-publication-gallery]")).not.toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
  });

  it("VID-15 — « Confirmer » is held while the chosen selection is being reloaded (never a stale fingerprint)", async () => {
    let finish!: (value: boolean) => void;
    const reload = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const publish = vi.fn(async () => "published" as PublishFromPreviewOutcome);
    render(
      <PreviewPublicationPanel language="fr" recap={FREE_RECAP} publication={publication({ gallery: sevenPhotos() })} publish={publish} reload={reload} builderPath={null} onBackToCreation={vi.fn()} />,
    );
    openPublication();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const confirm = screen.getByRole("button", { name: "Confirmer la publication" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(publish).not.toHaveBeenCalled();
    await act(async () => finish(true));
    await waitFor(() => expect(confirm.disabled).toBe(false));
  });

  it("7 photos: the six first are checked, the 7th cannot be added while six are chosen", () => {
    renderPanel({ publication: publication({ gallery: sevenPhotos() }) });
    openPublication();
    expect(screen.getByText(/6 photos sur 7 seront publiées/)).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, true, true, true, true, true, false]);
    expect(boxes[6].disabled).toBe(true);
  });

  it("unchecking then checking reloads the Preview with the selection in the Builder's order", async () => {
    const reload = vi.fn(async () => true);
    const { rerender } = render(
      <PreviewPublicationPanel language="fr" recap={FREE_RECAP} publication={publication({ gallery: sevenPhotos() })} publish={vi.fn()} reload={reload} builderPath={null} onBackToCreation={vi.fn()} />,
    );
    openPublication();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await waitFor(() => expect(reload).toHaveBeenLastCalledWith([1, 3, 4, 5, 6].map(id)));
    rerender(
      <PreviewPublicationPanel language="fr" recap={FREE_RECAP} publication={publication({ gallery: { ...sevenPhotos([1, 3, 4, 5, 6].map(id)), proposed: false } })} publish={vi.fn()} reload={reload} builderPath={null} onBackToCreation={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[6]);
    await waitFor(() => expect(reload).toHaveBeenLastCalledWith([1, 3, 4, 5, 6, 7].map(id)));
  });

  it.each([
    ["fr", "Un instant…"],
    ["en", "Just a moment…"],
    ["es", "Un momento…"],
  ] as const)("shows the real reload in %s, blocks repeated changes, then returns to rest", async (language, pendingLabel) => {
    let finish!: (value: boolean) => void;
    const reload = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { container } = render(
      <PreviewPublicationPanel
        language={language as Language}
        recap={FREE_RECAP}
        publication={publication({ gallery: sevenPhotos() })}
        publish={vi.fn()}
        reload={reload}
        builderPath={null}
        onBackToCreation={vi.fn()}
      />,
    );
    openPublication();

    const checkbox = screen.getAllByRole("checkbox")[1];
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe(pendingLabel);
    expect(container.querySelector("[data-publication-gallery-loading]")).not.toBeNull();
    expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(true);

    await act(async () => finish(true));
    await waitFor(() => expect(container.querySelector("[data-publication-gallery-loading]")).toBeNull());
    expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(false);
  });

  it("reports a failed reload, restores the controls, and clears the error on retry", async () => {
    const reload = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { container } = render(
      <PreviewPublicationPanel
        language="fr"
        recap={FREE_RECAP}
        publication={publication({ gallery: sevenPhotos() })}
        publish={vi.fn()}
        reload={reload}
        builderPath={null}
        onBackToCreation={vi.fn()}
      />,
    );
    openPublication();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect((await screen.findByRole("alert")).textContent).toBe("L’aperçu n’est pas disponible pour le moment. Réessayez dans un instant.");
    expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(false);

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(container.querySelector("[data-publication-gallery-error]")).toBeNull();
  });

  it("the last photo cannot be unchecked (an empty gallery choice is not a choice)", () => {
    const { reload } = renderPanel({ publication: publication({ gallery: sevenPhotos([id(3)]) }) });
    openPublication();
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("a filled premium section is signalled discreetly", () => {
    renderPanel({ publication: publication({ premiumSections: ["video"] }) });
    expect(screen.getByText(/réservées à l'hommage complet/)).toBeTruthy();
  });
  it("QG 004-B — an unverified address opens the one-time verification step, nothing is published", async () => {
    const { publish } = renderPanel({ outcome: "email_unverified" });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    });
    expect(publish).toHaveBeenCalledOnce();
    expect(await screen.findByText("Confirmez votre adresse e-mail.", {}, { timeout: 3_000 })).toBeTruthy();
    expect(document.querySelector("[data-email-verification=\"start\"]")).not.toBeNull();
    expect(document.querySelector("[data-publication=\"done\"]")).toBeNull();
  });
});

describe("PreviewPublicationPanel — 05-R1 recap, free tribute", () => {
  it("says what will be public, what stays private, the 45 days, the 12-month rule and the current locks", () => {
    renderPanel({
      recap: recap({
        previewOnlyVideoCount: 2,
        hiddenSections: ["story"],
        contributions: { condolences: true, stories: true, photos: true },
        visible: [
          { sectionId: "hero", archived: false },
          { sectionId: "gallery", archived: false },
          { sectionId: "testimonials", archived: false },
          { sectionId: "ceremony", archived: true },
        ],
      }),
    });
    openPublication();
    const dialog = screen.getByRole("dialog", { name: "Publier votre hommage gratuit ?" });
    const visible = dialog.querySelector("[data-publication-recap-visible]")!;
    expect(visible.textContent).toContain("Le portrait de votre proche");
    expect(visible.textContent).toContain("La galerie de souvenirs");
    expect(visible.textContent).toContain("Dans l'hommage gratuit, la galerie publique compte au plus six photographies.");
    expect(visible.textContent).toContain("Les condoléances de vos proches sont publiées aussitôt.");
    expect(visible.textContent).toContain("Leurs récits et leurs photographies ne sont publiés qu'avec votre accord.");
    expect(visible.textContent).toContain("La cérémonie, consultable par un lien discret en bas de l'hommage");
    expect(visible.textContent).not.toContain("vidéo");

    const privateBlock = dialog.querySelector("[data-publication-recap-private]")!;
    expect(privateBlock.textContent).toContain("Vos vidéos ne seront pas publiées : elles sont réservées à l'hommage complet.");
    expect(privateBlock.textContent).toContain("L'aperçu montre aussi ce que vous avez préparé pour l'hommage complet.");
    expect(privateBlock.textContent).toContain("Le récit de vie (rubrique masquée)");

    const duration = dialog.querySelector("[data-publication-recap-duration]")!;
    expect(duration.textContent).toContain("pendant 45 jours à compter de sa publication");
    expect(duration.textContent).toContain("une publication gratuite par période de 12 mois");

    expect(dialog.querySelector("[data-publication-recap-locks]")!.textContent).toContain(
      "l'ambiance, le choix de l'annonce et les informations de la cérémonie ne peuvent plus être modifiés en ligne",
    );
    // No republication promise, no complete term.
    expect(dialog.textContent).not.toMatch(/republi|dix ans|archiv/i);
  });

  it("no prepared video: no video line and no « aperçu » note", () => {
    renderPanel();
    openPublication();
    const privateBlock = screen.getByRole("dialog").querySelector("[data-publication-recap-private]")!;
    expect(privateBlock.querySelector("[data-publication-recap-private-videos]")).toBeNull();
    expect(privateBlock.textContent).not.toContain("L'aperçu montre aussi");
    expect(privateBlock.textContent).toContain("D'autres possibilités, comme la vidéo, sont réservées à l'hommage complet.");
  });

  it("empty gallery: no gallery line at all", () => {
    renderPanel({ recap: recap({ galleryCount: null, visible: [{ sectionId: "hero", archived: false }] }) });
    openPublication();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toContain("galerie");
    expect(dialog.querySelector("[data-publication-gallery]")).toBeNull();
  });

  it("more than six photos: the existing choice sits in the « visible » block, the limit is said once", () => {
    renderPanel({ publication: publication({ gallery: sevenPhotos() }) });
    openPublication();
    const dialog = screen.getByRole("dialog");
    const recapBlock = dialog.querySelector("[data-publication-recap]")!;
    expect(recapBlock.querySelector("[data-publication-gallery]")).not.toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(dialog.textContent).toContain("6 photos sur 7 seront publiées. Les autres restent dans votre brouillon.");
    expect(dialog.textContent).not.toContain("Dans l'hommage gratuit, la galerie publique compte au plus six photographies.");
  });

  it("the buttons stay in a bar pinned to the bottom of the dialog", () => {
    renderPanel();
    openPublication();
    const confirm = screen.getByRole("button", { name: "Confirmer la publication" });
    const back = screen.getByRole("button", { name: "Revenir à l'aperçu" });
    expect(confirm.parentElement).toBe(back.parentElement);
    expect(confirm.parentElement!.className).toMatch(/dialogActions/);
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe("publication-confirm-body");
    expect(document.getElementById("publication-confirm-body")!.querySelector("[data-publication-recap]")).not.toBeNull();
  });
});

describe("PreviewPublicationPanel — 05-R1 recap, complete tribute", () => {
  const COMPLETE = recap({
    offer: "complete",
    visible: [
      { sectionId: "hero", archived: false },
      { sectionId: "gallery", archived: false },
      { sectionId: "video", archived: false },
    ],
    galleryCount: 24,
    videoCount: 2,
  });
  const complete = () =>
    publication({ accessLevel: "complet", gallery: { total: 24, limit: null, selection: undefined, proposed: false, choices: [] } });

  it("is short and textual: the photo count, no thumbnail, no checkbox, no free-tribute rules", () => {
    renderPanel({ publication: complete(), recap: COMPLETE });
    openPublication();
    const dialog = screen.getByRole("dialog", { name: "Publier votre hommage complet ?" });
    expect(dialog.textContent).toContain("Vos 24 photographies seront incluses dans votre hommage complet.");
    expect(dialog.textContent).toContain("Seules les vidéos dont la préparation est terminée au moment de la publication y figureront.");
    expect(dialog.querySelectorAll("img")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(dialog.querySelector("[data-publication-recap-duration]")).toBeNull();
    expect(dialog.querySelector("[data-publication-recap-private]")).toBeNull();
    expect(dialog.textContent).not.toMatch(/45 jours|six photographies|12 mois|dix ans|trois mois|douze mois|archiv/);
    expect(dialog.textContent).toContain("tel que vous le voyez dans cet aperçu");
    expect(dialog.querySelector("[data-publication-recap-locks]")).not.toBeNull();
  });

  it("empty gallery: no photo sentence", () => {
    renderPanel({ publication: complete(), recap: recap({ offer: "complete", galleryCount: null, visible: [{ sectionId: "hero", archived: false }] }) });
    openPublication();
    expect(screen.getByRole("dialog").querySelector("[data-publication-recap-gallery]")).toBeNull();
  });

  it("a hidden section is said as private, without the free-tribute lines", () => {
    renderPanel({ publication: complete(), recap: { ...COMPLETE, hiddenSections: ["traditions"] } });
    openPublication();
    const privateBlock = screen.getByRole("dialog").querySelector("[data-publication-recap-private]")!;
    expect(privateBlock.textContent).toContain("Traditions & repères (rubrique masquée)");
    expect(privateBlock.textContent).not.toContain("réservées à l'hommage complet");
  });

  it("« Confirmer » still sends only the revision, the fingerprint and no selection", async () => {
    const { publish } = renderPanel({ publication: complete(), recap: COMPLETE });
    openPublication();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmer la publication" }));
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith(5, DIGEST, undefined);
  });
});

describe("PreviewPublicationPanel — 05-R1 recap in English and Spanish", () => {
  it.each([
    ["en", "Publish your free tribute?", "Publish your complete tribute?", "Your 24 photographs will be included in your complete tribute.", "45 days"],
    ["es", "¿Publicar su homenaje gratuito?", "¿Publicar su homenaje completo?", "Sus 24 fotografías se incluirán en su homenaje completo.", "45 días"],
  ] as const)("%s — both variants are translated, no raw key", (language, freeTitle, completeTitle, photos, days) => {
    renderPanel({ language, recap: recap({ previewOnlyVideoCount: 1, hiddenSections: ["story"], contributions: { condolences: true, stories: false, photos: true } }) });
    openPublication();
    const free = screen.getByRole("dialog", { name: freeTitle });
    expect(free.textContent).toContain(days);
    expect(free.textContent).not.toMatch(/publish\.|visibility\.|\{\w+\}/);
    cleanup();

    renderPanel({
      language,
      publication: publication({ accessLevel: "complet", gallery: { total: 24, limit: null, selection: undefined, proposed: false, choices: [] } }),
      recap: recap({ offer: "complete", galleryCount: 24, videoCount: 1, visible: [{ sectionId: "hero", archived: false }, { sectionId: "gallery", archived: false }, { sectionId: "video", archived: false }] }),
    });
    openPublication();
    const complete = screen.getByRole("dialog", { name: completeTitle });
    expect(complete.textContent).toContain(photos);
    expect(complete.textContent).not.toMatch(/publish\.|visibility\.|\{\w+\}/);
  });
});
