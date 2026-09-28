import type { AllowedImageMimeType } from "@/config/media";

/**
 * Dette D1 (A13 Gallery data foundations) — the NATURAL dimensions of a
 * stored photograph, measured from its own bytes at finalization.
 *
 * ## Why measured here, never declared
 *
 * The A13 Gallery lays every photograph out at its natural ratio (no
 * crop, no distortion), so `media.width`/`media.height` are geometry
 * inputs. A dimension a browser DECLARES is a claim anyone can forge;
 * the one read that cannot be forged is the file's own header, read
 * server-side from the object Storage actually holds — exactly the
 * doctrine `image-signature.ts` applies to the content type.
 *
 * ## What is read, and nothing else
 *
 * Only the header of the three formats the foundation admits, with the
 * same "no image library, no new dependency" rule as the signature
 * check (config/media.ts):
 *
 *  - PNG: the mandatory first chunk, `IHDR` (width, height, big-endian).
 *  - WebP: the first chunk — `VP8 ` (lossy), `VP8L` (lossless) or
 *    `VP8X` (extended: canvas size).
 *  - JPEG: the first Start-Of-Frame segment (SOF0–SOF15 except the
 *    DHT/JPG/DAC markers that share the range), skipping every segment
 *    before it by its declared length; plus the EXIF `Orientation` tag
 *    of an `APP1 Exif` segment, when present.
 *
 * ## EXIF orientation — the ratio the photograph is SEEN at
 *
 * A phone stores most portraits as landscape pixels plus an EXIF
 * orientation, and every current browser applies it
 * (`image-orientation: from-image` is the default). The natural ratio a
 * visitor sees is therefore the oriented one: for orientations 5–8
 * (a quarter turn) the stored width and height are swapped. Nothing is
 * rotated, re-encoded or rewritten — the original bytes are untouched;
 * only the reported dimensions follow what the browser displays.
 *
 * Fail closed: anything truncated, malformed, out of range or not found
 * within the bytes given is `null` — never a guessed or default size.
 */

/**
 * How much of the object finalization reads. The PNG and WebP headers
 * sit in the first 30 bytes; a JPEG's Start-Of-Frame follows its APPn
 * segments (EXIF with an embedded thumbnail, ICC profile, XMP), which
 * in practice stay well under this bound. One ranged read of at most
 * this many bytes — never the whole photograph (see
 * lib/adapters/supabase/media-object-store.ts's `readObjectHead`).
 */
export const IMAGE_HEADER_BYTES = 512 * 1024;

/**
 * The largest side accepted: JPEG's own format limit (a 16-bit field).
 * A spec-derived bound, not a product choice — it only refuses values
 * no real photograph of the admitted formats can carry.
 */
export const MAX_IMAGE_DIMENSION_PX = 65535;

export interface ImageDimensions {
  width: number;
  height: number;
}

function isValidSide(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_DIMENSION_PX;
}

function valid(width: number, height: number): ImageDimensions | null {
  return isValidSide(width) && isValidSide(height) ? { width, height } : null;
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
}

function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

function ascii(b: Uint8Array, o: number, length: number): string {
  return String.fromCharCode(...b.subarray(o, o + length));
}

function readPngDimensions(b: Uint8Array): ImageDimensions | null {
  // signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4)
  if (b.length < 24) return null;
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") return null;
  return valid(u32be(b, 16), u32be(b, 20));
}

function readWebpDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Frame tag (3 bytes at 20), then the 0x9d 0x01 0x2a start code.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const b1 = b[21];
    const b2 = b[22];
    const b3 = b[23];
    const b4 = b[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return valid(width, height);
  }
  if (chunk === "VP8X") {
    // flags (1) + reserved (3) at 20, then canvas width-1 and height-1 (24 bits each).
    return valid(1 + u24le(b, 24), 1 + u24le(b, 27));
  }
  return null;
}

/** EXIF `Orientation` (tag 0x0112) from the TIFF block of an `APP1 Exif` segment, or `null`. */
function readExifOrientation(b: Uint8Array, start: number, end: number): number | null {
  // "Exif\0\0" then the TIFF header.
  if (end - start < 14 || ascii(b, start, 4) !== "Exif" || b[start + 4] !== 0 || b[start + 5] !== 0) return null;
  const tiff = start + 6;
  const order = ascii(b, tiff, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const r16 = (o: number) => (le ? u16le(b, o) : u16be(b, o));
  const r32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0) : u32be(b, o));
  if (r16(tiff + 2) !== 42) return null;
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = r16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (r16(entry) === 0x0112) {
      // Type SHORT (3), count 1: the value sits in the first two bytes of the value field.
      if (r16(entry + 2) !== 3) return null;
      const value = r16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Markers in the SOF range that are NOT frame headers. */
const NOT_SOF = new Set([0xc4, 0xc8, 0xcc]);

function readJpegDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientation: number | null = null;
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    // Fill bytes: any number of 0xFF may precede a marker.
    let marker = b[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      if (offset + 1 >= b.length) return null;
      marker = b[offset + 1];
    }
    offset += 2;
    // Stand-alone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // End of image, or scan data reached before any frame header.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > b.length) return null;
    const length = u16be(b, offset);
    if (length < 2) return null;
    const segmentEnd = offset + length;
    if (marker >= 0xc0 && marker <= 0xcf && !NOT_SOF.has(marker)) {
      // length (2) + precision (1) + height (2) + width (2)
      if (offset + 7 > b.length) return null;
      const height = u16be(b, offset + 3);
      const width = u16be(b, offset + 5);
      const quarterTurn = orientation !== null && orientation >= 5;
      return quarterTurn ? valid(height, width) : valid(width, height);
    }
    if (marker === 0xe1 && orientation === null && segmentEnd <= b.length) {
      orientation = readExifOrientation(b, offset + 2, segmentEnd);
    }
    offset = segmentEnd;
  }
  return null;
}

/**
 * The natural (display-oriented) dimensions of an image whose type has
 * ALREADY been verified from its bytes (`detectImageMimeType`), or
 * `null` when they cannot be established from `bytes`.
 */
export function readImageDimensions(bytes: Uint8Array, mimeType: AllowedImageMimeType): ImageDimensions | null {
  switch (mimeType) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
  }
}
