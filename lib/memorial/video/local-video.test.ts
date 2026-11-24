import { describe, expect, it, vi } from "vitest";
import { isVideoFile, openLocalVideo, type LocalVideoEnvironment } from "./local-video";

/** Élément vidéo minimal : écoute des événements, `src`, dimensions. */
function fakeVideo(outcome: { duration?: number; width?: number; height?: number; error?: boolean; silent?: boolean }) {
  const listeners = new Map<string, () => void>();
  const element = {
    preload: "",
    muted: false,
    duration: outcome.duration ?? Number.NaN,
    videoWidth: outcome.width ?? 0,
    videoHeight: outcome.height ?? 0,
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    set src(_value: string) {
      if (outcome.silent) return;
      queueMicrotask(() => listeners.get(outcome.error ? "error" : "loadedmetadata")?.());
    },
  };
  return element as unknown as HTMLVideoElement;
}

function environment(video: HTMLVideoElement, timeoutMs = 1000): LocalVideoEnvironment & { revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    createObjectURL: () => "blob:heritage/1",
    revokeObjectURL: (url) => revoked.push(url),
    createVideoElement: () => video,
    timeoutMs,
  };
}

describe("vidéos de démonstration locales", () => {
  it("reconnaît une vidéo par son type", () => {
    expect(isVideoFile({ type: "video/quicktime" })).toBe(true);
    expect(isVideoFile({ type: "video/mp4" })).toBe(true);
    expect(isVideoFile({ type: "image/jpeg" })).toBe(false);
  });

  it("lit la durée et les dimensions, sans aucune requête réseau", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = environment(fakeVideo({ duration: 268.4, width: 1080, height: 1920 }));
    const handle = await openLocalVideo(new Blob(["x"], { type: "video/mp4" }), env);
    expect(handle.url).toBe("blob:heritage/1");
    expect(handle.metadata).toEqual({ durationSeconds: 268.4, width: 1080, height: 1920, playable: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("un fichier illisible n'est pas une erreur : aperçu impossible, durée inconnue", async () => {
    const env = environment(fakeVideo({ error: true }));
    const handle = await openLocalVideo(new Blob(["x"]), env);
    expect(handle.metadata).toEqual({ durationSeconds: null, width: null, height: null, playable: false });
  });

  it("abandonne après le délai si le navigateur ne répond pas", async () => {
    vi.useFakeTimers();
    const env = environment(fakeVideo({ silent: true }), 50);
    const pending = openLocalVideo(new Blob(["x"]), env);
    await vi.advanceTimersByTimeAsync(60);
    expect((await pending).metadata.playable).toBe(false);
    vi.useRealTimers();
  });

  it("libère l'adresse locale une seule fois", async () => {
    const env = environment(fakeVideo({ duration: 10, width: 640, height: 360 }));
    const handle = await openLocalVideo(new Blob(["x"]), env);
    handle.release();
    handle.release();
    expect(env.revoked).toEqual(["blob:heritage/1"]);
  });
});
