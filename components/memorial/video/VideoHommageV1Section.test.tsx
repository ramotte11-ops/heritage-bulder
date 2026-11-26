// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VideoHostingLoad } from "@/lib/memorial/video/hosting/hosted-video-types";

/**
 * VID-08 — la rubrique vidéo assemblée, avec ses deux hôtes : la page
 * publique (lectures signées par le serveur) et l'aperçu du Builder (fichiers
 * locaux, vidéos hébergées de la famille). Sans hôte : rien n'est dessiné.
 */

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/font/google", () => ({
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
}));

const { VideoHommageV1Section } = await import("./VideoHommageV1Section");
const { VideoPreviewProvider } = await import("./video-preview-host");
const { createLocalVideoRegistry } = await import("@/lib/memorial/video/local-video-registry");
const { resetStreamSupportForTests } = await import("./use-stream-playback");
const { VIDEO_HOMMAGE_TEXTS } = await import("./texts");

const texts = VIDEO_HOMMAGE_TEXTS.fr;
const ITEMS = [
  { id: "v-a", title: "Mariage", durationSeconds: 40 },
  { id: "v-b", title: null, durationSeconds: 12 },
];
const signed = { hlsUrl: "https://stream.mux.com/a.m3u8?token=t", posterUrl: "https://image.mux.com/a.webp?token=t", mp4Url: null, expiresAt: "2000-01-01T00:00:00.000Z", durationSeconds: 39.9 };

beforeEach(() => {
  // Navigateur à HLS natif : l'adresse est posée directement.
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((type) => (type === "application/vnd.apple.mpegurl" ? "maybe" : ""));
  resetStreamSupportForTests();
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

const player = () => document.querySelector("[data-video-player]");

describe("VID-08 — sans hôte", () => {
  it("ni page publique ni aperçu : rien n'est dessiné (jamais de lecteur vide)", () => {
    const { container } = render(<VideoHommageV1Section skinVariant="light" language="fr" items={ITEMS} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("VID-08 — page publique", () => {
  it("seules les vidéos signées par le serveur sont montrées, avec le titre et le sous-titre officiels", () => {
    render(<VideoHommageV1Section skinVariant="dark" language="fr" items={ITEMS} publicPlayback={{ "v-a": signed }} />);
    expect(screen.getByRole("heading", { name: "Des instants pour se souvenir" })).toBeTruthy();
    expect(screen.getByText("Quelques instants précieux à revivre et à partager.")).toBeTruthy();
    expect(document.querySelector("[data-video-hommage]")!.getAttribute("data-count")).toBe("1");
    expect(document.querySelector("[data-video-hommage]")!.getAttribute("data-variant")).toBe("light");
    expect(document.querySelector("video")!.getAttribute("src")).toBe("https://stream.mux.com/a.m3u8?token=t");
  });

  it("aucune lecture signée : rien n'est dessiné", () => {
    const { container } = render(<VideoHommageV1Section skinVariant="light" language="fr" items={ITEMS} publicPlayback={{}} />);
    expect(container.innerHTML).toBe("");
  });

  it("jeton expiré pendant une longue visite : « Recharger la vidéo » demande une nouvelle page au serveur", () => {
    render(<VideoHommageV1Section skinVariant="light" language="fr" items={ITEMS} publicPlayback={{ "v-a": signed }} />);
    fireEvent.error(document.querySelector("video")!);
    fireEvent.click(screen.getByRole("button", { name: texts.reload }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("VID-08 — aperçu du Builder", () => {
  it("invité (aucune action serveur) : les fichiers de la session sont lus localement ; les autres sont « à sélectionner de nouveau »", async () => {
    const registry = createLocalVideoRegistry();
    registry.set("v-a", { url: "blob:local/a", metadata: { durationSeconds: 40, width: 1, height: 1, playable: true }, release: vi.fn() });
    render(
      <VideoPreviewProvider registry={registry}>
        <VideoHommageV1Section skinVariant="light" language="fr" items={ITEMS} />
      </VideoPreviewProvider>,
    );
    expect(document.querySelector("video")!.getAttribute("src")).toBe("blob:local/a");
    fireEvent.click(screen.getByRole("button", { name: /Souvenir 2/ }));
    expect(player()!.getAttribute("data-state")).toBe("local-unavailable");
    expect(screen.getByText(texts.localUnavailable)).toBeTruthy();
    // Sans renouvellement possible, aucun bouton « Recharger ».
    expect(screen.queryByRole("button", { name: texts.reload })).toBeNull();
  });

  it("connecté : la vidéo hébergée prête de la famille est lue quand le fichier n'est plus sur l'appareil ; « Recharger » relit le serveur", async () => {
    const load = vi.fn(async (): Promise<VideoHostingLoad> => ({
      status: "available",
      videos: [
        {
          videoId: "11111111-1111-4111-8111-111111111111",
          draftVideoId: "v-a",
          state: "ready",
          durationSeconds: 39.5,
          durationVerified: true,
          failure: null,
          uploadExpiresAt: null,
          playback: { hlsUrl: "https://stream.mux.com/owner.m3u8?token=o", posterUrl: "https://image.mux.com/owner.webp", mp4Url: null, expiresAt: "2000-01-01T00:00:00.000Z" },
        },
        { videoId: "22222222-2222-4222-8222-222222222222", draftVideoId: "v-b", state: "processing", durationSeconds: 12, durationVerified: false, failure: null, uploadExpiresAt: null, playback: null },
      ],
    }));
    render(
      <VideoPreviewProvider load={load} registry={createLocalVideoRegistry()}>
        <VideoHommageV1Section skinVariant="light" language="fr" items={ITEMS} />
      </VideoPreviewProvider>,
    );
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.querySelector("video")!.getAttribute("src")).toBe("https://stream.mux.com/owner.m3u8?token=o");
    fireEvent.error(document.querySelector("video")!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: texts.reload }));
    });
    expect(load).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /Souvenir 2/ }));
    expect(player()!.getAttribute("data-state")).toBe("preparing");
  });

  it("session expirée côté serveur : l'aperçu garde ce qui est local, sans erreur", async () => {
    const registry = createLocalVideoRegistry();
    registry.set("v-b", { url: "blob:local/b", metadata: { durationSeconds: 12, width: 1, height: 1, playable: true }, release: vi.fn() });
    render(
      <VideoPreviewProvider load={async () => Promise.reject(new Error("Video hosting refused."))} registry={registry}>
        <VideoHommageV1Section skinVariant="light" language="fr" items={ITEMS} />
      </VideoPreviewProvider>,
    );
    await act(async () => {});
    expect(player()!.getAttribute("data-state")).toBe("local-unavailable");
    fireEvent.click(screen.getByRole("button", { name: /Souvenir 2/ }));
    expect(document.querySelector("video")!.getAttribute("src")).toBe("blob:local/b");
  });
});
