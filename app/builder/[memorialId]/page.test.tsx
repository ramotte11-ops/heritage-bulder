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

// Mission 033 — PAGE C, mocked the same way and for the same reasons as
// HeroIdentityStep/HeroPhraseStep above.
const { HeroPhotoStep } = vi.hoisted(() => ({ HeroPhotoStep: vi.fn(() => null) }));
vi.mock("@/components/builder/HeroPhotoStep", () => ({ HeroPhotoStep }));

// Mission 034 — PAGE D, mocked the same way again.
const { HeroCropStep } = vi.hoisted(() => ({ HeroCropStep: vi.fn(() => null) }));
vi.mock("@/components/builder/HeroCropStep", () => ({ HeroCropStep }));

// Mission 035 — PAGE E, mocked the same way again (and for the same
// "keep this suite out of next/font" reason — HeroRevealStep pulls in
// HeroIntemporel, which pulls in the Hero-specific fonts).
const { HeroRevealStep } = vi.hoisted(() => ({ HeroRevealStep: vi.fn(() => null) }));
vi.mock("@/components/builder/HeroRevealStep", () => ({ HeroRevealStep }));

// Mission 039 — A01/A02, mocked the same way and for the same reasons.
const { DeathNoticeAnnouncementStep } = vi.hoisted(() => ({
  DeathNoticeAnnouncementStep: vi.fn(() => null),
}));
vi.mock("@/components/builder/DeathNoticeAnnouncementStep", () => ({ DeathNoticeAnnouncementStep }));

const { DeathNoticePrecisionsStep } = vi.hoisted(() => ({
  DeathNoticePrecisionsStep: vi.fn(() => null),
}));
vi.mock("@/components/builder/DeathNoticePrecisionsStep", () => ({ DeathNoticePrecisionsStep }));

// Mission 033 — PAGE C's own server-side data resolution (the section-14
// compensation pass + the initial signed read URL) and the wiring that
// builds its real MediaEngineDeps. Both compose real Mission 030
// primitives this route never re-implements — this file only proves the
// ROUTE calls them with the right arguments and renders what they
// return; resolve-hero-photo-step.test.ts is where their own behaviour
// is actually proven.
// Mission 033 QG follow-up: `reconcileHeroMediaOnResume` is the durable
// retry called on every load PAST the PAGE C gate — defaulted to a
// passthrough (returns `content` unchanged) so every pre-existing test
// below, which does not care about it, keeps working unmodified; tests
// that DO care about it override the mock explicitly.
const { resolveHeroPhotoStepData, reconcileHeroMediaOnResume } = vi.hoisted(() => ({
  resolveHeroPhotoStepData: vi.fn(),
  reconcileHeroMediaOnResume: vi.fn((_deps: unknown, _actor: unknown, _memorialId: string, content: unknown) =>
    Promise.resolve(content),
  ),
}));
vi.mock("@/lib/builder/guided-flow/resolve-hero-photo-step", () => ({
  resolveHeroPhotoStepData,
  reconcileHeroMediaOnResume,
}));

// Mission 034 — PAGE D's own server-side data resolution (the one
// signed read URL it needs, against the already-reconciled content).
// This file only proves the ROUTE calls it correctly and renders what
// it returns; resolve-hero-crop-step.test.ts proves its own behaviour.
const { resolveHeroCropStepData } = vi.hoisted(() => ({ resolveHeroCropStepData: vi.fn() }));
vi.mock("@/lib/builder/guided-flow/resolve-hero-crop-step", () => ({ resolveHeroCropStepData }));

const { createServerMediaEngineDeps } = vi.hoisted(() => ({
  createServerMediaEngineDeps: vi.fn().mockReturnValue({ fake: "media-engine-deps" }),
}));
vi.mock("@/lib/media/server-media-engine", () => ({ createServerMediaEngineDeps }));

const {
  reserveHeroPhotoUploadAction,
  finalizeHeroPhotoUploadAction,
  retireHeroPhotoUploadAction,
} = vi.hoisted(() => ({
  reserveHeroPhotoUploadAction: vi.fn(),
  finalizeHeroPhotoUploadAction: vi.fn(),
  retireHeroPhotoUploadAction: vi.fn(),
}));
vi.mock("./media-actions", () => ({
  reserveHeroPhotoUploadAction,
  finalizeHeroPhotoUploadAction,
  retireHeroPhotoUploadAction,
}));

