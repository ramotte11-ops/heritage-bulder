import { describe, expect, it } from "vitest";
import { findJpegScanStart, isImageComplete } from "./image-integrity";

/** Optimisation photographique V1 — fichier complet ou tronqué, lu dans ses octets. */

function reader(bytes: Uint8Array) {
  return async (start: number, end: number) => bytes.slice(start, end);
}

function check(type: "image/jpeg" | "image/png" | "image/webp", bytes: Uint8Array) {
  return isImageComplete(type, bytes.slice(0, 512 * 1024), bytes.length, reader(bytes));
}

function concat(...parts: Array<ArrayLike<number>>): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Segment JPEG : marqueur + longueur (2 octets, incluse) + données. */
function segment(marker: number, data: ArrayLike<number>): number[] {
  const length = data.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...Array.from(data)];
}

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
/** APP1 « Exif » dont la vignette porte son propre EOI. */
const EXIF_WITH_THUMBNAIL = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...SOI, 1, 2, 3, ...EOI]);
const SOS = segment(0xda, [1, 1, 0, 0, 0x3f, 0]);
/** Données compressées : FF toujours suivi de 00 (bourrage) ou d'un RST. */
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];

describe("JPEG", () => {
  it("trouve le début des données compressées après les segments APPn", () => {
    const head = concat(SOI, EXIF_WITH_THUMBNAIL, SOS, SCAN);
    expect(findJpegScanStart(head)).toBe(SOI.length + EXIF_WITH_THUMBNAIL.length);
    expect(findJpegScanStart(concat(SOI, [0x12, 0x34, 0x56, 0x78]))).toBeNull();
    expect(findJpegScanStart(concat(SOI, EXIF_WITH_THUMBNAIL).slice(0, 10))).toBe("beyond");
  });

  it("complet : se termine par EOI", async () => {
    expect(await check("image/jpeg", concat(SOI, EXIF_WITH_THUMBNAIL, SOS, SCAN, EOI))).toBe(true);
  });

  it("photo animée : données après l'EOI admises", async () => {
    const video = new TextEncoder().encode("....ftypmp42 video");
    expect(await check("image/jpeg", concat(SOI, EXIF_WITH_THUMBNAIL, SOS, SCAN, EOI, video))).toBe(true);
  });

  it("tronqué : l'EOI de la vignette EXIF ne compte pas", async () => {
    expect(await check("image/jpeg", concat(SOI, EXIF_WITH_THUMBNAIL, SOS, SCAN))).toBe(false);
  });

  it("EOI à cheval sur deux blocs de lecture", async () => {
    const head = concat(SOI, SOS);
    const filler = new Uint8Array(1024 * 1024 - 1);
    const bytes = concat(head, filler, EOI, [7, 7]);
    expect(await check("image/jpeg", bytes)).toBe(true);
    expect(await check("image/jpeg", concat(head, filler, [0xff, 0x00, 7, 7]))).toBe(false);
  });
});

describe("PNG", () => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

  it("complet : chunk IEND final, quelques octets parasites tolérés", async () => {
    expect(await check("image/png", concat(signature, new Uint8Array(5000), iend))).toBe(true);
    expect(await check("image/png", concat(signature, new Uint8Array(5000), iend, [0, 0, 0]))).toBe(true);
  });

  it("tronqué : pas d'IEND", async () => {
    expect(await check("image/png", concat(signature, new Uint8Array(5000)))).toBe(false);
  });
});

describe("WebP", () => {
  function webp(declared: number, actual: number): Uint8Array {
    const bytes = new Uint8Array(actual);
    bytes.set([0x52, 0x49, 0x46, 0x46]);
    new DataView(bytes.buffer).setUint32(4, declared, true);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    return bytes;
  }

  it("complet quand toute la longueur RIFF déclarée est là", async () => {
    expect(await check("image/webp", webp(992, 1000))).toBe(true);
    expect(await check("image/webp", webp(5000, 1000))).toBe(false);
  });
});
