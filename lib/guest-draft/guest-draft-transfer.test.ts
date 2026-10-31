import { describe, expect, it, vi } from "vitest";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { AuthenticatedIdentity } from "@/lib/entitlement/resolve-owner";
import type { Owner } from "@/types/owner";
import type { MemorialContent } from "@/types/memorial";
import {
  commitGuestDraftTransfer,
  recordGuestTransferPhoto,
  startGuestDraftTransfer,
  type GuestDraftTransferRepository,
  type GuestTransferState,
} from "./guest-draft-transfer";
import { HERO_LOCAL_ID, TRANSFER_KEY, galleryLocalId, serverMediaId, transferableDraft } from "./guest-transfer-test-fixtures";

const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";

const VERIFIED: AuthenticatedIdentity = {
  id: "auth-user-1",
  email: "famille@example.test",
  email_confirmed_at: "2026-11-01T09:00:00Z",
  is_anonymous: false,
};

function ownerRepository(existing: Owner | null = null): OwnerRepository {
  const owner: Owner = { id: OWNER_ID, authUserId: VERIFIED.id, email: "famille@example.test", createdAt: "t", updatedAt: "t" };
  return {
    findByAuthUserId: vi.fn().mockResolvedValue(existing),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ status: "created", owner }),
  };
}

function transferRepository(overrides: Partial<GuestDraftTransferRepository> = {}) {
  const repo: GuestDraftTransferRepository = {
    begin: vi.fn().mockResolvedValue({
      outcome: "created",
      memorialId: MEMORIAL_ID,
      status: "started",
      mediaMap: {},
      baseDraftRevision: 0,
      anchorOutcome: "anchored",
      freePublishUntil: "p",
      freeDraftUntil: "d",
    }),
    find: vi.fn().mockResolvedValue(null),
    recordMedia: vi.fn().mockResolvedValue("recorded"),
    complete: vi.fn().mockResolvedValue("completed"),
    ...overrides,
  };
  return repo;
}

const FULL_MAP = {
  [HERO_LOCAL_ID]: serverMediaId(0),
  [galleryLocalId(1)]: serverMediaId(1),
  [galleryLocalId(2)]: serverMediaId(2),
  [galleryLocalId(3)]: serverMediaId(3),
};

function state(overrides: Partial<GuestTransferState> = {}): GuestTransferState {
  return { memorialId: MEMORIAL_ID, status: "started", mediaMap: FULL_MAP, baseDraftRevision: 0, ...overrides };
}

