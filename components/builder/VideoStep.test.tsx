// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { MemorialContent } from "@/types/memorial";
import type { LocalVideoHandle } from "@/lib/memorial/video/local-video";

/** VID-06 — l'écran A16 : préparation locale des vidéos, sans aucun transfert. */

const { routerRefresh, useRouter } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
}));

const { VideoStep } = await import("./VideoStep");
const { createLocalVideoRegistry } = await import("@/lib/memorial/video/local-video-registry");

const DRAFT = {
  hero: { displayName: "Élise Martin" },
  legacy: { text: "Conservé" },
  guidedFlow: { A13: { status: "skipped" }, A15: { status: "skipped" } },
} as unknown as MemorialContent;

const t = (key: Parameters<typeof translate>[1]) => translate("fr", key);

/** Fichier factice et sa lecture locale simulée (durée, lisibilité). */
interface FakeVideo {
  name: string;
  type?: string;
  durationSeconds: number | null;
  playable?: boolean;
}
function file({ name, type = "video/mp4" }: FakeVideo): File {
  return new File(["x"], name, { type });
}

let opened: Map<string, FakeVideo>;
let handles: (LocalVideoHandle & { release: ReturnType<typeof vi.fn> })[];
let fetchSpy: ReturnType<typeof vi.fn>;
let xhrSpy: ReturnType<typeof vi.fn<() => void>>;
let beaconSpy: ReturnType<typeof vi.fn>;
let counter: number;

function openVideo(f: File): Promise<LocalVideoHandle> {
  const spec = opened.get(f.name)!;
  const handle = {
    url: `blob:local/${f.name}`,
    metadata: { durationSeconds: spec.durationSeconds, width: 1920, height: 1080, playable: spec.playable ?? true },
    release: vi.fn(),
  };
  handles.push(handle);
  return Promise.resolve(handle);
}

function setup(content: MemorialContent = DRAFT, registry = createLocalVideoRegistry()) {
  const persist = vi.fn<(content: MemorialContent) => Promise<{ updatedAt: string }>>(async () => ({ updatedAt: "2026-11-25T10:00:00.000Z" }));
  const view = render(
    <VideoStep language="fr" content={content} persist={persist} registry={registry} openVideo={openVideo} createId={() => `v-${++counter}`} />,
  );
  return { persist, registry, view };
}

async function add(video: FakeVideo) {
  opened.set(video.name, video);
  const input = document.querySelector<HTMLInputElement>("[data-video-add] input[type=file]")!;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file(video)] } });
  });
}

async function replaceAt(index: number, video: FakeVideo) {
  opened.set(video.name, video);
  const row = document.querySelectorAll("[data-video-item]")[index]!;
  const input = row.querySelector<HTMLInputElement>("input[type=file]")!;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file(video)] } });
  });
}

const rows = () => [...document.querySelectorAll<HTMLElement>("[data-video-item]")];
const titleInputs = () => rows().map((row) => row.querySelector<HTMLInputElement>("input[type=text]")!);

async function continueAndSaved(persist: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: t("common.continue") }));
  await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  return persist.mock.calls.at(-1)![0] as Record<string, unknown>;
}

beforeEach(() => {
  opened = new Map();
  handles = [];
  counter = 0;
  fetchSpy = vi.fn();
  xhrSpy = vi.fn<() => void>();
  beaconSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", vi.fn(function () {
    xhrSpy();
  }));
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beaconSpy });
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  routerRefresh.mockClear();
  // Aucun accès réseau, quel que soit le test.
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  expect(beaconSpy).not.toHaveBeenCalled();
});

