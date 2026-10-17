import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminForRequest, notFound, assembleMemorial, buildFounderAtelierContent } = vi.hoisted(() => ({
  requireAdminForRequest: vi.fn(),
  assembleMemorial: vi.fn(),
  buildFounderAtelierContent: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin/admin-session", () => ({ requireAdminForRequest }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/admin/founder-atelier-fixture", () => ({
  buildFounderAtelierContent,
  resolveFounderAtelierMedia: vi.fn(),
}));
vi.mock("@/lib/memorial/assembly/assemble-memorial", () => ({ assembleMemorial }));
vi.mock("@/components/memorial/assembly/MemorialAssembly", () => ({ MemorialAssembly: () => null }));

const { default: FounderAtelierPreviewPage } = await import("./page");

const props = (query: { section?: string; theme?: string }) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(query),
});

describe("FounderAtelierPreviewPage", () => {
  beforeEach(() => {
    requireAdminForRequest.mockReset();
    assembleMemorial.mockReset();
    buildFounderAtelierContent.mockReset();
    notFound.mockClear();
  });

  it("checks the Admin gate before reading query data or building any fixture", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "denied" });
    const searchParams = Promise.reject(new Error("must not be read"));
    searchParams.catch(() => {});

    await expect(
      FounderAtelierPreviewPage({ params: Promise.resolve({}), searchParams }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(buildFounderAtelierContent).not.toHaveBeenCalled();
    expect(assembleMemorial).not.toHaveBeenCalled();
  });

  it("refuses unknown section and theme parameters", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "granted" });
    await expect(FounderAtelierPreviewPage(props({ section: "unknown", theme: "sepia" }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(assembleMemorial).not.toHaveBeenCalled();
  });
});
