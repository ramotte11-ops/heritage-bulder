import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Mission 021B — the autosave Server Action.
 *
 * The audited defect this file guards: Mission 021 authorized the
 * Builder ONCE, at render time, and then handed the client a closure
 * that could write the draft for the rest of the page's life. A save is
 * its own request; it must be authorized as one. Every test below is
 * about that, plus the one rule Missions 007-010's autosave contract
 * makes non-negotiable — a refusal must REJECT, never resolve with a
 * fabricated `updatedAt` the UI would read as "saved".
 */

const { authorizeMemorialForRequest } = vi.hoisted(() => ({
  authorizeMemorialForRequest: vi.fn(),
}));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ fake: "session-scoped-client" }),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { SupabaseDraftRepository, saveDraftContent } = vi.hoisted(() => {
  const save = vi.fn();
  return {
    saveDraftContent: save,
    SupabaseDraftRepository: vi.fn().mockImplementation(function SupabaseDraftRepository() {
      return { getDraftContent: vi.fn(), saveDraftContent: save };
    }),
  };
});
vi.mock("@/lib/adapters/supabase/draft-repository", () => ({ SupabaseDraftRepository }));

const { SupabaseMemorialConfigRepository, saveLanguage } = vi.hoisted(() => {
  const save = vi.fn();
  return {
    saveLanguage: save,
    SupabaseMemorialConfigRepository: vi
      .fn()
      .mockImplementation(function SupabaseMemorialConfigRepository() {
        return { findConfigById: vi.fn(), saveLanguage: save };
      }),
  };
});
vi.mock("@/lib/adapters/supabase/memorial-config-repository", () => ({
  SupabaseMemorialConfigRepository,
}));

// Imported after the mocks above are registered.
const { saveDraftAction, saveLanguageAction } = await import("./actions");

const MEMORIAL_ID = "memorial-abc";
const CONTENT = { hero: { title: "Edited by the family" } };

function granted(memorialId = MEMORIAL_ID) {
  return { status: "granted", ownerId: "owner-a", memorialId };
}

describe("saveDraftAction — authorization on every single save", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    SupabaseDraftRepository.mockClear();
    saveDraftContent.mockReset();
  });

  it("re-authorizes on each call — never once per rendered page", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveDraftContent.mockResolvedValue({ updatedAt: "2026-02-01T00:00:00.000Z" });

    await saveDraftAction(MEMORIAL_ID, CONTENT);
    await saveDraftAction(MEMORIAL_ID, CONTENT);
    await saveDraftAction(MEMORIAL_ID, CONTENT);

    expect(authorizeMemorialForRequest).toHaveBeenCalledTimes(3);
    expect(saveDraftContent).toHaveBeenCalledTimes(3);
  });

  it("saves through the real draft repository and returns the row's own updatedAt", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveDraftContent.mockResolvedValue({ updatedAt: "2026-02-01T00:00:00.000Z" });

    const result = await saveDraftAction(MEMORIAL_ID, CONTENT);

    expect(saveDraftContent).toHaveBeenCalledExactlyOnceWith(MEMORIAL_ID, CONTENT);
    expect(result).toEqual({ updatedAt: "2026-02-01T00:00:00.000Z" });
  });

  it("writes to the id the authorization returned, never the one it was handed", async () => {
    // The verified id and the raw argument are the same string in
    // production — the point is which one the code reads. If a future
    // authorization ever normalizes or re-resolves the id, the write
    // must follow IT, not the caller's claim.
    authorizeMemorialForRequest.mockResolvedValue(granted("authorized-id"));
    saveDraftContent.mockResolvedValue({ updatedAt: "2026-02-01T00:00:00.000Z" });

    await saveDraftAction("claimed-id", CONTENT);

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("claimed-id");
    expect(saveDraftContent).toHaveBeenCalledExactlyOnceWith("authorized-id", CONTENT);
  });

  it("builds the Supabase client server-side, per call, and only after authorization succeeds", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveDraftContent.mockResolvedValue({ updatedAt: "2026-02-01T00:00:00.000Z" });

    await saveDraftAction(MEMORIAL_ID, CONTENT);

    expect(createServerSupabaseClient).toHaveBeenCalledOnce();
    expect(SupabaseDraftRepository).toHaveBeenCalledExactlyOnceWith({
      fake: "session-scoped-client",
    });
  });
});

