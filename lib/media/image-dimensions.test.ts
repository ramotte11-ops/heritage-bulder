import { describe, expect, it } from "vitest";
import { IMAGE_HEADER_BYTES, MAX_IMAGE_DIMENSION_PX, readImageDimensions } from "./image-dimensions";
import { detectImageMimeType, IMAGE_SIGNATURE_BYTES } from "./image-signature";
import { jpegWithDimensions, pngWithDimensions, webpVp8lWithDimensions, webpVp8WithDimensions, webpVp8xWithDimensions } from "./test-fixtures";

/**
 * Dette D1 — natural dimensions read from the stored bytes: every admitted
 * format, EXIF orientation, and fail-closed refusal of anything truncated,
 * malformed or out of range.
 */

describe("readImageDimensions — PNG", () => {
  it("reads IHDR width and height", () => {
    expect(readImageDimensions(pngWithDimensions(1600, 1200), "image/png")).toEqual({ width: 1600, height: 1200 });
    expect(readImageDimensions(pngWithDimensions(1, 65535), "image/png")).toEqual({ width: 1, height: 65535 });
  });

  it("refuses a missing IHDR, a truncated header, zero and out-of-range sides", () => {
    const noIhdr = pngWithDimensions(10, 10);
    noIhdr[12] = 0x58;
    expect(readImageDimensions(noIhdr, "image/png")).toBeNull();
    expect(readImageDimensions(pngWithDimensions(10, 10).subarray(0, 20), "image/png")).toBeNull();
    expect(readImageDimensions(pngWithDimensions(0, 10), "image/png")).toBeNull();
    expect(readImageDimensions(pngWithDimensions(10, MAX_IMAGE_DIMENSION_PX + 1), "image/png")).toBeNull();
  });
});

describe("readImageDimensions — WebP", () => {
  it("reads VP8 (lossy), VP8L (lossless) and VP8X (extended canvas)", () => {
    expect(readImageDimensions(webpVp8WithDimensions(1920, 1080), "image/webp")).toEqual({ width: 1920, height: 1080 });
    expect(readImageDimensions(webpVp8lWithDimensions(1080, 1920), "image/webp")).toEqual({ width: 1080, height: 1920 });
    expect(readImageDimensions(webpVp8xWithDimensions(2390, 1000), "image/webp")).toEqual({ width: 2390, height: 1000 });
    expect(readImageDimensions(webpVp8lWithDimensions(16384, 1), "image/webp")).toEqual({ width: 16384, height: 1 });
  });

  it("refuses a bad VP8 start code, a bad VP8L signature, an unknown chunk and a truncated header", () => {
    const vp8 = webpVp8WithDimensions(10, 10);
    vp8[23] = 0;
    expect(readImageDimensions(vp8, "image/webp")).toBeNull();
    const vp8l = webpVp8lWithDimensions(10, 10);
    vp8l[20] = 0;
    expect(readImageDimensions(vp8l, "image/webp")).toBeNull();
    const unknown = webpVp8xWithDimensions(10, 10);
    unknown.set([0x41, 0x4c, 0x50, 0x48], 12);
    expect(readImageDimensions(unknown, "image/webp")).toBeNull();
    expect(readImageDimensions(webpVp8xWithDimensions(10, 10).subarray(0, 25), "image/webp")).toBeNull();
  });
});

describe("readImageDimensions — JPEG", () => {
  it("reads the first Start-Of-Frame after the APPn segments (baseline and progressive)", () => {
    expect(readImageDimensions(jpegWithDimensions(1200, 1600), "image/jpeg")).toEqual({ width: 1200, height: 1600 });
    expect(readImageDimensions(jpegWithDimensions(4000, 3000, { sof: 0xc2 }), "image/jpeg")).toEqual({ width: 4000, height: 3000 });
  });

  it("skips large segments by their declared length (EXIF thumbnail, ICC, XMP)", () => {
    const bytes = jpegWithDimensions(3024, 4032, { paddingSegments: 6 });
    expect(bytes.length).toBeGreaterThan(300_000);
    expect(bytes.length).toBeLessThan(IMAGE_HEADER_BYTES);
    expect(readImageDimensions(bytes, "image/jpeg")).toEqual({ width: 3024, height: 4032 });
  });

  it("ignores DHT/JPG/DAC markers that share the SOF range", () => {
    expect(readImageDimensions(jpegWithDimensions(800, 600, { dhtFirst: true }), "image/jpeg")).toEqual({ width: 800, height: 600 });
  });

  it("applies EXIF orientation: 5–8 (quarter turn) swap the sides, 1–4 keep them — in both byte orders", () => {
    for (const byteOrder of ["II", "MM"] as const) {
      for (const orientation of [1, 2, 3, 4]) {
        expect(readImageDimensions(jpegWithDimensions(4032, 3024, { orientation, byteOrder }), "image/jpeg")).toEqual({ width: 4032, height: 3024 });
      }
      for (const orientation of [5, 6, 7, 8]) {
        expect(readImageDimensions(jpegWithDimensions(4032, 3024, { orientation, byteOrder }), "image/jpeg")).toEqual({ width: 3024, height: 4032 });
      }
    }
  });

  it("refuses: no SOF before the scan, truncation, zero sides, broken marker chain", () => {
    expect(readImageDimensions(jpegWithDimensions(10, 10, { sosBeforeSof: true }), "image/jpeg")).toBeNull();
    const full = jpegWithDimensions(1200, 1600, { paddingSegments: 2 });
    expect(readImageDimensions(full.subarray(0, full.length - 20), "image/jpeg")).toBeNull();
    expect(readImageDimensions(jpegWithDimensions(0, 1600), "image/jpeg")).toBeNull();
    const broken = jpegWithDimensions(10, 10);
    broken[2] = 0x00;
    expect(readImageDimensions(broken, "image/jpeg")).toBeNull();
  });
});

describe("the test images are real headers the signature check accepts", () => {
  it("every generator yields bytes detectImageMimeType recognises from its first bytes", () => {
    expect(detectImageMimeType(jpegWithDimensions(1, 1).subarray(0, IMAGE_SIGNATURE_BYTES))).toBe("image/jpeg");
    expect(detectImageMimeType(pngWithDimensions(1, 1).subarray(0, IMAGE_SIGNATURE_BYTES))).toBe("image/png");
    for (const make of [webpVp8WithDimensions, webpVp8lWithDimensions, webpVp8xWithDimensions]) {
      expect(detectImageMimeType(make(1, 1).subarray(0, IMAGE_SIGNATURE_BYTES))).toBe("image/webp");
    }
  });
});
