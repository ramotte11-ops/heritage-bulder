import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MemorialVersion, StoredMemorialConfig } from "@/types/memorial";

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

const { SupabaseMemorialConfigRepository } = vi.hoisted(() => ({
  SupabaseMemorialConfigRepository: vi
    .fn()
    .mockImplementation(function SupabaseMemorialConfigRepository() {
      return { findConfigById: vi.fn() };
    }),
}));
vi.mock("@/lib/adapters/supabase/memorial-config-repository", () => ({
  SupabaseMemorialConfigRepository,
}));

// Mission 021B: `persist` is a BOUND Server Action, so the page must
// import the action itself. The bound function is what BuilderShell
// receives — these tests check the binding, never the action's own
// behaviour (that is actions.test.ts's job).
const { saveDraftAction } = vi.hoisted(() => ({
  saveDraftAction: vi.fn(async () => ({ updatedAt: "2026-02-01T00:00:00.000Z" })),
}));
// Mission 023: `saveLanguageAction` is bound the same way as
// `saveDraftAction` — see the "wires LanguageStep's persist" test below.
const { saveLanguageAction } = vi.hoisted(() => ({
  saveLanguageAction: vi.fn(async () => undefined),
}));
vi.mock("./actions", () => ({ saveDraftAction, saveLanguageAction }));

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

const { LanguageStep } = vi.hoisted(() => ({ LanguageStep: vi.fn(() => null) }));
vi.mock("@/components/builder/LanguageStep", () => ({ LanguageStep }));

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

const CONFIGURED_MEMORIAL: StoredMemorialConfig = {
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Exactly the row a redemption creates — the family has chosen nothing
 * yet. Mission 011A's normal state, not an error. */
const UNCONFIGURED_MEMORIAL: StoredMemorialConfig = {
  ...CONFIGURED_MEMORIAL,
  editorialContext: null,
  language: null,
  slug: null,
};

/** Mission 023 — T01 is done (language chosen), but no later mission has
 * built the editorial-context step yet. */
const LANGUAGE_CHOSEN_BUT_OTHERWISE_UNCONFIGURED: StoredMemorialConfig = {
  ...CONFIGURED_MEMORIAL,
  editorialContext: null,
  language: "es",
  slug: null,
};

const REAL_DRAFT: MemorialVersion = {
  content: { hero: { title: "Real content" } },
  updatedAt: "2026-01-01T00:00:00.000Z",
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
    LanguageStep.mockClear();
    SupabaseMemorialConfigRepository.mockClear();
    saveDraftAction.mockClear();
    saveLanguageAction.mockClear();
    draftRepositoryInstance.saveDraftContent.mockReset();
  });

  it("resumes the real, authorized memorial and renders BuilderShell with it", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({
      status: "resumable",
      memorial: CONFIGURED_MEMORIAL,
      draft: REAL_DRAFT,
    });

    const result = await callPage();

    expect(resumeBuilderSession).toHaveBeenCalledWith(expect.anything(), MEMORIAL_ID);
    expect(result.type).toBe(BuilderShell);
    // The configuration, plus the one draft resumeBuilderSession read
    // through DraftRepository — and nothing else. No `published`.
    expect(result.props.memorial).toEqual({ ...CONFIGURED_MEMORIAL, draft: REAL_DRAFT });
    expect(result.props.memorial).not.toHaveProperty("published");
  });

  it("reads the memorial through the narrow config port, never the composing repository", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({
      status: "resumable",
      memorial: CONFIGURED_MEMORIAL,
      draft: REAL_DRAFT,
    });

    await callPage();

    expect(SupabaseMemorialConfigRepository).toHaveBeenCalledOnce();
    const [deps] = resumeBuilderSession.mock.calls[0];
    expect(deps).toHaveProperty("memorialConfigRepository");
    expect(deps).toHaveProperty("draftRepository");
    expect(deps).not.toHaveProperty("memorialRepository");
  });

  it("wires `persist` to the saveDraftAction Server Action, bound to the AUTHORIZED memorialId", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    // The authorization deliberately returns a different id from the one
    // in the URL: the bound action must follow the verified one.
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: "authorized-id",
    });
    resumeBuilderSession.mockResolvedValue({
      status: "resumable",
      memorial: CONFIGURED_MEMORIAL,
      draft: REAL_DRAFT,
    });

    const result = await callPage();
    const newContent = { hero: { title: "Edited by the family" } };
    await result.props.persist(newContent);

    expect(saveDraftAction).toHaveBeenCalledExactlyOnceWith("authorized-id", newContent);
  });

  it("never hands the client a closure over a server-side repository — the draft repository is never called from the page", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({
      status: "resumable",
      memorial: CONFIGURED_MEMORIAL,
      draft: REAL_DRAFT,
    });

    const result = await callPage();
    await result.props.persist({ hero: { title: "Edited" } });

    // Rendering built a repository for the READ path only; the write
    // path goes through the Server Action, which builds its own client
    // per call and re-authorizes there.
    expect(draftRepositoryInstance.saveDraftContent).not.toHaveBeenCalled();
  });

  it("never renders the Builder for a memorial the family has not configured yet (editorialContext still NULL)", async () => {
    getHeritageActor.mockResolvedValue(OWNER_ACTOR);
    authorizeMemorialForRequest.mockResolvedValue({
      status: "granted",
      ownerId: "owner-a",
      memorialId: MEMORIAL_ID,
    });
    resumeBuilderSession.mockResolvedValue({
      status: "resumable",
      memorial: UNCONFIGURED_MEMORIAL,
      draft: REAL_DRAFT,
    });

    const result = await callPage();

    expect(BuilderShell).not.toHaveBeenCalled();
    expect(result.type).not.toBe(BuilderShell);
  });

  describe("Mission 023 — T01 (language not yet chosen)", () => {
    it("renders LanguageStep instead of BuilderShell when language is NULL", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: UNCONFIGURED_MEMORIAL,
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(result.type).toBe(LanguageStep);
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("wires LanguageStep's persist to saveLanguageAction, bound to the AUTHORIZED memorialId", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      // Deliberately a different id from the URL, same technique as the
      // equivalent saveDraftAction test above: the bound action must
      // follow the verified id, never the raw one.
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: UNCONFIGURED_MEMORIAL,
        draft: REAL_DRAFT,
      });

      const result = await callPage();
      await result.props.persist("fr");

      expect(saveLanguageAction).toHaveBeenCalledExactlyOnceWith("authorized-id", "fr");
    });

    it("never renders LanguageStep once a language has already been recorded — T01 is never re-posed", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // language: "fr"
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(LanguageStep).not.toHaveBeenCalled();
      expect(result.type).not.toBe(LanguageStep);
    });

    it("resumes straight past T01 (to the not-yet-configured notice) when only the language has been chosen so far", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(LanguageStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      // Localized in the family's own already-chosen language (Spanish
      // in this fixture), not hard-coded French.
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
      expect(JSON.stringify(result)).not.toContain("Votre mémorial doit encore être configuré");
    });
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
 * block: fail loudly the moment somebody reintroduces exactly the
 * shortcut these missions exist to close, even before it is exploited.
 *
 * Comments are stripped before matching. This route's docstring
 * legitimately names what it does NOT use (the demo fixtures, the
 * composing repository, the snapshots table) to explain why — and
 * explaining a decision must never look identical to reversing it.
 */