const { saveSkinVariantAction } = vi.hoisted(() => ({ saveSkinVariantAction: vi.fn() }));
vi.mock("./hero-reveal-actions", () => ({ saveSkinVariantAction }));

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

/** Mission 032/033/034/035/039 — PAGE A, PAGE B, PAGE C, PAGE D, PAGE E,
 * A01 and A02 all genuinely done: a real `displayName`, T04 explicitly
 * skipped (never just inferred from zero dates — QG micro-correction),
 * T05 explicitly treated, T06 explicitly completed with a real photo
 * reference, T07 explicitly completed with a real crop attached to that
 * exact photo, T08 explicitly completed (Mission 035's own "Hero
 * reveal" confirmation), A01 explicitly completed with a real
 * announcement text, and A02 explicitly skipped (Mission 039 — A01/A02
 * only apply to `CONFIGURED_MEMORIAL`'s own `announcement` context, but
 * a completed/skipped StepRecord is simply inert, unread data for a
 * `remembrance` memorial, so the same draft still works for both).
 * Paired with a memorial that has a language and an editorial context,
 * this draft resumes straight past every gate — exactly what every
 * pre-039 test below that expects to reach BuilderShell (or the T02/
 * "not configured yet" fallthrough) still needs. See the "Mission 032"/
 * "Mission 033"/"Mission 034"/"Mission 035"/"Mission 039" describe
 * blocks for the drafts that deliberately do NOT satisfy these gates. */