describe("VID-06 — A16 « Vos souvenirs en vidéo »", () => {
  it("à l'arrivée sur l'écran, rien n'est enregistré tant que la famille ne change rien", async () => {
    const { persist } = setup({ ...DRAFT, video: { items: [{ id: "v-9", title: "Gardée", durationSeconds: 5 }] } } as unknown as MemorialContent);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(persist).not.toHaveBeenCalled();
  });

  it("état vide : une invitation simple, l'information sur le stockage local, aucun aperçu", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: t("videoStep.title") })).toBeTruthy();
    expect(screen.getByText(t("videoStep.addFirst"))).toBeTruthy();
    expect(screen.getByText(t("videoStep.localNotice"))).toBeTruthy();
    expect(document.querySelector("[data-video-preview]")).toBeNull();
    expect(document.querySelector("[data-video-register]")).toBeNull();
  });

  it("une vidéo : ajoutée, mesurée, visible aussitôt dans la rubrique HERITAGE (lecteur seul, sans sélecteur, Master Light)", async () => {
    setup();
    await add({ name: "anniversaire.mp4", durationSeconds: 268.4 });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain(translateWith("fr", "videoStep.duration", { duration: "4 min 28 s" }));
    const preview = document.querySelector("[data-video-preview]")!;
    expect(preview.querySelector("video")?.getAttribute("src")).toBe("blob:local/anniversaire.mp4");
    expect(preview.querySelector("[data-video-selectors]")).toBeNull();
    expect(preview.querySelector("[data-video-hommage]")?.getAttribute("data-variant")).toBe("light");
    expect(preview.querySelector("video")?.hasAttribute("autoplay")).toBe(false);
    expect(document.querySelector("[data-video-compliance]")?.textContent).toContain(translateWith("fr", "videoStep.budget", { count: 1, used: "4 min 28 s" }));
  });

  it("trois vidéos : sélecteurs dans l'aperçu, plus de zone d'ajout, la limite est expliquée", async () => {
    setup();
    await add({ name: "a.mp4", durationSeconds: 60 });
    await add({ name: "b.mp4", durationSeconds: 60 });
    await add({ name: "c.mp4", durationSeconds: 60 });
    expect(rows()).toHaveLength(3);
    expect(document.querySelectorAll("[data-video-preview] [data-video-selector]")).toHaveLength(3);
    expect(document.querySelector("[data-video-add]")).toBeNull();
    expect(screen.getByText(t("videoStep.limitCount"))).toBeTruthy();
  });

  it("cumul égal à 600 s accepté ; supérieur refusé avec la durée restante ; plus de place : explication", async () => {
    setup();
    await add({ name: "a.mp4", durationSeconds: 400 });
    await add({ name: "trop.mp4", durationSeconds: 200.5 });
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toBe(
      translateWith("fr", "videoStep.errorTooLong", { duration: "3 min 20 s", remaining: "3 min 20 s" }),
    );
    expect(handles.at(-1)!.release).toHaveBeenCalledTimes(1);
    await add({ name: "juste.mp4", durationSeconds: 200 });
    expect(rows()).toHaveLength(2);
    expect(document.querySelector("[data-video-compliance]")?.getAttribute("data-video-compliance")).toBe("within");
    expect(document.querySelector("[data-video-add]")).toBeNull();
    expect(screen.getByText(t("videoStep.limitTime"))).toBeTruthy();
  });

  it("durée indisponible : la vidéo est gardée, jamais comptée comme zéro, le cumul reste « à vérifier » ; Continuer n'est pas bloqué", async () => {
    const { persist } = setup();
    await add({ name: "a.mp4", durationSeconds: 100 });
    await add({ name: "flux.webm", durationSeconds: null });
    expect(rows()).toHaveLength(2);
    expect(rows()[1]!.querySelector("[data-video-duration]")?.getAttribute("data-video-duration")).toBe("unknown");
    expect(screen.getByText(t("videoStep.budgetUnverified"))).toBeTruthy();
    expect(document.querySelector("[data-video-compliance]")?.getAttribute("data-video-compliance")).toBe("unverified");
    const saved = await continueAndSaved(persist);
    expect((saved.video as { items: { durationSeconds: number | null }[] }).items.map((i) => i.durationSeconds)).toEqual([100, null]);
    expect((saved.guidedFlow as Record<string, unknown>).A16).toEqual({ status: "completed" });
  });

  it("fichier illisible ou non vidéo : explication, rien n'est ajouté, l'adresse temporaire est libérée", async () => {
    setup();
    await add({ name: "abime.mp4", durationSeconds: null, playable: false });
    expect(screen.getByRole("alert").textContent).toBe(t("videoStep.errorUnreadable"));
    expect(handles[0]!.release).toHaveBeenCalledTimes(1);
    await add({ name: "photo.jpg", type: "image/jpeg", durationSeconds: 3 });
    expect(screen.getByRole("alert").textContent).toBe(t("videoStep.errorNotVideo"));
    expect(rows()).toHaveLength(0);
  });

  it("vidéo mesurée mais non affichable par ce navigateur (codec) : gardée, avec une explication", async () => {
    setup();
    await add({ name: "hevc.mov", type: "video/quicktime", durationSeconds: 42, playable: false });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain(t("videoStep.notPlayable"));
  });

  it("titres : vide → « Souvenir n » ; 30 caractères gardés ; au-delà, coupé à 30 ; espaces tapés conservés pendant la saisie", async () => {
    const { persist } = setup();
    await add({ name: "a.mp4", durationSeconds: 10 });
    await add({ name: "b.mp4", durationSeconds: 10 });
    const thirty = "Les 80 ans de Mamie à Biarritz";
    fireEvent.change(titleInputs()[0]!, { target: { value: `${thirty} et la suite` } });
    expect(titleInputs()[0]!.value).toBe(thirty);
    expect(rows()[0]!.textContent).toContain(translateWith("fr", "videoStep.titleCounter", { count: 30 }));
    fireEvent.change(titleInputs()[1]!, { target: { value: "À " } });
    expect(titleInputs()[1]!.value).toBe("À ");
    fireEvent.change(titleInputs()[1]!, { target: { value: "   " } });
    expect(titleInputs()[1]!.placeholder).toBe("Souvenir 2");
    const selectors = [...document.querySelectorAll("[data-video-preview] [data-video-selector]")].map((b) => b.textContent);
    expect(selectors[0]).toContain(thirty);
    expect(selectors[1]).toContain("Souvenir 2");
    const saved = await continueAndSaved(persist);
    expect((saved.video as { items: { title: string | null }[] }).items.map((i) => i.title)).toEqual([thirty, null]);
  });

  it("ordre : monter et descendre, la numérotation suit ; l'aperçu suit le même ordre", async () => {
    const { persist } = setup();
    await add({ name: "a.mp4", durationSeconds: 10 });
    await add({ name: "b.mp4", durationSeconds: 20 });
    await add({ name: "c.mp4", durationSeconds: 30 });
    fireEvent.click(screen.getByRole("button", { name: translateWith("fr", "videoStep.moveUp", { title: "Souvenir 3" }) }));
    expect(rows().map((r) => r.getAttribute("data-video-item"))).toEqual(["v-1", "v-3", "v-2"]);
    expect(screen.getByRole("button", { name: translateWith("fr", "videoStep.moveUp", { title: "Souvenir 1" }) }).hasAttribute("disabled")).toBe(true);
    const saved = await continueAndSaved(persist);
    expect((saved.video as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(["v-1", "v-3", "v-2"]);
  });

  it("remplacer : même place, même titre, nouvelle durée, ancien fichier libéré ; le remplacement respecte le cumul", async () => {
    setup();
    await add({ name: "a.mp4", durationSeconds: 500 });
    await add({ name: "b.mp4", durationSeconds: 100 });
    fireEvent.change(titleInputs()[0]!, { target: { value: "Le mariage" } });
    await replaceAt(0, { name: "a2.mp4", durationSeconds: 450 });
    expect(handles[0]!.release).toHaveBeenCalledTimes(1);
    expect(rows()[0]!.getAttribute("data-video-item")).toBe("v-1");
    expect(titleInputs()[0]!.value).toBe("Le mariage");
    expect(document.querySelector("[data-video-preview] video")?.getAttribute("src")).toBe("blob:local/a2.mp4");
    await replaceAt(0, { name: "a3.mp4", durationSeconds: 501 });
    expect(screen.getByRole("alert").getAttribute("data-video-feedback")).toBe("tooLong");
    expect(document.querySelector("[data-video-preview] video")?.getAttribute("src")).toBe("blob:local/a2.mp4");
  });

  it("retirer : confirmation calme, puis retrait et fichier libéré ; « Garder » ne change rien", async () => {
    const { persist, registry } = setup();
    await add({ name: "a.mp4", durationSeconds: 10 });
    await add({ name: "b.mp4", durationSeconds: 10 });
    fireEvent.click(within(rows()[0]!).getByRole("button", { name: t("videoStep.remove") }));
    fireEvent.click(screen.getByRole("button", { name: t("videoStep.removeNo") }));
    expect(rows()).toHaveLength(2);
    fireEvent.click(within(rows()[0]!).getByRole("button", { name: t("videoStep.remove") }));
    fireEvent.click(screen.getByRole("button", { name: t("videoStep.removeYes") }));
    expect(rows().map((r) => r.getAttribute("data-video-item"))).toEqual(["v-2"]);
    expect(handles[0]!.release).toHaveBeenCalledTimes(1);
    expect(registry.has("v-1")).toBe(false);
    const saved = await continueAndSaved(persist);
    expect((saved.video as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(["v-2"]);
  });

  it("aucun fichier n'est jamais enregistré : seuls l'identifiant, le titre et la durée", async () => {
    const { persist } = setup();
    await add({ name: "IMG_2041 Mamie.mp4", durationSeconds: 12 });
    const saved = await continueAndSaved(persist);
    expect(saved.video).toEqual({ items: [{ id: "v-1", title: null, durationSeconds: 12 }] });
    expect(JSON.stringify(saved)).not.toMatch(/blob:|IMG_2041|Mamie\.mp4/);
    expect(saved.legacy).toEqual({ text: "Conservé" });
  });

  it("retour après rechargement : titres, durées et ordre restaurés ; chaque vidéo est à sélectionner de nouveau, sans fausse promesse", async () => {
    const stored = {
      ...DRAFT,
      video: { items: [{ id: "v-9", title: "Son anniversaire", durationSeconds: 268 }, { id: "v-8", title: null, durationSeconds: null }] },
      guidedFlow: { ...(DRAFT as { guidedFlow: object }).guidedFlow, A16: { status: "completed" } },
    } as unknown as MemorialContent;
    setup(stored);
    expect(titleInputs().map((i) => i.value)).toEqual(["Son anniversaire", ""]);
    expect(rows().every((r) => r.getAttribute("data-file") === "missing")).toBe(true);
    expect(screen.getAllByText(t("videoStep.fileMissing"))).toHaveLength(2);
    expect(document.querySelector("[data-video-preview] video")).toBeNull();
    expect(document.querySelector("[data-video-preview] [role=status]")?.textContent).toBe(
      "Pour revoir cette vidéo, sélectionnez-la à nouveau sur votre appareil.",
    );
    await replaceAt(0, { name: "retour.mp4", durationSeconds: 268 });
    expect(rows()[0]!.getAttribute("data-file")).toBe("present");
    expect(document.querySelector("[data-video-preview] video")?.getAttribute("src")).toBe("blob:local/retour.mp4");
  });

  it("aller-retour dans le parcours (même page) : les fichiers déjà choisis restent disponibles", async () => {
    const registry = createLocalVideoRegistry();
    const first = setup(DRAFT, registry);
    await add({ name: "a.mp4", durationSeconds: 10 });
    const saved = await continueAndSaved(first.persist);
    first.view.unmount();
    setup(saved as unknown as MemorialContent, registry);
    expect(rows()[0]!.getAttribute("data-file")).toBe("present");
    expect(handles[0]!.release).not.toHaveBeenCalled();
  });

  it("« Passer cette étape » : l'étape est passée, les vidéos déjà préparées restent", async () => {
    const stored = { ...DRAFT, video: { items: [{ id: "v-9", title: "Gardée", durationSeconds: 5 }] } } as unknown as MemorialContent;
    const { persist } = setup(stored);
    fireEvent.click(screen.getByRole("button", { name: t("videoStep.skip") }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const saved = persist.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect((saved.guidedFlow as Record<string, unknown>).A16).toEqual({ status: "skipped" });
    expect(saved.video).toEqual({ items: [{ id: "v-9", title: "Gardée", durationSeconds: 5 }] });
  });

  it("« Continuer » sans vidéo : l'étape est résolue comme passée", async () => {
    const { persist } = setup();
    const saved = await continueAndSaved(persist);
    expect((saved.guidedFlow as Record<string, unknown>).A16).toEqual({ status: "skipped" });
  });

  it("contenu vidéo illisible : message, aucune écriture par-dessus", () => {
    const { persist } = setup({ ...DRAFT, video: { items: "x" } } as unknown as MemorialContent);
    expect(screen.getByRole("alert").textContent).toBe(t("hero.dataUnavailable"));
    expect(screen.queryByRole("button", { name: t("common.continue") })).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it("clavier et tactile : boutons et champs de fichier nommés, focalisables, de taille tactile", async () => {
    setup();
    await add({ name: "a.mp4", durationSeconds: 10 });
    await add({ name: "b.mp4", durationSeconds: 10 });
    for (const row of rows()) {
      expect(row.querySelector("label input[type=file]")).not.toBeNull();
      expect(within(row).getByLabelText(t("videoStep.titleLabel"))).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: /^(Monter|Descendre) / })).toHaveLength(4);
    expect(screen.getByRole("list", { name: t("videoStep.listLabel") })).toBeTruthy();
  });
});
