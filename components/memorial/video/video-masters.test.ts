import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VIDEO_MASTERS, VIDEO_MASTERS_INSTALLED, videoMasterSrcSet, type VideoMasterRendition } from "./video-masters";

/**
 * VID-05B — intégrité des Masters officiels et de leurs fichiers servis
 * (convention d'empreinte du lot 06-D : nom = SHA-256 complet des octets).
 */

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "assets", "video-hommage-v1", "source");
const SERVED_DIR = path.join(ROOT, "public", "assets", "video-hommage", "v1");

const SPECS = Object.entries(VIDEO_MASTERS).flatMap(([layout, variants]) =>
  Object.entries(variants).map(([variant, spec]) => ({ name: `${layout}-${variant}`, layout, variant, spec })),
);
const RENDITIONS = SPECS.flatMap(({ name, spec }) =>
  (["avif", "webp"] as const).flatMap((format) => spec[format].map((r) => ({ name, format, r, spec }))),
);

function publicFile(src: string): string {
  return path.join(ROOT, "public", ...src.replace(/^\//, "").split("/"));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Dimensions lues dans l'en-tête : PNG (IHDR), WebP sans perte (VP8L), AVIF (boîte `ispe`). */
function dimensions(bytes: Buffer, format: "png" | "avif" | "webp"): [number, number] {
  if (format === "png") {
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (format === "webp") {
    expect(bytes.subarray(8, 16).toString("latin1")).toBe("WEBPVP8L");
    const bits = bytes.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  expect(bytes.subarray(4, 12).toString("latin1")).toBe("ftypavif");
  const ispe = bytes.indexOf("ispe", 0, "latin1");
  expect(ispe).toBeGreaterThan(0);
  return [bytes.readUInt32BE(ispe + 8), bytes.readUInt32BE(ispe + 12)];
}

describe("VID-05B — Masters officiels de la rubrique vidéo", () => {
  it("les Masters sont installés : la rubrique les affiche", () => {
    expect(VIDEO_MASTERS_INSTALLED).toBe(true);
  });

  it.each(SPECS)("$name : PNG officiel intact (octets, SHA-256, dimensions)", ({ spec }) => {
    const bytes = readFileSync(path.join(SOURCE_DIR, spec.source.file));
    expect(bytes.byteLength).toBe(spec.source.bytes);
    expect(sha256(bytes)).toBe(spec.source.sha256);
    expect(dimensions(bytes, "png")).toEqual([spec.width, spec.height]);
  });

  it("le répertoire des sources ne contient que les quatre PNG officiels", () => {
    expect(readdirSync(SOURCE_DIR).sort()).toEqual(SPECS.map(({ spec }) => spec.source.file).sort());
  });

  it.each(RENDITIONS.map((x) => ({ ...x, label: `${x.name} ${x.r.width}w ${x.format}` })))(
    "$label : adresse liée au SHA-256 complet de ses octets, dimensions exactes",
    ({ r, format, spec }: { r: VideoMasterRendition; format: "avif" | "webp"; spec: (typeof SPECS)[number]["spec"] }) => {
      const bytes = readFileSync(publicFile(r.src));
      expect(bytes.byteLength).toBe(r.bytes);
      expect(sha256(bytes)).toBe(r.sha256);
      expect(path.basename(r.src).startsWith(`${r.sha256}-`)).toBe(true);
      expect(r.src.endsWith(`.${format}`)).toBe(true);
      expect(dimensions(bytes, format)).toEqual([r.width, r.height]);
      // Réduction homothétique du Master, jamais d'agrandissement ni de recadrage.
      expect(r.width).toBeLessThanOrEqual(spec.width);
      expect(r.height).toBe(Math.round((spec.height * r.width) / spec.width));
    },
  );

  it.each(SPECS)("$name : AVIF et WebP aux mêmes largeurs, la plus grande étant la native", ({ spec }) => {
    const widths = (list: readonly VideoMasterRendition[]) => list.map((r) => r.width);
    expect(widths(spec.avif)).toEqual(widths(spec.webp));
    expect(widths(spec.avif)).toEqual([...widths(spec.avif)].sort((a, b) => a - b));
    expect(spec.avif.at(-1)!.width).toBe(spec.width);
    expect(videoMasterSrcSet(spec.avif)).toBe(spec.avif.map((r) => `${r.src} ${r.width}w`).join(", "));
  });

  it("le répertoire servi contient exactement les fichiers déclarés, aucun autre", () => {
    const declared = RENDITIONS.map(({ r }) => path.basename(r.src)).sort();
    expect(new Set(declared).size).toBe(16);
    expect(readdirSync(SERVED_DIR).sort()).toEqual(declared);
  });
});
