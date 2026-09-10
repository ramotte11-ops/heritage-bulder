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
// Mission 024: `saveEditorialContextAction` is bound the same way again
// — see the "wires ContextStep's persist" test below.
const { saveEditorialContextAction } = vi.hoisted(() => ({
  saveEditorialContextAction: vi.fn(async () => undefined),
}));
vi.mock("./actions", () => ({ saveDraftAction, saveLanguageAction, saveEditorialContextAction }));

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

const { ContextStep } = vi.hoisted(() => ({ ContextStep: vi.fn(() => null) }));
vi.mock("@/components/builder/ContextStep", () => ({ ContextStep }));

// Mission 032 — PAGE A / PAGE B, mocked the same way as LanguageStep/
// ContextStep above: this file only proves the ROUTE wires them
// correctly (gate condition, props, persist binding), never their own
// rendering — that is hero-step.test.ts's and each component's own
// concern. Mocking them also keeps this suite out of next/font
// (components/builder/fonts.ts), which BuilderScreen — and therefore
// these two components — pulls in transitively.
const { HeroIdentityStep } = vi.hoisted(() => ({ HeroIdentityStep: vi.fn(() => null) }));
vi.mock("@/components/builder/HeroIdentityStep", () => ({ HeroIdentityStep }));

const { HeroPhraseStep } = vi.hoisted(() => ({ HeroPhraseStep: vi.fn(() => null) }));
vi.mock("@/components/builder/HeroPhraseStep", () => ({ HeroPhraseStep }));

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
  skinVariant: "light",
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

/** Mission 023 — T01 is done (language chosen), but Mission 024's T02
 * (editorial context) has not been completed yet. */
const LANGUAGE_CHOSEN_BUT_OTHERWISE_UNCONFIGURED: StoredMemorialConfig = {
  ...CONFIGURED_MEMORIAL,
  editorialContext: null,
  language: "es",
  slug: null,
};

/** Mission 024 — T01 AND T02 are both done (language + editorial context
 * chosen), but no later mission has built slug generation yet. */
const LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED: StoredMemorialConfig = {
  ...CONFIGURED_MEMORIAL,
  editorialContext: "remembrance",
  language: "es",
  slug: null,
};

/** Mission 032 — PAGE A and PAGE B both genuinely done: a real
 * `displayName`, T04 explicitly skipped (never just inferred from zero
 * dates — QG micro-correction), and T05 explicitly treated too. Paired
 * with a memorial that has a language and an editorial context, this
 * draft resumes straight past both new gates — exactly what every
 * pre-032 test below that expects to reach BuilderShell (or the
 * T02/"not configured yet" fallthrough) still needs. See the "Mission
 * 032" describe block for the drafts that deliberately do NOT satisfy
 * these gates. */
