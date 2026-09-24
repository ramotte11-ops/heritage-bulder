import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MemorialContent, StoredMemorialConfig } from "@/types/memorial";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import {
  FIXTURE_HERO_MEDIA_ID,
  FIXTURE_READ_URL,
  fullAnnouncement,
  throughA02,
} from "@/lib/memorial/assembly/test-fixtures";

/**
 * Étape 3 — the Preview's one read. Everything around the database is
 * mocked; the Guided Flow rules, the composition and the assembler are
 * the REAL ones, run on real fixture content.
 */

const { getHeritageActor, authorizeMemorialForRequest } = vi.hoisted(() => ({
  getHeritageActor: vi.fn(),
  authorizeMemorialForRequest: vi.fn(),
}));
vi.mock("@/lib/auth/heritage-session", () => ({ getHeritageActor, authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(() => Promise.resolve({ fake: "supabase" })),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { SupabaseMemorialConfigRepository } = vi.hoisted(() => ({
  SupabaseMemorialConfigRepository: vi.fn(function (this: Record<string, unknown>) {
    this.kind = "config";
  }),
}));
vi.mock("@/lib/adapters/supabase/memorial-config-repository", () => ({ SupabaseMemorialConfigRepository }));

const { SupabaseDraftRepository, saveDraftContent } = vi.hoisted(() => {
  const saveDraftContent = vi.fn();
  return {
    saveDraftContent,
    SupabaseDraftRepository: vi.fn(function (this: Record<string, unknown>) {
      this.kind = "draft";
      this.saveDraftContent = saveDraftContent;
    }),
  };
});
vi.mock("@/lib/adapters/supabase/draft-repository", () => ({ SupabaseDraftRepository }));

const { resumeBuilderSession } = vi.hoisted(() => ({ resumeBuilderSession: vi.fn() }));
vi.mock("@/lib/builder/resume-session", () => ({ resumeBuilderSession }));

const { createServerMediaEngineDeps } = vi.hoisted(() => ({
  createServerMediaEngineDeps: vi.fn(() => ({ fake: "media-engine-deps" })),
}));
vi.mock("@/lib/media/server-media-engine", () => ({ createServerMediaEngineDeps }));

const { createOwnerDraftMediaResolver, resolverCalls } = vi.hoisted(() => {
  const resolverCalls: unknown[] = [];
  return {
    resolverCalls,
    createOwnerDraftMediaResolver: vi.fn(),
  };
});
vi.mock("@/lib/memorial/assembly/owner-draft-media-resolver", () => ({ createOwnerDraftMediaResolver }));

const { loadMemorialPreviewAction } = await import("./preview-actions");

const OWNER_ACTOR = { audience: "owner", identity: { id: "auth-a" }, owner: { id: "owner-a" }, isHeritageAdmin: false };

const MEMORIAL: StoredMemorialConfig = {
  id: "authorized-id",
  ownerId: "owner-a",
  entitlementId: "entitlement-a",
  memorialType: "person",
  editorialContext: "announcement",
  skin: "intemporel",
  skinVariant: "light",
  language: "fr",
  enabledSections: [],
  status: "draft",
  slug: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function resumable(content: MemorialContent, memorial: Partial<StoredMemorialConfig> = {}) {
  resumeBuilderSession.mockResolvedValue({
    status: "resumable",
    memorial: { ...MEMORIAL, ...memorial },
    draft: { content, updatedAt: "2026-01-01T00:00:00.000Z" },
  });
}

function resolverAnswering(answer: (mediaId: string) => { mediaId: string; readUrl: string } | null) {
  createOwnerDraftMediaResolver.mockImplementation(() => {
    const resolve: MediaResolver = async (request) => {
      resolverCalls.push(request);
      return answer(request.mediaId);
    };
    return resolve;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolverCalls.length = 0;
  getHeritageActor.mockResolvedValue(OWNER_ACTOR);
  authorizeMemorialForRequest.mockResolvedValue({ status: "granted", ownerId: "owner-a", memorialId: "authorized-id" });
  resolverAnswering((mediaId) => ({ mediaId, readUrl: FIXTURE_READ_URL }));
});

describe("loadMemorialPreviewAction — access", () => {
  it("takes the memorial id only — never any content from the client", () => {
    expect(loadMemorialPreviewAction.length).toBe(1);
  });

  it("refuses opaquely when access is not granted, reading nothing", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(loadMemorialPreviewAction("claimed-id")).rejects.toThrow("Preview refused.");
    expect(resumeBuilderSession).not.toHaveBeenCalled();
    expect(createOwnerDraftMediaResolver).not.toHaveBeenCalled();
  });
});

describe("loadMemorialPreviewAction — the saved draft, assembled for real", () => {
  it("re-reads the draft for the AUTHORIZED id and returns the real assembled Memorial", async () => {
    const content = fullAnnouncement();
    resumable(content);

    const result = await loadMemorialPreviewAction("claimed-id");

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("claimed-id");
    expect(resumeBuilderSession).toHaveBeenCalledWith(expect.anything(), "authorized-id");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.assembled.status).toBe("assembled");
    expect(result.assembled.sections.map((s) => s.sectionId)).toEqual(["hero", "deathNotice", "story", "ceremony"]);
    const hero = result.assembled.sections.find((s) => s.rendererKey === "HeroIntemporel");
    expect(hero?.props).toMatchObject({ photo: { readUrl: FIXTURE_READ_URL }, language: "fr", skinVariant: "light" });
  });

  it("resolves the Hero photo through the Owner/draft resolver built for this actor and the authorized id", async () => {
    resumable(fullAnnouncement());
    await loadMemorialPreviewAction("claimed-id");
    expect(createOwnerDraftMediaResolver).toHaveBeenCalledWith({ fake: "media-engine-deps" }, OWNER_ACTOR, "authorized-id");
    expect(resolverCalls).toEqual([{ mediaId: FIXTURE_HERO_MEDIA_ID, purpose: "hero" }]);
  });

  it("each call reads and resolves afresh — nothing is cached", async () => {
    resumable(fullAnnouncement());
    await loadMemorialPreviewAction("claimed-id");
    await loadMemorialPreviewAction("claimed-id");
    expect(resumeBuilderSession).toHaveBeenCalledTimes(2);
    expect(createOwnerDraftMediaResolver).toHaveBeenCalledTimes(2);
    expect(resolverCalls).toHaveLength(2);
  });

  it("progression: after T08 only the Hero", async () => {
    resumable(throughA02());
    const result = await loadMemorialPreviewAction("claimed-id");
    expect(result.status === "ready" && result.assembled.sections.map((s) => s.sectionId)).toEqual(["hero"]);
  });

  it("never writes: no draft save", async () => {
    resumable(fullAnnouncement());
    await loadMemorialPreviewAction("claimed-id");
    expect(saveDraftContent).not.toHaveBeenCalled();
  });
});

describe("loadMemorialPreviewAction — fail closed", () => {
  it("before T08 → locked, nothing assembled, no media resolved", async () => {
    resumable({});
    expect(await loadMemorialPreviewAction("claimed-id")).toEqual({ status: "locked" });
    expect(createOwnerDraftMediaResolver).not.toHaveBeenCalled();
  });

  it.each([
    ["no language", { language: null }],
    ["no editorial context", { editorialContext: null }],
  ])("%s → locked", async (_label, memorial) => {
    resumable(fullAnnouncement(), memorial as Partial<StoredMemorialConfig>);
    expect(await loadMemorialPreviewAction("claimed-id")).toEqual({ status: "locked" });
  });

  it("an invalid stored skin variant → unavailable", async () => {
    resumable(fullAnnouncement(), { skinVariant: "sepia" as StoredMemorialConfig["skinVariant"] });
    expect(await loadMemorialPreviewAction("claimed-id")).toEqual({ status: "unavailable" });
  });

  it.each(["musulman", "juif", "hindou"] as const)("a %s memorial → unavailable, never an Intemporel fallback", async (skin) => {
    resumable(fullAnnouncement(), { skin });
    expect(await loadMemorialPreviewAction("claimed-id")).toEqual({ status: "unavailable" });
  });

  it("the Hero photo cannot be resolved → unavailable, no Memorial payload at all", async () => {
    resolverAnswering(() => null);
    resumable(fullAnnouncement());
    expect(await loadMemorialPreviewAction("claimed-id")).toEqual({ status: "unavailable" });
  });

  it.each([
    ["error", { status: "error", reason: "db down" }],
    ["draftAnomaly", { status: "draftAnomaly", memorial: MEMORIAL }],
    ["notFoundOrForbidden", { status: "notFoundOrForbidden" }],
  ])("a %s resume → unavailable", async (_label, resumed) => {
    resumeBuilderSession.mockResolvedValue(resumed);
    expect(await loadMemorialPreviewAction("claimed-id")).toEqual({ status: "unavailable" });
  });
});

describe("loadMemorialPreviewAction — read-only by construction", () => {
  const CODE = readFileSync(path.resolve(import.meta.dirname, "preview-actions.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("never reconciles, saves, revalidates, refreshes or navigates", () => {
    expect(CODE).not.toMatch(/reconcileHeroMedia|saveDraft|revalidate|refresh\(|redirect\(|next\/cache|next\/navigation/);
  });

  it("never builds the Preview from anything but assembleMemorial + the Owner/draft resolver", () => {
    expect(CODE).toMatch(/assembleMemorial\(/);
    expect(CODE).toMatch(/createOwnerDraftMediaResolver\(/);
    expect(CODE).not.toMatch(/\bMemorialPreview\b|demo-memorials|qg-runtime-demo|composeMemorial/);
  });
});
