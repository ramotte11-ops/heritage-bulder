// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { MemorialContent } from "@/types/memorial";
import type { LocalVideoHandle } from "@/lib/memorial/video/local-video";
import type { DirectUploadOptions, DirectUploadResult } from "@/lib/memorial/video/hosting/direct-upload";
import type { HostedVideoView, VideoHostingActions, VideoUploadRequestResult } from "@/lib/memorial/video/hosting/hosted-video-types";

/**
 * VID-07 — l'écran A16 en mode premium : transfert, progression, annulation,
 * reprise, mise en forme, disponibilité, erreurs, retrait, reconnexion.
 *
 * Serveur HERITAGE et hébergeur sont des DOUBLES de test : aucune requête
 * réseau n'est émise (fetch, XHR et sendBeacon sont piégés). Ce n'est pas une
 * validation sur Mux.
 */

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
const { createVideoTransferManager } = await import("@/lib/memorial/video/hosting/video-transfers");

const DRAFT = {
  hero: { displayName: "Élise Martin" },
  guidedFlow: { A13: { status: "skipped" }, A15: { status: "skipped" } },
} as unknown as MemorialContent;
const withVideos = (items: unknown[]) => ({ ...DRAFT, video: { items } }) as unknown as MemorialContent;

const t = (key: Parameters<typeof translate>[1]) => translate("fr", key);
const KEPT = t("videoStep.hostedReady");

/** Double du serveur HERITAGE : lignes par emplacement, comme list_memorial_videos_v1. */
function fakeServer(initial: HostedVideoView[] = []) {
  let rows = [...initial];
  let seq = 0;
  const view = (draftVideoId: string, patch: Partial<HostedVideoView>): HostedVideoView => ({
    videoId: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    draftVideoId,
    state: "pending",
    durationSeconds: null,
    durationVerified: false,
    failure: null,
    uploadExpiresAt: null,
    playback: null,
    ...patch,
  });
  let nextRequest: VideoUploadRequestResult | null = null;
  const actions = {
    load: vi.fn(async () => ({ status: "available" as const, videos: rows.map((r) => ({ ...r })) })),
    request: vi.fn(async (draftVideoId: string, declared: number | null): Promise<VideoUploadRequestResult> => {
      if (nextRequest !== null) {
        const answer = nextRequest;
        nextRequest = null;
        return answer;
      }
      const row = view(draftVideoId, { state: "uploading", durationSeconds: declared });
      rows.push(row);
      return { status: "granted", videoId: row.videoId, uploadUrl: `https://upload.example/${row.videoId}`, expiresAt: "2026-11-25T23:00:00.000Z" };
    }),
    cancel: vi.fn(async (videoId: string) => {
      rows = rows.map((r) => (r.videoId === videoId && (r.state === "uploading" || r.state === "pending") ? { ...r, state: "failed", failure: "upload_cancelled" } : r));
      return { status: "cancelled" as const };
    }),
    remove: vi.fn(async (draftVideoId: string) => {
      rows = rows.filter((r) => r.draftVideoId !== draftVideoId);
      return { status: "removed" as const };
    }),
  } satisfies VideoHostingActions;
  const latest = (draftVideoId: string) => rows.filter((r) => r.draftVideoId === draftVideoId).at(-1)!;
  const update = (draftVideoId: string, patch: Partial<HostedVideoView>) => {
    const target = latest(draftVideoId);
    rows = rows.map((r) => (r === target ? { ...r, ...patch } : r));
  };
  return {
    actions,
    refuseNext: (answer: VideoUploadRequestResult) => (nextRequest = answer),
    received: (draftVideoId: string) => update(draftVideoId, { state: "processing" }),
    ready: (draftVideoId: string, verifiedSeconds: number) =>
      update(draftVideoId, {
        state: "ready",
        durationSeconds: verifiedSeconds,
        durationVerified: true,
        playback: { hlsUrl: "https://stream.example/p.m3u8?token=signed", posterUrl: "https://image.example/p.webp?token=signed", mp4Url: "https://stream.example/720p.mp4?token=signed", expiresAt: "2026-11-25T23:00:00.000Z" },
      }),
    fail: (draftVideoId: string, failure: HostedVideoView["failure"]) => update(draftVideoId, { state: "failed", failure, durationVerified: true }),
    view,
    rows: () => rows,
  };
}