describe("QG 008 Lot 2 — startGuestDraftTransfer", () => {
  it("creates the durable draft for the VERIFIED owner and lists every photo to upload", async () => {
    const transfers = transferRepository();
    const result = await startGuestDraftTransfer(
      { ownerRepository: ownerRepository(), transferRepository: transfers },
      VERIFIED,
      transferableDraft(),
    );
    expect(result).toMatchObject({ status: "ready", memorialId: MEMORIAL_ID, transferKey: TRANSFER_KEY, completed: false, created: true });
    expect(result.status === "ready" && result.pending.map(({ localId }) => localId)).toEqual([
      HERO_LOCAL_ID, galleryLocalId(1), galleryLocalId(2), galleryLocalId(3),
    ]);
    expect(transfers.begin).toHaveBeenCalledExactlyOnceWith({
      ownerId: OWNER_ID,
      transferKey: TRANSFER_KEY,
      sourceRevision: 1,
      skinVariant: "dark",
      language: "fr",
    });
  });

  it("never touches the server without a session", async () => {
    const transfers = transferRepository();
    await expect(startGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers }, null, transferableDraft()))
      .resolves.toEqual({ status: "unauthenticated" });
    expect(transfers.begin).not.toHaveBeenCalled();
  });

  it("never attributes a draft to an UNVERIFIED address", async () => {
    const owners = ownerRepository();
    const transfers = transferRepository();
    const result = await startGuestDraftTransfer(
      { ownerRepository: owners, transferRepository: transfers },
      { ...VERIFIED, email_confirmed_at: undefined },
      transferableDraft(),
    );
    expect(result).toEqual({ status: "identity_refused", reason: "invalidAuthenticatedIdentity" });
    expect(owners.create).not.toHaveBeenCalled();
    expect(transfers.begin).not.toHaveBeenCalled();
  });

  it("refuses a malformed draft, or one smuggling a server media reference, before any write", async () => {
    const transfers = transferRepository();
    const deps = { ownerRepository: ownerRepository(), transferRepository: transfers };
    await expect(startGuestDraftTransfer(deps, VERIFIED, { schemaVersion: 3 })).resolves.toEqual({ status: "invalid_draft" });
    const draft = transferableDraft();
    const smuggled = {
      ...draft,
      content: { ...draft.content, hero: { ...(draft.content.hero as object), photo: { mediaId: serverMediaId(9), crop: null } } } as unknown as MemorialContent,
    };
    await expect(startGuestDraftTransfer(deps, VERIFIED, smuggled)).resolves.toEqual({ status: "invalid_draft" });
    expect(transfers.begin).not.toHaveBeenCalled();
  });

  it("a draft not yet past T08 starts in Light; the Builder asks the ambiance again", async () => {
    const transfers = transferRepository();
    await startGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers }, VERIFIED, transferableDraft({ skinVariant: null }));
    expect(transfers.begin).toHaveBeenCalledWith(expect.objectContaining({ skinVariant: "light" }));
  });

  it("resumes the same transfer: only the photos not yet mapped are listed", async () => {
    const transfers = transferRepository({
      begin: vi.fn().mockResolvedValue({ outcome: "resumed", ...state({ mediaMap: { [HERO_LOCAL_ID]: serverMediaId(0) } }), anchorOutcome: "already_anchored", freePublishUntil: "p", freeDraftUntil: "d" }),
    });
    const result = await startGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers }, VERIFIED, transferableDraft());
    expect(result).toMatchObject({ status: "ready", created: false, completed: false });
    expect(result.status === "ready" && result.pending.map(({ localId }) => localId)).toEqual([galleryLocalId(1), galleryLocalId(2), galleryLocalId(3)]);
  });

  it("a completed transfer lists nothing to upload", async () => {
    const transfers = transferRepository({
      begin: vi.fn().mockResolvedValue({ outcome: "resumed", ...state({ status: "completed" }), anchorOutcome: "already_anchored", freePublishUntil: "p", freeDraftUntil: "d" }),
    });
    await expect(startGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers }, VERIFIED, transferableDraft()))
      .resolves.toMatchObject({ status: "ready", completed: true, pending: [] });
  });

  it("one draft per owner: an existing active draft is reported, never overwritten", async () => {
    const transfers = transferRepository({ begin: vi.fn().mockResolvedValue({ outcome: "active_draft_exists", memorialId: "existing" }) });
    await expect(startGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers }, VERIFIED, transferableDraft()))
      .resolves.toEqual({ status: "active_draft_exists", memorialId: "existing" });
  });
});

describe("QG 008 Lot 2 — recordGuestTransferPhoto", () => {
  it("records for the verified owner only, with a known purpose", async () => {
    const transfers = transferRepository();
    const deps = { ownerRepository: ownerRepository(), transferRepository: transfers };
    await expect(recordGuestTransferPhoto(deps, VERIFIED, { transferKey: TRANSFER_KEY, localId: HERO_LOCAL_ID, mediaId: serverMediaId(0), purpose: "hero" }))
      .resolves.toEqual({ status: "recorded" });
    expect(transfers.recordMedia).toHaveBeenCalledWith({ ownerId: OWNER_ID, transferKey: TRANSFER_KEY, localId: HERO_LOCAL_ID, mediaId: serverMediaId(0), purpose: "hero" });
    await expect(recordGuestTransferPhoto(deps, VERIFIED, { transferKey: TRANSFER_KEY, localId: HERO_LOCAL_ID, mediaId: serverMediaId(0), purpose: "video" }))
      .resolves.toEqual({ status: "refused" });
    await expect(recordGuestTransferPhoto(deps, null, { transferKey: TRANSFER_KEY, localId: HERO_LOCAL_ID, mediaId: serverMediaId(0), purpose: "hero" }))
      .resolves.toEqual({ status: "unauthenticated" });
    expect(transfers.recordMedia).toHaveBeenCalledOnce();
  });
});

