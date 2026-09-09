import {
  ALLOWED_IMAGE_MIME_TYPES,
  type AllowedImageMimeType,
} from "@/config/media";

/**
 * Mission 030 — what a file ACTUALLY is, decided from its bytes.
 *
 * ## Why this exists
 *
 * `file.type` and `file.name` are strings the browser hands us, and a
 * hostile client picks both. A `.jpg` extension and an `image/jpeg`
 * content-type cost nothing to forge, so neither is evidence. The only
 * evidence about a file is the file.
 *
 * This module reads the leading bytes of an object and returns the
 * media type they genuinely encode, or `null`. It is the check that
 * makes "no arbitrary file disguised as an image" and "no executable
 * SVG" true rather than aspirational (mission brief, section 8).
 *
 * ## What this is NOT
 *
 * It is a format IDENTIFIER, not a decoder and not a malware scanner.
 * It proves the container is the one claimed; it does not prove every
 * pixel inside is well-formed, and it cannot. That is the honest limit
 * of a dependency-free check, and it is the right trade for V1: it
 * closes the whole class of "this .jpg is really a script/archive/HTML"
 * with no new attack surface of its own. A real decode belongs with the
 * normalization work (Mission 047), which needs an image library
 * anyway.
 *
 * ## Why no dependency
 *
 * `file-type` and friends do exactly this for a hundred formats we do
 * not accept. We accept three. Three signature checks are twenty lines
 * we can read in full, versus a transitive dependency in the one code
 * path whose entire job is to be suspicious of its input.
 */

/**
 * The number of leading bytes any check below can possibly need.
 *
 * WebP is the demanding one: its marker sits at offset 8-11, after the
 * RIFF header and the 4-byte length. 16 gives that room and a little
 * more, and — importantly — it is small enough that the caller can
 * fetch just this prefix over a Range request instead of downloading a
 * 15 MiB photograph to look at 12 bytes.
 */
export const IMAGE_SIGNATURE_BYTES = 16;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

/** "JFIF"/"Exif" and every other flavour share this 3-byte SOI+marker. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** The 8-byte PNG signature, including the CRLF/EOF corruption traps. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** "RIFF" at 0, then a 4-byte little-endian size, then "WEBP" at 8. */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

/**
 * The image type these bytes really are, or `null` for anything else.
 *
 * `null` covers every rejection with one answer on purpose: an SVG, a
 * ZIP, a PHP script, a HEIC photograph and eight random bytes are all
 * equally "not something this foundation accepts", and the caller turns
 * every one of them into the same `invalid_file`. Naming what it found
 * instead would invite a caller to special-case one.
 */
export function detectImageMimeType(bytes: Uint8Array): AllowedImageMimeType | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";

  // WebP is the only one of the three that is not a fixed prefix: the
  // four bytes between "RIFF" and "WEBP" are a length and can be
  // anything, so both halves are checked and the middle is skipped.
  // Checking only "RIFF" would accept a WAV or an AVI as a photograph.
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes.subarray(8), WEBP_SIGNATURE)) {
    return "image/webp";
  }

  return null;
}

/**
 * Whether a string the browser sent is one of the types we accept.
 *
 * This is a cheap pre-filter, NEVER the decision. Its only value is
 * refusing an obviously unacceptable upload before a path is reserved
 * and a permission issued — a client that lies here simply gets
 * refused later by `detectImageMimeType`, at finalization, having
 * gained nothing but a pending row the sweep reclaims.
 */
export function isAllowedImageMimeType(value: unknown): value is AllowedImageMimeType {
  return (
    typeof value === "string" &&
    (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}
