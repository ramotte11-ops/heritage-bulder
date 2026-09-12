import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Mission 035 — `saveSkinVariantAction`, T08's one write onto
 * `memorials`. Same authorization discipline as `actions.ts`'s own
 * `saveLanguageAction`/`saveEditorialContextAction`, mirrored here
 * exactly — see this action's own docstring for why it lives in a
 * separate file rather than `actions.ts`.
 */

const { authorizeMemorialForRequest } = vi.hoisted(() => ({
  authorizeMemorialForRequest: vi.fn(),
}));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ fake: "session-scoped-client" }),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { SupabaseMemorialConfigRepository, saveSkinVariant } = vi.hoisted(() => {
  const save = vi.fn();
  return {
    saveSkinVariant: save,
    SupabaseMemorialConfigRepository: vi
      .fn()
      .mockImplementation(function SupabaseMemorialConfigRepository() {
        return { findConfigById: vi.fn(), saveSkinVariant: save };
      }),
  };
});
vi.mock("@/lib/adapters/supabase/memorial-config-repository", () => ({
  SupabaseMemorialConfigRepository,
}));

// Imported after the mocks above are registered.
const { saveSkinVariantAction } = await import("./hero-reveal-actions");

const MEMORIAL_ID = "memorial-abc";

function granted(memorialId = MEMORIAL_ID) {
  return { status: "granted", ownerId: "owner-a", memorialId };
}

describe("saveSkinVariantAction — authorization on every single save", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    SupabaseMemorialConfigRepository.mockClear();
    saveSkinVariant.mockReset();
  });

  it("re-authorizes on each call — never once per rendered page", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveSkinVariant.mockResolvedValue(undefined);

    await saveSkinVariantAction(MEMORIAL_ID, "dark");
    await saveSkinVariantAction(MEMORIAL_ID, "dark");
    await saveSkinVariantAction(MEMORIAL_ID, "dark");

    expect(authorizeMemorialForRequest).toHaveBeenCalledTimes(3);
    expect(saveSkinVariant).toHaveBeenCalledTimes(3);
  });

  it("saves through the real config repository", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveSkinVariant.mockResolvedValue(undefined);

    await saveSkinVariantAction(MEMORIAL_ID, "dark");

    expect(saveSkinVariant).toHaveBeenCalledExactlyOnceWith(MEMORIAL_ID, "dark");
  });

  it("writes to the id the authorization returned, never the one it was handed", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted("authorized-id"));
    saveSkinVariant.mockResolvedValue(undefined);

    await saveSkinVariantAction("claimed-id", "light");

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("claimed-id");
    expect(saveSkinVariant).toHaveBeenCalledExactlyOnceWith("authorized-id", "light");
  });

  it("builds the Supabase client server-side, per call, and only after authorization succeeds", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveSkinVariant.mockResolvedValue(undefined);

    await saveSkinVariantAction(MEMORIAL_ID, "dark");

    expect(createServerSupabaseClient).toHaveBeenCalledOnce();
    expect(SupabaseMemorialConfigRepository).toHaveBeenCalledExactlyOnceWith({
      fake: "session-scoped-client",
    });
  });

  it.each(["light", "dark"] as const)(
    "accepts the canonical skin variant %s",
    async (skinVariant) => {
      authorizeMemorialForRequest.mockResolvedValue(granted());
      saveSkinVariant.mockResolvedValue(undefined);

      await expect(saveSkinVariantAction(MEMORIAL_ID, skinVariant)).resolves.toBeUndefined();
      expect(saveSkinVariant).toHaveBeenCalledWith(MEMORIAL_ID, skinVariant);
    },
  );

  it("propagates a genuine repository failure instead of swallowing it into a success", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveSkinVariant.mockRejectedValue(new Error("permission denied for table memorials"));

    await expect(saveSkinVariantAction(MEMORIAL_ID, "dark")).rejects.toThrow(
      "permission denied for table memorials",
    );
  });
});

describe("saveSkinVariantAction — an unsupported value is refused before any authorization or write", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    saveSkinVariant.mockReset();
  });

  // Never `prefers-color-scheme`, never a device setting, never a third
  // value — resolveSkinVariantRuntime is the one gate, and even a caller
  // that tried something else is refused before anything is authorized
  // or written.
  it.each(["system", "xx", "", "LIGHT", "dark ", "auto"])(
    "rejects %j without authorizing or writing anything",
    async (value) => {
      await expect(saveSkinVariantAction(MEMORIAL_ID, value)).rejects.toThrow();

      expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
      expect(saveSkinVariant).not.toHaveBeenCalled();
    },
  );
});

describe("saveSkinVariantAction — a refusal is a rejection, and writes nothing", () => {
  beforeEach(() => {
    authorizeMemorialForRequest.mockReset();
    createServerSupabaseClient.mockClear();
    saveSkinVariant.mockReset();
  });

  it("refuses Owner A's save on Owner B's memorial exactly like any other denial — no distinguishing message", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    const notMine = await saveSkinVariantAction("owner-b-memorial", "dark").catch(
      (e: Error) => e.message,
    );
    const nonexistent = await saveSkinVariantAction("no-such-memorial", "dark").catch(
      (e: Error) => e.message,
    );

    expect(notMine).toBe(nonexistent);
    expect(saveSkinVariant).not.toHaveBeenCalled();
  });

  it("propagates a genuine repository failure instead of swallowing it into a success", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted());
    saveSkinVariant.mockRejectedValue(new Error("permission denied for table memorials"));

    await expect(saveSkinVariantAction(MEMORIAL_ID, "dark")).rejects.toThrow(
      "permission denied for table memorials",
    );
  });
});

/**
 * Source-level guards, same technique as actions.test.ts's own
 * "the shape of the boundary" blocks.
 */
describe("saveSkinVariantAction — the shape of the boundary", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "hero-reveal-actions.ts"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("is a real Server Action file", () => {
    expect(SOURCE.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("never uses the service-role client — the session-scoped one keeps RLS as a second lock", () => {
    expect(CODE).not.toMatch(/service-role-client/);
    expect(CODE).not.toMatch(/createServiceRoleSupabaseClient/);
  });

  it("never accepts an actor, owner id, session, or already-typed SkinVariant as a parameter", () => {
    const signature = CODE.match(/export async function saveSkinVariantAction\(([\s\S]*?)\):/);
    expect(signature).not.toBeNull();
    const parameters = (signature as RegExpMatchArray)[1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    // `skinVariant: string`, not `skinVariant: SkinVariant` — re-validated
    // here (resolveSkinVariantRuntime), never merely typed and trusted.
    expect(parameters).toEqual(["memorialId: string", "skinVariant: string"]);
  });

  it("re-validates skinVariant through the canonical runtime resolver before doing anything else", () => {
    expect(CODE).toMatch(/resolveSkinVariantRuntime\(skinVariant\)/);
  });

  it("never derives the variant from prefers-color-scheme or any browser/device signal", () => {
    expect(CODE).not.toMatch(/matchMedia|prefers-color-scheme|window\./);
  });

  it("never writes T08's own StepRecord — that stays the caller's job, after this resolves", () => {
    expect(CODE).not.toMatch(/commitPageE|guidedFlow/);
  });

  it("never builds a second authorization mechanism of its own", () => {
    expect(CODE).not.toMatch(/memorial-ownership-repository/);
    expect(CODE).not.toMatch(/authorizeMemorialAccess/);
    expect(CODE).toMatch(/authorizeMemorialForRequest\(memorialId\)/);
  });
});
