import type { MediaPurpose } from "@/config/media";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { MemorialAccessResult } from "@/lib/auth/memorial-access";
import { authorizeMemorialEdit, type MemorialMediaEditTarget } from "@/lib/memorial/edit-authorization";
import type { MediaEngineDeps } from "./media-engine";

export interface AuthorizedMediaEdit {
  memorialId: string;
  ownerId: string;
  draftRevision: number;
}

export function mediaTarget(purpose: MediaPurpose, operation: "reserve" | "finalize" | "retire"): MemorialMediaEditTarget {
  return `${purpose}.${operation}` as MemorialMediaEditTarget;
}

export async function authorizeMediaEdit(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  access: Extract<MemorialAccessResult, { status: "granted" }>,
  target: MemorialMediaEditTarget,
): Promise<AuthorizedMediaEdit | null> {
  if (actor.audience !== "owner") return null;
  const snapshot = await deps.mediaSecurityRepository.load({
    memorialId: access.memorialId,
    ownerId: access.ownerId,
  });
  if (snapshot === null) return null;
  const decision = authorizeMemorialEdit(
    {
      actor: "owner",
      status: snapshot.status,
      firstPublicationExists: snapshot.firstPublishedAt !== null,
      locks: { ceremony: "unknown" },
    },
    [{ kind: "media", target }],
  );
  return decision.decision === "ALLOW"
    ? { memorialId: access.memorialId, ownerId: access.ownerId, draftRevision: snapshot.draftRevision }
    : null;
}
