import { describe, expect, it, vi, beforeEach } from "vitest";

const { getAuthenticatedUser } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({ getAuthenticatedUser }));

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

// Imported after the mocks above are registered.
const { default: OwnerPage } = await import("./page");

describe("OwnerPage", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    redirect.mockClear();
  });

  it("redirects to /login when there is no authenticated session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    await expect(OwnerPage()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("does not redirect when a session exists, and renders something", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "auth-user-1", email: "rany@example.com" });

    const result = await OwnerPage();

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
