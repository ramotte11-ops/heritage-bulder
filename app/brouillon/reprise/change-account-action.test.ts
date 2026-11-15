import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, signOut } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { signOutGuestDraftAccountAction } = await import("./change-account-action");

describe("signOutGuestDraftAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockResolvedValue({ auth: { signOut } });
    signOut.mockResolvedValue({ error: null });
  });

  it("signs out this browser only", async () => {
    await expect(signOutGuestDraftAccountAction()).resolves.toEqual({ ok: true });
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("returns a calm failure without redirecting or touching the local draft", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signOut.mockResolvedValue({ error: { message: "network" } });

    await expect(signOutGuestDraftAccountAction()).resolves.toEqual({ ok: false });
    errorSpy.mockRestore();
  });
});
