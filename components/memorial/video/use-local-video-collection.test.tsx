// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const released: string[] = [];
let counter = 0;
const durations: (number | null)[] = [];

vi.mock("@/lib/memorial/video/local-video", () => ({
  isVideoFile: (file: File) => file.type.startsWith("video/"),
  openLocalVideo: async () => {
    counter += 1;
    const url = `blob:heritage/${counter}`;
    const durationSeconds = durations.shift() ?? null;
    return {
      url,
      metadata: { durationSeconds, width: durationSeconds === null ? null : 1920, height: 1080, playable: durationSeconds !== null },
      release: () => released.push(url),
    };
  },
}));

const { useLocalVideoCollection } = await import("./use-local-video-collection");

const file = (type = "video/mp4") => new File(["x"], "souvenir.mp4", { type });

beforeEach(() => {
  released.length = 0;
  durations.length = 0;
  counter = 0;
});
afterEach(cleanup);

describe("démonstration locale", () => {
  it("ajoute des vidéos jusqu'à 600 s et refuse au-delà, sans garder le fichier refusé", async () => {
    const { result } = renderHook(() => useLocalVideoCollection());
    durations.push(420, 180, 1);
    await act(async () => expect((await result.current.add(file())).ok).toBe(true));
    await act(async () => expect((await result.current.add(file())).ok).toBe(true));
    let refused: unknown;
    await act(async () => {
      refused = await result.current.add(file());
    });
    expect(refused).toEqual({ ok: false, reason: "too-long", durationSeconds: 1, remainingSeconds: 0 });
    expect(result.current.items).toHaveLength(2);
    expect(released).toEqual(["blob:heritage/3"]);
  });

  it("refuse un fichier qui n'est pas une vidéo, et une vidéo illisible", async () => {
    const { result } = renderHook(() => useLocalVideoCollection());
    await act(async () => expect(await result.current.add(file("image/jpeg"))).toEqual({ ok: false, reason: "not-a-video" }));
    durations.push(null);
    await act(async () => expect(await result.current.add(file())).toEqual({ ok: false, reason: "unreadable" }));
    expect(result.current.items).toHaveLength(0);
  });

  it("remplace à la même position, garde le titre, libère l'ancien fichier", async () => {
    const { result } = renderHook(() => useLocalVideoCollection());
    durations.push(300, 200, 400);
    await act(async () => {
      await result.current.add(file());
      await result.current.add(file());
    });
    const firstId = result.current.items[0]!.id;
    act(() => result.current.setTitle(firstId, "À la plage"));
    await act(async () => expect((await result.current.replace(firstId, file())).ok).toBe(true));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]!.title).toBe("À la plage");
    expect(result.current.items[0]!.durationSeconds).toBe(400);
    expect(released).toEqual(["blob:heritage/1"]);
  });

  it("retirer libère le fichier ; tout est libéré quand la rubrique disparaît", async () => {
    const { result, unmount } = renderHook(() => useLocalVideoCollection());
    durations.push(10, 20);
    await act(async () => {
      await result.current.add(file());
      await result.current.add(file());
    });
    act(() => result.current.remove(result.current.items[0]!.id));
    expect(released).toEqual(["blob:heritage/1"]);
    unmount();
    expect(released).toEqual(["blob:heritage/1", "blob:heritage/2"]);
  });

  it("titres limités à 30 caractères pendant la saisie, ordre modifiable", async () => {
    const { result } = renderHook(() => useLocalVideoCollection());
    durations.push(10, 20);
    await act(async () => {
      await result.current.add(file());
      await result.current.add(file());
    });
    const [a, b] = result.current.items;
    act(() => result.current.setTitle(a!.id, "x".repeat(45)));
    expect(result.current.items[0]!.title).toHaveLength(30);
    act(() => result.current.move(1, 0));
    expect(result.current.items.map((entry) => entry.id)).toEqual([b!.id, a!.id]);
  });
});
