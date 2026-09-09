/**
 * Mission 030 — the error vocabulary of the media foundation.
 *
 * ## Why a closed set of codes and not `Error` subclasses
 *
 * Every media primitive returns a discriminated result rather than
 * throwing for expected outcomes, so a caller cannot forget to handle a
 * refusal the way it can forget a `catch`. The codes below are that
 * discriminant, and they are chosen to be exactly the categories a
 * future interface will need to translate into a human sentence
 * (mission brief, section 19):
 *
 *     file_too_large      "Cette photo est trop lourde (max 15 Mo)."
 *     unsupported_format  "Formats acceptes : JPEG, PNG, WebP."
 *     invalid_file        "Ce fichier n'est pas une photo valide."
 *     upload_incomplete   "L'envoi a ete interrompu. Reessayez."
 *     access_denied       "Vous n'avez pas acces a ce memorial."
 *     storage_unavailable "Un probleme technique est survenu."
 *
 * Mission 030 builds NO interface (section 19) — it only makes sure the
 * categories are clean enough that one can be written without going
 * back to the domain.
 *
 * ## Why these codes carry no detail
 *
 * A media error is returned to a browser. None of these values, and
 * nothing attached to them, may reveal a bucket name, an object path, a
 * policy, an SQL error, the service role, or whether some other
 * family's memorial exists. That is why the type is a bare string union
 * with no `message`, no `path`, no `cause`: there is no field an
 * implementation could leak through, so it cannot be done by accident.
 * Diagnostics belong in server logs, which is where the adapters put
 * them.
 *
 * `access_denied` in particular is ONE code for every reason: no
 * session, a session that is not an Owner, a memorial owned by somebody
 * else, and a memorial that does not exist. That collapse is inherited
 * from lib/auth/memorial-access.ts and exists for the same reason —
 * distinguishing them would make this an oracle for walking ids.
 */
export type MediaErrorCode =
  /** Bigger than MAX_MEDIA_BYTES (config/media.ts). */
  | "file_too_large"
  /** Declared or actual type is outside the image allowlist. */
  | "unsupported_format"
  /**
   * The bytes are not what they claim to be, or are not a coherent
   * image at all: a lying MIME type, a lying extension, a truncated
   * header, an executable renamed to .jpg.
   */
  | "invalid_file"
  /**
   * A reservation was finalized but the object is absent or empty —
   * the browser never completed the transfer.
   */
  | "upload_incomplete"
  /**
   * The actor does not own the memorial, or there is nothing to own.
   * Never says which.
   */
  | "access_denied"
  /**
   * The storage backend or the database failed. A technical fault, not
   * a judgement about the file.
   */
  | "storage_unavailable";

/**
 * The refusal half of every media primitive's result.
 *
 * Deliberately not an `Error`: these are expected outcomes on the happy
 * path of a system that is doing its job, and modelling them as
 * exceptions would put them in the same channel as genuine bugs.
 */
export interface MediaFailure {
  ok: false;
  code: MediaErrorCode;
}

/** The success half. */
export interface MediaSuccess<T> {
  ok: true;
  value: T;
}

export type MediaResult<T> = MediaSuccess<T> | MediaFailure;

export function mediaFailure(code: MediaErrorCode): MediaFailure {
  return { ok: false, code };
}

export function mediaSuccess<T>(value: T): MediaSuccess<T> {
  return { ok: true, value };
}
