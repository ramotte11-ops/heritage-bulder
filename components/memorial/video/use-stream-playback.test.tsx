// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VideoHommageItem } from "@/lib/memorial/video/video-hommage";

/**
 * VID-08 — lecture universelle des flux hébergés. hls.js est remplacé par un
 * double : ces tests prouvent le choix du mode, le chargement différé, la
 * gestion des erreurs et le nettoyage, PAS une lecture réelle dans Safari,
 * Chrome, Firefox ou Android (non exécutée ici).
 */

const { FakeHls, instances, loads } = vi.hoisted(() => {
  const instances: InstanceType<typeof FakeHls>[] = [];
  const loads = { count: 0 };
  class FakeHls {
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: "hlsError" } as const;
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" } as const;
    handlers = new Map<string, (event: string, data: unknown) => void>();
    attachMedia = vi.fn();
    loadSource = vi.fn();
    startLoad = vi.fn();
    stopLoad = vi.fn();
    destroy = vi.fn();
    recoverMediaError = vi.fn();
    constructor(public config: Record<string, unknown>) {
      instances.push(this);
    }
    on(event: string, handler: (event: string, data: unknown) => void) {
      this.handlers.set(event, handler);
    }
    fail(data: Record<string, unknown>) {
      this.handlers.get("hlsError")?.("hlsError", data);
    }
  }
  return { FakeHls, instances, loads };
});
vi.mock("hls.js", () => {
  loads.count += 1;
  return { default: FakeHls };
});
vi.mock("next/font/google", () => ({
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
}));

const { VideoHommageV1 } = await import("./VideoHommageV1");
const { detectStreamSupport, resetStreamSupportForTests, isStreamExpired } = await import("./use-stream-playback");
const { VIDEO_HOMMAGE_TEXTS } = await import("./texts");

const texts = VIDEO_HOMMAGE_TEXTS.fr;
const HLS = "application/vnd.apple.mpegurl";
const play = vi.fn(() => Promise.resolve());
let pausedFlag = true;
let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] = [];

function stream(id: string, url: string, extra: Partial<Extract<VideoHommageItem["source"], { kind: "stream" }>> = {}): VideoHommageItem {
  return { id, title: null, durationSeconds: 60, status: "ready", source: { kind: "stream", url, posterUrl: `https://image.example/${id}.webp`, ...extra } };
}

function browser(mode: "native" | "mse" | "none") {
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((type) => (mode === "native" && type === HLS ? "maybe" : ""));
  if (mode === "mse") vi.stubGlobal("MediaSource", { isTypeSupported: () => true });
  resetStreamSupportForTests();
}

/** Le lecteur approche de l'écran : l'observateur de préparation (marge 300px) se déclenche. */
function nearViewport() {
  const preparer = observers.filter((o) => o.options?.rootMargin === "300px").at(-1)!;
  act(() => preparer.callback([{ isIntersecting: true, intersectionRatio: 0.1 } as IntersectionObserverEntry], {} as IntersectionObserver));
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});
const player = () => document.querySelector<HTMLElement>("[data-video-player]")!;
const element = () => document.querySelector("video");

beforeEach(() => {
  instances.length = 0;
  observers = [];
  pausedFlag = true;
  play.mockClear();
  FakeHls.isSupported.mockReturnValue(true);
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: function (this: HTMLMediaElement) {
      pausedFlag = false;
      this.dispatchEvent(new Event("play"));
      return play();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => (pausedFlag = true) });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => pausedFlag });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options });
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetStreamSupportForTests();
});