describe("saveDraftAction — a refusal is a rejection, and writes nothing", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    saveDraftContent.mockReset();
  });

  it("rejects and never calls saveDraftContent when access is denied", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    await expect(saveDraftAction(MEMORIAL_ID, CONTENT)).rejects.toThrow();

    expect(saveDraftContent).not.toHaveBeenCalled();
  });

  it("never builds a Supabase client for a refused save", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    await expect(saveDraftAction(MEMORIAL_ID, CONTENT)).rejects.toThrow();

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("never resolves with a fabricated success — the autosave contract reads that as 'written'", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    const outcome = await saveDraftAction(MEMORIAL_ID, CONTENT).then(
      (value) => ({ resolved: true, value }),
      () => ({ resolved: false, value: undefined }),
    );

    expect(outcome.resolved).toBe(false);
  });

  it("refuses Owner A's save on Owner B's memorial exactly like any other denial — no distinguishing message", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    const notMine = await saveDraftAction("owner-b-memorial", CONTENT).catch((e: Error) => e.message);
    const nonexistent = await saveDraftAction("no-such-memorial", CONTENT).catch(
      (e: Error) => e.message,
    );

    expect(notMine).toBe(nonexistent);
    expect(saveDraftContent).not.toHaveBeenCalled();
  });

  it("propagates a genuine repository failure instead of swallowing it into a success", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveDraftContent.mockRejectedValue(new Error("permission denied for table memorial_drafts"));

    await expect(saveDraftAction(MEMORIAL_ID, CONTENT)).rejects.toThrow(
      "permission denied for table memorial_drafts",
    );
  });
});

describe("saveLanguageAction — authorization on every single save", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    SupabaseMemorialConfigRepository.mockClear();
    saveLanguage.mockReset();
  });

  it("re-authorizes on each call — never once per rendered page", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveLanguage.mockResolvedValue(undefined);

    await saveLanguageAction(MEMORIAL_ID, "fr");
    await saveLanguageAction(MEMORIAL_ID, "fr");
    await saveLanguageAction(MEMORIAL_ID, "fr");

    expect(authorizeMemorialForRequest).toHaveBeenCalledTimes(3);
    expect(saveLanguage).toHaveBeenCalledTimes(3);
  });

  it("saves through the real config repository", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveLanguage.mockResolvedValue(undefined);

    await saveLanguageAction(MEMORIAL_ID, "es");

    expect(saveLanguage).toHaveBeenCalledExactlyOnceWith(MEMORIAL_ID, "es");
  });

  it("writes to the id the authorization returned, never the one it was handed", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted("authorized-id"));
    saveLanguage.mockResolvedValue(undefined);

    await saveLanguageAction("claimed-id", "en");

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("claimed-id");
    expect(saveLanguage).toHaveBeenCalledExactlyOnceWith("authorized-id", "en");
  });

  it("builds the Supabase client server-side, per call, and only after authorization succeeds", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveLanguage.mockResolvedValue(undefined);

    await saveLanguageAction(MEMORIAL_ID, "fr");

    expect(createServerSupabaseClient).toHaveBeenCalledOnce();
    expect(SupabaseMemorialConfigRepository).toHaveBeenCalledExactlyOnceWith({
      fake: "session-scoped-client",
    });
  });

  it.each(["en", "fr", "es"] as const)("accepts the canonical language %s", async (language) => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveLanguage.mockResolvedValue(undefined);

    await expect(saveLanguageAction(MEMORIAL_ID, language)).resolves.toBeUndefined();
    expect(saveLanguage).toHaveBeenCalledWith(MEMORIAL_ID, language);
  });
});

describe("saveLanguageAction — an unsupported language is refused before any authorization or write", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    saveLanguage.mockReset();
  });

  it.each(["de", "xx", "", "EN", "en-US"])("rejects %j without authorizing or writing anything", async (value) => {
    await expect(saveLanguageAction(MEMORIAL_ID, value)).rejects.toThrow();

    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
    expect(saveLanguage).not.toHaveBeenCalled();
  });
});

