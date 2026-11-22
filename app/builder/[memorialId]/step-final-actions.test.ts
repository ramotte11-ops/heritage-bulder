import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { InMemoryEditRepository } from "@/lib/memorial/in-memory-edit-repository.test-helper";

/** Mission 04-J — the combined action's boundary (same as saveDraftAction's). */

const { authorizeMemorialForRequest, createServerSupabaseClient, createSupabaseMemorialEditRepository } = vi.hoisted(() => ({
  authorizeMemorialForRequest: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createSupabaseMemorialEditRepository: vi.fn(),
}));
vi.mock("@/lib/auth/heritage-session", () => ({ authorizeMemorialForRequest }));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/adapters/supabase/memorial-edit-repository", () => ({ createSupabaseMemorialEditRepository }));

const { saveTextThenStepAction } = await import("./step-final-actions");

const CONTENT = { ceremony: { venueName: null }, guidedFlow: {} } as unknown as MemorialContent;
const TEXT = { ceremony: { venueName: "Église" }, guidedFlow: {} } as unknown as MemorialContent;
const FINAL = { ceremony: { venueName: "Église" }, guidedFlow: { A06: { status: "completed" } } } as unknown as MemorialContent;

let repository: InMemoryEditRepository;
beforeEach(() => {
  vi.clearAllMocks();
  repository = new InMemoryEditRepository(CONTENT, 7);
  createServerSupabaseClient.mockResolvedValue({ fake: "session-client" });
  createSupabaseMemorialEditRepository.mockReturnValue(repository);
});

describe("saveTextThenStepAction — boundary", () => {
  it("access refused: rejects before any read or write", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(saveTextThenStepAction("m-x", TEXT, FINAL, 7)).rejects.toThrow("Draft save refused.");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(repository.loads).toBe(0);
    expect(repository.commits).toEqual([]);
  });

  it.each([
    ["a non-object text", null, FINAL, 7],
    ["an array final", TEXT, [], 7],
    ["a negative revision", TEXT, FINAL, -1],
    ["a fractional revision", TEXT, FINAL, 7.5],
  ])("rejects %s before authorization", async (_case, text, final, revision) => {
    await expect(saveTextThenStepAction("m-1", text as never, final as never, revision as number)).rejects.toThrow(/Unsupported/);
    expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
  });

  it("granted: uses the AUTHORIZED id and owner only, with the session-scoped client", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "granted", memorialId: "m-authorized", ownerId: "o-1" });
    const response = await saveTextThenStepAction("m-claimed", TEXT, FINAL, 7);

    expect(authorizeMemorialForRequest).toHaveBeenCalledWith("m-claimed");
    expect(createSupabaseMemorialEditRepository).toHaveBeenCalledWith({ fake: "session-client" });
    expect(repository.commits.map((c) => [c.memorialId, c.ownerId, c.expectedRevision])).toEqual([
      ["m-authorized", "o-1", 7],
      ["m-authorized", "o-1", 8],
    ]);
    expect(response).toMatchObject({ status: "done", text: { status: "saved" }, step: { status: "saved" } });
  });

  it.each([["an unknown attempt kind", "replay"], ["a non-string attempt", 1]])(
    "Mission 04-L — rejects %s before authorization",
    async (_case, attempt) => {
      await expect(saveTextThenStepAction("m-1", TEXT, FINAL, 7, attempt as never)).rejects.toThrow("Unsupported draft attempt.");
      expect(authorizeMemorialForRequest).not.toHaveBeenCalled();
    },
  );

  it("Mission 04-L — without the attempt argument (an older page), a request is « first »: never reconciled", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "granted", memorialId: "m-1", ownerId: "o-1" });
    repository.content = FINAL;
    repository.revision = 9; // the very same final content, stored by another tab
    expect(await saveTextThenStepAction("m-1", TEXT, FINAL, 7)).toMatchObject({ text: { status: "conflict" } });
    expect(await saveTextThenStepAction("m-1", TEXT, FINAL, 7, "retry")).toMatchObject({ text: { reconciled: true } });
    expect(repository.commits).toEqual([]);
  });

  it("Mission 04-M — a forged « retry » is authorized exactly like a first request: refused before any read", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "denied" });
    await expect(saveTextThenStepAction("m-x", TEXT, FINAL, 7, "retry")).rejects.toThrow("Draft save refused.");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(repository.loads).toBe(0);
    expect(repository.commits).toEqual([]);
  });

  it("Mission 04-M — a forged « retry » uses the AUTHORIZED id and owner only, never the claimed id", async () => {
    authorizeMemorialForRequest.mockResolvedValue({ status: "granted", memorialId: "m-authorized", ownerId: "o-1" });
    repository.content = TEXT;
    repository.revision = 8;
    await saveTextThenStepAction("m-claimed", TEXT, FINAL, 7, "retry");
    expect(repository.commits.map((c) => [c.memorialId, c.ownerId, c.expectedRevision])).toEqual([["m-authorized", "o-1", 8]]);
  });
});