describe("QG 008 Lot 2 — commitGuestDraftTransfer", () => {
  it("writes the content rebuilt from the SERVER photo map over the untouched draft, then completes", async () => {
    const transfers = transferRepository({ find: vi.fn().mockResolvedValue(state()) });
    const saveContent = vi.fn().mockResolvedValue("saved");
    const result = await commitGuestDraftTransfer(
      { ownerRepository: ownerRepository(), transferRepository: transfers, saveContent },
      VERIFIED,
      transferableDraft(),
    );
    expect(result).toEqual({ status: "completed", memorialId: MEMORIAL_ID, contentWritten: true });
    const written = saveContent.mock.calls[0][0];
    expect(written).toMatchObject({ memorialId: MEMORIAL_ID, expectedRevision: 0 });
    expect((written.content.hero as Record<string, unknown>).photo).toMatchObject({ mediaId: serverMediaId(0) });
    expect((written.content.gallery as { items: Array<{ mediaId: string }> }).items.map(({ mediaId }) => mediaId))
      .toEqual([serverMediaId(1), serverMediaId(2), serverMediaId(3)]);
    expect(transfers.complete).toHaveBeenCalledWith({ ownerId: OWNER_ID, transferKey: TRANSFER_KEY });
  });

  it("does not write while photos are missing on the server", async () => {
    const transfers = transferRepository({ find: vi.fn().mockResolvedValue(state({ mediaMap: { [HERO_LOCAL_ID]: serverMediaId(0) } })) });
    const saveContent = vi.fn();
    await expect(commitGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers, saveContent }, VERIFIED, transferableDraft()))
      .resolves.toMatchObject({ status: "photos_pending", memorialId: MEMORIAL_ID });
    expect(saveContent).not.toHaveBeenCalled();
    expect(transfers.complete).not.toHaveBeenCalled();
  });

  it("never overwrites a draft already written (resumed after an interruption, or edited in the Builder)", async () => {
    const transfers = transferRepository({ find: vi.fn().mockResolvedValue(state()) });
    const saveContent = vi.fn().mockResolvedValue("conflict");
    await expect(commitGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers, saveContent }, VERIFIED, transferableDraft()))
      .resolves.toEqual({ status: "completed", memorialId: MEMORIAL_ID, contentWritten: false });
    expect(transfers.complete).toHaveBeenCalledOnce();
  });

  it("a completed transfer writes nothing again", async () => {
    const transfers = transferRepository({ find: vi.fn().mockResolvedValue(state({ status: "completed" })) });
    const saveContent = vi.fn();
    await expect(commitGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers, saveContent }, VERIFIED, transferableDraft()))
      .resolves.toEqual({ status: "completed", memorialId: MEMORIAL_ID, contentWritten: false });
    expect(saveContent).not.toHaveBeenCalled();
  });

  it("an unknown transfer is refused — the commit never creates a draft", async () => {
    const transfers = transferRepository();
    const saveContent = vi.fn();
    await expect(commitGuestDraftTransfer({ ownerRepository: ownerRepository(), transferRepository: transfers, saveContent }, VERIFIED, transferableDraft()))
      .resolves.toEqual({ status: "refused" });
    expect(transfers.begin).not.toHaveBeenCalled();
    expect(saveContent).not.toHaveBeenCalled();
  });
});