const REAL_DRAFT: MemorialVersion = {
  content: {
    hero: {
      displayName: "Real content",
      birth: null,
      death: null,
      shortPhrase: null,
      photo: {
        mediaId: "cccccccc-cccc-4ccc-8ccc-000000000001",
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      },
    },
    deathNotice: {
      announcementText: "C'est avec tristesse que nous annonçons son départ.",
      precisions: {
        generalLocation: null,
        familyMessage: null,
        thought: null,
        quote: null,
        other: null,
      },
    },
    guidedFlow: {
      T04: { status: "skipped" },
      T05: { status: "skipped" },
      T06: { status: "completed" },
      T07: { status: "completed" },
      T08: { status: "completed" },
      A01: { status: "completed" },
      A02: { status: "skipped" },
    },
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
    HeroPhotoStep.mockClear();
    HeroCropStep.mockClear();
    HeroRevealStep.mockClear();
    saveSkinVariantAction.mockClear();
    resolveHeroPhotoStepData.mockReset();
    resolveHeroCropStepData.mockReset();
    reconcileHeroMediaOnResume.mockReset();
    reconcileHeroMediaOnResume.mockImplementation(
      (_deps: unknown, _actor: unknown, _memorialId: string, content: unknown) => Promise.resolve(content),
    );
    createServerMediaEngineDeps.mockClear();
    reserveHeroPhotoUploadAction.mockClear();
    finalizeHeroPhotoUploadAction.mockClear();
    retireHeroPhotoUploadAction.mockClear();
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
        draft: REAL_DRAFT, // T03 + T05 + T06 + T07 all already done
      });

      const result = await callPage();

      expect(HeroPhraseStep).not.toHaveBeenCalled();
      expect(HeroIdentityStep).not.toHaveBeenCalled();
      expect(HeroPhotoStep).not.toHaveBeenCalled();
      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      // Falls through to the existing T02-era notice — no later Guided
      // Flow step exists past T07 (Mission 034's own final trunk steps
      // — P01/V02/... — are a later mission's job, not built here).
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
    });
  });

  describe("Mission 033 — PAGE C (T06 photo Hero)", () => {
    /** PAGE A and PAGE B both genuinely done (same shape as REAL_DRAFT's
     * own Hero portion), but T06 has never been treated — the normal
     * state right after PAGE B. */
    const DRAFT_WITH_PAGE_B_DONE_NO_PHOTO: MemorialVersion = {
      content: {
        hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
        guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" } },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const RESOLVED_PHOTO_DATA = {
      content: DRAFT_WITH_PAGE_B_DONE_NO_PHOTO.content,
      initialPhoto: null,
    };

    it("never calls resolveHeroPhotoStepData while PAGE A/PAGE B are still ahead of the family", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: { content: {}, updatedAt: "2026-01-01T00:00:00.000Z" }, // T03 not even started
      });

      const result = await callPage();

      expect(result.type).toBe(HeroIdentityStep);
      expect(resolveHeroPhotoStepData).not.toHaveBeenCalled();
      expect(HeroPhotoStep).not.toHaveBeenCalled();
    });

    it("renders HeroPhotoStep (PAGE C) once PAGE A/PAGE B are done and T06 has never been treated", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_B_DONE_NO_PHOTO,
      });
      resolveHeroPhotoStepData.mockResolvedValue(RESOLVED_PHOTO_DATA);

      const result = await callPage();

      expect(result.type).toBe(HeroPhotoStep);
      expect(HeroIdentityStep).not.toHaveBeenCalled();
      expect(HeroPhraseStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("resolves PAGE C's data with the real actor, the AUTHORIZED memorialId and the draft content", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_B_DONE_NO_PHOTO,
      });
      resolveHeroPhotoStepData.mockResolvedValue(RESOLVED_PHOTO_DATA);

      await callPage();

      expect(resolveHeroPhotoStepData).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mediaEngine: { fake: "media-engine-deps" } }),
        OWNER_ACTOR,
        "authorized-id",
        DRAFT_WITH_PAGE_B_DONE_NO_PHOTO.content,
      );
    });

    it("renders HeroPhotoStep with the content/initialPhoto resolveHeroPhotoStepData returned — never the raw, unreconciled draft content", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_B_DONE_NO_PHOTO,
      });
      const reconciledData = {
        content: { hero: { displayName: "Jean Dupont", photo: { mediaId: "reconciled-id", crop: null } } },
        initialPhoto: {
          media: { id: "reconciled-id", purpose: "hero", status: "ready" },
          readUrl: "https://storage.test/signed/reconciled",
        },
      };
      resolveHeroPhotoStepData.mockResolvedValue(reconciledData);

      const result = await callPage();

      expect(result.props.content).toBe(reconciledData.content);
      expect(result.props.initialPhoto).toBe(reconciledData.initialPhoto);
      expect(result.props.language).toBe("es");
      expect(result.props.editorialContext).toBe("remembrance");
    });

    it("wires persist/reserveUpload/finalizeUpload/retireUpload to the AUTHORIZED memorialId, never the raw URL segment", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_B_DONE_NO_PHOTO,
      });
      resolveHeroPhotoStepData.mockResolvedValue(RESOLVED_PHOTO_DATA);

      const result = await callPage("claimed-id");

      const newContent = { hero: { displayName: "Jean Dupont" } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledExactlyOnceWith("authorized-id", newContent);

      await result.props.reserveUpload("image/jpeg");
      expect(reserveHeroPhotoUploadAction).toHaveBeenCalledExactlyOnceWith(
        "authorized-id",
        "image/jpeg",
      );

      await result.props.finalizeUpload("some-media-id");
      expect(finalizeHeroPhotoUploadAction).toHaveBeenCalledExactlyOnceWith(
        "authorized-id",
        "some-media-id",
      );

      await result.props.retireUpload("old-media-id");
      expect(retireHeroPhotoUploadAction).toHaveBeenCalledExactlyOnceWith(
        "authorized-id",
        "old-media-id",
      );
    });

    it("never renders HeroPhotoStep once T06 has already been explicitly completed — resumes straight to the next gate", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, // slug still null
        draft: REAL_DRAFT, // T03 + T05 + T06 + T07 all already done
      });

      const result = await callPage();

      expect(HeroPhotoStep).not.toHaveBeenCalled();
      expect(resolveHeroPhotoStepData).not.toHaveBeenCalled();
      // T07 is also already done on REAL_DRAFT (Mission 034) — PAGE D
      // is skipped straight past too.
      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(resolveHeroCropStepData).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      // Falls through to the existing T02-era notice — no later Guided
      // Flow step exists past T07 that this codebase has built yet.
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
      // QG follow-up: T06 being completed does NOT stop the durable
      // retire retry — a stale, non-canonical ready hero media must
      // still be able to get cleaned up on this exact load.
      expect(reconcileHeroMediaOnResume).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mediaEngine: { fake: "media-engine-deps" } }),
        OWNER_ACTOR,
        MEMORIAL_ID,
        REAL_DRAFT.content,
      );
    });

    it("renders BuilderShell once T06 is completed and the memorial is otherwise fully configured", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // has a real slug
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(result.type).toBe(BuilderShell);
      expect(HeroPhotoStep).not.toHaveBeenCalled();
      expect(resolveHeroPhotoStepData).not.toHaveBeenCalled();
      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(resolveHeroCropStepData).not.toHaveBeenCalled();
      // QG follow-up: the durable retire retry still runs on this load
      // too, past T06, exactly like the notice-branch test above.
      expect(reconcileHeroMediaOnResume).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mediaEngine: { fake: "media-engine-deps" } }),
        OWNER_ACTOR,
        MEMORIAL_ID,
        REAL_DRAFT.content,
      );
    });

    it("QG follow-up: never calls the T06 retry before PAGE A/PAGE B/T06 are all genuinely behind the family", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: { content: {}, updatedAt: "2026-01-01T00:00:00.000Z" }, // T03 not even started
      });

      const result = await callPage();

      expect(result.type).toBe(HeroIdentityStep);
      expect(reconcileHeroMediaOnResume).not.toHaveBeenCalled();
    });

    it("QG follow-up: BuilderShell receives the RECONCILED content, never the raw pre-reconciliation draft", async () => {
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
      const reconciledContent = {
        hero: { ...REAL_DRAFT.content.hero, photo: { mediaId: "adopted-later", crop: null } },
        // Mission 039 — this fixture deliberately carries no T06/T07/T08
        // guidedFlow entries at all (same as before A01/A02 existed):
        // `needsPageC` being true short-circuits `needsPageD`/`needsPageE`
        // to false, so neither PAGE D nor PAGE E is reached. A01/A02
        // ARE reached now, though (nothing gates them behind PAGE C the
        // same way), so they need their own StepRecord here to keep
        // falling through to BuilderShell, exactly like every other gate
        // this specific test does not care about.
        guidedFlow: { A01: { status: "completed" }, A02: { status: "skipped" } },
      };
      reconcileHeroMediaOnResume.mockResolvedValue(reconciledContent);

      const result = await callPage();

      expect(result.props.memorial.draft.content).toBe(reconciledContent);
      expect(result.props.memorial.draft.content).not.toBe(REAL_DRAFT.content);
      // Everything else about the draft (its updatedAt) survives.
      expect(result.props.memorial.draft.updatedAt).toBe(REAL_DRAFT.updatedAt);
    });
  });

  describe("Mission 034 — PAGE D (T07 photo crop)", () => {
    /** PAGE A, PAGE B and PAGE C (T06) all genuinely done — a real hero
     * photo linked and confirmed — but T07 has never been treated. The
     * normal state right after PAGE C's own Continue click. */
    const DRAFT_WITH_PAGE_C_DONE_NO_CROP: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: null,
          death: null,
          shortPhrase: null,
          photo: { mediaId: "cccccccc-cccc-4ccc-8ccc-000000000001", crop: null },
        },
        guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" }, T06: { status: "completed" } },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const RESOLVED_CROP_DATA = {
      media: { id: "cccccccc-cccc-4ccc-8ccc-000000000001", purpose: "hero", status: "ready" },
      readUrl: "https://storage.test/signed/crop",
    };

    it("never calls resolveHeroCropStepData while PAGE A/PAGE B/PAGE C are still ahead of the family", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: { content: {}, updatedAt: "2026-01-01T00:00:00.000Z" }, // T03 not even started
      });

      const result = await callPage();

      expect(result.type).toBe(HeroIdentityStep);
      expect(resolveHeroCropStepData).not.toHaveBeenCalled();
      expect(HeroCropStep).not.toHaveBeenCalled();
    });

    it("renders HeroCropStep (PAGE D) once PAGE A/PAGE B/PAGE C are done and T07 has never been treated", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_NO_CROP,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_CROP_DATA);

      const result = await callPage();

      expect(result.type).toBe(HeroCropStep);
      expect(HeroIdentityStep).not.toHaveBeenCalled();
      expect(HeroPhraseStep).not.toHaveBeenCalled();
      expect(HeroPhotoStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("resolves PAGE D's data with the real actor, the AUTHORIZED memorialId and the RECONCILED content", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_NO_CROP,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_CROP_DATA);

      await callPage();

      expect(resolveHeroCropStepData).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mediaEngine: { fake: "media-engine-deps" } }),
        OWNER_ACTOR,
        "authorized-id",
        DRAFT_WITH_PAGE_C_DONE_NO_CROP.content, // the passthrough reconcileHeroMediaOnResume default.
      );
    });

    it("renders HeroCropStep with the content/photo resolveHeroCropStepData returned", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_NO_CROP,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_CROP_DATA);

      const result = await callPage();

      expect(result.props.content).toBe(DRAFT_WITH_PAGE_C_DONE_NO_CROP.content);
      expect(result.props.photo).toBe(RESOLVED_CROP_DATA);
      expect(result.props.language).toBe("es");
      expect(result.props.editorialContext).toBe("remembrance");
    });

    it("wires HeroCropStep's persist to saveDraftAction, bound to the AUTHORIZED memorialId", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_NO_CROP,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_CROP_DATA);

      const result = await callPage("claimed-id");

      const newContent = { hero: { displayName: "Jean Dupont" } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledExactlyOnceWith("authorized-id", newContent);
    });

    it("falls through to the notice when resolveHeroCropStepData finds no usable photo, rather than crashing", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_NO_CROP,
      });
      resolveHeroCropStepData.mockResolvedValue(null);

      const result = await callPage();

      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
    });

    it("never renders HeroCropStep once T07 has already been explicitly completed — resumes straight to the next gate", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, // slug still null
        draft: REAL_DRAFT, // T03 + T05 + T06 + T07 all already done
      });

      const result = await callPage();

      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(resolveHeroCropStepData).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
    });

    it("renders BuilderShell once T07 is completed and the memorial is otherwise fully configured", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // has a real slug
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(result.type).toBe(BuilderShell);
      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(resolveHeroCropStepData).not.toHaveBeenCalled();
    });

    it("PAGE D is resolved against the RECONCILED content, never the raw pre-reconciliation draft", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_NO_CROP,
      });
      const reconciledContent = {
        hero: { ...DRAFT_WITH_PAGE_C_DONE_NO_CROP.content.hero, photo: { mediaId: "adopted-later", crop: null } },
        guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" }, T06: { status: "completed" } },
      };
      reconcileHeroMediaOnResume.mockResolvedValue(reconciledContent);
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_CROP_DATA);

      const result = await callPage();

      expect(result.type).toBe(HeroCropStep);
      expect(result.props.content).toBe(reconciledContent);
      expect(resolveHeroCropStepData).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mediaEngine: { fake: "media-engine-deps" } }),
        OWNER_ACTOR,
        MEMORIAL_ID,
        reconciledContent,
      );
    });
  });

  describe("Mission 035 — PAGE E (T08 Hero reveal)", () => {
    /** PAGE A through PAGE D all genuinely done — a real crop attached
     * to a real photo — but T08 has never been treated. The normal
     * state right after PAGE D's own Continue click. */
    const DRAFT_WITH_PAGE_D_DONE_NO_REVEAL: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: null,
          death: null,
          shortPhrase: null,
          photo: {
            mediaId: "cccccccc-cccc-4ccc-8ccc-000000000001",
            crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
          },
        },
        guidedFlow: {
          T04: { status: "skipped" },
          T05: { status: "skipped" },
          T06: { status: "completed" },
          T07: { status: "completed" },
        },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const RESOLVED_REVEAL_DATA = {
      media: { id: "cccccccc-cccc-4ccc-8ccc-000000000001", purpose: "hero", status: "ready" },
      readUrl: "https://storage.test/signed/reveal",
    };

    /** T07 not done yet (no crop) — PAGE D's own gate applies, never
     * PAGE E's. */
    const DRAFT_WITH_PAGE_C_DONE_STILL_NO_CROP: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: null,
          death: null,
          shortPhrase: null,
          photo: { mediaId: "cccccccc-cccc-4ccc-8ccc-000000000001", crop: null },
        },
        guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" }, T06: { status: "completed" } },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("never calls resolveHeroCropStepData a second time while PAGE D is still ahead of the family", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_C_DONE_STILL_NO_CROP,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_REVEAL_DATA);

      const result = await callPage();

      expect(result.type).toBe(HeroCropStep);
      expect(resolveHeroCropStepData).toHaveBeenCalledOnce(); // PAGE D's own call, not PAGE E's
      expect(HeroRevealStep).not.toHaveBeenCalled();
    });

    it("renders HeroRevealStep (PAGE E) once PAGE A-D are done and T08 has never been treated", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_D_DONE_NO_REVEAL,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_REVEAL_DATA);

      const result = await callPage();

      expect(result.type).toBe(HeroRevealStep);
      expect(HeroCropStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("resolves PAGE E's photo with the real actor, the AUTHORIZED memorialId and the RECONCILED content", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_D_DONE_NO_REVEAL,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_REVEAL_DATA);

      await callPage();

      expect(resolveHeroCropStepData).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mediaEngine: { fake: "media-engine-deps" } }),
        OWNER_ACTOR,
        "authorized-id",
        DRAFT_WITH_PAGE_D_DONE_NO_REVEAL.content,
      );
    });

    it("renders HeroRevealStep with the resolved content/photo/skinVariant and wires both writes", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: { ...LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, skinVariant: "light" },
        draft: DRAFT_WITH_PAGE_D_DONE_NO_REVEAL,
      });
      resolveHeroCropStepData.mockResolvedValue(RESOLVED_REVEAL_DATA);

      const result = await callPage("claimed-id");

      expect(result.props.content).toBe(DRAFT_WITH_PAGE_D_DONE_NO_REVEAL.content);
      expect(result.props.photo).toBe(RESOLVED_REVEAL_DATA);
      expect(result.props.initialSkinVariant).toBe("light");
      expect(result.props.language).toBe("es");
      expect(result.props.editorialContext).toBe("remembrance");

      const newContent = { hero: { displayName: "Jean Dupont" } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledWith("authorized-id", newContent);

      await result.props.saveSkinVariant("dark");
      expect(saveSkinVariantAction).toHaveBeenCalledWith("authorized-id", "dark");
    });

    it("falls through to the notice when resolveHeroCropStepData finds no usable photo, rather than crashing", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED,
        draft: DRAFT_WITH_PAGE_D_DONE_NO_REVEAL,
      });
      resolveHeroCropStepData.mockResolvedValue(null);

      const result = await callPage();

      expect(HeroRevealStep).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
    });

    it("never renders HeroRevealStep once T08 has already been explicitly completed — resumes straight to the next gate", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, // slug still null
        draft: REAL_DRAFT, // T03 + T05 + T06 + T07 + T08 all already done
      });

      const result = await callPage();

      expect(HeroRevealStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
    });

    it("renders BuilderShell once T08 is completed and the memorial is otherwise fully configured", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // has a real slug
        draft: REAL_DRAFT,
      });

      const result = await callPage();

      expect(result.type).toBe(BuilderShell);
      expect(HeroRevealStep).not.toHaveBeenCalled();
    });
  });

  describe("Mission 039 — A01 (l'annonce) and A02 (précisions facultatives)", () => {
    /** PAGE A through PAGE E all genuinely done, ANNOUNCEMENT context —
     * A01/A02's own normal starting point. */
    const DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE: MemorialVersion = {
      content: {
        hero: {
          displayName: "Jean Dupont",
          birth: null,
          death: null,
          shortPhrase: null,
          photo: {
            mediaId: "cccccccc-cccc-4ccc-8ccc-000000000001",
            crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
          },
        },
        guidedFlow: {
          T04: { status: "skipped" },
          T05: { status: "skipped" },
          T06: { status: "completed" },
          T07: { status: "completed" },
          T08: { status: "completed" },
        },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    /** Same as above, plus A01 already completed with a real text —
     * A02's own normal starting point. */
    const DRAFT_WITH_A01_DONE: MemorialVersion = {
      content: {
        ...DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE.content,
        deathNotice: {
          announcementText: "Elle s'en est allée paisiblement.",
          precisions: { generalLocation: null, familyMessage: null, thought: null, quote: null, other: null },
        },
        guidedFlow: {
          ...(DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE.content as { guidedFlow: object }).guidedFlow,
          A01: { status: "completed" },
        },
      } as MemorialVersion["content"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("renders DeathNoticeAnnouncementStep (A01) once T08 is done, for the announcement context", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // editorialContext: "announcement"
        draft: DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE,
      });

      const result = await callPage();

      expect(result.type).toBe(DeathNoticeAnnouncementStep);
      expect(DeathNoticePrecisionsStep).not.toHaveBeenCalled();
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("wires DeathNoticeAnnouncementStep's persist to saveDraftAction, bound to the AUTHORIZED memorialId", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL,
        draft: DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE,
      });

      const result = await callPage("claimed-id");

      expect(result.props.content).toBe(DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE.content);
      expect(result.props.language).toBe("fr");
      expect(result.props.editorialContext).toBe("announcement");

      const newContent = { deathNotice: { announcementText: "Texte", precisions: {} } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledWith("authorized-id", newContent);
    });

    it("A01/A02 never appear for the remembrance context — falls through past T08 to the same notice", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: LANGUAGE_AND_CONTEXT_CHOSEN_BUT_OTHERWISE_UNCONFIGURED, // remembrance, slug still null
        draft: DRAFT_WITH_T08_DONE_NO_DEATH_NOTICE,
      });

      const result = await callPage();

      expect(DeathNoticeAnnouncementStep).not.toHaveBeenCalled();
      expect(DeathNoticePrecisionsStep).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain("Tu memorial todavía debe configurarse");
    });

    it("renders DeathNoticePrecisionsStep (A02) once A01 is done, never before", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL,
        draft: DRAFT_WITH_A01_DONE,
      });

      const result = await callPage();

      expect(result.type).toBe(DeathNoticePrecisionsStep);
      expect(BuilderShell).not.toHaveBeenCalled();
    });

    it("wires DeathNoticePrecisionsStep's persist to saveDraftAction, bound to the AUTHORIZED memorialId", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: "authorized-id",
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL,
        draft: DRAFT_WITH_A01_DONE,
      });

      const result = await callPage("claimed-id");

      expect(result.props.content).toBe(DRAFT_WITH_A01_DONE.content);
      expect(result.props.editorialContext).toBe("announcement");

      const newContent = { deathNotice: { announcementText: "Texte", precisions: {} } };
      await result.props.persist(newContent);
      expect(saveDraftAction).toHaveBeenCalledWith("authorized-id", newContent);
    });

    it("renders BuilderShell once A02 is resolved (completed or skipped) and the memorial is otherwise fully configured", async () => {
      getHeritageActor.mockResolvedValue(OWNER_ACTOR);
      authorizeMemorialForRequest.mockResolvedValue({
        status: "granted",
        ownerId: "owner-a",
        memorialId: MEMORIAL_ID,
      });
      resumeBuilderSession.mockResolvedValue({
        status: "resumable",
        memorial: CONFIGURED_MEMORIAL, // has a real slug
        draft: REAL_DRAFT, // A01 completed, A02 skipped
      });

      const result = await callPage();

      expect(result.type).toBe(BuilderShell);
      expect(DeathNoticeAnnouncementStep).not.toHaveBeenCalled();
      expect(DeathNoticePrecisionsStep).not.toHaveBeenCalled();
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
    // `\.skin\b` (a word boundary, not just `\.skin`) since Mission 035
    // introduced the legitimate, unrelated `.skinVariant` field (T08's
    // Light/Dark ambiance) — `resumed.memorial.skinVariant` must not
    // trip this guard, which is about a literal `.skin` (culture)
    // read, never about the field name merely starting with "skin".
    expect(CODE).not.toMatch(/deathDate|dateOfDeath|offerId|\.skin\b|culture/i);
  });
});
