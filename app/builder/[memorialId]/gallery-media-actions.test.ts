import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Dette D1 — the Gallery's three Server Actions. Same discipline as
 * media-actions.test.ts: proves the wiring (session actor per call, the
 * real primitives, purpose hard-coded to "gallery", the saved-draft guard
 * for retire). The primitives' own behaviour is proven in lib/media/*.test.ts
 * and lib/memorial/gallery-media.test.ts.
 */

const { getHeritageActor } = vi.hoisted(() => ({ getHeritageActor: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ getHeritageActor }));

const { createServerMediaEngineDeps } = vi.hoisted(() => ({ createServerMediaEngineDeps: vi.fn().mockReturnValue({ fake: "media-engine-deps" }) }));
vi.mock("@/lib/media/server-media-engine", () => ({ createServerMediaEngineDeps }));

const { reserveMediaUpload, finalizeMediaUpload } = vi.hoisted(() => ({ reserveMediaUpload: vi.fn(), finalizeMediaUpload: vi.fn() }));
vi.mock("@/lib/media/upload-lifecycle", () => ({ reserveMediaUpload, finalizeMediaUpload }));

const { retireGalleryMedia } = vi.hoisted(() => ({ retireGalleryMedia: vi.fn() }));
vi.mock("@/lib/memorial/gallery-media", () => ({ retireGalleryMedia }));

const { createServerSupabaseClient } = vi.hoisted(() => ({ createServerSupabaseClient: vi.fn().mockResolvedValue({ fake: "session-client" }) }));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { SupabaseDraftRepository } = vi.hoisted(() => ({
  SupabaseDraftRepository: vi.fn(function (this: { client: unknown }, client: unknown) {
    this.client = client;
  }),
}));
vi.mock("@/lib/adapters/supabase/draft-repository", () => ({ SupabaseDraftRepository }));

const { reserveGalleryPhotoUploadAction, finalizeGalleryPhotoUploadAction, retireGalleryPhotoAction } = await import("./gallery-media-actions");

const MEMORIAL_ID = "memorial-abc";
const OWNER_ACTOR = { audience: "owner", identity: { id: "auth-a" }, owner: { id: "owner-a" }, isHeritageAdmin: false };

beforeEach(() => {
  getHeritageActor.mockReset();
  reserveMediaUpload.mockReset();
  finalizeMediaUpload.mockReset();
  retireGalleryMedia.mockReset();
  createServerMediaEngineDeps.mockClear();
  SupabaseDraftRepository.mockClear();
});

describe("reserveGalleryPhotoUploadAction", () => {
  it("resolves the session actor and reserves with purpose hard-coded to 'gallery'", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    reserveMediaUpload.mockResolvedValue({ ok: true, value: { mediaId: "m1" } });
    await reserveGalleryPhotoUploadAction(MEMORIAL_ID, "image/jpeg");
    expect(reserveMediaUpload).toHaveBeenCalledExactlyOnceWith({ fake: "media-engine-deps" }, OWNER_ACTOR, { memorialId: MEMORIAL_ID, purpose: "gallery", declaredMimeType: "image/jpeg" });
  });

  it("re-resolves the actor on every call and propagates a refusal verbatim", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    reserveMediaUpload.mockResolvedValue({ ok: false, code: "access_denied" });
    await reserveGalleryPhotoUploadAction(MEMORIAL_ID, "image/jpeg");
    await expect(reserveGalleryPhotoUploadAction(MEMORIAL_ID, "image/jpeg")).resolves.toEqual({ ok: false, code: "access_denied" });
    expect(getHeritageActor).toHaveBeenCalledTimes(2);
  });
});

describe("finalizeGalleryPhotoUploadAction", () => {
  it("finalizes with expectedPurpose 'gallery' (a Hero media is refused by the primitive)", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    finalizeMediaUpload.mockResolvedValue({ ok: true, value: { id: "m1", status: "ready", width: 1200, height: 1600 } });
    const result = await finalizeGalleryPhotoUploadAction(MEMORIAL_ID, "m1");
    expect(finalizeMediaUpload).toHaveBeenCalledExactlyOnceWith({ fake: "media-engine-deps" }, OWNER_ACTOR, { memorialId: MEMORIAL_ID, mediaId: "m1", expectedPurpose: "gallery" });
    expect(result).toEqual({ ok: true, value: { id: "m1", status: "ready", width: 1200, height: 1600 } });
  });

  it("propagates invalid_file (e.g. dimensions that cannot be established) exactly", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    finalizeMediaUpload.mockResolvedValue({ ok: false, code: "invalid_file" });
    await expect(finalizeGalleryPhotoUploadAction(MEMORIAL_ID, "m1")).resolves.toEqual({ ok: false, code: "invalid_file" });
  });
});

describe("retireGalleryPhotoAction", () => {
  it("retires through retireGalleryMedia, with the session-scoped draft repository (the saved-draft guard)", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    retireGalleryMedia.mockResolvedValue({ ok: true, value: { removed: false, retained: "stillReferenced" } });
    const result = await retireGalleryPhotoAction(MEMORIAL_ID, "m1");
    expect(createServerSupabaseClient).toHaveBeenCalled();
    expect(SupabaseDraftRepository).toHaveBeenCalledWith({ fake: "session-client" });
    const [deps, actor, input] = retireGalleryMedia.mock.calls[0];
    expect(deps.mediaEngine).toEqual({ fake: "media-engine-deps" });
    expect(deps.draftRepository).toBeInstanceOf(SupabaseDraftRepository);
    expect(actor).toBe(OWNER_ACTOR);
    expect(input).toEqual({ memorialId: MEMORIAL_ID, mediaId: "m1" });
    expect(result).toEqual({ ok: true, value: { removed: false, retained: "stillReferenced" } });
  });
});

describe("gallery-media-actions.ts — the shape of the boundary", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "gallery-media-actions.ts"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("is a real Server Action file", () => {
    expect(SOURCE.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("hard-codes purpose 'gallery' only — never 'hero', never a caller-supplied purpose", () => {
    expect(CODE).toMatch(/purpose:\s*"gallery"/);
    expect(CODE).toMatch(/expectedPurpose:\s*"gallery"/);
    expect(CODE).not.toMatch(/"hero"/);
    for (const name of ["reserveGalleryPhotoUploadAction", "finalizeGalleryPhotoUploadAction", "retireGalleryPhotoAction"]) {
      const signature = CODE.match(new RegExp(`export async function ${name}\\(([\\s\\S]*?)\\):`));
      expect(signature, name).not.toBeNull();
      expect((signature as RegExpMatchArray)[1], name).not.toMatch(/purpose|width|height|content/);
    }
  });

  it("deletes only through the guarded retire (no direct deleteMedia), with no service-role client and no media adapter", () => {
    expect(CODE).not.toMatch(/deleteMedia|removeByPrefix|deleteById/);
    expect(CODE).not.toMatch(/service-role-client/);
    expect(CODE).not.toMatch(/adapters\/supabase\/media/);
  });

  it("writes no draft content itself — order and captions go through the existing autosave", () => {
    expect(CODE).not.toMatch(/saveDraftContent|saveDraftAction/);
  });
});
