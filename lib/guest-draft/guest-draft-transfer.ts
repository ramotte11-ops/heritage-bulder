import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { resolveOwnerForIdentity, type AuthenticatedIdentity } from "@/lib/entitlement/resolve-owner";
import type { MemorialContent } from "@/types/memorial";
import { validateGuestDraftV3, type GuestDraftV3 } from "./guest-draft-v3";
import {
  buildTransferredContent,
  pendingGuestPhotos,
  type GuestTransferMediaMap,
  type PendingGuestPhoto,
} from "./guest-transfer-plan";

/**
 * QG 008 Lot 2 — server core of « Builder invité → brouillon durable ».
 *
 * Framework-free: the server actions (app/brouillon/reprise/actions.ts)
 * supply the session identity and the adapters. Every rule that matters
 * is ALSO enforced by the database functions
 * (supabase/migrations/20261101090000_qg008_lot2_guest_draft_transfer.sql);
 * this layer never pretends to be the transaction boundary.
 *
 * Invariants:
 *   - nothing is attributed to an unverified address: the owner comes from
 *     `resolveOwnerForIdentity`, which requires a confirmed e-mail, and
 *     never from the browser;
 *   - the guest draft is untrusted input, re-validated with
 *     `validateGuestDraftV3` (which also refuses any server media reference
 *     in its content);
 *   - the durable content is rebuilt from the validated guest draft and the
 *     SERVER-side photo map only;
 *   - one draft per owner: an owner who already has an active draft gets
 *     `active_draft_exists` — nothing is created, nothing overwritten, and
 *     the local guest draft stays in the browser;
 *   - idempotent per (owner, transferKey): a retry, a reconnection or a
 *     second tab resume the same durable draft; no deadline is recomputed.
 */

export interface GuestTransferState {
  memorialId: string;
  status: "started" | "completed";
  mediaMap: GuestTransferMediaMap;
  baseDraftRevision: number;
}

export type BeginGuestTransferRow =
  | ({ outcome: "created" | "resumed" } & GuestTransferState & {
      anchorOutcome: string | null;
      freePublishUntil: string | null;
      freeDraftUntil: string | null;
    })
  | { outcome: "active_draft_exists"; memorialId: string | null }
  | { outcome: "refused" };

export type RecordGuestTransferMediaOutcome = "recorded" | "already_recorded" | "conflict" | "refused";

export interface GuestDraftTransferRepository {
  begin(input: {
    ownerId: string;
    transferKey: string;
    sourceRevision: number;
    skinVariant: SkinVariant;
    language: Language | null;
  }): Promise<BeginGuestTransferRow>;
  find(input: { ownerId: string; transferKey: string }): Promise<GuestTransferState | null>;
  recordMedia(input: {
    ownerId: string;
    transferKey: string;
    localId: string;
    mediaId: string;
    purpose: "hero" | "gallery";
  }): Promise<RecordGuestTransferMediaOutcome>;
  complete(input: { ownerId: string; transferKey: string }): Promise<"completed" | "already_completed" | "refused">;
}

export interface GuestTransferDeps {
  ownerRepository: OwnerRepository;
  transferRepository: GuestDraftTransferRepository;
}

type IdentityFailure =
  | { status: "unauthenticated" }
  | { status: "invalid_draft" }
  | { status: "identity_refused"; reason: "invalidAuthenticatedIdentity" | "ownerLinkConflict" | "ownerIdentityConflict" };

async function resolveVerifiedOwner(
  deps: GuestTransferDeps,
  identity: AuthenticatedIdentity | null,
): Promise<{ ok: true; ownerId: string } | { ok: false; failure: IdentityFailure }> {
  if (identity === null) return { ok: false, failure: { status: "unauthenticated" } };
  const owner = await resolveOwnerForIdentity(deps.ownerRepository, identity);
  if (owner.status !== "resolved") {
    return { ok: false, failure: { status: "identity_refused", reason: owner.status } };
  }
  return { ok: true, ownerId: owner.owner.id };
}

function validDraft(raw: unknown): GuestDraftV3 | null {
  const validated = validateGuestDraftV3(raw);
  return validated.ok ? validated.draft : null;
}

/** The skin variant is chosen at T08; an earlier draft starts in Light
 * until the family chooses (the durable Builder asks T08 again). */
function initialSkinVariant(draft: GuestDraftV3): SkinVariant {
  return draft.skinVariant ?? "light";
}

