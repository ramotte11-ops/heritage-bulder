import { describe, expect, it, vi, beforeEach } from "vitest";

const { getAuthenticatedUser } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/lib/supabase/session", () => ({ getAuthenticatedUser }));

const { createServiceRoleSupabaseClient } = vi.hoisted(() => ({
  createServiceRoleSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service-role-client", () => ({ createServiceRoleSupabaseClient }));

const { activateHeritageAccess } = vi.hoisted(() => ({
  activateHeritageAccess: vi.fn(),
}));
vi.mock("./activate-heritage-access", () => ({ activateHeritageAccess }));

const { runHeritageActivationAttempt } = await import("./activation-session");

const AUTH_USER = {
  id: "auth-user-1",
  email: "famille@example.test",
  email_confirmed_at: "2026-09-05T10:00:00.000Z",
  is_anonymous: false,
};

describe("runHeritageActivationAttempt", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    createServiceRoleSupabaseClient.mockReset();
    activateHeritageAccess.mockReset();
  });

  it("refuses an unauthenticated caller WITHOUT ever constructing a service-role client", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const outcome = await runHeritageActivationAttempt("HH1-whatever");

    expect(outcome).toEqual({ status: "unauthenticated" });
    expect(createServiceRoleSupabaseClient).not.toHaveBeenCalled();
    expect(activateHeritageAccess).not.toHaveBeenCalled();
  });

  it("resolves the identity from the session, never from an argument, and runs the attempt", async () => {
    getAuthenticatedUser.mockResolvedValue(AUTH_USER);
    createServiceRoleSupabaseClient.mockReturnValue({ rpc: vi.fn(), from: vi.fn() });
    activateHeritageAccess.mockResolvedValue({ status: "redeemed", memorialId: "memorial-1" });

    const outcome = await runHeritageActivationAttempt("HH1-whatever");

    expect(outcome).toEqual({
      status: "completed",
      result: { status: "redeemed", memorialId: "memorial-1" },
    });
    expect(activateHeritageAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identity: expect.objectContaining({ id: "auth-user-1" }),
        rawActivationKey: "HH1-whatever",
      }),
    );
  });
});
