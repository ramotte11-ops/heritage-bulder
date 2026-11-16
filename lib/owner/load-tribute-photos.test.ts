import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createMediaReadUrl } = vi.hoisted(() => ({ createMediaReadUrl: vi.fn() }));
vi.mock("@/lib/media/read-media", () => ({ createMediaReadUrl }));

const { loadTributePhotos } = await import("./load-tribute-photos");
import type { FamilyTribute } from "./family-space";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { MediaEngineDeps } from "@/lib/media/media-engine";

const deps = {} as MediaEngineDeps;
const actor = { audience: "owner" } as unknown as HeritageActor;

function tribute(id: string, photo: FamilyTribute["photo"]): FamilyTribute {
  return { id, displayName: id, language: null, state: "in_preparation", years: null, photo, publicSlug: null, freeDeadlines: null };
}

beforeEach(() => createMediaReadUrl.mockReset());

describe("loadTributePhotos — the Hero photo, reused through the Builder's read path", () => {
  it("asks a signed URL only for tributes that have a photo, each for its OWN memorial and media", async () => {
    createMediaReadUrl.mockResolvedValue({ ok: true, value: { media: { width: 800, height: 1000 }, readUrl: "signed", expiresInSeconds: 300 } });

    const photos = await loadTributePhotos(deps, actor, [tribute("a", { mediaId: "m-a", crop: null }), tribute("b", null)]);

    expect(createMediaReadUrl).toHaveBeenCalledTimes(1);
    expect(createMediaReadUrl).toHaveBeenCalledWith(deps, actor, { memorialId: "a", mediaId: "m-a" });
    expect(photos.has("b")).toBe(false);
    // 4:5 source in a 4:5 window, neutral crop: exactly the window.
    expect(photos.get("a")).toEqual({ readUrl: "signed", frame: { leftPercent: 0, topPercent: 0, widthPercent: 100, heightPercent: 100 } });
  });

  it("applies the crop the family confirmed, with the Hero's own geometry", async () => {
    createMediaReadUrl.mockResolvedValue({ ok: true, value: { media: { width: 1000, height: 1000 }, readUrl: "signed", expiresInSeconds: 300 } });

    const photos = await loadTributePhotos(deps, actor, [tribute("a", { mediaId: "m", crop: { focalX: 0, focalY: 0.5, zoom: 2 } })]);

    expect(photos.get("a")?.frame).toEqual({ leftPercent: 0, topPercent: -50, widthPercent: 250, heightPercent: 200 });
  });

  it("has no frame when the stored dimensions are unknown (the card then covers its window)", async () => {
    createMediaReadUrl.mockResolvedValue({ ok: true, value: { media: { width: null, height: null }, readUrl: "signed", expiresInSeconds: 300 } });
    expect((await loadTributePhotos(deps, actor, [tribute("a", { mediaId: "m", crop: null })])).get("a")).toEqual({ readUrl: "signed", frame: null });
  });

  it("a refused or failing photo is absent — never an error, never another tribute's photo", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createMediaReadUrl
      .mockResolvedValueOnce({ ok: false, code: "access_denied" })
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValueOnce({ ok: true, value: { media: { width: 4, height: 5 }, readUrl: "signed-c", expiresInSeconds: 300 } });

    const photos = await loadTributePhotos(deps, actor, [
      tribute("a", { mediaId: "m-a", crop: null }), tribute("b", { mediaId: "m-b", crop: null }), tribute("c", { mediaId: "m-c", crop: null }),
    ]);

    expect([...photos.keys()]).toEqual(["c"]);
    expect(photos.get("c")?.readUrl).toBe("signed-c");
    error.mockRestore();
  });
});
