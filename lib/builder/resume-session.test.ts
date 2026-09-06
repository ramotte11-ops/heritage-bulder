import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resumeBuilderSession, type ResumeBuilderSessionDeps } from "./resume-session";
import type { MemorialVersion, StoredMemorialConfig } from "@/types/memorial";

/**
 * Mission 021B: the memorial half of these dependencies is now the
 * narrow `MemorialConfigRepository` (one row, one table) instead of
 * `DataRepository<StoredMemorial>.findById`, which composed `memorials`,
 * `memorial_drafts` AND `memorial_published_snapshots`. The fixture is
 * therefore a configuration with no content on it at all — there is no
 * longer a "stale draft from findById" to disagree with the
 * authoritative one, because there is no second read of it.
 */
const FIXTURE_CONFIG: StoredMemorialConfig = {
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const FRESH_DRAFT: MemorialVersion = {
  content: { hero: { title: "Fresh, from draftRepository" } },
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function depsWith(overrides: {
  findConfigById?: (id: string) => Promise<StoredMemorialConfig | null>;
  getDraftContent?: (memorialId: string) => Promise<MemorialVersion | null>;
}): ResumeBuilderSessionDeps {
  return {
    memorialConfigRepository: {
      findConfigById: overrides.findConfigById ?? vi.fn().mockResolvedValue(FIXTURE_CONFIG),
    },
    draftRepository: { getDraftContent: overrides.getDraftContent ?? vi.fn().mockResolvedValue(FRESH_DRAFT) },
  };
}

describe("resumeBuilderSession — happy path", () => {
  it("resolves resumable with the configuration and the one draft, read from DraftRepository", async () => {
    const deps = depsWith({});

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({
      status: "resumable",
      memorial: FIXTURE_CONFIG,
      draft: FRESH_DRAFT,
    });
  });

  it("carries no content on the memorial itself — the draft is the only content, and it is read once", async () => {
    const getDraftContent = vi.fn().mockResolvedValue(FRESH_DRAFT);
    const deps = depsWith({ getDraftContent });

    const result = await resumeBuilderSession(deps, "memorial-123");

    if (result.status !== "resumable") throw new Error("expected resumable");
    expect(result.memorial).not.toHaveProperty("draft");
    expect(result.memorial).not.toHaveProperty("published");
    expect(getDraftContent).toHaveBeenCalledOnce();
  });

  it("passes the exact memorialId through to both repositories, unchanged", async () => {
    const findConfigById = vi.fn().mockResolvedValue(FIXTURE_CONFIG);
    const getDraftContent = vi.fn().mockResolvedValue(FRESH_DRAFT);
    const deps = depsWith({ findConfigById, getDraftContent });

    await resumeBuilderSession(deps, "memorial-123");

    expect(findConfigById).toHaveBeenCalledWith("memorial-123");
    expect(getDraftContent).toHaveBeenCalledWith("memorial-123");
  });
});

describe("resumeBuilderSession — memorial not found or not authorized", () => {
  it("resolves notFoundOrForbidden when findConfigById returns null", async () => {
    const deps = depsWith({ findConfigById: vi.fn().mockResolvedValue(null) });

    const result = await resumeBuilderSession(deps, "not-mine-or-nonexistent");

    expect(result).toEqual({ status: "notFoundOrForbidden" });
  });

  it("never calls getDraftContent when the memorial itself isn't found — no wasted read, no guessing", async () => {
    const getDraftContent = vi.fn();
    const deps = depsWith({ findConfigById: vi.fn().mockResolvedValue(null), getDraftContent });

    await resumeBuilderSession(deps, "not-mine-or-nonexistent");

    expect(getDraftContent).not.toHaveBeenCalled();
  });
});

describe("resumeBuilderSession — draft anomaly", () => {
  it("resolves draftAnomaly, carrying the (authorized) memorial, when the draft comes back null", async () => {
    const deps = depsWith({ getDraftContent: vi.fn().mockResolvedValue(null) });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "draftAnomaly", memorial: FIXTURE_CONFIG });
  });
});

