import { describe, expect, it, vi } from "vitest";
import type { MemorialEditRepository, MemorialEditSnapshot } from "@/lib/adapters/memorial-edit-repository";
import { commitAuthorizedConfigurationEdit, commitAuthorizedDraftEdit } from "./persist-edit";

const ACCESS = { memorialId: "memorial-a", ownerId: "owner-a" };

function snapshot(overrides: Partial<MemorialEditSnapshot> = {}): MemorialEditSnapshot {
  return {
    status: "draft",
    firstPublishedAt: null,
    language: "fr",
    skin: "intemporel",
    skinVariant: "light",
    draft: { content: {}, updatedAt: "2026-10-18T10:00:00Z", revision: 4 },
    ...overrides,
  };
}

function repository() {
  const commitDraft = vi.fn().mockResolvedValue({ updatedAt: "2026-10-18T10:01:00Z", revision: 5 });
  const commitConfiguration = vi.fn().mockResolvedValue(undefined);
  return {
    value: { load: vi.fn(), commitDraft, commitConfiguration } as unknown as MemorialEditRepository,
    commitDraft,
    commitConfiguration,
  };
}

describe("commitAuthorizedDraftEdit", () => {
  it("returns the stored timestamp and writes nothing for an identical draft", async () => {
    const repo = repository();

    await expect(
      commitAuthorizedDraftEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot(),
        content: {},
        operation: "content.saved",
        mutations: [],
      }),
    ).resolves.toEqual({ updatedAt: "2026-10-18T10:00:00Z", revision: 4 });

    expect(repo.commitDraft).not.toHaveBeenCalled();
  });

  it("preserves normal pre-publication saves and sends the CAS facts to persistence", async () => {
    const repo = repository();
    await expect(
      commitAuthorizedDraftEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot(),
        content: { hero: { displayName: "Jeanne" } },
        operation: "content.saved",
        mutations: [{ kind: "content", target: "hero.displayName" }],
      }),
    ).resolves.toEqual({ updatedAt: "2026-10-18T10:01:00Z", revision: 5 });

    expect(repo.commitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        expectedRevision: 4,
        expectedStatus: "draft",
        expectedFirstPublishedAt: null,
        mutationTargets: ["content.hero.displayName"],
      }),
    );
  });

  it("allows post-publication story corrections", async () => {
    const repo = repository();
    await commitAuthorizedDraftEdit({
      repository: repo.value,
      access: ACCESS,
      snapshot: snapshot({ status: "published", firstPublishedAt: "2026-10-01T10:00:00Z" }),
      content: { personWords: { text: "Correction" } } as unknown as MemorialEditSnapshot["draft"]["content"],
      operation: "content.saved",
      mutations: [{ kind: "content", target: "personWords.text" }],
    });
    expect(repo.commitDraft).toHaveBeenCalledOnce();
  });

  it("refuses a post-publication Hero change and writes nothing", async () => {
    const repo = repository();
    await expect(
      commitAuthorizedDraftEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot({ status: "published", firstPublishedAt: "2026-10-01T10:00:00Z" }),
        content: { hero: { displayName: "Nouveau nom" } },
        operation: "content.saved",
        mutations: [{ kind: "content", target: "hero.displayName" }],
      }),
    ).rejects.toThrow("hero_locked_after_publication");
    expect(repo.commitDraft).not.toHaveBeenCalled();
  });

  it("refuses a whole composite save when one target is protected", async () => {
    const repo = repository();
    await expect(
      commitAuthorizedDraftEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot({ status: "editing", firstPublishedAt: "2026-10-01T10:00:00Z" }),
        content: {},
        operation: "content.saved",
        mutations: [
          { kind: "content", target: "personWords.text" },
          { kind: "content", target: "hero.death" },
        ],
      }),
    ).rejects.toThrow("hero_locked_after_publication");
    expect(repo.commitDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown field", { kind: "content", target: "story.futureField" }, "unknown_mutation_target"],
    ["an archived memorial", { kind: "content", target: "gallery.items" }, "archived_restricted"],
  ] as const)("refuses %s", async (_label, mutation, reason) => {
    const repo = repository();
    await expect(
      commitAuthorizedDraftEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot(mutation.target === "gallery.items" ? { status: "archived" } : {}),
        content: {},
        operation: "content.saved",
        mutations: [mutation],
      }),
    ).rejects.toThrow(reason);
    expect(repo.commitDraft).not.toHaveBeenCalled();
  });

  it("never converts a persistence conflict or audit failure into autosave success", async () => {
    const repo = repository();
    repo.commitDraft.mockRejectedValue(new Error("concurrent update"));
    await expect(
      commitAuthorizedDraftEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot(),
        content: { gallery: { items: [] } },
        operation: "content.saved",
        mutations: [{ kind: "content", target: "gallery.items" }],
      }),
    ).rejects.toThrow("concurrent update");
  });
});

describe("commitAuthorizedConfigurationEdit", () => {
  it("writes nothing for an identical configuration value", async () => {
    const repo = repository();

    await expect(
      commitAuthorizedConfigurationEdit({
        repository: repo.value,
        access: ACCESS,
        snapshot: snapshot(),
        target: "language",
        value: "fr",
        mutations: [],
      }),
    ).resolves.toBeUndefined();

    expect(repo.commitConfiguration).not.toHaveBeenCalled();
  });

  it("allows language before publication and refuses it after publication", async () => {
    const repo = repository();
    await commitAuthorizedConfigurationEdit({
      repository: repo.value,
      access: ACCESS,
      snapshot: snapshot(),
      target: "language",
      value: "en",
      mutations: [{ kind: "configuration", target: "language" }],
    });
    expect(repo.commitConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ expectedValue: "fr", value: "en" }),
    );

    const afterPublication = repository();
    await expect(
      commitAuthorizedConfigurationEdit({
        repository: afterPublication.value,
        access: ACCESS,
        snapshot: snapshot({ status: "published", firstPublishedAt: "2026-10-01T10:00:00Z" }),
        target: "language",
        value: "es",
        mutations: [{ kind: "configuration", target: "language" }],
      }),
    ).rejects.toThrow("language_after_publication_unresolved");
    expect(afterPublication.commitConfiguration).not.toHaveBeenCalled();
  });
});
