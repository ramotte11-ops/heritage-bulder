import { describe, expect, it, vi } from "vitest";
import { resumeBuilderSession, type ResumeBuilderSessionDeps } from "./resume-session";
import type { Memorial, MemorialVersion } from "@/types/memorial";

const FIXTURE_MEMORIAL: Memorial = {
  id: "memorial-123",
  ownerId: "owner-a",
  entitlementId: "entitlement-a",
  memorialType: "person",
  editorialContext: "announcement",
  skin: "intemporel",
  language: "fr",
  enabledSections: ["story"],
  status: "draft",
  slug: "test-memorial",
  draft: { content: { hero: { title: "Stale, from findById" } }, updatedAt: "2026-01-01T00:00:00.000Z" },
  published: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const FRESH_DRAFT: MemorialVersion = {
  content: { hero: { title: "Fresh, from draftRepository" } },
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function depsWith(overrides: {
  findById?: (id: string) => Promise<Memorial | null>;
  getDraftContent?: (memorialId: string) => Promise<MemorialVersion | null>;
}): ResumeBuilderSessionDeps {
  return {
    memorialRepository: { findById: overrides.findById ?? vi.fn().mockResolvedValue(FIXTURE_MEMORIAL) },
    draftRepository: { getDraftContent: overrides.getDraftContent ?? vi.fn().mockResolvedValue(FRESH_DRAFT) },
  };
}

describe("resumeBuilderSession — happy path", () => {
  it("resolves resumable with the memorial and the freshly-read draft, never findById's own stale one", async () => {
    const deps = depsWith({});

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({
      status: "resumable",
      memorial: { ...FIXTURE_MEMORIAL, draft: FRESH_DRAFT },
    });
  });

  it("passes the exact memorialId through to both repositories, unchanged", async () => {
    const findById = vi.fn().mockResolvedValue(FIXTURE_MEMORIAL);
    const getDraftContent = vi.fn().mockResolvedValue(FRESH_DRAFT);
    const deps = depsWith({ findById, getDraftContent });

    await resumeBuilderSession(deps, "memorial-123");

    expect(findById).toHaveBeenCalledWith("memorial-123");
    expect(getDraftContent).toHaveBeenCalledWith("memorial-123");
  });
});

describe("resumeBuilderSession — memorial not found or not authorized", () => {
  it("resolves notFoundOrForbidden when findById returns null", async () => {
    const deps = depsWith({ findById: vi.fn().mockResolvedValue(null) });

    const result = await resumeBuilderSession(deps, "not-mine-or-nonexistent");

    expect(result).toEqual({ status: "notFoundOrForbidden" });
  });

  it("never calls getDraftContent when the memorial itself isn't found — no wasted read, no guessing", async () => {
    const getDraftContent = vi.fn();
    const deps = depsWith({ findById: vi.fn().mockResolvedValue(null), getDraftContent });

    await resumeBuilderSession(deps, "not-mine-or-nonexistent");

    expect(getDraftContent).not.toHaveBeenCalled();
  });
});

describe("resumeBuilderSession — draft anomaly", () => {
  it("resolves draftAnomaly, carrying the (authorized) memorial, when the draft comes back null", async () => {
    const deps = depsWith({ getDraftContent: vi.fn().mockResolvedValue(null) });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "draftAnomaly", memorial: FIXTURE_MEMORIAL });
  });
});

describe("resumeBuilderSession — repository errors", () => {
  it("resolves error when findById rejects, with its message as the reason", async () => {
    const deps = depsWith({ findById: vi.fn().mockRejectedValue(new Error("connection reset")) });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "error", reason: "connection reset" });
  });

  it("resolves error when getDraftContent rejects, without ever claiming draftAnomaly", async () => {
    const deps = depsWith({ getDraftContent: vi.fn().mockRejectedValue(new Error("network down")) });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "error", reason: "network down" });
  });

  it("normalizes a non-Error rejection to a string reason instead of throwing", async () => {
    const deps = depsWith({ findById: vi.fn().mockRejectedValue("raw string failure") });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "error", reason: "raw string failure" });
  });
});

describe("resumeBuilderSession — no arbitrary memorial selection", () => {
  it("only ever asks for the exact memorialId passed in — the dependency surface has no listing method to fall back to", async () => {
    // Pick<DataRepository<Memorial>, "findById"> and
    // Pick<DraftRepository, "getDraftContent"> are the entire dependency
    // surface (see resume-session.ts's own imports/types) — there is no
    // findAll/list method in scope for this function to call even by
    // mistake. This test documents that guarantee at the call level: no
    // matter what memorialId is requested, exactly that id (and no
    // other) reaches both repositories.
    const findById = vi.fn().mockResolvedValue(FIXTURE_MEMORIAL);
    const getDraftContent = vi.fn().mockResolvedValue(FRESH_DRAFT);
    const deps = depsWith({ findById, getDraftContent });

    await resumeBuilderSession(deps, "some-other-memorial-id");

    expect(findById).toHaveBeenCalledOnce();
    expect(findById).toHaveBeenCalledWith("some-other-memorial-id");
    expect(getDraftContent).toHaveBeenCalledOnce();
    expect(getDraftContent).toHaveBeenCalledWith("some-other-memorial-id");
  });
});
