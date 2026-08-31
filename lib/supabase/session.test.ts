import { describe, expect, it, vi, beforeEach } from "vitest";
import { getAuthenticatedUser } from "./session";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("./server-client", () => ({
  createServerSupabaseClient,
}));

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it("returns the user when a session exists", async () => {
    const fakeUser = { id: "auth-user-1", email: "rany@example.com" };
    const from = vi.fn();
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: fakeUser } }) },
      from,
    });

    const user = await getAuthenticatedUser();

    expect(user).toEqual(fakeUser);
    // Mission 004 rule: proving identity never touches the owners table.
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null when there is no session", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("returns null instead of throwing when Supabase isn't configured", async () => {
    createServerSupabaseClient.mockRejectedValue(
      new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL."),
    );

    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("returns null instead of throwing when the auth call itself fails", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error("network error")) },
    });

    expect(await getAuthenticatedUser()).toBeNull();
  });
});
