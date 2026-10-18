import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeMemorialForRequest } = vi.hoisted(() => ({ authorizeMemorialForRequest: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ fake: "session-scoped-client" }),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { createSupabaseMemorialEditRepository, load, commitConfiguration } = vi.hoisted(() => ({
  createSupabaseMemorialEditRepository: vi.fn(),
  load: vi.fn(),
  commitConfiguration: vi.fn(),
}));
const { MemorialEditConflictError } = vi.hoisted(() => ({
  MemorialEditConflictError: class MemorialEditConflictError extends Error {
    readonly code = "MEMORIAL_EDIT_CONFLICT";
  },
}));
createSupabaseMemorialEditRepository.mockImplementation(() => ({
  load,
  commitDraft: vi.fn(),
  commitConfiguration,
}));
vi.mock("@/lib/adapters/supabase/memorial-edit-repository", () => ({
  createSupabaseMemorialEditRepository,
  MemorialEditConflictError,
}));

const { saveSkinVariantAction: saveSkinVariantTransport } = await import("./hero-reveal-actions");
const saveSkinVariantAction = async (memorialId: string, skinVariant: string) => {
  const result = await saveSkinVariantTransport(memorialId, "light", skinVariant);
  return result.status === "saved" ? undefined : result;
};

function snapshot(status: "draft" | "published" = "draft") {
  return {
    status,
    firstPublishedAt: status === "published" ? "2026-10-01T10:00:00Z" : null,
    language: "fr",
    skin: "intemporel",
    skinVariant: "light",
    draft: { content: {}, updatedAt: "2026-10-18T10:00:00Z", revision: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeMemorialForRequest.mockResolvedValue({
    status: "granted",
    ownerId: "owner-a",
    memorialId: "memorial-a",
  });
  load.mockResolvedValue(snapshot());
  commitConfiguration.mockResolvedValue(undefined);
});
describe("saveSkinVariantAction — Security V1 lot 2", () => {
  it("accepts the already stored Light ambiance without a write or audit event", async () => {
    await expect(saveSkinVariantAction("memorial-a", "light")).resolves.toBeUndefined();

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("memorial-a");
    expect(load).toHaveBeenCalledWith("memorial-a");
    expect(commitConfiguration).not.toHaveBeenCalled();
  });

  it("keeps the first-creation write and uses the authorized identifiers", async () => {
    await expect(saveSkinVariantAction("claimed-id", "dark")).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledWith("memorial-a");
    expect(commitConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        target: "skinVariant",
        expectedValue: "light",
        value: "dark",
        mutationTargets: ["configuration.skinVariant"],
      }),
    );
  });

  it("refuses a stale ambiance form without claiming that it was saved", async () => {
    commitConfiguration.mockRejectedValue(new MemorialEditConflictError());

    await expect(saveSkinVariantTransport("memorial-a", "light", "dark")).resolves.toEqual({
      status: "conflict",
    });
    expect(commitConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ target: "skinVariant", expectedValue: "light", value: "dark" }),
    );
  });

  it("refuses the Hero ambiance after first publication", async () => {
    load.mockResolvedValue(snapshot("published"));
    await expect(saveSkinVariantAction("memorial-a", "dark")).rejects.toThrow(
      "hero_locked_after_publication",
    );
    expect(commitConfiguration).not.toHaveBeenCalled();
  });

  it.each(["system", "xx", "", "LIGHT", "dark ", "auto"])(
    "rejects unsupported %j before authorization",
    async (value) => {
      await expect(saveSkinVariantAction("memorial-a", value)).rejects.toThrow();
      expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
    },
  );

  it("rejects another owner's memorial even for the already stored Light ambiance", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(saveSkinVariantAction("not-mine", "light")).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
    expect(commitConfiguration).not.toHaveBeenCalled();
  });

  it("propagates a lifecycle conflict or audit failure", async () => {
    commitConfiguration.mockRejectedValue(new Error("memorial lifecycle changed"));
    await expect(saveSkinVariantAction("memorial-a", "dark")).rejects.toThrow(
      "memorial lifecycle changed",
    );
  });
});