export type StartGuestTransferResult =
  | IdentityFailure
  | {
      status: "ready";
      memorialId: string;
      transferKey: string;
      completed: boolean;
      pending: PendingGuestPhoto[];
      /** true only for the very first durable save of this guest draft. */
      created: boolean;
    }
  | { status: "active_draft_exists"; memorialId: string | null }
  | { status: "refused" };

export async function startGuestDraftTransfer(
  deps: GuestTransferDeps,
  identity: AuthenticatedIdentity | null,
  rawDraft: unknown,
): Promise<StartGuestTransferResult> {
  if (identity === null) return { status: "unauthenticated" };
  const draft = validDraft(rawDraft);
  if (draft === null) return { status: "invalid_draft" };
  const owner = await resolveVerifiedOwner(deps, identity);
  if (!owner.ok) return owner.failure;

  const begun = await deps.transferRepository.begin({
    ownerId: owner.ownerId,
    transferKey: draft.transferKey,
    sourceRevision: draft.revision,
    skinVariant: initialSkinVariant(draft),
    language: draft.language,
  });
  if (begun.outcome === "refused") return { status: "refused" };
  if (begun.outcome === "active_draft_exists") return { status: "active_draft_exists", memorialId: begun.memorialId };

  return {
    status: "ready",
    memorialId: begun.memorialId,
    transferKey: draft.transferKey,
    completed: begun.status === "completed",
    pending: begun.status === "completed" ? [] : pendingGuestPhotos(draft, begun.mediaMap),
    created: begun.outcome === "created",
  };
}

export type RecordGuestTransferPhotoResult =
  | IdentityFailure
  | { status: RecordGuestTransferMediaOutcome };

export async function recordGuestTransferPhoto(
  deps: GuestTransferDeps,
  identity: AuthenticatedIdentity | null,
  input: { transferKey: string; localId: string; mediaId: string; purpose: string },
): Promise<RecordGuestTransferPhotoResult> {
  if (input.purpose !== "hero" && input.purpose !== "gallery") return { status: "refused" };
  const owner = await resolveVerifiedOwner(deps, identity);
  if (!owner.ok) return owner.failure;
  const outcome = await deps.transferRepository.recordMedia({
    ownerId: owner.ownerId,
    transferKey: input.transferKey,
    localId: input.localId,
    mediaId: input.mediaId,
    purpose: input.purpose,
  });
  return { status: outcome };
}

/**
 * Writes the durable content ONLY over the untouched draft the transfer
 * created (its revision at creation). `conflict` means somebody already
 * wrote it — this transfer before an interruption, or the family in the
 * Builder — and it is never overwritten.
 */
export type SaveTransferredContent = (input: {
  memorialId: string;
  content: MemorialContent;
  expectedRevision: number;
}) => Promise<"saved" | "conflict">;

export type CommitGuestTransferResult =
  | IdentityFailure
  | { status: "completed"; memorialId: string; contentWritten: boolean }
  | { status: "photos_pending"; memorialId: string; pending: PendingGuestPhoto[] }
  | { status: "refused" };

export async function commitGuestDraftTransfer(
  deps: GuestTransferDeps & { saveContent: SaveTransferredContent },
  identity: AuthenticatedIdentity | null,
  rawDraft: unknown,
): Promise<CommitGuestTransferResult> {
  if (identity === null) return { status: "unauthenticated" };
  const draft = validDraft(rawDraft);
  if (draft === null) return { status: "invalid_draft" };
  const owner = await resolveVerifiedOwner(deps, identity);
  if (!owner.ok) return owner.failure;

  const transfer = await deps.transferRepository.find({ ownerId: owner.ownerId, transferKey: draft.transferKey });
  if (transfer === null) return { status: "refused" };
  if (transfer.status === "completed") {
    return { status: "completed", memorialId: transfer.memorialId, contentWritten: false };
  }

  const built = buildTransferredContent(draft, transfer.mediaMap);
  if (!built.ok) {
    return { status: "photos_pending", memorialId: transfer.memorialId, pending: pendingGuestPhotos(draft, transfer.mediaMap) };
  }

  const saved = await deps.saveContent({
    memorialId: transfer.memorialId,
    content: built.content,
    expectedRevision: transfer.baseDraftRevision,
  });
  const completed = await deps.transferRepository.complete({ ownerId: owner.ownerId, transferKey: draft.transferKey });
  if (completed === "refused") return { status: "refused" };
  return { status: "completed", memorialId: transfer.memorialId, contentWritten: saved === "saved" };
}