/** Double de l'hébergeur : chaque envoi est piloté par le test. */
function fakeUploads() {
  const calls: { options: DirectUploadOptions; finish: (result: DirectUploadResult) => void }[] = [];
  const upload = vi.fn(
    (options: DirectUploadOptions) =>
      new Promise<DirectUploadResult>((resolve) => {
        options.signal?.addEventListener("abort", () => resolve({ status: "aborted" }));
        calls.push({ options, finish: resolve });
      }),
  );
  return { upload, calls, last: () => calls.at(-1)! };
}

let fetchSpy: ReturnType<typeof vi.fn>;
let xhrSpy: ReturnType<typeof vi.fn<() => void>>;
let beaconSpy: ReturnType<typeof vi.fn>;
let counter: number;
let durations: Map<string, number | null>;

function openVideo(f: File): Promise<LocalVideoHandle> {
  return Promise.resolve({
    url: `blob:local/${f.name}`,
    metadata: { durationSeconds: durations.get(f.name) ?? null, width: 1920, height: 1080, playable: true },
    release: vi.fn(),
  });
}

function setup(options: { content?: MemorialContent; server?: ReturnType<typeof fakeServer>; hosting?: VideoHostingActions; registry?: ReturnType<typeof createLocalVideoRegistry>; uploads?: ReturnType<typeof fakeUploads>; transfers?: ReturnType<typeof createVideoTransferManager> } = {}) {
  const server = options.server ?? fakeServer();
  const uploads = options.uploads ?? fakeUploads();
  const registry = options.registry ?? createLocalVideoRegistry();
  const transfers = options.transfers ?? createVideoTransferManager({ upload: uploads.upload });
  const persist = vi.fn<(content: MemorialContent) => Promise<{ updatedAt: string }>>(async () => ({ updatedAt: "2026-11-25T10:00:00.000Z" }));
  const view = render(
    <VideoStep
      language="fr"
      content={options.content ?? DRAFT}
      persist={persist}
      registry={registry}
      openVideo={openVideo}
      createId={() => `v-${++counter}`}
      hosting={options.hosting ?? server.actions}
      transfers={transfers}
      hostingPollMs={15}
    />,
  );
  return { server, uploads, registry, transfers, persist, view };
}

async function add(name: string, durationSeconds: number | null, index?: number) {
  durations.set(name, durationSeconds);
  const input =
    index === undefined
      ? document.querySelector<HTMLInputElement>("[data-video-add] input[type=file]")!
      : document.querySelectorAll("[data-video-item]")[index]!.querySelector<HTMLInputElement>("input[type=file]")!;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(1000)], name, { type: "video/mp4" })] } });
  });
}

const row = (index = 0) => document.querySelectorAll<HTMLElement>("[data-video-item]")[index]!;
const hostingState = (index = 0) => row(index).querySelector("[data-video-hosting]")?.getAttribute("data-video-hosting") ?? null;
const hostedNotice = () => document.querySelector("[data-video-hosted-notice]");

beforeEach(() => {
  counter = 0;
  durations = new Map();
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
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  expect(beaconSpy).not.toHaveBeenCalled();
});

describe("VID-07 — A16 sans hébergement disponible : exactement VID-06", () => {
  it("offre gratuite ou hébergement non configuré (« indisponible ») : notice locale, aucune demande, aucun envoi", async () => {
    const uploads = fakeUploads();
    const hosting: VideoHostingActions = {
      load: vi.fn(async () => ({ status: "unavailable" as const })),
      request: vi.fn(),
      cancel: vi.fn(),
      remove: vi.fn(),
    };
    setup({ hosting, uploads });
    await waitFor(() => expect(hosting.load).toHaveBeenCalled());
    await add("a.mp4", 30);
    expect(screen.getByText(t("videoStep.localNotice"))).toBeTruthy();
    expect(hostedNotice()).toBeNull();
    expect(hosting.request).not.toHaveBeenCalled();
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(row().querySelector("[data-video-hosting]")).toBeNull();
  });

  it("ouverture refusée par le serveur (session expirée) : préparation locale, rien n'est envoyé", async () => {
    const uploads = fakeUploads();
    const hosting: VideoHostingActions = { load: vi.fn(async () => Promise.reject(new Error("Video hosting refused."))), request: vi.fn(), cancel: vi.fn(), remove: vi.fn() };
    setup({ hosting, uploads });
    await waitFor(() => expect(hosting.load).toHaveBeenCalled());
    await add("a.mp4", 30);
    expect(screen.getByText(t("videoStep.localNotice"))).toBeTruthy();
    expect(uploads.upload).not.toHaveBeenCalled();
  });
});

