import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MemorialContent } from "@/types/memorial";

const { authorizeMemorialForRequest } = vi.hoisted(() => ({ authorizeMemorialForRequest: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ fake: "session-scoped-client" }),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { createSupabaseMemorialEditRepository, load, commitDraft, commitConfiguration } = vi.hoisted(() => ({
  load: vi.fn(),
  commitDraft: vi.fn(),
  commitConfiguration: vi.fn(),
  createSupabaseMemorialEditRepository: vi.fn(),
}));
createSupabaseMemorialEditRepository.mockImplementation(() => ({ load, commitDraft, commitConfiguration }));
vi.mock("@/lib/adapters/supabase/memorial-edit-repository", () => ({
  createSupabaseMemorialEditRepository,
}));

const { saveDraftAction, saveLanguageAction } = await import("./actions");

const MEMORIAL_ID = "memorial-abc";
const STORED = { hero: { displayName: "Jeanne" } } as MemorialContent;
const CONTENT = { hero: { displayName: "Jeanne Martin" } } as MemorialContent;

function granted(memorialId = MEMORIAL_ID) {
  return { status: "granted", ownerId: "owner-a", memorialId };
}

function editSnapshot(
  overrides: Partial<{
    status: "draft" | "ready" | "published" | "editing" | "archived";
    firstPublishedAt: string | null;
    language: "fr" | "en" | "es" | null;
    content: MemorialContent;
  }> = {},
) {
  return {
    status: overrides.status ?? "draft",
    firstPublishedAt: overrides.firstPublishedAt ?? null,
    language: overrides.language ?? "fr",
    skin: "intemporel",
    skinVariant: "light",
    draft: { content: overrides.content ?? STORED, updatedAt: "2026-10-18T10:00:00Z", revision: 7 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeMemorialForRequest.mockResolvedValue(granted());
  load.mockResolvedValue(editSnapshot());
  commitDraft.mockResolvedValue({ updatedAt: "2026-10-18T10:01:00Z", revision: 8 });
  commitConfiguration.mockResolvedValue(undefined);
});
describe("saveDraftAction — Security V1 lot 2", () => {
  it("re-authorizes every save and commits through the atomic repository", async () => {
    await saveDraftAction(MEMORIAL_ID, CONTENT);
    await saveDraftAction(MEMORIAL_ID, CONTENT);
    expect(authorizeMemorialForRequest).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(commitDraft).toHaveBeenCalledTimes(2);
  });

  it("uses only the authorized memorial and owner identifiers", async () => {
    authorizeMemorialForRequest.mockResolvedValue(granted("authorized-id"));
    await saveDraftAction("claimed-id", CONTENT);
    expect(load).toHaveBeenCalledWith("authorized-id");
    expect(commitDraft).toHaveBeenCalledWith(
      expect.objectContaining({ memorialId: "authorized-id", ownerId: "owner-a" }),
    );
  });

  it("returns the durable RPC timestamp, preserving the autosave contract", async () => {
    await expect(saveDraftAction(MEMORIAL_ID, CONTENT)).resolves.toEqual({
      updatedAt: "2026-10-18T10:01:00Z",
    });
  });

  it("preserves stored visibility instead of accepting a stale screen copy", async () => {
    load.mockResolvedValue(
      editSnapshot({ content: { ...STORED, presentation: { hiddenSections: ["ceremony"] } } as MemorialContent }),
    );
    await saveDraftAction(MEMORIAL_ID, {
      ...CONTENT,
      presentation: { hiddenSections: ["gallery"] },
    } as MemorialContent);
    expect(commitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { ...CONTENT, presentation: { hiddenSections: ["ceremony"] } },
        mutationTargets: ["content.hero.displayName"],
      }),
    );
  });

  it("allows an authorized post-publication story correction", async () => {
    load.mockResolvedValue(
      editSnapshot({
        status: "published",
        firstPublishedAt: "2026-10-01T10:00:00Z",
        content: { personWords: { text: "Avant" } } as MemorialContent,
      }),
    );
    await saveDraftAction(MEMORIAL_ID, { personWords: { text: "Après" } } as MemorialContent);
    expect(commitDraft).toHaveBeenCalledOnce();
  });

  it("refuses a hidden Hero change after publication inside a composite save", async () => {
    load.mockResolvedValue(
      editSnapshot({
        status: "editing",
        firstPublishedAt: "2026-10-01T10:00:00Z",
        content: { hero: { displayName: "Jeanne" }, personWords: { text: "Avant" } } as MemorialContent,
      }),
    );
    await expect(
      saveDraftAction(MEMORIAL_ID, {
        hero: { displayName: "Nom interdit" },
        personWords: { text: "Correction autorisée" },
      } as MemorialContent),
    ).rejects.toThrow("hero_locked_after_publication");
    expect(commitDraft).not.toHaveBeenCalled();
  });

  it("refuses an unknown JSON path", async () => {
    await expect(
      saveDraftAction(MEMORIAL_ID, {
        ...STORED,
        futureSection: { secret: "value" },
      } as unknown as MemorialContent),
    ).rejects.toThrow("unknown_mutation_target");
    expect(commitDraft).not.toHaveBeenCalled();
  });

  it("rejects denied ownership before constructing persistence", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(saveDraftAction("not-mine", CONTENT)).rejects.toThrow("Draft save refused");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(commitDraft).not.toHaveBeenCalled();
  });

  it("propagates a CAS, audit or server failure and never fabricates success", async () => {
    commitDraft.mockRejectedValue(new Error("concurrent update"));
    await expect(saveDraftAction(MEMORIAL_ID, CONTENT)).rejects.toThrow("concurrent update");
  });
});

describe("saveLanguageAction — Security V1 lot 2", () => {
  it.each(["en", "fr", "es"] as const)("keeps %s available before publication", async (language) => {
    load.mockResolvedValue(editSnapshot({ language: language === "fr" ? "en" : "fr" }));
    await expect(saveLanguageAction(MEMORIAL_ID, language)).resolves.toBeUndefined();
    expect(commitConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ target: "language", value: language }),
    );
  });

  it("refuses language after publication until product arbitration", async () => {
    load.mockResolvedValue(
      editSnapshot({ status: "published", firstPublishedAt: "2026-10-01T10:00:00Z" }),
    );
    await expect(saveLanguageAction(MEMORIAL_ID, "en")).rejects.toThrow(
      "language_after_publication_unresolved",
    );
    expect(commitConfiguration).not.toHaveBeenCalled();
  });

  it.each(["de", "xx", "", "EN", "en-US"])("rejects unsupported %j before authorization", async (value) => {
    await expect(saveLanguageAction(MEMORIAL_ID, value)).rejects.toThrow("Unsupported language");
    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
  });

  it("propagates persistence failure", async () => {
    commitConfiguration.mockRejectedValue(new Error("audit insert failed"));
    await expect(saveLanguageAction(MEMORIAL_ID, "en")).rejects.toThrow("audit insert failed");
  });
});

describe("Server Action boundary", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "actions.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("keeps the public signatures unchanged and accepts no actor/owner/session input", () => {
    expect(code).toMatch(/saveDraftAction\(\s*memorialId: string,\s*content: MemorialContent/);
    expect(code).toMatch(/saveLanguageAction\(memorialId: string, language: string\)/);
  });

  it("does not import the privileged client directly", () => {
    expect(code).not.toMatch(/service-role-client|createServiceRoleSupabaseClient/);
  });

  it("still exposes only the two established actions", async () => {
    expect(Object.keys(await import("./actions")).sort()).toEqual(["saveDraftAction", "saveLanguageAction"]);
  });
});
