// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { isVideoFullscreen, useFullscreenOrientation } from "./use-fullscreen-orientation";
import { usePauseWhenHidden } from "./use-pause-when-hidden";

let fullscreenElement: Element | null = null;
const lock = vi.fn((orientation: string) => (orientation === "landscape" ? Promise.resolve() : Promise.reject(new Error("refus"))));
const unlock = vi.fn();
let observerCallback: IntersectionObserverCallback | null = null;

function Harness({ width, height }: { width: number; height: number }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useFullscreenOrientation(video);
  usePauseWhenHidden(video);
  return (
    <video
      ref={(element) => {
        if (element !== null) {
          Object.defineProperty(element, "videoWidth", { configurable: true, value: width });
          Object.defineProperty(element, "videoHeight", { configurable: true, value: height });
        }
        setVideo(element);
      }}
      data-testid="video"
    />
  );
}

async function enterFullscreen(element: Element | null) {
  fullscreenElement = element;
  await act(async () => {
    document.dispatchEvent(new Event("fullscreenchange"));
    await Promise.resolve();
  });
}

beforeEach(() => {
  fullscreenElement = null;
  lock.mockClear();
  unlock.mockClear();
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  Object.defineProperty(screen, "orientation", { configurable: true, value: { lock, unlock, type: "portrait-primary" } });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("plein écran du lecteur", () => {
  it("vidéo horizontale : paysage en plein écran, orientation libérée à la sortie", async () => {
    const { getByTestId } = render(<Harness width={1920} height={1080} />);
    await enterFullscreen(getByTestId("video"));
    expect(lock).toHaveBeenCalledWith("landscape");
    await enterFullscreen(null);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it("vidéo verticale : jamais forcée en paysage", async () => {
    const { getByTestId } = render(<Harness width={1080} height={1920} />);
    await enterFullscreen(getByTestId("video"));
    expect(lock).not.toHaveBeenCalled();
  });

  it("sans verrouillage possible (iPhone, ordinateur) : aucun forçage, aucune erreur", async () => {
    Object.defineProperty(screen, "orientation", { configurable: true, value: { type: "portrait-primary" } });
    const { getByTestId } = render(<Harness width={1920} height={1080} />);
    await enterFullscreen(getByTestId("video"));
    await enterFullscreen(null);
    expect(lock).not.toHaveBeenCalled();
  });

  it("refus du navigateur : rien n'est forcé, rien n'est libéré", async () => {
    lock.mockImplementationOnce(() => Promise.reject(new Error("refus")));
    const { getByTestId } = render(<Harness width={1920} height={1080} />);
    await enterFullscreen(getByTestId("video"));
    await enterFullscreen(null);
    expect(unlock).not.toHaveBeenCalled();
  });

  it("plein écran iPhone (lecteur du système) reconnu", () => {
    const video = document.createElement("video");
    expect(isVideoFullscreen(video)).toBe(false);
    Object.defineProperty(video, "webkitDisplayingFullscreen", { configurable: true, value: true });
    expect(isVideoFullscreen(video)).toBe(true);
  });

  it("en plein écran, la position du lecteur dans la page ne met pas en pause", async () => {
    const pause = vi.fn();
    const { getByTestId } = render(<Harness width={1920} height={1080} />);
    const video = getByTestId("video") as HTMLVideoElement;
    Object.defineProperty(video, "paused", { configurable: true, get: () => false });
    video.pause = pause;
    await enterFullscreen(video);
    act(() => observerCallback!([{ intersectionRatio: 0, target: video } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(pause).not.toHaveBeenCalled();
    await enterFullscreen(null);
    act(() => observerCallback!([{ intersectionRatio: 0, target: video } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
