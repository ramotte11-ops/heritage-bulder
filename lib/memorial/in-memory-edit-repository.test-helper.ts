import type {
  DraftEditCommit,
  MemorialEditRepository,
  MemorialEditSnapshot,
} from "@/lib/adapters/memorial-edit-repository";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

/**
 * Mission 04-J — TEST HELPER. An in-memory stand-in for the edit
 * repository that reproduces commit_memorial_draft_edit_v1's contract
 * (supabase/migrations/20261018140637_memorial_edit_persistence_v1.sql):
 *
 *   - lifecycle (status, first publication) re-checked at commit time;
 *   - revision compare-and-swap: a stale expected revision is refused
 *     with the same MEMORIAL_EDIT_CONFLICT the real adapter raises;
 *   - one atomic write: content replaced, revision + 1;
 *   - an audit event ONLY once the memorial has a first publication.
 *
 * `inject` lets a test fail a given commit (by its 1-based index) either
 * BEFORE it is applied (nothing written) or AFTER it (written, but the
 * caller sees an error — a lost response).
 */
export class ConflictError extends Error {
  readonly code = "MEMORIAL_EDIT_CONFLICT";
  constructor() {
    super("memorial draft changed");
  }
}

export interface AuditEvent {
  operation: string;
  mutationTargets: readonly string[];
  draftRevision: number;
}

export class InMemoryEditRepository implements MemorialEditRepository {
  status: MemorialStatus = "draft";
  firstPublishedAt: string | null = null;
  content: MemorialContent;
  revision: number;
  updatedAt = "2026-01-01T00:00:00.000Z";
  readonly commits: DraftEditCommit[] = [];
  readonly audit: AuditEvent[] = [];
  loads = 0;
  private attempts = 0;
  private injections = new Map<number, { when: "before" | "after"; error: () => Error }>();

  constructor(content: MemorialContent, revision = 7) {
    this.content = content;
    this.revision = revision;
  }

  inject(attempt: number, when: "before" | "after", error: () => Error = () => new Error("network down")): void {
    this.injections.set(attempt, { when, error });
  }

  async load(): Promise<MemorialEditSnapshot> {
    this.loads += 1;
    return {
      status: this.status,
      firstPublishedAt: this.firstPublishedAt,
      language: "fr",
      skin: "intemporel",
      skinVariant: "light",
      draft: { content: this.content, updatedAt: this.updatedAt, revision: this.revision },
    } as MemorialEditSnapshot;
  }

  async commitDraft(input: DraftEditCommit): Promise<{ updatedAt: string; revision: number }> {
    this.attempts += 1;
    const injection = this.injections.get(this.attempts);
    if (injection?.when === "before") throw injection.error();

    if (input.expectedStatus !== this.status || input.expectedFirstPublishedAt !== this.firstPublishedAt) {
      throw new ConflictError();
    }
    if (input.expectedRevision !== this.revision) throw new ConflictError();

    this.commits.push(input);
    this.content = input.content;
    this.revision += 1;
    this.updatedAt = `2026-01-01T00:00:${String(this.revision).padStart(2, "0")}.000Z`;
    if (this.firstPublishedAt !== null) {
      this.audit.push({ operation: input.operation, mutationTargets: input.mutationTargets, draftRevision: this.revision });
    }

    if (injection?.when === "after") throw injection.error();
    return { updatedAt: this.updatedAt, revision: this.revision };
  }

  async commitConfiguration(): Promise<void> {
    throw new Error("not used");
  }
}
