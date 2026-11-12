"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { MemorialEditConflictError } from "@/lib/adapters/memorial-edit-repository";
import { SupabaseGuestDraftTransferRepository } from "@/lib/adapters/supabase/guest-draft-transfer-repository";
import { createSupabaseMemorialEditRepository } from "@/lib/adapters/supabase/memorial-edit-repository";
import { SupabaseOwnerRepository } from "@/lib/adapters/supabase/owner-repository";
import type { AuthenticatedIdentity } from "@/lib/entitlement/resolve-owner";
import {
  commitGuestDraftTransfer,
  recordGuestTransferPhoto,
  startGuestDraftTransfer,
  type CommitGuestTransferResult,
  type GuestTransferDeps,
  type RecordGuestTransferPhotoResult,
  type SaveTransferredContent,
  type StartGuestTransferResult,
} from "@/lib/guest-draft/guest-draft-transfer";
import { changedMemorialContentMutations } from "@/lib/memorial/edit-mutations";
import { commitAuthorizedDraftEdit } from "@/lib/memorial/persist-edit";
import { withStoredPresentation } from "@/lib/memorial/section-visibility";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { getAuthenticatedUser } from "@/lib/supabase/session";

/**
 * QG 008 Lot 2 — the three server actions of « Builder invité → brouillon
 * durable », called by components/builder/transfer/GuestDraftTransfer.tsx
 * on /brouillon/reprise, once the family's e-mail is verified (magic link).
 *
 * The identity comes from the server session only (never an argument);
 * `resolveOwnerForIdentity` refuses an unconfirmed address. Photos travel
 * through the EXISTING media actions (reserve → signed upload → finalize),
 * which re-authorize the owner of the memorial on every call.
 */

async function sessionIdentity(): Promise<AuthenticatedIdentity | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    is_anonymous: user.is_anonymous,
  };
}

function deps(): GuestTransferDeps {
  const serviceRole = createServiceRoleSupabaseClient();
  return {
    ownerRepository: new SupabaseOwnerRepository(serviceRole),
    transferRepository: new SupabaseGuestDraftTransferRepository(serviceRole),
  };
}

/**
 * Same authorization and audited write path as the Builder's own
 * `saveDraftAction`, plus one rule: the transfer only writes over the
 * untouched draft it created (`expectedRevision` = its revision at
 * creation). Anything else answers `conflict` and is never overwritten.
 */
const saveTransferredContent: SaveTransferredContent = async ({ memorialId, content, expectedRevision }) => {
  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") throw new Error("Guest draft transfer refused.");

  const supabase = await createServerSupabaseClient();
  const editRepository = createSupabaseMemorialEditRepository(supabase);
  const snapshot = await editRepository.load(access.memorialId);
  if (snapshot === null) throw new Error("Guest draft transfer refused.");
  if (snapshot.draft.revision !== expectedRevision) return "conflict";

  const nextContent = withStoredPresentation(content, snapshot.draft.content);
  try {
    await commitAuthorizedDraftEdit({
      repository: editRepository,
      access,
      snapshot,
      expectedRevision,
      content: nextContent,
      operation: "content.saved",
      mutations: changedMemorialContentMutations(snapshot.draft.content, nextContent),
    });
    return "saved";
  } catch (error) {
    if (
      error instanceof MemorialEditConflictError ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "MEMORIAL_EDIT_CONFLICT")
    ) {
      return "conflict";
    }
    throw error;
  }
};

export async function beginGuestDraftTransferAction(rawDraft: unknown): Promise<StartGuestTransferResult> {
  return startGuestDraftTransfer(deps(), await sessionIdentity(), rawDraft);
}

export async function recordGuestTransferPhotoAction(
  transferKey: string,
  localId: string,
  mediaId: string,
  purpose: string,
): Promise<RecordGuestTransferPhotoResult> {
  if ([transferKey, localId, mediaId, purpose].some((value) => typeof value !== "string")) {
    return { status: "refused" };
  }
  return recordGuestTransferPhoto(deps(), await sessionIdentity(), { transferKey, localId, mediaId, purpose });
}

export async function commitGuestDraftTransferAction(rawDraft: unknown): Promise<CommitGuestTransferResult> {
  return commitGuestDraftTransfer({ ...deps(), saveContent: saveTransferredContent }, await sessionIdentity(), rawDraft);
}
