import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullAnnouncement } from "@/lib/memorial/assembly/test-fixtures";

const { authorizeMemorialForRequest } = vi.hoisted(() => ({ authorizeMemorialForRequest: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(async () => ({ fake: "session-scoped-client" })),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { createSupabaseMemorialEditRepository, load, commitDraft } = vi.hoisted(() => ({
  createSupabaseMemorialEditRepository: vi.fn(),
  load: vi.fn(),
  commitDraft: vi.fn(),
}));
const { MemorialEditConflictError } = vi.hoisted(() => ({
  MemorialEditConflictError: class MemorialEditConflictError extends Error {
    readonly code = "MEMORIAL_EDIT_CONFLICT";
  },
}));
createSupabaseMemorialEditRepository.mockImplementation(() => ({ load, commitDraft, commitConfiguration: vi.fn() }));
vi.mock("@/lib/adapters/supabase/memorial-edit-repository", () => ({
  createSupabaseMemorialEditRepository,
  MemorialEditConflictError,
}));

const { saveSectionVisibilityAction: saveSectionVisibilityTransport } = await import("./visibility-actions");
const DRAFT = fullAnnouncement();
const saveSectionVisibilityAction = (memorialId: string, sectionId: string, visible: boolean) =>
  saveSectionVisibilityTransport(memorialId, sectionId, visible, 2);

function snapshot(content = DRAFT, status: "draft" | "published" = "draft") {
  return {
    status,
    firstPublishedAt: status === "published" ? "2026-10-01T10:00:00Z" : null,
    language: "fr",
    skin: "intemporel",
    skinVariant: "light",
    draft: { content, updatedAt: "2026-10-18T10:00:00Z", revision: 2 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeMemorialForRequest.mockResolvedValue({ status: "granted", ownerId: "owner-a", memorialId: "authorized-id" });
  load.mockResolvedValue(snapshot());
  commitDraft.mockResolvedValue({ updatedAt: "2026-10-18T10:01:00Z", revision: 3 });
});
describe("saveSectionVisibilityAction — atomic visibility write", () => {
  it("changes only presentation on the stored draft and records the visibility target", async () => {
    await saveSectionVisibilityAction("claimed-id", "ceremony", false);
    expect(load).toHaveBeenCalledWith("authorized-id");
    expect(commitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        memorialId: "authorized-id",
        expectedRevision: 2,
        operation: "visibility.changed",
        mutationTargets: ["visibility.ceremony"],
        content: { ...DRAFT, presentation: { hiddenSections: ["ceremony"] } },
      }),
    );
  });

  it("Offrandes symboliques (M3.1): the same existing RPC operation, a visibility target only", async () => {
    await saveSectionVisibilityAction("claimed-id", "symbolicOfferings", false);
    expect(commitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        memorialId: "authorized-id",
        operation: "visibility.changed",
        mutationTargets: ["visibility.symbolicOfferings"],
        content: { ...DRAFT, presentation: { hiddenSections: ["symbolicOfferings"] } },
      }),
    );
  });

  it("remains allowed after publication while ceremony content is conservatively locked", async () => {
    load.mockResolvedValue(snapshot(DRAFT, "published"));
    await expect(saveSectionVisibilityAction("authorized-id", "ceremony", false)).resolves.toEqual({
      status: "saved",
      updatedAt: "2026-10-18T10:01:00Z",
      revision: 3,
    });
    expect(commitDraft).toHaveBeenCalledOnce();
  });

  it.each([["the Hero", "hero", false], ["a section without a renderer", "condolences", false]])(
    "refuses %s and writes nothing",
    async (_label, sectionId, visible) => {
      await expect(saveSectionVisibilityAction("authorized-id", sectionId, visible)).rejects.toThrow();
      expect(commitDraft).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed input before authorization", async () => {
    await expect(saveSectionVisibilityAction("authorized-id", "javascript:alert(1)", false)).rejects.toThrow();
    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
  });

  it("propagates a concurrent autosave conflict", async () => {
    commitDraft.mockRejectedValue(new Error("concurrent update"));
    await expect(saveSectionVisibilityAction("authorized-id", "ceremony", false)).rejects.toThrow("concurrent update");
  });

  it("uses the shared browser revision and reports a stale visibility write as a conflict", async () => {
    commitDraft.mockRejectedValue(new MemorialEditConflictError());

    await expect(
      saveSectionVisibilityTransport("authorized-id", "ceremony", false, 1),
    ).resolves.toEqual({ status: "conflict" });
    expect(commitDraft).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1 }));
  });

  it("treats an already-applied visibility choice as a no-op", async () => {
    load.mockResolvedValue(
      snapshot({ ...DRAFT, presentation: { hiddenSections: ["ceremony"] } } as never),
    );

    await expect(
      saveSectionVisibilityTransport("authorized-id", "ceremony", false, 1),
    ).resolves.toEqual({
      status: "saved",
      updatedAt: "2026-10-18T10:00:00Z",
      revision: 2,
    });
    expect(commitDraft).not.toHaveBeenCalled();
  });
});
