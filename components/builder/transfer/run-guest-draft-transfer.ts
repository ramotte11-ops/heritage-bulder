import type { GuestDraftPhotoAsset, GuestDraftV3 } from "@/lib/guest-draft/guest-draft-v3";
import type { GuestDraftV3ReadResult } from "@/lib/guest-draft/guest-draft-v3-store";
import type {
  CommitGuestTransferResult,
  RecordGuestTransferPhotoResult,
  StartGuestTransferResult,
} from "@/lib/guest-draft/guest-draft-transfer";
import { serializableGuestDraft } from "@/lib/guest-draft/guest-transfer-plan";

/**
 * QG 008 Lot 2 — the browser side of « Builder invité → brouillon
 * durable », as plain async steps with injected dependencies (tested
 * without IndexedDB, Supabase or a network).
 *
 * Order, chosen so that nothing is ever lost:
 *   1. read the local draft (IndexedDB) — absent: stop, nothing to save;
 *   2. begin on the server — creates and anchors the durable draft, or
 *      resumes this same transfer (idempotent per verified owner);
 *   3. upload each photo still missing, then record it on the server;
 *   4. commit — the server rebuilds the content from the validated draft
 *      and its own photo map, writes it once, closes the transfer;
 *   5. ONLY THEN clear the local draft.
 * Any failure stops before step 5: the local draft stays complete and a
 * retry resumes the same transfer.
 */

export interface GuestTransferRunDeps {
  readLocalDraft(): Promise<GuestDraftV3ReadResult>;
  readLocalPhoto(localId: string): Promise<GuestDraftPhotoAsset | null>;
  clearLocalDraft(): Promise<void>;
  begin(draft: GuestDraftV3): Promise<StartGuestTransferResult>;
  upload(memorialId: string, purpose: "hero" | "gallery", file: File): Promise<{ id: string }>;
  record(transferKey: string, localId: string, mediaId: string, purpose: "hero" | "gallery"): Promise<RecordGuestTransferPhotoResult>;
  commit(draft: GuestDraftV3): Promise<CommitGuestTransferResult>;
  onProgress?(progress: GuestTransferProgress): void;
}

export type GuestTransferProgress =
  | { phase: "starting" }
  | { phase: "photos"; done: number; total: number }
  | { phase: "committing" };

export type GuestTransferRunResult =
  | { status: "done"; memorialId: string; language: GuestDraftV3["language"] }
  | { status: "no_local_draft" }
  | { status: "active_draft_exists"; memorialId: string | null; language: GuestDraftV3["language"] }
  | { status: "unauthenticated" }
  | { status: "identity_refused" }
  | { status: "failed"; language: GuestDraftV3["language"]; step: "read" | "begin" | "photo" | "record" | "commit" };

function photoFile(asset: GuestDraftPhotoAsset): File {
  const name = asset.source.originalFilename ?? `${asset.localId}`;
  return new File([asset.blob], name, { type: asset.source.mimeType });
}

export async function runGuestDraftTransfer(deps: GuestTransferRunDeps): Promise<GuestTransferRunResult> {
  const read = await deps.readLocalDraft();
  if (read.status === "empty") return { status: "no_local_draft" };
  if (read.status !== "ready") return { status: "failed", language: null, step: "read" };
  const draft = read.draft;
  const language = draft.language;

  deps.onProgress?.({ phase: "starting" });
  let started: StartGuestTransferResult;
  try {
    started = await deps.begin(serializableGuestDraft(draft));
  } catch {
    return { status: "failed", language, step: "begin" };
  }
  switch (started.status) {
    case "ready":
      break;
    case "unauthenticated":
      return { status: "unauthenticated" };
    case "identity_refused":
      return { status: "identity_refused" };
    case "active_draft_exists":
      return { status: "active_draft_exists", memorialId: started.memorialId, language };
    default:
      return { status: "failed", language, step: "begin" };
  }

  const { memorialId, transferKey, pending } = started;
  if (!started.completed) {
    const total = pending.length;
    deps.onProgress?.({ phase: "photos", done: 0, total });
    for (const [index, photo] of pending.entries()) {
      const asset = await deps.readLocalPhoto(photo.localId).catch(() => null);
      if (asset === null) return { status: "failed", language, step: "photo" };
      let media: { id: string };
      try {
        media = await deps.upload(memorialId, photo.purpose, photoFile(asset));
      } catch {
        return { status: "failed", language, step: "photo" };
      }
      const recorded = await deps.record(transferKey, photo.localId, media.id, photo.purpose).catch(() => null);
      if (recorded === null || (recorded.status !== "recorded" && recorded.status !== "already_recorded")) {
        return { status: "failed", language, step: "record" };
      }
      deps.onProgress?.({ phase: "photos", done: index + 1, total });
    }
  }

  deps.onProgress?.({ phase: "committing" });
  let committed: CommitGuestTransferResult;
  try {
    committed = await deps.commit(serializableGuestDraft(draft));
  } catch {
    return { status: "failed", language, step: "commit" };
  }
  if (committed.status !== "completed") {
    if (committed.status === "unauthenticated") return { status: "unauthenticated" };
    if (committed.status === "identity_refused") return { status: "identity_refused" };
    return { status: "failed", language, step: "commit" };
  }

  // The durable draft is confirmed: the local copy can go. A failure here
  // is harmless — a later transfer of the same draft resumes the
  // completed transfer and lands on the same durable draft.
  await deps.clearLocalDraft().catch(() => undefined);
  return { status: "done", memorialId: committed.memorialId, language };
}
