import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createServiceRoleSupabaseClient, read, Repository } = vi.hoisted(() => ({
  createServiceRoleSupabaseClient: vi.fn(),
  read: vi.fn(),
  Repository: vi.fn(function (this: { read: unknown }) {
    this.read = read;
  }),
}));

vi.mock("@/lib/supabase/service-role-client", () => ({ createServiceRoleSupabaseClient }));
vi.mock("@/lib/adapters/supabase/owner-free-publication-status-repository", () => ({
  SupabaseOwnerFreePublicationStatusRepository: Repository,
}));

const { loadOwnerFreePublicationStatus } = await import("./load-owner-free-publication-status");

describe("loadOwnerFreePublicationStatus", () => {
  beforeEach(() => {
    createServiceRoleSupabaseClient.mockReset();
    createServiceRoleSupabaseClient.mockReturnValue({ privileged: true });
    Repository.mockClear();
    read.mockReset();
  });

  it("uses the server-only service-role client and the session-resolved owner", async () => {
    const status = {
      status: "opens_on_next_save" as const,
      activeFreeDrafts: 0,
      maxFreeDrafts: 3,
    };
    read.mockResolvedValue(status);

    await expect(loadOwnerFreePublicationStatus("owner-from-session")).resolves.toBe(status);
    expect(createServiceRoleSupabaseClient).toHaveBeenCalledTimes(1);
    expect(Repository).toHaveBeenCalledWith({ privileged: true });
    expect(read).toHaveBeenCalledWith("owner-from-session");
  });

  it("returns the neutral state if privileged wiring or the read fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    read.mockRejectedValue(new Error("unavailable"));

    await expect(loadOwnerFreePublicationStatus("owner-from-session")).resolves.toEqual({
      status: "unknown",
    });
    errorSpy.mockRestore();
  });
});
