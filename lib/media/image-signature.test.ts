import { describe, expect, it } from "vitest";
import { detectImageMimeType, isAllowedImageMimeType, IMAGE_SIGNATURE_BYTES } from "./image-signature";
import {
  HEIC_BYTES,
  JPEG_BYTES,
  MP4_BYTES,
  PNG_BYTES,
  SCRIPT_BYTES,
  SVG_BYTES,
  WEBP_BYTES,
  ZIP_BYTES,
} from "./test-fixtures";

/**
 * Mission 030, section 8 — "never trust file.name / file.type /
 * extension". These tests are the evidence that the foundation decides
 * from bytes.
 */
describe("detectImageMimeType — the accepted formats", () => {
  it("recognises a real JPEG", () => {
    expect(detectImageMimeType(JPEG_BYTES)).toBe("image/jpeg");
  });

  it("recognises a real PNG", () => {
    expect(detectImageMimeType(PNG_BYTES)).toBe("image/png");
  });

  it("recognises a real WebP", () => {
    expect(detectImageMimeType(WEBP_BYTES)).toBe("image/webp");
  });

  it("needs no more than IMAGE_SIGNATURE_BYTES to decide", () => {
    // The property that lets finalization read a 16-byte Range instead
    // of downloading a 15 MiB photograph. If a future format needed
    // more, this fails rather than silently making every upload
    // download the whole file.
    for (const bytes of [JPEG_BYTES, PNG_BYTES, WEBP_BYTES]) {
      expect(detectImageMimeType(bytes.subarray(0, IMAGE_SIGNATURE_BYTES))).not.toBeNull();
    }
  });
});

describe("detectImageMimeType — what must never be accepted", () => {
  it("refuses an SVG", () => {
    // The one that matters most: an SVG is a script host, and this
    // foundation handles family photographs.
    expect(detectImageMimeType(SVG_BYTES)).toBeNull();
  });

  it("refuses a shell script", () => {
    expect(detectImageMimeType(SCRIPT_BYTES)).toBeNull();
  });

  it("refuses a ZIP archive", () => {
    expect(detectImageMimeType(ZIP_BYTES)).toBeNull();
  });

  it("refuses video", () => {
    // Mission 030 admits no video at any layer (section 21).
    expect(detectImageMimeType(MP4_BYTES)).toBeNull();
  });

  it("refuses HEIC, which is deliberately unsupported rather than forgotten", () => {
    // Nothing in this runtime can decode HEIC. Accepting it would mean
    // storing a file most visitors' browsers render as broken. See
    // config/media.ts.
    expect(detectImageMimeType(HEIC_BYTES)).toBeNull();
  });

  it("refuses empty and truncated input", () => {
    expect(detectImageMimeType(new Uint8Array([]))).toBeNull();
    expect(detectImageMimeType(new Uint8Array([0xff]))).toBeNull();
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("refuses a RIFF container that is not WebP", () => {
    // A WAV file starts with "RIFF" too. Checking only the first four
    // bytes would accept audio as a photograph.
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(detectImageMimeType(wav)).toBeNull();
  });

  it("refuses a near-miss PNG signature", () => {
    // The PNG signature's trailing bytes exist to catch corruption. One
    // wrong byte must be a rejection, not a "close enough".
    const almost = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00]);
    expect(detectImageMimeType(almost)).toBeNull();
  });
});

describe("detectImageMimeType — a lying wrapper does not help", () => {
  it("is not fooled by an image signature appearing later in the file", () => {
    // A polyglot: script first, JPEG magic afterwards. Only the START
    // of the file is the container's identity.
    const polyglot = new Uint8Array([...SCRIPT_BYTES, ...JPEG_BYTES]);
    expect(detectImageMimeType(polyglot)).toBeNull();
  });

  it("reports what the bytes are, never what anyone claimed", () => {
    // The core anti-forgery property: the function has no parameter for
    // a declared type, so a lie has nowhere to enter.
    expect(detectImageMimeType(PNG_BYTES)).toBe("image/png");
    expect(detectImageMimeType(JPEG_BYTES)).toBe("image/jpeg");
  });
});

describe("isAllowedImageMimeType", () => {
  it("accepts exactly the three allowlisted types", () => {
    expect(isAllowedImageMimeType("image/jpeg")).toBe(true);
    expect(isAllowedImageMimeType("image/png")).toBe(true);
    expect(isAllowedImageMimeType("image/webp")).toBe(true);
  });

  it("rejects every format the mission excludes", () => {
    for (const type of [
      "image/svg+xml",
      "image/heic",
      "image/heif",
      "image/avif",
      "image/gif",
      "image/bmp",
      "image/tiff",
      "video/mp4",
      "video/quicktime",
      "application/pdf",
      "text/html",
      "application/octet-stream",
    ]) {
      expect(isAllowedImageMimeType(type)).toBe(false);
    }
  });

  it("rejects non-strings and near-misses without throwing", () => {
    // This runs on unvalidated request input, so it must survive
    // anything.
    for (const value of [null, undefined, 42, {}, [], true, "", "image/jpeg; charset=x", "IMAGE/JPEG", " image/jpeg"]) {
      expect(isAllowedImageMimeType(value)).toBe(false);
    }
  });
});
