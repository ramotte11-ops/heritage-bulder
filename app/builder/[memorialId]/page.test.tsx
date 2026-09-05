import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { StoredMemorial } from "@/types/memorial";

/**
 * Mission 021 — the real Builder entry point.
 *
 * These tests exercise app/builder/[memorialId]/page.tsx exactly the way
 * app/owner/page.test.tsx exercises app/owner/page.tsx: call the async
 * Server Component directly and inspect what it returns (or throws), no
 * DOM rendering (this project's Vitest runs in the "node" environment —
 * see vitest.config.mts, and no components/builder/* file has a DOM
 * test either).
 *
 * The real security decision (`authorizeMemorialForRequest`) and the
 * real resume orchestration (`resumeBuilderSession`) already have their
 * own exhaustive unit tests (lib/auth/heritage-session.test.ts,
 * lib/auth/memorial-access.test.ts, lib/builder/resume-session.test.ts)
 * — this file does not re-prove their internals, only that THIS route
 * calls them correctly, in the right order, and never substitutes a
 * fixture or a second authorization path of its own.
 */

const { getHeritageActor, authorizeMemorialForRequest } = vi.hoisted(() => ({
  getHeritageActor: vi.fn(),
  authorizeMemorialForRequest: vi.fn(),
}));
vi.mock("@/lib/auth/heritage-session", () => ({ getHeritageActor, authorizeMemorialForRequest }));

const { resumeBuilderSession } = vi.hoisted(() => ({ resumeBuilderSession: vi.fn() }));
vi.mock("@/lib/builder/resume-session", () => ({ resumeBuilderSession }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ fake: "session-scoped-client" }),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { SupabaseMemorialRepository } = vi.hoisted(() => ({
  SupabaseMemorialRepository: vi.fn().mockImplementation(function SupabaseMemorialRepository() {
    return { findById: vi.fn() };
  }),
}));
vi.mock("@/lib/adapters/supabase/memorial-repository", () => ({ SupabaseMemorialRepository }));

const { SupabaseDraftRepository, draftRepositoryInstance } = vi.hoisted(() => {
  const instance = { getDraftContent: vi.fn(), saveDraftContent: vi.fn() };
  return {
    draftRepositoryInstance: instance,
    SupabaseDraftRepository: vi.fn().mockImplementation(function SupabaseDraftRepository() {
      return instance;
    }),
  };
});
vi.mock("@/lib/adapters/supabase/draft-repository", () => ({ SupabaseDraftRepository }));

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ notFound, redirect }));

const { BuilderShell } = vi.hoisted(() => ({ BuilderShell: vi.fn(() => null) }));
vi.mock("@/components/builder/BuilderShell", () => ({ BuilderShell }));

// Imported after every mock above is registered.
const { default: BuilderMemorialPage } = await import("./page");

const MEMORIAL_ID = "memorial-abc";

const VISITOR = { audience: "visitor", identity: null, owner: null, isHeritageAdmin: false };
const OWNER_ACTOR = {
  audience: "owner",
  identity: { id: "auth-a", email: "a@example.test", app_metadata: {} },
  owner: { id: "owner-a", authUserId: "auth-a", email: "a@example.test", createdAt: "", updatedAt: "" },
  isHeritageAdmin: false,
};

const CONFIGURED_MEMORIAL: StoredMemorial = {
  id: MEMORIAL_ID,
  ownerId: "owner-a",
  entitlementId: "entitlement-a",
  memorialType: "person",
  editorialContext: "announcement",
  skin: "intemporel",
  language: "fr",
  enabledSections: ["story"],
  status: "draft",
  slug: "real-memorial",
  draft: { content: { hero: { title: "Real content" } }, updatedAt: "2026-01-01T00:00:00.000Z" },
  published: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const UNCONFIGURED_MEMORIAL: StoredMemorial = {
  ...CONFIGURED_MEMORIAL,
  editorialContext: null,
  language: null,
  slug: null,
};

function paramsFor(memorialId: string) {
  return Promise.resolve({ memorialId });
}

async function callPage(memorialId = MEMORIAL_ID) {
  return BuilderMemorialPage({ params: paramsFor(memorialId) });
}

describe("BuilderMemorialPage — no session", () => {
  beforeEach(() => {
    getHeritageActor.mockReset();
    authorizeMemorialForRequest.mockReset();
    resumeBuilderSession.mockReset();
    notFound.mockClear();
    redirect.mockClear();
    BuilderShell.mockClear();
  });

  it("redirects to /login with a return path, and never touches ownership or draft data", async () => {
    getHeritageActor.mockResolvedValue(VISITOR);

    await expect(callPage()).rejects.toThrow(`REDIRECT:/login?next=/builder/${MEMORIAL_ID}`);

    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
    expect(resumeBuilderSession).not.toHaveBeenCalled();
  });
});

describe("BuilderMemorialPage — access denied (no Owner, wrong Owner, or no such memorial)", () => {
  beforeEach(() => {
    getHeritageActor.mockReset();
    authorizeMemorialForRequest.mockReset();
    resumeBuilderSession.mockReset();
    notFound.mockClear();
    redirect.mockClear();
    BuilderShell.mockClear();
  });

  it("renders nothing private and never calls resumeBuilderSession when authorization is denied", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    await expect(callPage()).rejects.toThrow("NOT_FOUND");

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith(MEMORIAL_ID);
    expect(resumeBuilderSession).not.toHaveBeenCalled();
    expect(BuilderShell).not.toHaveBeenCalled();
  });

  it("is denied the same way for Owner A on Owner B's memorial as for a session with no Owner at all", async () => {
    // authorizeMemorialForRequest is the single, already-tested boundary
    // that decides this (lib/auth/heritage-session.test.ts /
    // lib/auth/memorial-access.test.ts) — this route must simply obey
    // its answer, uniformly, whatever the underlying reason.
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });

    await expect(callPage("someone-elses-memorial")).rejects.toThrow("NOT_FOUND");
    expect(resumeBuilderSession).not.toHaveBeenCalled();
  });
});