describe("VID-07 — A16 premium : du fichier choisi à la vidéo conservée", () => {
  it("transfert direct, progression, réception, mise en forme, puis disponibilité — « conservée » seulement quand le serveur le dit", async () => {
    const { server, uploads } = setup();
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("souvenir.mp4", 268.44);

    await waitFor(() => expect(hostingState()).toBe("sending"));
    expect(server.actions.request).toHaveBeenCalledWith("v-1", 268.44);
    const call = uploads.last();
    expect(call.options.url).toMatch(/^https:\/\/upload\.example\//);
    expect(call.options.file.size).toBe(1000);

    act(() => call.options.onProgress!(250, 1000));
    const bar = within(row()).getByRole("progressbar", { name: translateWith("fr", "videoStep.transferProgressLabel", { title: "Souvenir 1" }) });
    expect(bar.getAttribute("value")).toBe("25");
    expect(within(row()).getByText(translateWith("fr", "videoStep.transferProgress", { percent: 25 }))).toBeTruthy();
    expect(screen.queryByText(KEPT)).toBeNull();

    // Fichier entièrement reçu par l'hébergeur : ce n'est PAS encore une vidéo conservée.
    await act(async () => call.finish({ status: "done" }));
    expect(hostingState()).toBe("processing");
    expect(within(row()).getByText(t("videoStep.hostedProcessing"))).toBeTruthy();
    expect(screen.queryByText(KEPT)).toBeNull();

    server.received("v-1");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(hostingState()).toBe("processing");
    expect(screen.queryByText(KEPT)).toBeNull();

    // Le serveur déclare la vidéo prête (notification signée de l'hébergeur, côté serveur).
    server.ready("v-1", 268.4);
    await waitFor(() => expect(hostingState()).toBe("ready"));
    expect(within(row()).getByText(KEPT)).toBeTruthy();
    // La durée mesurée par l'hébergeur remplace celle du navigateur.
    expect(within(row()).getByText(translateWith("fr", "videoStep.duration", { duration: "4 min 28 s" }))).toBeTruthy();
  });

  it("le brouillon enregistre la durée vérifiée, jamais un fichier ni une adresse", async () => {
    const { server, uploads, persist } = setup();
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", 61.9);
    await waitFor(() => expect(uploads.calls).toHaveLength(1));
    await act(async () => uploads.last().finish({ status: "done" }));
    server.ready("v-1", 58.2);
    await waitFor(() => expect(within(row()).getByText(translateWith("fr", "videoStep.duration", { duration: "58 s" }))).toBeTruthy());
    expect(hostingState()).toBe("ready");
    fireEvent.click(screen.getByRole("button", { name: t("common.continue") }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled(), { timeout: 4000 });
    const saved = persist.mock.calls.at(-1)![0] as { video: unknown };
    expect(saved.video).toEqual({ items: [{ id: "v-1", title: null, durationSeconds: 58.2 }] });
    expect(JSON.stringify(saved)).not.toMatch(/upload\.example|stream\.example|token|blob:/);
  });

  it("« Annuler l'envoi » : l'envoi s'arrête, le serveur est prévenu ; « Reprendre l'envoi » repart de zéro avec une nouvelle autorisation", async () => {
    const { server, uploads } = setup();
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", 30);
    await waitFor(() => expect(hostingState()).toBe("sending"));
    const first = uploads.last();
    const firstId = server.rows()[0]!.videoId;

    await act(async () => {
      fireEvent.click(within(row()).getByRole("button", { name: t("videoStep.transferCancel") }));
    });
    expect(first.options.signal!.aborted).toBe(true);
    expect(server.actions.cancel).toHaveBeenCalledWith(firstId);
    await waitFor(() => expect(hostingState()).toBe("interrupted"));
    expect(screen.queryByText(KEPT)).toBeNull();

    await act(async () => {
      fireEvent.click(within(row()).getByRole("button", { name: t("videoStep.transferResume") }));
    });
    await waitFor(() => expect(uploads.calls).toHaveLength(2));
    expect(server.actions.request).toHaveBeenCalledTimes(2);
    expect(uploads.last().options.url).not.toBe(first.options.url);
  });

  it("coupure durable ou adresse expirée : « L'envoi a été interrompu », reprise par une nouvelle adresse (l'ancienne est annulée)", async () => {
    const { server, uploads } = setup();
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", 30);
    await waitFor(() => expect(uploads.calls).toHaveLength(1));
    const expiredId = server.rows()[0]!.videoId;
    await act(async () => uploads.last().finish({ status: "expired" }));
    expect(hostingState()).toBe("interrupted");
    expect(within(row()).getByText(t("videoStep.transferInterrupted"))).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(row()).getByRole("button", { name: t("videoStep.transferResume") }));
    });
    await waitFor(() => expect(uploads.calls).toHaveLength(2));
    expect(server.actions.cancel).toHaveBeenCalledWith(expiredId);
    expect(server.actions.cancel.mock.invocationCallOrder[0]!).toBeLessThan(server.actions.request.mock.invocationCallOrder[1]!);
  });

  it.each([
    ["duration", "videoStep.refusedDuration", false],
    ["too_many", "videoStep.refusedTooMany", false],
    ["offer", "videoStep.refusedOffer", false],
    ["unknown_pending", "videoStep.refusedUnknownPending", true],
    ["other", "videoStep.refusedOther", true],
  ] as const)("refus du serveur (%s) : explication, aucun envoi ; reprise proposée seulement si elle peut aboutir", async (reason, key, canResume) => {
    const server = fakeServer();
    server.refuseNext({ status: "refused", reason });
    const { uploads } = setup({ server });
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", 30);
    await waitFor(() => expect(hostingState()).toBe("refused"));
    expect(within(row()).getByRole("alert").textContent).toBe(t(key));
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(within(row()).queryByRole("button", { name: t("videoStep.transferResume") }) !== null).toBe(canResume);
  });

  it.each([
    ["over_total_duration", "videoStep.hostedFailedTotal"],
    ["too_many_videos", "videoStep.hostedFailedCount"],
    ["duration_unavailable", "videoStep.hostedFailedDuration"],
    ["asset_errored", "videoStep.hostedFailedProcessing"],
  ] as const)("refus après mesure par l'hébergeur (%s) : la vidéo n'est pas dite conservée, la raison est expliquée", async (failure, key) => {
    const { server, uploads } = setup();
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", null);
    await waitFor(() => expect(uploads.calls).toHaveLength(1));
    expect(server.actions.request).toHaveBeenCalledWith("v-1", null);
    await act(async () => uploads.last().finish({ status: "done" }));
    server.fail("v-1", failure);
    await waitFor(() => expect(hostingState()).toBe("failed"));
    expect(within(row()).getByRole("alert").textContent).toBe(t(key));
    expect(screen.queryByText(KEPT)).toBeNull();
    // « Remplacer » reste la voie proposée.
    expect(within(row()).getByText(t("videoStep.replace"))).toBeTruthy();
  });

  it("remplacement d'une vidéo conservée : nouvel envoi du même emplacement ; « conservée » ne revient qu'avec la nouvelle version prête", async () => {
    const server = fakeServer();
    const ready = server.view("v-7", { state: "ready", durationSeconds: 40, durationVerified: true, playback: { hlsUrl: "https://stream.example/old.m3u8", posterUrl: "https://image.example/old.webp", mp4Url: null, expiresAt: "x" } });
    server.rows().push(ready);
    const { uploads } = setup({ server, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 40 }]) });
    await waitFor(() => expect(hostingState()).toBe("ready"));

    await add("nouvelle.mp4", 50, 0);
    await waitFor(() => expect(hostingState()).toBe("sending"));
    expect(server.actions.request).toHaveBeenLastCalledWith("v-7", 50);
    await act(async () => uploads.last().finish({ status: "done" }));
    expect(hostingState()).toBe("processing");
    server.ready("v-7", 49.8);
    await waitFor(() => expect(hostingState()).toBe("ready"));
  });

  it("retrait : la vidéo est retirée chez l'hébergeur AVANT d'être retirée du brouillon ; un échec la laisse en place", async () => {
    const server = fakeServer();
    server.rows().push(server.view("v-7", { state: "ready", durationSeconds: 40, durationVerified: true, playback: null }));
    const failing = { ...server.actions, remove: vi.fn(async () => Promise.reject(new Error("Video hosting refused."))) };
    setup({ server, hosting: failing, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 40 }]) });
    await waitFor(() => expect(hostingState()).toBe("ready"));
    fireEvent.click(within(row()).getByRole("button", { name: t("videoStep.remove") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("videoStep.removeYes") }));
    });
    expect(failing.remove).toHaveBeenCalledWith("v-7");
    expect(document.querySelectorAll("[data-video-item]")).toHaveLength(1);
    expect(document.querySelector("[data-video-feedback]")!.textContent).toBe(t("videoStep.removeFailed"));
    cleanup();

    setup({ server, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 40 }]) });
    await waitFor(() => expect(hostingState()).toBe("ready"));
    fireEvent.click(within(row()).getByRole("button", { name: t("videoStep.remove") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("videoStep.removeYes") }));
    });
    expect(server.actions.remove).toHaveBeenCalledWith("v-7");
    expect(document.querySelectorAll("[data-video-item]")).toHaveLength(0);
  });

  it("retrait pendant l'envoi : l'envoi s'arrête aussitôt", async () => {
    const { server, uploads } = setup();
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", 30);
    await waitFor(() => expect(hostingState()).toBe("sending"));
    fireEvent.click(within(row()).getByRole("button", { name: t("videoStep.remove") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("videoStep.removeYes") }));
    });
    expect(uploads.last().options.signal!.aborted).toBe(true);
    expect(server.actions.remove).toHaveBeenCalledWith("v-1");
    expect(document.querySelectorAll("[data-video-item]")).toHaveLength(0);
  });
});

