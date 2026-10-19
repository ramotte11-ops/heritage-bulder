import type { MediaPurpose } from "@/config/media";
import type { MemorialStatus } from "@/types/memorial";

export interface MediaSecuritySnapshot {
  status: MemorialStatus;
  firstPublishedAt: string | null;
  draftRevision: number;
}

export interface MediaRetirementLease {
  leaseId: string;
  expiresAt: string;
}

export interface PendingMediaCleanupClaim {
  claimId: string;
}

/**
 * Service-only persistence boundary for Security V1 media mutations.
 * The application policy is evaluated from `load`; every effective write is
 * then repeated by a locked PostgreSQL RPC so this preflight is never the
 * concurrency boundary.
 */
export interface MediaSecurityRepository {
  load(input: { memorialId: string; ownerId: string }): Promise<MediaSecuritySnapshot | null>;
  reserveRetirement(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    purpose: MediaPurpose;
    expectedRevision: number;
  }): Promise<MediaRetirementLease>;
  finishRetirement(input: {
    memorialId: string;
    ownerId: string;
    purpose: MediaPurpose;
    leaseId: string;
    outcome: "completed" | "cancelled";
  }): Promise<void>;
  reservePendingCleanup(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    createdBefore?: string;
  }): Promise<PendingMediaCleanupClaim>;
  finishPendingCleanup(input: {
    memorialId: string;
    ownerId: string;
    claimId: string;
  }): Promise<void>;
}

export class MediaSecurityConflictError extends Error {
  constructor() {
    super("The memorial changed while the media operation was running.");
    this.name = "MediaSecurityConflictError";
  }
}

export class MediaSecurityDeniedError extends Error {
  constructor() {
    super("The media operation is not authorized.");
    this.name = "MediaSecurityDeniedError";
  }
}

export class MediaSecurityRetainedError extends Error {
  constructor() {
    super("The media is retained because durable content still references it.");
    this.name = "MediaSecurityRetainedError";
  }
}
