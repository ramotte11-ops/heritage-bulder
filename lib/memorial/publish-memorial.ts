import type { Language } from "@/config/languages";
import type { Skin, SkinVariant } from "@/config/skins";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { transitionMemorial } from "./status-transitions";
import type { MemorialContent, MemorialStatus } from "@/types/memorial";

export interface MemorialPublicationSnapshot {
  status: MemorialStatus;
  firstPublishedAt: string | null;
  language: Language | null;
  skin: Skin;
  skinVariant: SkinVariant;
  slug: string | null;
  draft: {
    content: MemorialContent;
    updatedAt: string;
    revision: number;
  };
}

export interface MemorialPublicationCommit {
  memorialId: string;
  ownerId: string;
  expectedRevision: number;
  expectedStatus: "ready" | "editing";
  expectedFirstPublishedAt: string | null;
  expectedContent: MemorialContent;
}

export interface MemorialPublicationResult {
  publishedAt: string;
  firstPublishedAt: string;
  revision: number;
}

export interface MemorialPublicationRepository {
  load(memorialId: string): Promise<MemorialPublicationSnapshot | null>;
  commitPublication(input: MemorialPublicationCommit): Promise<MemorialPublicationResult>;
}

export type PublishMemorialResult =
  | ({ ok: true } & MemorialPublicationResult)
  | { ok: false; code: "not_found_or_forbidden" | "invalid_transition" | "revision_conflict" | "not_publishable" };

/**
 * Validates the exact stored draft before asking PostgreSQL to publish it.
 * The repository repeats ownership, lifecycle, revision, content and active
 * Hero-retirement checks under locks; this layer supplies the established
 * application validation without pretending it is the transaction boundary.
 */
export async function publishMemorial(
  deps: { repository: MemorialPublicationRepository; resolveMedia: MediaResolver },
  input: { memorialId: string; ownerId: string; expectedRevision: number },
): Promise<PublishMemorialResult> {
  const snapshot = await deps.repository.load(input.memorialId);
  if (snapshot === null) return { ok: false, code: "not_found_or_forbidden" };
  if (snapshot.draft.revision !== input.expectedRevision) return { ok: false, code: "revision_conflict" };

  const transition = transitionMemorial(
    { status: snapshot.status, firstPublishedAt: snapshot.firstPublishedAt },
    "published",
  );
  const coherentFirstPublication = snapshot.status === "ready" && snapshot.firstPublishedAt === null;
  const coherentRepublication = snapshot.status === "editing" && snapshot.firstPublishedAt !== null;
  if (!transition.ok || (!coherentFirstPublication && !coherentRepublication)) {
    return { ok: false, code: "invalid_transition" };
  }

  if (snapshot.language === null || snapshot.slug === null || snapshot.slug.trim() === "") {
    return { ok: false, code: "not_publishable" };
  }

  const assembled = await assembleMemorial(
    {
      content: snapshot.draft.content,
      language: snapshot.language,
      skin: snapshot.skin,
      skinVariant: snapshot.skinVariant,
    },
    { resolveMedia: deps.resolveMedia },
  );
  if (assembled.status !== "assembled") return { ok: false, code: "not_publishable" };

  const committed = await deps.repository.commitPublication({
    memorialId: input.memorialId,
    ownerId: input.ownerId,
    expectedRevision: input.expectedRevision,
    expectedStatus: snapshot.status as "ready" | "editing",
    expectedFirstPublishedAt: snapshot.firstPublishedAt,
    expectedContent: snapshot.draft.content,
  });
  return { ok: true, ...committed };
}