describe("VID-08 — détection des capacités du navigateur", () => {
  const scope = (canPlay: string, extra: Record<string, unknown> = {}) => ({
    document: { createElement: () => ({ canPlayType: (type: string) => (type === HLS ? canPlay : "") }) },
    ...extra,
  });

  it("HLS natif (Safari iPhone et Mac) : natif, même si MSE existe", () => {
    expect(detectStreamSupport(scope("maybe", { MediaSource: { isTypeSupported: () => true } }))).toBe("native");
    expect(detectStreamSupport(scope("probably"))).toBe("native");
  });

  it("sans HLS natif, avec Media Source Extensions (Chrome, Firefox, Edge, Android) : hls.js", () => {
    expect(detectStreamSupport(scope("", { MediaSource: { isTypeSupported: () => true } }))).toBe("mse");
    expect(detectStreamSupport(scope("", { ManagedMediaSource: { isTypeSupported: () => true } }))).toBe("mse");
  });

  it("ni l'un ni l'autre, ou MSE sans H.264 : incompatible", () => {
    expect(detectStreamSupport(scope(""))).toBe("none");
    expect(detectStreamSupport(scope("", { MediaSource: { isTypeSupported: () => false } }))).toBe("none");
    expect(detectStreamSupport({})).toBe("none");
  });

  it("expiration du jeton : marge de 10 s, adresses locales jamais expirées", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(isStreamExpired({ kind: "stream", url: "u", expiresAt: "2026-11-25T12:00:05Z" }, now)).toBe(true);
    expect(isStreamExpired({ kind: "stream", url: "u", expiresAt: "2026-11-25T13:00:00Z" }, now)).toBe(false);
    expect(isStreamExpired({ kind: "stream", url: "u" }, now)).toBe(false);
    expect(isStreamExpired({ kind: "local", url: "blob:x" }, now)).toBe(false);
  });
});

describe("VID-08 — lecture HLS native (Safari)", () => {
  it("l'adresse signée est posée sur <video>, sans préchargement ni lecture automatique ; hls.js n'est jamais créé", async () => {
    browser("native");
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8?token=t")]} skinVariant="light" language="fr" />);
    await flush();
    expect(element()!.getAttribute("src")).toBe("https://stream.example/a.m3u8?token=t");
    expect(element()!.getAttribute("preload")).toBe("none");
    expect(element()!.hasAttribute("autoplay")).toBe(false);
    expect(player().getAttribute("data-stream-support")).toBe("native");
    expect(play).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  it("erreur du lecteur natif après expiration du jeton : « lien expiré », avec « Recharger la vidéo » si l'hôte sait renouveler", async () => {
    browser("native");
    const renew = vi.fn();
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8", { expiresAt: "2000-01-01T00:00:00Z" })]} skinVariant="light" language="fr" onSourcesExpired={renew} />);
    fireEvent.error(element()!);
    expect(player().getAttribute("data-state")).toBe("expired");
    expect(screen.getByText(texts.expired)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: texts.reload }));
    expect(renew).toHaveBeenCalledTimes(1);
  });
});

