import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { processContributionPhoto } from "./photo-processing";

/**
 * O5 — preuves sur fichiers SYNTHÉTIQUES (générés ici, aucune photo
 * réelle) : orientation, réduction, WebP, absence de toute métadonnée,
 * refus des fichiers invalides ou dangereux.
 */

async function jpegWithExif(width: number, height: number, orientation?: number): Promise<Uint8Array> {
  // Moitié gauche rouge, moitié droite bleue : permet de vérifier que la
  // rotation a bien été appliquée aux pixels.
  const half = Math.floor(width / 2);
  const left = await sharp({ create: { width: half, height, channels: 3, background: { r: 220, g: 20, b: 20 } } }).png().toBuffer();
  let img = sharp({ create: { width, height, channels: 3, background: { r: 20, g: 20, b: 220 } } })
    .composite([{ input: left, left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "SyntheticCam", Model: "Test 1", Software: "heritage-test" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 24/1", GPSLongitudeRef: "E", GPSLongitude: "2/1 21/1 3/1" },
    });
  if (orientation !== undefined) img = img.withMetadata({ orientation });
  return new Uint8Array(await img.toBuffer());
}

async function pixelAt(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

describe("M8-E2 — traitement des photographies (O5)", () => {
  it("12 Mpx avec EXIF et GPS : WebP 2000 × 1500, aucune métadonnée", async () => {
    const input = await jpegWithExif(4032, 3024);
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined(); // le fichier synthétique porte bien un EXIF (GPS compris)
    expect(Buffer.from(inMeta.exif!).includes(Buffer.from("SyntheticCam"))).toBe(true);

    const out = await processContributionPhoto(input);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out).toMatchObject({ mimeType: "image/webp", width: 2000, height: 1500 });
    expect(out.sizeBytes).toBe(out.bytes.byteLength);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.exif, meta.xmp, meta.icc, meta.iptc]).toEqual([undefined, undefined, undefined, undefined]);
    expect(meta.orientation).toBeUndefined();
    expect(Buffer.from(out.bytes).includes(Buffer.from("SyntheticCam"))).toBe(false);
    expect(Buffer.from(out.bytes).includes(Buffer.from("GPS"))).toBe(false);
  });

  it("orientation 6 (photo verticale) : pixels tournés, sortie droite 1500 × 2000", async () => {
    const input = await jpegWithExif(4032, 3024, 6);
    const out = await processContributionPhoto(input);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect([out.width, out.height]).toEqual([1500, 2000]);
    expect((await sharp(out.bytes).metadata()).orientation).toBeUndefined();
    // Orientation 6 = rotation de 90° horaire : la moitié gauche (rouge)
    // se retrouve en haut.
    const top = await pixelAt(out.bytes, 750, 100);
    const bottom = await pixelAt(out.bytes, 750, 1900);
    expect(top.r).toBeGreaterThan(150);
    expect(bottom.b).toBeGreaterThan(150);
  });

  it("une petite image n'est jamais agrandie ; PNG et WebP acceptés", async () => {
    const png = new Uint8Array(await sharp({ create: { width: 640, height: 480, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).png().toBuffer());
    const webp = new Uint8Array(await sharp({ create: { width: 300, height: 900, channels: 3, background: "#808080" } }).webp().toBuffer());
    expect(await processContributionPhoto(png)).toMatchObject({ ok: true, width: 640, height: 480 });
    expect(await processContributionPhoto(webp)).toMatchObject({ ok: true, width: 300, height: 900 });
  });

  it("refuse ce qui n'est pas une image JPEG/PNG/WebP (SVG, GIF, texte, vide)", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    const gif = new Uint8Array(await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer());
    for (const bytes of [svg, gif, new TextEncoder().encode("#!/bin/sh\nrm -rf /"), new Uint8Array(0)]) {
      expect(await processContributionPhoto(bytes)).toEqual({ ok: false, reason: "not_an_image" });
    }
  });

  it("refuse un JPEG tronqué", async () => {
    const input = await jpegWithExif(800, 600);
    expect(await processContributionPhoto(input.subarray(0, Math.floor(input.byteLength / 2)))).toEqual({ ok: false, reason: "corrupted" });
  });

  it("refuse une signature JPEG suivie de n'importe quoi", async () => {
    const forged = new Uint8Array(4096);
    forged.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await processContributionPhoto(forged)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("refuse une image de plus de 50 Mpx AVANT de la décoder", async () => {
    const huge = new Uint8Array(await sharp({ create: { width: 10_000, height: 8_100, channels: 3, background: "#000" } }).png({ compressionLevel: 1 }).toBuffer());
    expect(await processContributionPhoto(huge)).toEqual({ ok: false, reason: "too_many_pixels" });
  }, 30_000);

  it("refuse un fichier de plus de 15 Mo sans le décoder", async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await processContributionPhoto(big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("une image animée devient une image fixe", async () => {
    const red = await sharp({ create: { width: 20, height: 40, channels: 3, background: "#f00" } }).png().toBuffer();
    const blue = await sharp({ create: { width: 20, height: 40, channels: 3, background: "#00f" } }).png().toBuffer();
    const anim = new Uint8Array(await sharp([red, blue], { join: { animated: true } }).webp({ loop: 0 }).toBuffer());
    expect((await sharp(anim, { animated: true }).metadata()).pages).toBe(2);
    const out = await processContributionPhoto(anim);
    expect(out.ok).toBe(true);
    if (out.ok) expect((await sharp(out.bytes, { animated: true }).metadata()).pages ?? 1).toBe(1);
  });
});
