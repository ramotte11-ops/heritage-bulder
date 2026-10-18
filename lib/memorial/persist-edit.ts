import type {
  MemorialEditRepository,
  MemorialEditSnapshot,
} from "@/lib/adapters/memorial-edit-repository";
import {
  authorizeMemorialEdit,
  type MemorialMutationClaim,
} from "./edit-authorization";
import type { MemorialContent } from "@/types/memorial";

export interface VerifiedMemorialOwner {
  memorialId: string;
  ownerId: string;
}

function authorize(snapshot: MemorialEditSnapshot, mutations: readonly MemorialMutationClaim[]): void {
  const decision = authorizeMemorialEdit(
    {
      actor: "owner",
      status: snapshot.status,
      firstPublicationExists: snapshot.firstPublishedAt !== null,
      // No durable ceremony-closure fact exists yet. Security V1 must
      // therefore refuse ceremony content after publication.
      locks: { ceremony: "unknown" },
    },
    mutations,
  );

  if (decision.decision === "DENY") {
    throw new Error(`Memorial edit refused: ${decision.reason}.`);
  }
}

function auditTargets(mutations: readonly MemorialMutationClaim[]): string[] {
  return mutations.map(({ kind, target }) => `${kind}.${target}`);
}

export async function commitAuthorizedDraftEdit(input: {
  repository: MemorialEditRepository;
  access: VerifiedMemorialOwner;
  snapshot: MemorialEditSnapshot;
  content: MemorialContent;
  operation: "content.saved" | "visibility.changed";
  mutations: readonly MemorialMutationClaim[];
}): Promise<{ updatedAt: string }> {
  // The Server Action has already authenticated the owner, loaded this
  // server-side snapshot through RLS and computed the stored/submitted diff.
  // An empty diff is therefore a successful idempotent confirmation: keep the
  // durable timestamp and skip both the data write and its audit event.
  if (input.mutations.length === 0) {
    return { updatedAt: input.snapshot.draft.updatedAt };
  }

  authorize(input.snapshot, input.mutations);

  const result = await input.repository.commitDraft({
    memorialId: input.access.memorialId,
    ownerId: input.access.ownerId,
    expectedRevision: input.snapshot.draft.revision,
    expectedStatus: input.snapshot.status,
    expectedFirstPublishedAt: input.snapshot.firstPublishedAt,
    content: input.content,
    operation: input.operation,
    mutationTargets: auditTargets(input.mutations),
  });

  return { updatedAt: result.updatedAt };
}

export async function commitAuthorizedConfigurationEdit(input: {
  repository: MemorialEditRepository;
  access: VerifiedMemorialOwner;
  snapshot: MemorialEditSnapshot;
  target: "language" | "skinVariant";
  value: string;
  mutations: readonly MemorialMutationClaim[];
}): Promise<void> {
  // As above, an empty server-computed diff is already the stored value. The
  // public configuration actions keep their existing Promise<void> contract.
  if (input.mutations.length === 0) return;

  authorize(input.snapshot, input.mutations);

  await input.repository.commitConfiguration({
    memorialId: input.access.memorialId,
    ownerId: input.access.ownerId,
    expectedStatus: input.snapshot.status,
    expectedFirstPublishedAt: input.snapshot.firstPublishedAt,
    target: input.target,
    expectedValue:
      input.target === "language" ? input.snapshot.language : input.snapshot.skinVariant,
    value: input.value,
    mutationTargets: auditTargets(input.mutations),
  });
}
