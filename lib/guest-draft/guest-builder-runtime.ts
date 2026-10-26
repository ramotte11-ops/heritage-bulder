import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import type { DraftSaveResponse, DraftSaveTransport } from "@/lib/builder/draft-revision";
import { needsWelcome } from "@/lib/builder/guided-flow/welcome-step";
import { needsA00 } from "@/lib/builder/guided-flow/announcement-choice-step";
import { needsPageA, needsPageB } from "@/lib/builder/guided-flow/hero-step";
import {
  createGuestDraftV3,
  updateGuestDraftV3,
  type GuestDraftV3,
  type GuestDraftV3ValidationReason,
} from "./guest-draft-v3";
import type {
  GuestDraftV3ReadResult,
  GuestDraftV3StorageErrorCode,
  GuestDraftV3WriteResult,
} from "./guest-draft-v3-store";

/** The narrow storage surface used by the guest runtime. It has no clear(). */
export interface GuestBuilderDraftStore {
  read(): Promise<GuestDraftV3ReadResult>;
  save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult>;
}

export type GuestBuilderStage =
  | "language"
  | "welcome"
  | "identity"
  | "announcementChoice"
  | "phrase"
  | "mediaPending";

export type GuestBuilderRuntimeErrorReason =
  | GuestDraftV3StorageErrorCode
  | GuestDraftV3ValidationReason
  | "incompatible"
  | "corrupted"
  | "migration_failed"
  | "revision_conflict";

export class GuestBuilderRuntimeError extends Error {
  constructor(readonly reason: GuestBuilderRuntimeErrorReason) {
    super(`Guest Builder persistence failed: ${reason}`);
    this.name = "GuestBuilderRuntimeError";
  }
}

export interface GuestDraftRuntimeOptions {
  store: GuestBuilderDraftStore;
  getDraft: () => GuestDraftV3;
  acceptDraft: (draft: GuestDraftV3) => void;
  now?: () => string;
}

export interface LoadGuestDraftOptions {
  store: GuestBuilderDraftStore;
  createId: () => string;
  now?: () => string;
}

function nowIso(now: (() => string) | undefined): string {
  return (now ?? (() => new Date().toISOString()))();
}

function readFailure(result: Exclude<GuestDraftV3ReadResult, { status: "empty" | "ready" }>): GuestBuilderRuntimeError {
  switch (result.status) {
    case "incompatible":
      return new GuestBuilderRuntimeError("incompatible");
    case "corrupted":
      return new GuestBuilderRuntimeError("corrupted");
    case "migration_failed":
      return new GuestBuilderRuntimeError("migration_failed");
    case "error":
      return new GuestBuilderRuntimeError(result.error.code);
  }
}

function writeFailure(result: Extract<GuestDraftV3WriteResult, { ok: false }>): GuestBuilderRuntimeError {
  return new GuestBuilderRuntimeError(result.reason);
}

/**
 * Reads the one active guest draft, or creates it once. A concurrent tab
 * winning creation is handled by re-reading; no record is ever deleted.
 */
export async function loadOrCreateGuestDraft({
  store,
  createId,
  now,
}: LoadGuestDraftOptions): Promise<GuestDraftV3> {
  const read = await store.read();
  if (read.status === "ready") return read.draft;
  if (read.status !== "empty") throw readFailure(read);

  const created = createGuestDraftV3({
    draftId: createId(),
    transferKey: createId(),
    now: nowIso(now),
  });
  if (!created.ok) throw new GuestBuilderRuntimeError(created.reason);

  const saved = await store.save(created.draft, null);
  if (saved.ok) return created.draft;
  if (saved.reason !== "revision_conflict") throw writeFailure(saved);

  // Another tab created the single active draft between read and create.
  const concurrent = await store.read();
  if (concurrent.status === "ready") return concurrent.draft;
  if (concurrent.status === "empty") throw new GuestBuilderRuntimeError("revision_conflict");
  throw readFailure(concurrent);
}

/** The shared Builder route, deliberately stopped before T06/media. */
export function resolveGuestBuilderStage(draft: GuestDraftV3): GuestBuilderStage {
  if (draft.language === null) return "language";
  if (needsWelcome(null, draft.content)) return "welcome";
  if (needsPageA(draft.content)) return "identity";
  if (needsA00(draft.content)) return "announcementChoice";
  if (needsPageB(draft.content)) return "phrase";
  return "mediaPending";
}

function updatedContent(draft: GuestDraftV3, content: MemorialContent, now: () => string) {
  const updated = updateGuestDraftV3(draft, { content, now: now() });
  if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
  return updated.draft;
}

/**
 * Adapts the local V2 CAS store to the existing DraftRevisionProvider.
 * The store performs the revision comparison and write atomically.
 */
export function createGuestDraftSaveTransport({
  store,
  getDraft,
  acceptDraft,
  now = () => new Date().toISOString(),
}: GuestDraftRuntimeOptions): DraftSaveTransport {
  return async (content, expectedRevision): Promise<DraftSaveResponse> => {
    const current = getDraft();
    if (current.revision !== expectedRevision) return { status: "conflict" };

    const next = updatedContent(current, content, now);
    const result = await store.save(next, expectedRevision);
    if (!result.ok) {
      if (result.reason === "revision_conflict") return { status: "conflict" };
      throw writeFailure(result);
    }

    acceptDraft(next);
    return { status: "saved", updatedAt: next.updatedAt, revision: next.revision };
  };
}

/** T01's local equivalent, using the same V2 CAS and stable identifiers. */
export async function saveGuestDraftLanguage(
  options: GuestDraftRuntimeOptions,
  language: Language,
): Promise<{ response: { status: "saved" } | { status: "conflict" }; draft?: GuestDraftV3 }> {
  const current = options.getDraft();
  const updated = updateGuestDraftV3(current, {
    language,
    now: nowIso(options.now),
  });
  if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);

  const result = await options.store.save(updated.draft, current.revision);
  if (!result.ok) {
    if (result.reason === "revision_conflict") return { response: { status: "conflict" } };
    throw writeFailure(result);
  }

  options.acceptDraft(updated.draft);
  return { response: { status: "saved" }, draft: updated.draft };
}