describe("saveLanguageAction — a refusal is a rejection, and writes nothing", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    saveLanguage.mockReset();
  });

  it("rejects and never calls saveLanguage when access is denied", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    await expect(saveLanguageAction(MEMORIAL_ID, "fr")).rejects.toThrow();

    expect(saveLanguage).not.toHaveBeenCalled();
  });

  it("never builds a Supabase client for a refused save", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    await expect(saveLanguageAction(MEMORIAL_ID, "fr")).rejects.toThrow();

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("never resolves with a fabricated success", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    const outcome = await saveLanguageAction(MEMORIAL_ID, "fr").then(
      () => ({ resolved: true }),
      () => ({ resolved: false }),
    );

    expect(outcome.resolved).toBe(false);
  });

  it("refuses Owner A's save on Owner B's memorial exactly like any other denial — no distinguishing message", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    const notMine = await saveLanguageAction("owner-b-memorial", "fr").catch((e: Error) => e.message);
    const nonexistent = await saveLanguageAction("no-such-memorial", "fr").catch(
      (e: Error) => e.message,
    );

    expect(notMine).toBe(nonexistent);
    expect(saveLanguage).not.toHaveBeenCalled();
  });

  it("propagates a genuine repository failure instead of swallowing it into a success", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveLanguage.mockRejectedValue(new Error("permission denied for table memorials"));

    await expect(saveLanguageAction(MEMORIAL_ID, "fr")).rejects.toThrow(
      "permission denied for table memorials",
    );
  });
});

/**
 * Source-level guards, same technique as
 * lib/auth/heritage-session.test.ts. Comments are stripped first so the
 * file may explain what it deliberately does not do.
 */
describe("saveDraftAction — the shape of the boundary", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "actions.ts"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("is a real Server Action file", () => {
    expect(SOURCE.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("never uses the service-role client — the session-scoped one keeps RLS as a second lock", () => {
    expect(CODE).not.toMatch(/service-role-client/);
    expect(CODE).not.toMatch(/createServiceRoleSupabaseClient/);
  });

  it("never accepts an actor, owner id or session as a parameter", () => {
    const signature = CODE.match(/export async function saveDraftAction\(([\s\S]*?)\):/);
    expect(signature).not.toBeNull();
    const parameters = (signature as RegExpMatchArray)[1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    expect(parameters).toEqual(["memorialId: string", "content: MemorialContent"]);
  });

  it("never builds a second authorization mechanism of its own", () => {
    expect(CODE).not.toMatch(/memorial-ownership-repository/);
    expect(CODE).not.toMatch(/authorizeMemorialAccess/);
    expect(CODE).toMatch(/authorizeMemorialForRequest\(memorialId\)/);
  });
});

describe("saveLanguageAction — the shape of the boundary", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "actions.ts"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("never uses the service-role client — the session-scoped one keeps RLS as a second lock", () => {
    // Already asserted for the whole file above, restated here so this
    // action's own guard block does not silently depend on the other.
    expect(CODE).not.toMatch(/service-role-client/);
    expect(CODE).not.toMatch(/createServiceRoleSupabaseClient/);
  });

  it("never accepts an actor, owner id, session, or already-typed Language as a parameter", () => {
    const signature = CODE.match(/export async function saveLanguageAction\(([\s\S]*?)\):/);
    expect(signature).not.toBeNull();
    const parameters = (signature as RegExpMatchArray)[1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    // `language: string`, not `language: Language` — a Server Action
    // argument crosses a network boundary and must be re-validated here
    // (isLanguage), never merely typed and trusted.
    expect(parameters).toEqual(["memorialId: string", "language: string"]);
  });

  it("re-validates language against the canonical LANGUAGES before doing anything else", () => {
    expect(CODE).toMatch(/isLanguage\(language\)/);
  });

  it("never builds a second authorization mechanism of its own", () => {
    expect(CODE).not.toMatch(/memorial-ownership-repository/);
    expect(CODE).not.toMatch(/authorizeMemorialAccess/);
    expect(CODE).toMatch(/authorizeMemorialForRequest\(memorialId\)/);
  });
});