describe("VID-07 — A16 premium : reconnexion et changement d'écran", () => {
  it("après fermeture de la page : une vidéo conservée n'est pas « à sélectionner de nouveau », l'aperçu la lit chez l'hébergeur", async () => {
    const server = fakeServer();
    server.rows().push(server.view("v-7", { state: "ready", durationSeconds: 40, durationVerified: true, playback: { hlsUrl: "https://stream.example/p.m3u8?token=signed", posterUrl: "https://image.example/p.webp", mp4Url: "https://stream.example/720p.mp4?token=signed", expiresAt: "x" } }));
    setup({ server, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 40 }]) });
    await waitFor(() => expect(row().getAttribute("data-file")).toBe("hosted"));
    expect(screen.queryByText(t("videoStep.fileMissing"))).toBeNull();
    expect(within(row()).getByText(t("videoStep.replace"))).toBeTruthy();
    expect(document.querySelector("[data-video-player]")!.getAttribute("data-state")).toBe("ready");
  });

  it("après fermeture pendant un envoi : « interrompu », et la vidéo doit être sélectionnée de nouveau pour reprendre", async () => {
    const server = fakeServer();
    server.rows().push(server.view("v-7", { state: "uploading", durationSeconds: 40 }));
    const { uploads } = setup({ server, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 40 }]) });
    await waitFor(() => expect(hostingState()).toBe("interrupted"));
    expect(within(row()).getByText(t("videoStep.transferNeedsFile"))).toBeTruthy();
    expect(within(row()).queryByRole("button", { name: t("videoStep.transferResume") })).toBeNull();

    // La famille sélectionne de nouveau le fichier : l'ancien envoi est annulé, un nouveau part.
    const stale = server.rows()[0]!.videoId;
    await add("mariage.mp4", 40, 0);
    await waitFor(() => expect(uploads.calls).toHaveLength(1));
    expect(server.actions.cancel).toHaveBeenCalledWith(stale);
  });

  it("vidéo choisie avant que le serveur réponde : elle part dès que l'hébergement est confirmé", async () => {
    const server = fakeServer();
    const registry = createLocalVideoRegistry();
    registry.set("v-7", { url: "blob:local/x", metadata: { durationSeconds: 12, width: 1, height: 1, playable: true }, release: vi.fn() }, new Blob([new Uint8Array(10)]));
    const { uploads } = setup({ server, registry, content: withVideos([{ id: "v-7", title: null, durationSeconds: 12 }]) });
    await waitFor(() => expect(uploads.calls).toHaveLength(1));
    expect(server.actions.request).toHaveBeenCalledWith("v-7", 12);
  });

  it("l'envoi continue quand la famille passe à un autre écran du Builder, et l'écran le retrouve au retour", async () => {
    const uploads = fakeUploads();
    const transfers = createVideoTransferManager({ upload: uploads.upload });
    const server = fakeServer();
    const registry = createLocalVideoRegistry();
    const first = setup({ server, uploads, transfers, registry });
    await waitFor(() => expect(hostedNotice()).not.toBeNull());
    await add("a.mp4", 30);
    await waitFor(() => expect(uploads.calls).toHaveLength(1));
    const saved = first.persist;
    await waitFor(() => expect(saved).toHaveBeenCalled(), { timeout: 4000 });
    first.view.unmount();

    const call = uploads.last();
    expect(call.options.signal!.aborted).toBe(false);
    act(() => call.options.onProgress!(600, 1000));
    setup({ server, uploads, transfers, registry, content: saved.mock.calls.at(-1)![0] });
    await waitFor(() => expect(hostingState()).toBe("sending"));
    expect(within(row()).getByRole("progressbar").getAttribute("value")).toBe("60");
    expect(uploads.calls).toHaveLength(1);
  });
});

