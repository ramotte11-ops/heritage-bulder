import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullAnnouncement } from "@/lib/memorial/assembly/test-fixtures";

/**
 * « Gérer les rubriques visibles » — the one write of `presentation`:
 * authorization on every call, the authorized id only, arguments
 * re-validated, only `presentation` changes, and every refusal rejects.
 */

const { authorizeMemorialForRequest } = vi.hoisted(() => ({ authorizeMemorialForRequest: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(async () => ({ fake: "session-scoped-client" })),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { getDraftContent, saveDraftContent, findConfigById } = vi.hoisted(() => ({
  getDraftContent: vi.fn(),
  saveDraftContent: vi.fn(),
  findConfigById: vi.fn(),
}));
vi.mock("@/lib/adapters/supabase/draft-repository", () => ({
  SupabaseDraftRepository: vi.fn().mockImplementation(function SupabaseDraftRepository() {
    return { getDraftContent, saveDraftContent };
  }),
}));
vi.mock("@/lib/adapters/supabase/memorial-config-repository", () => ({
  SupabaseMemorialConfigRepository: vi.fn().mockImplementation(function SupabaseMemorialConfigRepository() {
    return { findConfigById };
  }),
}));

const { saveSectionVisibilityAction } = await import("./visibility-actions");

const DRAFT = fullAnnouncement();

beforeEach(() => {
  vi.clearAllMocks();
  authorizeMemorialForRequest.mockResolvedValue({ status: "granted", ownerId: "owner-a", memorialId: "authorized-id" });
  findConfigById.mockResolvedValue({ skin: "intemporel" });
  getDraftContent.mockResolvedValue({ content: DRAFT, updatedAt: "2026-01-01T00:00:00.000Z" });
  saveDraftContent.mockResolvedValue({ updatedAt: "2026-01-02T00:00:00.000Z" });
});

describe("saveSectionVisibilityAction", () => {
  it("hides one section on the SAVED draft, touching nothing else, on the authorized id", async () => {
    await saveSectionVisibilityAction("claimed-id", "ceremony", false);
    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("claimed-id");
    expect(getDraftContent).toHaveBeenCalledWith("authorized-id");
    expect(saveDraftContent).toHaveBeenCalledExactlyOnceWith("authorized-id", {
      ...DRAFT,
      presentation: { hiddenSections: ["ceremony"] },
    });
  });

  it("shows it again: the content is exactly the original one", async () => {
    getDraftContent.mockResolvedValue({ content: { ...DRAFT, presentation: { hiddenSections: ["ceremony"] } }, updatedAt: "x" });
    await saveSectionVisibilityAction("authorized-id", "ceremony", true);
    expect(saveDraftContent).toHaveBeenCalledExactlyOnceWith("authorized-id", { ...DRAFT, presentation: { hiddenSections: [] } });
  });

  it.each([
    ["the Hero", "hero", false],
    ["a section without a renderer yet (traditions)", "traditions", false],
  ])("refuses %s — and writes nothing", async (_label, sectionId, visible) => {
    await expect(saveSectionVisibilityAction("authorized-id", sectionId, visible)).rejects.toThrow();
    expect(saveDraftContent).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown section", "javascript:alert(1)", false],
    ["a non-boolean visibility", "ceremony", "no" as unknown as boolean],
  ])("rejects %s before any Supabase call", async (_label, sectionId, visible) => {
    await expect(saveSectionVisibilityAction("authorized-id", sectionId, visible)).rejects.toThrow();
    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("a denied authorization rejects and writes nothing", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "notFoundOrForbidden" });
    await expect(saveSectionVisibilityAction("someone-else", "ceremony", false)).rejects.toThrow();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(saveDraftContent).not.toHaveBeenCalled();
  });

  it("no draft (or no memorial) rejects; a failing save propagates", async () => {
    getDraftContent.mockResolvedValueOnce(null);
    await expect(saveSectionVisibilityAction("authorized-id", "ceremony", false)).rejects.toThrow();
    saveDraftContent.mockRejectedValueOnce(new Error("permission denied"));
    await expect(saveSectionVisibilityAction("authorized-id", "ceremony", false)).rejects.toThrow("permission denied");
  });
});
