import { describe, expect, it, vi } from "vitest";
import type { GuestDraftV3ReadResult } from "@/lib/guest-draft/guest-draft-v3-store";
import {
  HERO_LOCAL_ID,
  TRANSFER_KEY,
  galleryLocalId,
  guestAsset,
  serverMediaId,
  transferableDraft,
} from "@/lib/guest-draft/guest-transfer-test-fixtures";
import { runGuestDraftTransfer, type GuestTransferRunDeps } from "./run-guest-draft-transfer";

const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";

function deps(overrides: Partial<GuestTransferRunDeps> = {}) {
  const draft = transferableDraft({ galleryCount: 2 });
  const calls: string[] = [];
  let uploads = 0;
  const value: GuestTransferRunDeps = {
    readLocalDraft: vi.fn(async (): Promise<GuestDraftV3ReadResult> => ({ status: "ready", draft })),
    readLocalPhoto: vi.fn(async (localId: string) => guestAsset(localId)),
    clearLocalDraft: vi.fn(async () => { calls.push("clear"); }),
    begin: vi.fn(async () => {
      calls.push("begin");
      return {
        status: "ready" as const,
        memorialId: MEMORIAL_ID,
        transferKey: TRANSFER_KEY,
        completed: false,
        created: true,
        pending: [
          { localId: HERO_LOCAL_ID, purpose: "hero" as const },
          { localId: galleryLocalId(1), purpose: "gallery" as const },
          { localId: galleryLocalId(2), purpose: "gallery" as const },
        ],
      };
    }),
    upload: vi.fn(async (_memorialId: string, purpose: "hero" | "gallery", file: File) => {
      calls.push(`upload:${purpose}:${file.name}`);
      uploads += 1;
      return { id: serverMediaId(uploads) };
    }),
    record: vi.fn(async (_key: string, localId: string) => {
      calls.push(`record:${localId}`);
      return { status: "recorded" as const };
    }),
    commit: vi.fn(async () => {
      calls.push("commit");
      return { status: "completed" as const, memorialId: MEMORIAL_ID, contentWritten: true };
    }),
    ...overrides,
  };
  return { value, calls, draft };
}

describe("QG 008 Lot 2 — runGuestDraftTransfer", () => {
  it("begins, uploads then records each photo in order, commits, and only then clears the local draft", async () => {
    const { value, calls } = deps();
    const progress: unknown[] = [];
    await expect(runGuestDraftTransfer({ ...value, onProgress: (p) => progress.push(p) }))
      .resolves.toEqual({ status: "done", memorialId: MEMORIAL_ID, language: "fr" });
    expect(calls).toEqual([
      "begin",
      `upload:hero:${HERO_LOCAL_ID}.webp`, `record:${HERO_LOCAL_ID}`,
      `upload:gallery:${galleryLocalId(1)}.webp`, `record:${galleryLocalId(1)}`,
      `upload:gallery:${galleryLocalId(2)}.webp`, `record:${galleryLocalId(2)}`,
      "commit",
      "clear",
    ]);
    expect(progress).toEqual([
      { phase: "starting" },
      { phase: "photos", done: 0, total: 3 },
      { phase: "photos", done: 1, total: 3 },
      { phase: "photos", done: 2, total: 3 },
      { phase: "photos", done: 3, total: 3 },
      { phase: "committing" },
    ]);
  });

  it("sends the draft metadata only — never a blob — to the server actions", async () => {
    const { value } = deps();
    await runGuestDraftTransfer(value);
    const sent = (value.begin as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.parse(JSON.stringify(sent)).photos).toHaveLength(3);
    expect(sent).not.toHaveProperty("assets");
  });

  it.each([
    ["an upload fails", { upload: vi.fn(async () => { throw new Error("storage"); }) }, "photo"],
    ["a local photo is missing", { readLocalPhoto: vi.fn(async () => null) }, "photo"],
    ["the server refuses to record a photo", { record: vi.fn(async () => ({ status: "conflict" as const })) }, "record"],
    ["the commit fails", { commit: vi.fn(async () => { throw new Error("network"); }) }, "commit"],
    ["the commit reports photos pending", { commit: vi.fn(async () => ({ status: "photos_pending" as const, memorialId: MEMORIAL_ID, pending: [] })) }, "commit"],
  ])("when %s, it stops and KEEPS the local draft", async (_label, override, step) => {
    const { value } = deps(override as Partial<GuestTransferRunDeps>);
    await expect(runGuestDraftTransfer(value)).resolves.toEqual({ status: "failed", language: "fr", step });
    expect(value.clearLocalDraft).not.toHaveBeenCalled();
  });

  it("a resumed transfer uploads only what is still missing", async () => {
    const { value, calls } = deps({
      begin: vi.fn(async () => ({
        status: "ready" as const, memorialId: MEMORIAL_ID, transferKey: TRANSFER_KEY, completed: false, created: false,
        pending: [{ localId: galleryLocalId(2), purpose: "gallery" as const }],
      })),
    });
    await runGuestDraftTransfer(value);
    expect(calls.filter((call) => call.startsWith("upload"))).toEqual([`upload:gallery:${galleryLocalId(2)}.webp`]);
  });

  it("a completed transfer goes straight to the commit (idempotent) and the same durable draft", async () => {
    const { value, calls } = deps({
      begin: vi.fn(async () => ({ status: "ready" as const, memorialId: MEMORIAL_ID, transferKey: TRANSFER_KEY, completed: true, created: false, pending: [] })),
    });
    await expect(runGuestDraftTransfer(value)).resolves.toMatchObject({ status: "done", memorialId: MEMORIAL_ID });
    expect(calls).toEqual(["commit", "clear"]);
  });

  it("an existing active draft is reported; nothing is uploaded and the local draft is kept", async () => {
    const { value } = deps({ begin: vi.fn(async () => ({ status: "active_draft_exists" as const, memorialId: "existing" })) });
    await expect(runGuestDraftTransfer(value)).resolves.toEqual({ status: "active_draft_exists", memorialId: "existing", language: "fr" });
    expect(value.upload).not.toHaveBeenCalled();
    expect(value.clearLocalDraft).not.toHaveBeenCalled();
  });

  it("no local draft in this browser: nothing is sent", async () => {
    const { value } = deps({ readLocalDraft: vi.fn(async (): Promise<GuestDraftV3ReadResult> => ({ status: "empty" })) });
    await expect(runGuestDraftTransfer(value)).resolves.toEqual({ status: "no_local_draft" });
    expect(value.begin).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "unauthenticated" as const }, "unauthenticated"],
    [{ status: "identity_refused" as const, reason: "invalidAuthenticatedIdentity" as const }, "identity_refused"],
  ])("a refused session (%o) keeps the local draft", async (answer, status) => {
    const { value } = deps({ begin: vi.fn(async () => answer) });
    await expect(runGuestDraftTransfer(value)).resolves.toEqual({ status });
    expect(value.clearLocalDraft).not.toHaveBeenCalled();
  });
});
