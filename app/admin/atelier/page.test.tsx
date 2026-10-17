import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminForRequest, notFound } = vi.hoisted(() => ({
  requireAdminForRequest: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin/admin-session", () => ({ requireAdminForRequest }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./FounderAtelier", () => ({ FounderAtelier: () => null }));

const { default: FounderAtelierPage } = await import("./page");

describe("FounderAtelierPage", () => {
  beforeEach(() => {
    requireAdminForRequest.mockReset();
    notFound.mockClear();
  });

  it("404s for a non-admin", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "denied" });
    await expect(FounderAtelierPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders only after the existing server-side Admin gate grants access", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "granted" });
    await expect(FounderAtelierPage()).resolves.toBeTruthy();
    expect(requireAdminForRequest).toHaveBeenCalledOnce();
    expect(notFound).not.toHaveBeenCalled();
  });
});
