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

/** The Hero and the A13 Gallery (dettes D2–D4) consume media. */
export type AssemblyMediaPurpose = "hero" | "gallery";

export interface MediaRequest {
  mediaId: string;
  purpose: AssemblyMediaPurpose;
}

export interface ResolvedMedia {
  /** Echo of the requested id — the assembler refuses any mismatch. */
  mediaId: string;
  readUrl: string;
  /**
   * The media's natural dimensions, MEASURED at finalization (dette D1) —
   * `null` for a media whose dimensions were never established. Geometry
   * inputs only, never an internal column: the Gallery lays photographs
   * out at their natural ratio and needs them; the Hero ignores them.
   */
  width?: number | null;
  height?: number | null;
}

/**
 * Resolves one media to a displayable URL, or `null` when it cannot be
 * shown (no access, not `ready`, wrong purpose, storage failure...).
 * A resolver may also throw; the assembler treats that exactly like
 * `null` (fail closed).
 */
export type MediaResolver = (request: MediaRequest) => Promise<ResolvedMedia | null>;
