import { describe, expect, it } from "vitest";
import { MAX_MEDIA_BYTES } from "@/config/media";
import { PHOTO_INPUT_MAX_BYTES, PHOTO_INPUT_MAX_PIXELS, PHOTO_PROFILES } from "@/config/photo-profiles";
import {
  fitWithin,
  preparePhotoForUpload,
  qualityLadder,
  type DecodedPhoto,
  type PhotoPreparationEnv,
  type PreparedPhotoType,
} from "./photo-preparation";

/**
 * Optimisation photographique V1 — l'orchestration (vérifications,
 * compression adaptative, repli JPEG, échecs) avec un navigateur simulé.
 * Le rendu réel (canvas, orientation EXIF, poids) est mesuré dans
 * Chromium, hors de ces tests.
 */

/** En-tête PNG minimal : signature + chunk IHDR (largeur, hauteur). */
function pngHead(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

/** Fin d'un PNG complet : chunk IEND (longueur nulle, type, CRC). */
const PNG_END = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

interface FakeOptions {
  decoded?: { width: number; height: number } | "fail";
  webp?: boolean;
  /** Poids encodé (octets) selon dimensions, qualité et format. */
  weight?: (width: number, height: number, quality: number, type: PreparedPhotoType) => number;
  /** Format réellement rendu par l'encodeur (Safari : PNG pour un WebP). */
  renders?: (type: PreparedPhotoType) => string;
}

function fakeEnv(options: FakeOptions = {}) {
  const calls = { resized: [] as Array<[number, number, boolean]>, encoded: [] as Array<[PreparedPhotoType, number]>, released: 0, decodedReleased: 0 };
  const decoded = options.decoded ?? { width: 4032, height: 3024 };
  const env: PhotoPreparationEnv = {
    read: async (file, start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
    decode: async (): Promise<DecodedPhoto> => {
      if (decoded === "fail") throw new Error("decode");
      return { ...decoded, release: () => (calls.decodedReleased += 1) };
    },
    resize: async (_photo, width, height, opaque) => {
      calls.resized.push([width, height, opaque]);
      return {
        encode: async (type, quality) => {
          calls.encoded.push([type, quality]);
          const bytes = (options.weight ?? ((w, h, q) => Math.round(w * h * q * 0.12)))(width, height, quality, type);
          return new Blob([new Uint8Array(bytes)], { type: options.renders?.(type) ?? type });
        },
        release: () => (calls.released += 1),
      };
    },
    canEncodeWebp: async () => options.webp ?? true,
    now: () => 0,
  };
  return { env, calls };
}

/** Une « photo » : en-tête PNG, octets nuls, puis IEND si elle est complète. */
function photo(bytes = 3_000_000, type = "image/jpeg", head = pngHead(4032, 3024), complete = true): File {
  const content = new Uint8Array(bytes);
  content.set(head.subarray(0, Math.min(head.length, bytes)));
  if (complete && bytes >= head.length + PNG_END.length) content.set(PNG_END, bytes - PNG_END.length);
  return new File([content], "IMG_0001.JPG", { type });
}

describe("fitWithin / qualityLadder", () => {
  it("réduit au grand côté, en gardant le rapport, sans jamais agrandir", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 2400)).toEqual({ width: 1800, height: 2400 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("descend de la qualité de départ au plancher inclus", () => {
    expect(qualityLadder(0.8, 0.62)).toEqual([0.8, 0.74, 0.68, 0.62]);
    expect(qualityLadder(0.86, 0.74)).toEqual([0.86, 0.8, 0.74]);
  });
});

describe("preparePhotoForUpload — profils", () => {
  it("Galerie : 1600 px de grand côté, WebP, un seul essai quand la cible est atteinte", async () => {
    const { env, calls } = fakeEnv({ weight: () => 200 * 1024 });
    const result = await preparePhotoForUpload(photo(), "gallery", env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("photo.webp");
    expect(result.report).toMatchObject({ width: 1600, height: 1200, quality: 0.8, attempts: 1, targetMet: true });
    expect(calls.resized).toEqual([[1600, 1200, false]]);
  });

  it("décode directement à la taille du profil, calculée sur l'en-tête ; le rapport garde les dimensions d'origine", async () => {
    const { env } = fakeEnv({ decoded: { width: 1600, height: 1200 }, weight: () => 200 * 1024 });
    const targets: Array<{ width: number; height: number }> = [];
    const spy: PhotoPreparationEnv = { ...env, decode: (file, target) => (targets.push(target), env.decode(file, target)) };
    const result = await preparePhotoForUpload(photo(3_000_000, "image/jpeg", pngHead(8160, 6120)), "gallery", spy);
    expect(targets).toEqual([{ width: 1600, height: 1200 }]);
    expect(result.ok && result.report).toMatchObject({ inputWidth: 8160, inputHeight: 6120, width: 1600, height: 1200 });
  });

    it("Hero : 2400 px de grand côté et qualité de départ supérieure", async () => {
    const { env } = fakeEnv({ decoded: { width: 3024, height: 4032 }, weight: () => 500 * 1024 });
    const result = await preparePhotoForUpload(photo(), "hero", env);
    expect(result.ok && result.report).toMatchObject({ width: 1800, height: 2400, quality: 0.86, targetMet: true });
    expect(PHOTO_PROFILES.hero.qualityStart).toBeGreaterThan(PHOTO_PROFILES.gallery.qualityStart);
  });

  it("compression adaptative : baisse la qualité jusqu'à atteindre la cible", async () => {
    const target = PHOTO_PROFILES.gallery.targetMaxBytes;
    const { env, calls } = fakeEnv({ weight: (_w, _h, q) => (q > 0.7 ? target + 50_000 : target - 10_000) });
    const result = await preparePhotoForUpload(photo(), "gallery", env);
    expect(result.ok && result.report).toMatchObject({ quality: 0.68, attempts: 3, targetMet: true });
    expect(calls.encoded.map(([, q]) => q)).toEqual([0.8, 0.74, 0.68]);
  });

  it("puis réduit les dimensions quand le plancher de qualité ne suffit pas", async () => {
    const target = PHOTO_PROFILES.gallery.targetMaxBytes;
    const { env, calls } = fakeEnv({ weight: (w) => (w > 1400 ? target * 2 : target - 1) });
    const result = await preparePhotoForUpload(photo(), "gallery", env);
    expect(result.ok && result.report).toMatchObject({ width: 1360, height: 1020, targetMet: true });
    expect(calls.resized.map(([w]) => w)).toEqual([1600, 1360]);
  });

  it("cible inatteignable : envoie la meilleure version optimisée, signalée, jamais l'original", async () => {
    const { env } = fakeEnv({ weight: (w, h, q) => Math.round(w * h * q) });
    const input = photo(9_000_000);
    const result = await preparePhotoForUpload(input, "gallery", env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.targetMet).toBe(false);
    expect(result.file).not.toBe(input);
    expect(result.report).toMatchObject({ width: 1152, height: 864, quality: 0.62 });
  });

  it("photo déjà légère : la qualité descend pour ne pas l'alourdir, jamais les dimensions", async () => {
    const lighter = fakeEnv({ decoded: { width: 1800, height: 1200 }, weight: (_w, _h, q) => Math.round(q * 400_000) });
    const kept = await preparePhotoForUpload(photo(339_000), "hero", lighter.env);
    expect(kept.ok && kept.report).toMatchObject({ width: 1800, height: 1200, quality: 0.8, attempts: 2, heavierThanInput: false });

    const floor = fakeEnv({ decoded: { width: 1800, height: 1200 }, weight: (_w, _h, q) => Math.round(q * 500_000) });
    const atFloor = await preparePhotoForUpload(photo(339_000), "hero", floor.env);
    expect(atFloor.ok && atFloor.report).toMatchObject({ width: 1800, height: 1200, quality: 0.74, targetMet: true, heavierThanInput: true });
    expect(floor.calls.resized).toEqual([[1800, 1200, false]]);
  });

  it("petite image : jamais agrandie, pas de réessai inutile aux mêmes dimensions", async () => {
    const { env, calls } = fakeEnv({ decoded: { width: 640, height: 480 }, weight: () => PHOTO_PROFILES.gallery.targetMaxBytes + 1 });
    const result = await preparePhotoForUpload(photo(80_000), "gallery", env);
    expect(result.ok && result.report).toMatchObject({ width: 640, height: 480 });
    expect(calls.resized).toEqual([[640, 480, false]]);
  });

  it("navigateur sans encodeur WebP : repli JPEG, sur fond blanc", async () => {
    const { env, calls } = fakeEnv({ webp: false, weight: () => 120 * 1024 });
    const result = await preparePhotoForUpload(photo(), "gallery", env);
    expect(result.ok && result.file.type).toBe("image/jpeg");
    expect(result.ok && result.file.name).toBe("photo.jpg");
    expect(calls.resized[0][2]).toBe(true);
  });

  it("un encodeur qui rend un autre format que demandé n'est jamais retenu", async () => {
    const { env } = fakeEnv({ renders: () => "image/png" });
    expect(await preparePhotoForUpload(photo(), "gallery", env)).toEqual({ ok: false, code: "invalid_file" });
  });

  it("libère toujours l'image décodée et chaque canvas", async () => {
    const { env, calls } = fakeEnv({ weight: (w) => (w > 1400 ? 10_000_000 : 1000) });
    await preparePhotoForUpload(photo(), "gallery", env);
    expect(calls.decodedReleased).toBe(1);
    expect(calls.released).toBe(calls.resized.length);
  });
});

describe("preparePhotoForUpload — refus, jamais d'envoi de l'original", () => {
  it("fichier vide ou trop lourd en entrée", async () => {
    const { env } = fakeEnv();
    expect(await preparePhotoForUpload(photo(0), "gallery", env)).toEqual({ ok: false, code: "invalid_file" });
    expect(await preparePhotoForUpload(photo(PHOTO_INPUT_MAX_BYTES + 1), "gallery", env)).toEqual({ ok: false, code: "file_too_large" });
  });

  it("format lu dans les octets : un faux JPEG est invalide, un autre format n'est pas admis", async () => {
    const garbage = new TextEncoder().encode("#!/bin/sh\necho not a photo\n");
    expect(await preparePhotoForUpload(photo(3_000_000, "image/jpeg", garbage), "gallery", fakeEnv().env)).toEqual({ ok: false, code: "invalid_file" });
    expect(await preparePhotoForUpload(photo(3_000_000, "image/heic", garbage), "gallery", fakeEnv().env)).toEqual({
      ok: false,
      code: "unsupported_format",
    });
  });

  it("image démesurée refusée sur son en-tête, AVANT tout décodage", async () => {
    let decodedCalled = false;
    const { env } = fakeEnv();
    const guarded = { ...env, decode: async () => ((decodedCalled = true), env.decode(new Blob(), { width: 1, height: 1 })) };
    expect(10_000 * 7_000).toBeGreaterThan(PHOTO_INPUT_MAX_PIXELS);
    expect(await preparePhotoForUpload(photo(3_000_000, "image/jpeg", pngHead(10_000, 7_000)), "gallery", guarded)).toEqual({
      ok: false,
      code: "file_too_large",
    });
    expect(decodedCalled).toBe(false);
    // L'ancienne limite (60 Mpx) est refusée ; un capteur 50 Mpx (8160 × 6120) passe.
    expect(8940 * 6700).toBeGreaterThan(PHOTO_INPUT_MAX_PIXELS);
    expect(await preparePhotoForUpload(photo(3_000_000, "image/jpeg", pngHead(8940, 6700)), "gallery", guarded)).toEqual({
      ok: false,
      code: "file_too_large",
    });
    expect(8160 * 6120).toBeLessThanOrEqual(PHOTO_INPUT_MAX_PIXELS);
  });

  it("en-tête illisible ou image impossible à décoder", async () => {
    const truncated = pngHead(100, 100).slice(0, 12);
    expect(await preparePhotoForUpload(photo(12, "image/png", truncated, false), "gallery", fakeEnv().env)).toEqual({ ok: false, code: "invalid_file" });
    expect(await preparePhotoForUpload(photo(), "gallery", fakeEnv({ decoded: "fail" }).env)).toEqual({ ok: false, code: "invalid_file" });
  });

  it("fichier tronqué (transfert interrompu) refusé AVANT tout décodage — le navigateur l'aurait grisé", async () => {
    let decodedCalled = false;
    const { env } = fakeEnv();
    const guarded = { ...env, decode: async (file: Blob, target: { width: number; height: number }) => ((decodedCalled = true), env.decode(file, target)) };
    expect(await preparePhotoForUpload(photo(3_000_000, "image/png", pngHead(4032, 3024), false), "gallery", guarded)).toEqual({
      ok: false,
      code: "invalid_file",
    });
    expect(decodedCalled).toBe(false);
  });

  it("échec de compression : aucun fichier rendu", async () => {
    const { env } = fakeEnv();
    const broken: PhotoPreparationEnv = { ...env, resize: async () => ({ encode: async () => null, release: () => {} }) };
    expect(await preparePhotoForUpload(photo(), "gallery", broken)).toEqual({ ok: false, code: "invalid_file" });
  });

  it("résultat au-delà de la limite du serveur : refusé, jamais envoyé", async () => {
    const { env } = fakeEnv({ weight: () => MAX_MEDIA_BYTES + 1 });
    expect(await preparePhotoForUpload(photo(), "gallery", env)).toEqual({ ok: false, code: "file_too_large" });
  });
});
