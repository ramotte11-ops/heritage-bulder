import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Mission 033 — T06's three Server Actions. Same discipline as
 * actions.test.ts: proves this file wires `getHeritageActor()` and the
 * real media engine primitives correctly, in the right order, and never
 * builds a second ownership check of its own. The primitives'
 * (`reserveMediaUpload`/`finalizeMediaUpload`/`replaceMedia`) own
 * behaviour — including every ownership/cross-owner/format/size rule —
 * is already exhaustively proven in lib/media/*.test.ts; this file does
 * not re-prove it.
 */

const { getHeritageActor } = vi.hoisted(() => ({ getHeritageActor: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ getHeritageActor }));

const { createServerMediaEngineDeps } = vi.hoisted(() => ({
  createServerMediaEngineDeps: vi.fn().mockReturnValue({ fake: "media-engine-deps" }),
}));
vi.mock("@/lib/media/server-media-engine", () => ({ createServerMediaEngineDeps }));

const { reserveMediaUpload, finalizeMediaUpload } = vi.hoisted(() => ({
  reserveMediaUpload: vi.fn(),
  finalizeMediaUpload: vi.fn(),
}));
vi.mock("@/lib/media/upload-lifecycle", () => ({ reserveMediaUpload, finalizeMediaUpload }));

const { replaceMedia } = vi.hoisted(() => ({ replaceMedia: vi.fn() }));
vi.mock("@/lib/media/replace-media", () => ({ replaceMedia }));

const {
  reserveHeroPhotoUploadAction,
  finalizeHeroPhotoUploadAction,
  replaceHeroPhotoUploadAction,
} = await import("./media-actions");

const MEMORIAL_ID = "memorial-abc";
const OWNER_ACTOR = {
  audience: "owner",
  identity: { id: "auth-a", email: "a@example.test", app_metadata: {} },
  owner: { id: "owner-a", authUserId: "auth-a", email: "a@example.test", createdAt: "", updatedAt: "" },
  isHeritageAdmin: false,
};

beforeEach(() => {
  getHeritageActor.mockReset();
  createServerMediaEngineDeps.mockClear();
  reserveMediaUpload.mockReset();
  finalizeMediaUpload.mockReset();
  replaceMedia.mockReset();
});

describe("reserveHeroPhotoUploadAction", () => {
  it("resolves the real actor from the session and passes it, with purpose hard-coded to 'hero'", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    reserveMediaUpload.mockResolvedValue({ ok: true, value: { mediaId: "m1" } });

    await reserveHeroPhotoUploadAction(MEMORIAL_ID, "image/jpeg");

    expect(getHeritageActor).toHaveBeenCalledOnce();
    expect(reserveMediaUpload).toHaveBeenCalledExactlyOnceWith(
      { fake: "media-engine-deps" },
      OWNER_ACTOR,
      { memorialId: MEMORIAL_ID, purpose: "hero", declaredMimeType: "image/jpeg" },
    );
  });

  it("re-resolves the actor on every single call — never once per rendered page", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    reserveMediaUpload.mockResolvedValue({ ok: true, value: { mediaId: "m1" } });

    await reserveHeroPhotoUploadAction(MEMORIAL_ID, "image/jpeg");
    await reserveHeroPhotoUploadAction(MEMORIAL_ID, "image/jpeg");

    expect(getHeritageActor).toHaveBeenCalledTimes(2);
    expect(reserveMediaUpload).toHaveBeenCalledTimes(2);
  });

  it("propagates the primitive's MediaResult verbatim — a refusal resolves, never rejects", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    reserveMediaUpload.mockResolvedValue({ ok: false, code: "access_denied" });

    await expect(reserveHeroPhotoUploadAction(MEMORIAL_ID, "image/jpeg")).resolves.toEqual({
      ok: false,
      code: "access_denied",
    });
  });

  it("builds the media engine deps fresh, per call", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    reserveMediaUpload.mockResolvedValue({ ok: true, value: {} });

    await reserveHeroPhotoUploadAction(MEMORIAL_ID, "image/jpeg");

    expect(createServerMediaEngineDeps).toHaveBeenCalledOnce();
  });
});

describe("finalizeHeroPhotoUploadAction", () => {
  it("resolves the actor and calls finalizeMediaUpload with memorialId + mediaId", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    finalizeMediaUpload.mockResolvedValue({ ok: true, value: { id: "m1", status: "ready" } });

    const result = await finalizeHeroPhotoUploadAction(MEMORIAL_ID, "m1");

    expect(finalizeMediaUpload).toHaveBeenCalledExactlyOnceWith(
      { fake: "media-engine-deps" },
      OWNER_ACTOR,
      { memorialId: MEMORIAL_ID, mediaId: "m1" },
    );
    expect(result).toEqual({ ok: true, value: { id: "m1", status: "ready" } });
  });

  it("propagates a refusal exactly as the primitive reports it", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    finalizeMediaUpload.mockResolvedValue({ ok: false, code: "invalid_file" });

    await expect(finalizeHeroPhotoUploadAction(MEMORIAL_ID, "m1")).resolves.toEqual({
      ok: false,
      code: "invalid_file",
    });
  });
});

describe("replaceHeroPhotoUploadAction", () => {
  it("resolves the actor and calls replaceMedia with memorialId + mediaId + previousMediaId", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    replaceMedia.mockResolvedValue({
      ok: true,
      value: { media: { id: "m2", status: "ready" }, previousRemoved: true },
    });

    const result = await replaceHeroPhotoUploadAction(MEMORIAL_ID, "m2", "m1");

    expect(replaceMedia).toHaveBeenCalledExactlyOnceWith(
      { fake: "media-engine-deps" },
      OWNER_ACTOR,
      { memorialId: MEMORIAL_ID, mediaId: "m2", previousMediaId: "m1" },
    );
    expect(result).toEqual({
      ok: true,
      value: { media: { id: "m2", status: "ready" }, previousRemoved: true },
    });
  });

  it("propagates a refusal exactly as the primitive reports it — the old media stays the Hero photo", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    replaceMedia.mockResolvedValue({ ok: false, code: "file_too_large" });

    await expect(replaceHeroPhotoUploadAction(MEMORIAL_ID, "m2", "m1")).resolves.toEqual({
      ok: false,
      code: "file_too_large",
    });
  });
});

/**
 * Source-level guards, same technique as actions.test.ts's own "shape of
 * the boundary" describe block.
 */
describe("media-actions.ts — the shape of the boundary", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "media-actions.ts"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("is a real Server Action file", () => {
    expect(SOURCE.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("never hard-codes a purpose other than 'hero' — Mission 033 builds Hero only", () => {
    expect(CODE).toMatch(/purpose:\s*"hero"/);
    expect(CODE).not.toMatch(/purpose:\s*"gallery"/);
  });

  it("never accepts a purpose parameter from its caller", () => {
    const signature = CODE.match(/export async function reserveHeroPhotoUploadAction\(([\s\S]*?)\):/);
    expect(signature).not.toBeNull();
    expect((signature as RegExpMatchArray)[1]).not.toMatch(/purpose/);
  });

  it("never imports the service-role client or a media repository/object-store adapter directly — only the shared engine wiring", () => {
    expect(CODE).not.toMatch(/service-role-client/);
    expect(CODE).not.toMatch(/adapters\/supabase\/media/);
  });

  it("never builds a second ownership/authorization mechanism of its own", () => {
    expect(CODE).not.toMatch(/authorizeMemorialAccess/);
    expect(CODE).not.toMatch(/memorial-ownership-repository/);
  });
});
