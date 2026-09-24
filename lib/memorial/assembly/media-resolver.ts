/**
 * Étape 2 — Assembleur du Memorial: the media resolution seam.
 *
 * The assembler never knows WHO is looking at the Memorial or WHY
 * (Preview for the Owner, a future public page): it only states which
 * media a section needs, and a caller-injected `MediaResolver` answers.
 *
 *  - Preview (today): `createOwnerDraftMediaResolver`
 *    (./owner-draft-media-resolver.ts) — the Owner's own draft media,
 *    through Mission 030's short-lived signed URLs.
 *  - Publication (future, not built): a resolver over public/snapshot
 *    media implementing this same type.
 *
 * `ResolvedMedia` deliberately carries no `Media` row: `storagePath`,
 * `ownerId` and every other internal column stay server-side — only a
 * displayable URL ever reaches a renderer.
 */

/** Only the Hero consumes a media today; A13 Galerie will widen this. */
export type AssemblyMediaPurpose = "hero";

export interface MediaRequest {
  mediaId: string;
  purpose: AssemblyMediaPurpose;
}

export interface ResolvedMedia {
  /** Echo of the requested id — the assembler refuses any mismatch. */
  mediaId: string;
  readUrl: string;
}

/**
 * Resolves one media to a displayable URL, or `null` when it cannot be
 * shown (no access, not `ready`, wrong purpose, storage failure...).
 * A resolver may also throw; the assembler treats that exactly like
 * `null` (fail closed).
 */
export type MediaResolver = (request: MediaRequest) => Promise<ResolvedMedia | null>;