const REAL_DRAFT: MemorialVersion = {
  content: {
    hero: { displayName: "Real content", birth: null, death: null, shortPhrase: null, photo: null },
    guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" } },
  } as MemorialVersion["content"],
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
    ContextStep.mockClear();
    HeroIdentityStep.mockClear();
    HeroPhraseStep.mockClear();
    SupabaseMemorialConfigRepository.mockClear();
    saveDraftAction.mockClear();
    saveLanguageAction.mockClear();
    saveEditorialContextAction.mockClear();
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

    it("resumes straight past T01 (to Mission 024's T02) when only the language has been chosen so far", async () => {
      // Mission 024 update: this used to fall through all the way to the
      // generic "not configured" notice (there was no T02 yet). Now that
      // T02 exists, a memorial with language set but no editorialContext
      // renders ContextStep instead — see the "Mission 024 — T02" block
      // below for that gate's own dedicated tests.
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
      expect(result.type).toBe(ContextStep);
    });
  });

  describe("Mission 024 — T02 (language chosen, editorial context not yet chosen)", () => {
    it("renders ContextStep instead of BuilderShell when language is set but editorialContext is NULL", async () => {
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

      expect(result.type).toBe(ContextStep);
      expect(BuilderShell).not.toHaveBeenCalled();
      expect(LanguageStep).not.toHaveBeenCalled();
    });

    it("passes the memorial's already-persisted language to ContextStep", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, // language: "es"
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(result.props.language).toBe("es");
    });

    it("wires ContextStep's persist to saveEditorialContextAction, bound to the AUTHORIZED memorialId", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      // Deliberately a different id from the URL — the bound action must
      // follow the verified id, never the raw one.
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: REAL_DRAFT,
      });

      const result = await callPage();
      await result.props.persist("announcement");

      expect(saveEditorialContextAction).toHaveBeenCalledExactlyOnceWith(
        "authorized-id",
        "announcement",
      );
    });

    it("never renders ContextStep once an editorial context has already been recorded — T02 is never re-posed", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // language: "fr", editorialContext: "announcement"
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(ContextStep).not.toHaveBeenCalled();
      expect(result.type).not.toBe(ContextStep);
    });

    it("resumes straight past T02 (to the not-yet-configured notice) when language and editorial context are both chosen but slug is not", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(ContextStep).not.toHaveBeenCalled();
      expect(LanguageStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      // Localized in the family's own already-chosen language (Spanish
      // in this fixture), not hard-coded French.
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
      expect(JSON.stringify(result)).not.toContain("Votre mémorial doit encore être configuré");
    });

    it("never deduces the editorial context from a death date, an offer, a skin, or a culture — resumeBuilderSession's memorial carries no such signal to ContextStep", async () => {
      // Mission 024 section 3's absolute rule, checked at the boundary
      // this route controls: ContextStep receives only `language` and
      // `persist` — never the memorial's skin, offer, or any date field,
      // so there is nothing for it to deduce from even if it wanted to.
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

      expect(Object.keys(result.props)).toEqual(["language", "persist"]);
    });
  });

  describe("Mission 032 — PAGE A (T03 + T04) and PAGE B (T05)", () => {
    /** Language + editorial context both chosen (T01/T02 done), but the
     * Hero has no displayName yet — the normal state right after T02. */
    const DRAFT_WITHOUT_HERO: MemorialVersion = {
      content: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** QG micro-correction fixture: a `displayName` that was only ever
     * autosaved while typing — zero dates, and the family never clicked
     * Continue on PAGE A (e.g. the browser was closed mid-visit). This
     * must NOT read as "PAGE A done": T04 has genuinely not been
     * resolved either way yet. */
    const DRAFT_WITH_NAME_ONLY_AUTOSAVED: MemorialVersion = {
      content: {
        hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** QG final correction fixture: a `displayName` AND a `birth` date,
     * both only ever autosaved while typing — the family never clicked
     * Continue. A date sitting in the field is draft content, not yet a
     * decision, so this must NOT read as "PAGE A done" either. */
    const DRAFT_WITH_NAME_AND_DATE_AUTOSAVED: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: { precision: "year", year: 1950 },
          death: null,
          shortPhrase: null,
          photo: null,
        },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** T03 done (a real displayName), T04 genuinely resolved via an
     * explicit Continue click with zero dates (`commitPageA`'s own
     * write), T05 never treated — PAGE A behind the family for real,
     * PAGE B still ahead. */
    const DRAFT_WITH_NAME_AND_T04_SKIPPED: MemorialVersion = {
      content: {
        hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
        guidedFlow: { T04: { status: "skipped" } },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** T04 genuinely resolved via an explicit Continue click WITH a
     * real date present at that moment — "completed", T05 never
     * treated — PAGE A behind the family for real, PAGE B still ahead. */
    const DRAFT_WITH_NAME_AND_T04_COMPLETED: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: { precision: "year", year: 1950 },
          death: null,
          shortPhrase: null,
          photo: null,
        },
        guidedFlow: { T04: { status: "completed" } },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** T04 explicitly skipped, THEN a date was added afterwards (e.g.
     * the family came back and typed a birth year) without a second
     * Continue click — T04 must flip to "completed" live. */
    const DRAFT_WITH_T04_SKIPPED_THEN_DATE_ADDED: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: { precision: "year", year: 1950 },
          death: null,
          shortPhrase: null,
          photo: null,
        },
        guidedFlow: { T04: { status: "skipped" } },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** A `content.hero` that fails Mission 031's own validation —
     * real, existing data that is malformed, not merely empty. */
    const DRAFT_WITH_CORRUPTED_HERO: MemorialVersion = {
      content: { hero: "not an object" } as unknown as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("renders HeroIdentityStep (PAGE A) once T01/T02 are done but the Hero has no displayName yet", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITHOUT_HERO,
      });

      const result = await callPage();

      expect(result.type).toBe(HeroIdentityStep);
      expect(HeroPhraseStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("renders HeroIdentityStep (PAGE A) for a corrupted stored Hero too — never silently skipped", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_CORRUPTED_HERO,
      });

      const result = await callPage();

      expect(result.type).toBe(HeroIdentityStep);
      expect(result.props.content).toEqual(DRAFT_WITH_CORRUPTED_HERO.content);
    });

    it("wires HeroIdentityStep's persist to saveDraftAction, bound to the AUTHORIZED memorialId, and passes the real editorialContext/content", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITHOUT_HERO,
      });

      const result = await callPage();
      expect(result.props.language).toBe("es");
      expect(result.props.editorialContext).toBe("remembrance");
      expect(result.props.content).toEqual(DRAFT_WITHOUT_HERO.content);

      const newContent = { hero: { displayName: "Edited" } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledExactlyOnceWith("authorized-id", newContent);
    });

    it("QG micro-correction: STILL renders HeroIdentityStep (PAGE A) for a name-only autosave — zero dates, no Continue click yet", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_NAME_ONLY_AUTOSAVED,
      });

      const result = await callPage();

      // A displayName alone is not proof T04 was ever treated — the
      // family may have simply closed the browser before clicking
      // Continue. Resuming must land them back on PAGE A, never on
      // PAGE B (which would silently treat the empty date fields as a
      // deliberate skip they never made).
      expect(result.type).toBe(HeroIdentityStep);
      expect(HeroPhraseStep).not.toHaveBeenCalled();
    });

    it("QG final correction: STILL renders HeroIdentityStep (PAGE A) for a name+date autosave — a date alone is not a decision, no Continue click yet", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_NAME_AND_DATE_AUTOSAVED,
      });

      const result = await callPage();

      // An autosaved date is still just draft content — only an actual
      // Continue click (commitPageA) resolves T04, so this must resume
      // on PAGE A, not jump ahead to PAGE B.
      expect(result.type).toBe(HeroIdentityStep);
      expect(HeroPhraseStep).not.toHaveBeenCalled();
    });

    it("resumes on PAGE B once the family clicked Continue on PAGE A WITH a date — T04 'completed'", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_NAME_AND_T04_COMPLETED,
      });

      const result = await callPage();

      expect(result.type).toBe(HeroPhraseStep);
      expect(HeroIdentityStep).not.toHaveBeenCalled();
    });

    it("resumes on PAGE B (not PAGE A) once T04 — previously skipped — flips to 'completed' after the family adds a date, with no second Continue click", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_T04_SKIPPED_THEN_DATE_ADDED,
      });

      const result = await callPage();

      expect(result.type).toBe(HeroPhraseStep);
      expect(HeroIdentityStep).not.toHaveBeenCalled();
    });

    it("never renders HeroIdentityStep once T04 has been genuinely resolved (an explicit skip) — T03/T04 are never re-posed", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_NAME_AND_T04_SKIPPED,
      });

      const result = await callPage();

      expect(HeroIdentityStep).not.toHaveBeenCalled();
      expect(result.type).not.toBe(HeroIdentityStep);
    });

    it("renders HeroPhraseStep (PAGE B) once T04 was explicitly skipped and T05 has never been treated", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_NAME_AND_T04_SKIPPED,
      });

      const result = await callPage();

      expect(result.type).toBe(HeroPhraseStep);
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("wires HeroPhraseStep's persist to saveDraftAction, bound to the AUTHORIZED memorialId, and passes the real editorialContext/content", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_NAME_AND_T04_SKIPPED,
      });

      const result = await callPage();
      expect(result.props.language).toBe("es");
      expect(result.props.editorialContext).toBe("remembrance");
      expect(result.props.content).toEqual(DRAFT_WITH_NAME_AND_T04_SKIPPED.content);

      const newContent = { hero: { displayName: "Jean Dupont", shortPhrase: "Un homme bon" } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledExactlyOnceWith("authorized-id", newContent);
    });

    it("never renders HeroPhraseStep once T05 has already been treated — resumes straight to the next gate", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, // slug still null
        draft: REAL_DRAFT, // T03 + T05 both already done
      });

      const result = await callPage();

      expect(HeroPhraseStep).not.toHaveBeenCalled();
      expect(HeroIdentityStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      // Falls through to the existing T02-era notice — no later Guided
      // Flow step (T06 photo included) is built by this mission.
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
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

  it("hands ContextStep a bound Server Action as `persist` too, never a closure over a repository", () => {
    expect(CODE).toMatch(/persist=\{saveEditorialContextAction\.bind\(null, access\.memorialId\)\}/);
    expect(CODE).not.toMatch(/saveEditorialContext\(/);
  });

  it("never deduces the editorial context from a death date, an offer, a skin, or a culture — the source has no such signal in scope", () => {
    expect(CODE).not.toMatch(/deathDate|dateOfDeath|offerId|\.skin|culture/i);
  });
});