describe("BuilderMemorialPage — granted access", () => {
  beforeEach(() => {
    getHeritageActor.mockReset();
    authorizeMemorialForRequest.mockReset();
    resumeBuilderSession.mockReset();
    notFound.mockClear();
    redirect.mockClear();
    BuilderShell.mockClear();
    draftRepositoryInstance.saveDraftContent.mockReset();
  });

  it("resumes the real, authorized memorial and renders BuilderShell with it", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({ status: "resumable", memorial: CONFIGURED_MEMORIAL });

    const result = await callPage();

    expect(resumeBuilderSession).toHaveBeenCalledWith(expect.anything(), MEMORIAL_ID);
    expect(result.type).toBe(BuilderShell);
    expect(result.props.memorial).toBe(CONFIGURED_MEMORIAL);
  });

  it("wires `persist` to the real draft repository, scoped to the authorized memorialId", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({ status: "resumable", memorial: CONFIGURED_MEMORIAL });
    draftRepositoryInstance.saveDraftContent.mockResolvedValue({ updatedAt: "2026-02-01T00:00:00.000Z" });

    const result = await callPage();
    const newContent = { hero: { title: "Edited by the family" } };
    await result.props.persist(newContent);

    expect(draftRepositoryInstance.saveDraftContent).toHaveBeenCalledWith(MEMORIAL_ID, newContent);
  });

  it("never renders the Builder for a memorial the family has not configured yet (editorialContext still NULL)", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({ status: "resumable", memorial: UNCONFIGURED_MEMORIAL });

    const result = await callPage();

    expect(BuilderShell).not.toHaveBeenCalled();
    expect(result.type).not.toBe(BuilderShell);
  });

  it("resolves notFoundOrForbidden from resumeBuilderSession the same way as a denied authorization", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({ status: "notFoundOrForbidden" });

    await expect(callPage()).rejects.toThrow("NOT_FOUND");
    expect(BuilderShell).not.toHaveBeenCalled();
  });

  it("renders a controlled failure notice on a genuine repository error — never a crash, never a fixture", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({ status: "error", reason: "connection reset" });

    const result = await callPage();

    expect(BuilderShell).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("connection reset");
  });

  it("renders a controlled notice on a draft anomaly, still carrying no fixture and no crash", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({ status: "draftAnomaly", memorial: CONFIGURED_MEMORIAL });

    await callPage();

    expect(BuilderShell).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});

/**
 * Source-level guards, same technique as
 * lib/auth/heritage-session.test.ts's "declared signature" describe
 * block: fails loudly the moment somebody reintroduces exactly the
 * shortcut this mission exists to close, even before it is exploited.
 */
describe("BuilderMemorialPage — no fixture fallback, no second authorization mechanism", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "page.tsx"), "utf8");

  it("never imports the demo fixtures", () => {
    // The docstring above legitimately mentions demo-memorials.ts by
    // name (to explain why it is NOT imported) — this only checks for
    // an actual import statement, not the file's own explanation.
    expect(SOURCE).not.toMatch(/from ["']@\/lib\/builder\/demo-memorials["']/);
  });

  it("never imports the memorial-ownership repository or the service-role client directly — the single, already-tested boundary (authorizeMemorialForRequest) is the only ownership check", () => {
    expect(SOURCE).not.toMatch(/memorial-ownership-repository/);
    expect(SOURCE).not.toMatch(/service-role-client/);
  });
});