describe("resumeBuilderSession — repository errors", () => {
  it("resolves error when findConfigById rejects, with its message as the reason", async () => {
    const deps = depsWith({
      findConfigById: vi.fn().mockRejectedValue(new Error("connection reset")),
    });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "error", reason: "connection reset" });
  });

  it("resolves error when getDraftContent rejects, without ever claiming draftAnomaly", async () => {
    const deps = depsWith({ getDraftContent: vi.fn().mockRejectedValue(new Error("network down")) });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "error", reason: "network down" });
  });

  it("normalizes a non-Error rejection to a string reason instead of throwing", async () => {
    const deps = depsWith({ findConfigById: vi.fn().mockRejectedValue("raw string failure") });

    const result = await resumeBuilderSession(deps, "memorial-123");

    expect(result).toEqual({ status: "error", reason: "raw string failure" });
  });
});

describe("resumeBuilderSession — no arbitrary memorial selection", () => {
  it("only ever asks for the exact memorialId passed in — the dependency surface has no listing method to fall back to", async () => {
    // MemorialConfigRepository and
    // Pick<DraftRepository, "getDraftContent"> are the entire dependency
    // surface (see resume-session.ts's own imports/types) — there is no
    // findAll/list method in scope for this function to call even by
    // mistake. This test documents that guarantee at the call level: no
    // matter what memorialId is requested, exactly that id (and no
    // other) reaches both repositories.
    const findConfigById = vi.fn().mockResolvedValue(FIXTURE_CONFIG);
    const getDraftContent = vi.fn().mockResolvedValue(FRESH_DRAFT);
    const deps = depsWith({ findConfigById, getDraftContent });

    await resumeBuilderSession(deps, "some-other-memorial-id");

    expect(findConfigById).toHaveBeenCalledOnce();
    expect(findConfigById).toHaveBeenCalledWith("some-other-memorial-id");
    expect(getDraftContent).toHaveBeenCalledOnce();
    expect(getDraftContent).toHaveBeenCalledWith("some-other-memorial-id");
  });
});

/**
 * Mission 021B — a durable guard on the shape of this module's
 * dependencies, in the same source-level style as
 * lib/auth/heritage-session.test.ts.
 *
 * The audited defect was not a wrong value; it was a dependency that
 * read more than the Builder needs. Switching back to
 * `DataRepository<StoredMemorial>.findById` would silently reintroduce a
 * `memorial_published_snapshots` read — and with it the pressure to
 * grant a client role a privilege on a table nothing displays. That
 * would pass every behavioural test above, so it is asserted here
 * instead.
 *
 * Comments are stripped first: this file's own docstring legitimately
 * names what it stopped using, and explaining a decision must not be
 * indistinguishable from reversing it.
 */
describe("resumeBuilderSession — the Builder's read path stays narrow", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "resume-session.ts"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("depends on the narrow MemorialConfigRepository port", () => {
    // Mission 023: narrowed further, via Pick, to the one method this
    // function actually calls — MemorialConfigRepository itself grew a
    // saveLanguage this function has no business calling.
    expect(CODE).toMatch(
      /memorialConfigRepository: Pick<MemorialConfigRepository, "findConfigById">;/,
    );
    expect(CODE).toMatch(/from "@\/lib\/adapters\/memorial-config-repository"/);
  });

  it("never calls saveLanguage — that is a write, and this function only ever reads", () => {
    expect(CODE).not.toMatch(/\.saveLanguage\(/);
  });

  it("never depends on DataRepository or the composing memorial repository", () => {
    expect(CODE).not.toMatch(/data-repository/);
    expect(CODE).not.toMatch(/DataRepository/);
    expect(CODE).not.toMatch(/SupabaseMemorialRepository/);
  });

  it("never names memorial_published_snapshots in code", () => {
    expect(CODE).not.toMatch(/memorial_published_snapshots/);
  });
});
