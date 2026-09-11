import type { MediaErrorCode } from "./media-errors";
import type { TranslationKey } from "@/lib/i18n/keys";

/**
 * Mission 033 section 12 — the ONE place a `MediaErrorCode` becomes a
 * calm, human, already-translated key. Never shown to the family:
 * `413`, `MIME`, `signature mismatch`, `storage error`, `Supabase`, an
 * HTTP status, a stack trace, or JSON — this function's whole job is to
 * make sure none of those can leak through, by returning nothing but a
 * `TranslationKey` a screen resolves with `translate()`.
 *
 * A `switch` with no `default` and no fallback branch is deliberate: it
 * is exhaustive over `MediaErrorCode` at COMPILE time (TypeScript
 * refuses this file to build if a case is missing — "not all code paths
 * return a value"), so a future code added to `lib/media/media-errors.ts`
 * fails here loudly rather than silently falling back to a generic
 * message nobody decided was right for it.
 */
export function mediaErrorTranslationKey(code: MediaErrorCode): TranslationKey {
  switch (code) {
    case "file_too_large":
      return "hero.photoErrorTooLarge";
    case "unsupported_format":
      return "hero.photoErrorUnsupportedFormat";
    case "invalid_file":
      return "hero.photoErrorInvalidFile";
    // `upload_incomplete`, `access_denied` and `storage_unavailable` are
    // all "an incident, not a judgement about the file" from the
    // family's point of view — mission brief section 12's "incident
    // temporaire" wording covers all three honestly. `access_denied` in
    // particular must never be distinguished here: doing so would be the
    // first step toward turning a Hero-photo error into an oracle for
    // "is this memorial/media real", exactly what
    // lib/auth/memorial-access.ts already refuses to let happen upstream.
    case "upload_incomplete":
    case "access_denied":
    case "storage_unavailable":
      return "hero.photoErrorGeneric";
  }
}

/**
 * A local, typed exception carrying nothing but a `MediaErrorCode` —
 * used by `HeroPhotoStep` to unify a refusal from any step of the
 * reserve/upload/finalize(or replace) sequence into one `catch`, so the
 * final human message always goes through `mediaErrorTranslationKey`
 * above. Never constructed with, or exposing, anything beyond the code:
 * no message from Storage, no response body, no stack a family could
 * ever see.
 */
export class MediaActionError extends Error {
  constructor(public readonly code: MediaErrorCode) {
    super(`Media action refused: ${code}`);
    this.name = "MediaActionError";
  }
}