describe("VID-08 — lecture avec hls.js (Chrome, Firefox, Edge, Android)", () => {
  it("hls.js n'est préparé qu'à l'approche de l'écran, sans télécharger un seul segment avant la demande de lecture", async () => {
    browser("mse");
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8?token=t")]} skinVariant="light" language="fr" />);
    await flush();
    expect(instances).toHaveLength(0);
    expect(element()!.hasAttribute("src")).toBe(false);

    nearViewport();
    await flush();
    expect(instances).toHaveLength(1);
    const hls = instances[0]!;
    expect(hls.config).toMatchObject({ autoStartLoad: false, capLevelToPlayerSize: true });
    expect(hls.attachMedia).toHaveBeenCalledWith(element());
    expect(hls.loadSource).toHaveBeenCalledWith("https://stream.example/a.m3u8?token=t");
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();

    // Le visiteur lance la lecture : alors seulement, les segments sont demandés.
    act(() => void element()!.play());
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
    act(() => element()!.dispatchEvent(new Event("play")));
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
  });

  it("changement de souvenir : l'ancien lecteur hls.js est détruit, le nouveau suit l'adresse choisie, la lecture démarre sur ce clic", async () => {
    browser("mse");
    const items = [stream("a", "https://stream.example/a.m3u8"), stream("b", "https://stream.example/b.m3u8")];
    render(<VideoHommageV1 items={items} skinVariant="light" language="fr" />);
    nearViewport();
    await flush();
    const first = instances[0]!;
    fireEvent.click(screen.getByRole("button", { name: /Souvenir 2/ }));
    await flush();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    nearViewport();
    await flush();
    const second = instances.at(-1)!;
    expect(second).not.toBe(first);
    expect(second.loadSource).toHaveBeenCalledWith("https://stream.example/b.m3u8");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("refus 403 de l'hébergeur (jeton expiré) : chargement arrêté, « lien expiré » ; de nouvelles adresses relancent la lecture", async () => {
    browser("mse");
    const renew = vi.fn();
    const { rerender } = render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8?token=old")]} skinVariant="light" language="fr" onSourcesExpired={renew} />);
    nearViewport();
    await flush();
    const hls = instances[0]!;
    act(() => hls.fail({ fatal: true, type: "networkError", response: { code: 403 } }));
    expect(hls.stopLoad).toHaveBeenCalled();
    expect(player().getAttribute("data-state")).toBe("expired");
    expect(element()).toBeNull();
    expect(hls.destroy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: texts.reload }));
    expect(renew).toHaveBeenCalledTimes(1);

    rerender(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8?token=new")]} skinVariant="light" language="fr" onSourcesExpired={renew} />);
    expect(player().getAttribute("data-state")).toBe("ready");
    nearViewport();
    await flush();
    expect(instances.at(-1)!.loadSource).toHaveBeenCalledWith("https://stream.example/a.m3u8?token=new");
  });

  it("jeton déjà expiré au moment de la lecture : aucune requête, pause, « lien expiré »", async () => {
    browser("mse");
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8", { expiresAt: "2000-01-01T00:00:00Z" })]} skinVariant="light" language="fr" />);
    nearViewport();
    await flush();
    const hls = instances[0]!;
    act(() => void element()!.play());
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(pausedFlag).toBe(true);
    expect(player().getAttribute("data-state")).toBe("expired");
    // Sans hôte capable de renouveler : pas de bouton trompeur.
    expect(screen.queryByRole("button", { name: texts.reload })).toBeNull();
  });

  it("erreurs : non fatale ignorée ; erreur média récupérée une fois, puis message ; réseau → message d'erreur", async () => {
    browser("mse");
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8")]} skinVariant="light" language="fr" />);
    nearViewport();
    await flush();
    const hls = instances[0]!;
    act(() => hls.fail({ fatal: false, type: "networkError" }));
    expect(player().getAttribute("data-state")).toBe("ready");
    act(() => hls.fail({ fatal: true, type: "mediaError" }));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(player().getAttribute("data-state")).toBe("ready");
    act(() => hls.fail({ fatal: true, type: "mediaError" }));
    expect(player().getAttribute("data-state")).toBe("error");
    expect(screen.getByText(texts.error)).toBeTruthy();
  });

  it("hls.js présent mais refuse ce navigateur : message « navigateur incompatible »", async () => {
    browser("mse");
    FakeHls.isSupported.mockReturnValue(false);
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8")]} skinVariant="light" language="fr" />);
    nearViewport();
    await flush();
    expect(player().getAttribute("data-state")).toBe("unsupported");
    expect(screen.getByText(texts.unsupported)).toBeTruthy();
  });

  it("nettoyage : la rubrique retirée de la page détruit hls.js et ses tampons", async () => {
    browser("mse");
    const { unmount } = render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8")]} skinVariant="light" language="fr" />);
    nearViewport();
    await flush();
    unmount();
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("VID-08 — navigateur incompatible", () => {
  it("ni HLS natif ni MSE : message clair, aucun lecteur vide, hls.js jamais créé", async () => {
    browser("none");
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8")]} skinVariant="light" language="fr" />);
    await flush();
    expect(element()).toBeNull();
    expect(player().getAttribute("data-state")).toBe("unsupported");
    expect(screen.getByText(texts.unsupported)).toBeTruthy();
    expect(instances).toHaveLength(0);
  });

  it("MP4 de secours fourni par le serveur (option payante, jamais automatique) : utilisé seulement dans ce cas", async () => {
    browser("none");
    render(<VideoHommageV1 items={[stream("a", "https://stream.example/a.m3u8", { fallbackUrl: "https://stream.example/720p.mp4" })]} skinVariant="light" language="fr" />);
    await flush();
    expect(element()!.getAttribute("src")).toBe("https://stream.example/720p.mp4");
  });
});

describe("VID-08 — vidéos locales (préparation dans le Builder)", () => {
  it("une vidéo locale ne passe jamais par hls.js, quel que soit le navigateur", async () => {
    browser("mse");
    render(<VideoHommageV1 items={[{ id: "l", title: null, durationSeconds: 5, status: "ready", source: { kind: "local", url: "blob:local/x" } }]} skinVariant="light" language="fr" />);
    await flush();
    expect(element()!.getAttribute("src")).toBe("blob:local/x");
    expect(instances).toHaveLength(0);
  });
});