describe("BuilderMemorialPage — durable guards on the real Builder path", () => {
  const SOURCE = readFileSync(path.resolve(import.meta.dirname, "page.tsx"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("never imports the demo fixtures", () => {
    expect(CODE).not.toMatch(/demo-memorials/);
  });

  it("never imports the memorial-ownership repository or the service-role client directly — the single, already-tested boundary (authorizeMemorialForRequest) is the only ownership check", () => {
    expect(CODE).not.toMatch(/memorial-ownership-repository/);
    expect(CODE).not.toMatch(/service-role-client/);
  });

  /**
   * Mission 021B, decision 1. `SupabaseMemorialRepository.findById()`
   * composes `memorials`, `memorial_drafts` AND
   * `memorial_published_snapshots`. Reaching the Builder through it
   * would force a client-role privilege on a table the Builder displays
   * nothing from — which the Mission 021B migration deliberately does
   * not grant, and scripts/db/test-local.sh asserts stays closed. A
   * regression here would pass every behavioural test and fail only in
   * production, as `permission denied`.
   */
  it("never reads memorial_published_snapshots, directly or through the composing repository", () => {
    expect(CODE).not.toMatch(/memorial_published_snapshots/);
    expect(CODE).not.toMatch(/SupabaseMemorialRepository/);
    expect(CODE).not.toMatch(/memorial-repository/);
    expect(CODE).toMatch(/SupabaseMemorialConfigRepository/);
  });

  /**
   * Mission 021B, decision 2. A closure over a server-side repository
   * both crosses the client boundary illegally and authorizes once per
   * render instead of once per save.
   */
  it("hands BuilderShell a bound Server Action as `persist`, never a closure over a repository", () => {
    expect(CODE).toMatch(/persist=\{saveDraftAction\.bind\(null, access\.memorialId\)\}/);
    expect(CODE).not.toMatch(/persist=\{\(content\)/);
    expect(CODE).not.toMatch(/saveDraftContent/);
  });
});