describe("VID-09 — remplacement d'une vidéo déjà publiée", () => {
  it("la nouvelle version est prévisualisée par la famille ; A16 précise que l'ancienne reste publique jusqu'à la prochaine publication", async () => {
    const server = fakeServer();
    server.rows().push(server.view("v-7", { state: "replaced", durationSeconds: 40, durationVerified: true, playback: null }));
    server.rows().push(server.view("v-7", { state: "ready", durationSeconds: 52, durationVerified: true, playback: { hlsUrl: "https://stream.example/new.m3u8", posterUrl: "https://image.example/new.webp", mp4Url: null, expiresAt: "x" } }));
    setup({ server, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 52 }]) });
    await waitFor(() => expect(hostingState()).toBe("ready"));
    expect(within(row()).getByText(t("videoStep.replacedPublished"))).toBeTruthy();
    expect(row().getAttribute("data-file")).toBe("hosted");
  });

  it("sans ancienne version publique : aucune mention", async () => {
    const server = fakeServer();
    server.rows().push(server.view("v-7", { state: "ready", durationSeconds: 52, durationVerified: true, playback: null }));
    setup({ server, content: withVideos([{ id: "v-7", title: "Mariage", durationSeconds: 52 }]) });
    await waitFor(() => expect(hostingState()).toBe("ready"));
    expect(document.querySelector("[data-video-previous-public]")).toBeNull();
  });
});

describe("VID-09 — vidéo refusée après mesure, fichier plus sur l'appareil", () => {
  it("seule la raison est affichée, avec « Remplacer » ; l'aperçu ne la montre jamais comme lisible", async () => {
    const server = fakeServer();
    server.rows().push(server.view("v-7", { state: "failed", failure: "over_total_duration", durationSeconds: 590, durationVerified: true }));
    setup({ server, content: withVideos([{ id: "v-7", title: "Vacances", durationSeconds: 590 }]) });
    await waitFor(() => expect(hostingState()).toBe("failed"));
    expect(row().getAttribute("data-file")).toBe("refused");
    expect(within(row()).queryByText(t("videoStep.fileMissing"))).toBeNull();
    expect(within(row()).getByText(t("videoStep.replace"))).toBeTruthy();
    expect(document.querySelector("[data-video-player]")!.getAttribute("data-state")).toBe("error");
  });
});
