import { MAX_MEDIA_BYTES, type MediaPurpose } from "@/config/media";
import {
  PHOTO_INPUT_MAX_BYTES,
  PHOTO_INPUT_MAX_PIXELS,
  PHOTO_PROFILES,
  PHOTO_QUALITY_STEP,
  PHOTO_SCALE_STEPS,
} from "@/config/photo-profiles";
import { IMAGE_HEADER_BYTES, readImageDimensions } from "./image-dimensions";
import { isImageComplete } from "./image-integrity";
import { detectImageMimeType, isAllowedImageMimeType } from "./image-signature";
import type { MediaErrorCode } from "./media-errors";

/**
 * Optimisation photographique V1 — la préparation d'une photographie
 * DANS LE NAVIGATEUR, avant le parcours d'envoi sécurisé existant
 * (réservation → envoi signé → finalisation), qui reste inchangé et
 * garde toutes ses vérifications (format par signature, taille mesurée,
 * dimensions, propriété).
 *
 * 1. Vérifier le fichier : taille d'entrée, VRAI format lu dans ses
 *    octets (jamais `file.type`), dimensions lues dans l'en-tête — AVANT
 *    tout décodage, pour refuser proprement une image qui saturerait la
 *    mémoire d'un téléphone — et fichier complet (`image-integrity.ts` :
 *    un navigateur décode sans erreur une photo tronquée, grisée).
 * 2. Décoder en appliquant l'orientation EXIF (comportement par défaut
 *    des navigateurs actuels : les pixels produits sont déjà droits, et
 *    le fichier envoyé ne porte plus aucune métadonnée — ni orientation,
 *    ni position GPS).
 * 3. Réduire au grand côté du profil (jamais d'agrandissement), par
 *    divisions successives par deux puis un dernier pas lissé, pour une
 *    réduction nette.
 * 4. Compresser : WebP (repli JPEG si le navigateur ne sait pas encoder
 *    le WebP), qualité de départ du profil, abaissée par paliers jusqu'au
 *    plancher, puis dimensions réduites si la cible du profil n'est pas
 *    atteinte. Une photo déjà légère ne doit pas s'alourdir : la qualité
 *    descend (jamais sous le plancher) tant que le résultat pèse plus que
 *    l'original — sans jamais réduire les dimensions pour cela.
 * 5. Vérifier le résultat (format admis, dimensions, poids ≤ limite du
 *    serveur).
 * 6. Rendre UNIQUEMENT le fichier optimisé. En cas d'échec : un code
 *    d'erreur du vocabulaire média existant — l'original n'est jamais
 *    renvoyé, donc jamais envoyé.
 */

export interface DecodedPhoto {
  /** Dimensions affichées (orientation EXIF appliquée). */
  width: number;
  height: number;
  release(): void;
}

export interface ResizedPhoto {
  encode(type: PreparedPhotoType, quality: number): Promise<Blob | null>;
  release(): void;
}

export type PreparedPhotoType = "image/webp" | "image/jpeg";

/** Ce dont la préparation a besoin du navigateur — injecté pour les tests. */
export interface PhotoPreparationEnv {
  /** Octets `[start, end[` du fichier. */
  read(file: Blob, start: number, end: number): Promise<Uint8Array>;
  decode(file: Blob): Promise<DecodedPhoto>;
  /** `opaque` : fond blanc sous les zones transparentes (le JPEG n'a pas d'alpha). */
  resize(photo: DecodedPhoto, width: number, height: number, opaque: boolean): Promise<ResizedPhoto>;
  canEncodeWebp(): Promise<boolean>;
  now(): number;
}

export interface PhotoPreparationReport {
  purpose: MediaPurpose;
  inputBytes: number;
  inputWidth: number;
  inputHeight: number;
  outputBytes: number;
  width: number;
  height: number;
  type: PreparedPhotoType;
  quality: number;
  attempts: number;
  /** Le poids cible du profil est atteint. */
  targetMet: boolean;
  /** Le fichier optimisé pèse plus que l'original (photo déjà très légère). */
  heavierThanInput: boolean;
  durationMs: number;
}

export type PhotoPreparationResult =
  | { ok: true; file: File; report: PhotoPreparationReport }
  | { ok: false; code: MediaErrorCode };

const EXTENSION: Record<PreparedPhotoType, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

/** Dimensions réduites pour tenir dans `maxSide` (jamais agrandies). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Qualités essayées, de la plus haute au plancher du profil. */
export function qualityLadder(start: number, floor: number, step: number = PHOTO_QUALITY_STEP): number[] {
  const ladder: number[] = [];
  for (let q = start; q >= floor - 1e-9; q -= step) ladder.push(Math.round(q * 100) / 100);
  if (ladder.at(-1) !== floor) ladder.push(floor);
  return ladder;
}

function fail(code: MediaErrorCode): PhotoPreparationResult {
  return { ok: false, code };
}

export async function preparePhotoForUpload(
  file: File,
  purpose: MediaPurpose,
  env: PhotoPreparationEnv = browserPhotoPreparationEnv,
): Promise<PhotoPreparationResult> {
  const started = env.now();
  const profile = PHOTO_PROFILES[purpose];

  // 1. Vérifier le fichier, sans le décoder.
  if (file.size === 0) return fail("invalid_file");
  if (file.size > PHOTO_INPUT_MAX_BYTES) return fail("file_too_large");

  const read = (start: number, end: number) => env.read(file, start, end);
  let head: Uint8Array;
  try {
    head = await read(0, Math.min(file.size, IMAGE_HEADER_BYTES));
  } catch {
    return fail("invalid_file");
  }
  const actualType = detectImageMimeType(head);
  if (actualType === null) {
    // Un fichier qui se dit photo mais n'en a pas les octets est invalide ;
    // un autre format (HEIC, GIF, PDF…) n'est simplement pas admis.
    return fail(isAllowedImageMimeType(file.type) ? "invalid_file" : "unsupported_format");
  }
  const header = readImageDimensions(head, actualType);
  if (header === null) return fail("invalid_file");
  if (header.width * header.height > PHOTO_INPUT_MAX_PIXELS) return fail("file_too_large");
  try {
    if (!(await isImageComplete(actualType, head, file.size, read))) return fail("invalid_file");
  } catch {
    return fail("invalid_file");
  }

  // 2. Décoder (orientation EXIF appliquée par le navigateur).
  let decoded: DecodedPhoto;
  try {
    decoded = await env.decode(file);
  } catch {
    return fail("invalid_file");
  }

  try {
    if (decoded.width < 1 || decoded.height < 1) return fail("invalid_file");
    const type: PreparedPhotoType = (await env.canEncodeWebp()) ? "image/webp" : "image/jpeg";
    const opaque = type === "image/jpeg";

    // 3–4. Réduire puis compresser, du plus fidèle au plus léger.
    const enough = Math.min(profile.targetMaxBytes, file.size);
    let best: { blob: Blob; width: number; height: number; quality: number } | null = null;
    let attempts = 0;
    search: for (const scale of PHOTO_SCALE_STEPS) {
      const size = fitWithin(decoded.width, decoded.height, Math.round(profile.maxSide * scale));
      // Une petite image déjà sous le grand côté : inutile de la réduire davantage.
      if (best !== null && size.width === best.width && size.height === best.height) break;
      let resized: ResizedPhoto;
      try {
        resized = await env.resize(decoded, size.width, size.height, opaque);
      } catch {
        break;
      }
      try {
        for (const quality of qualityLadder(profile.qualityStart, profile.qualityFloor)) {
          attempts += 1;
          let blob: Blob | null;
          try {
            blob = await resized.encode(type, quality);
          } catch {
            blob = null;
          }
          // Un encodeur qui rend un autre format que demandé (ou rien) ne compte pas.
          if (blob === null || blob.size === 0 || blob.type !== type) continue;
          if (best === null || blob.size < best.blob.size) best = { blob, ...size, quality };
          if (blob.size <= enough) break search;
        }
      } finally {
        resized.release();
      }
      // Seule la cible du profil justifie de réduire les dimensions.
      if (best !== null && best.blob.size <= profile.targetMaxBytes) break;
    }

    // 5. Vérifier le résultat ; 6. ne rendre que le fichier optimisé.
    if (best === null) return fail("invalid_file");
    if (Math.max(best.width, best.height) > profile.maxSide) return fail("invalid_file");
    if (best.blob.size > MAX_MEDIA_BYTES) return fail("file_too_large");

    const prepared = new File([best.blob], `photo.${EXTENSION[type]}`, { type });
    return {
      ok: true,
      file: prepared,
      report: {
        purpose,
        inputBytes: file.size,
        inputWidth: decoded.width,
        inputHeight: decoded.height,
        outputBytes: prepared.size,
        width: best.width,
        height: best.height,
        type,
        quality: best.quality,
        attempts,
        targetMet: prepared.size <= profile.targetMaxBytes,
        heavierThanInput: prepared.size > file.size,
        durationMs: Math.round(env.now() - started),
      },
    };
  } finally {
    decoded.release();
  }
}

// ---------------------------------------------------------------------
// Navigateur
// ---------------------------------------------------------------------

interface BrowserDecodedPhoto extends DecodedPhoto {
  image: HTMLImageElement;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Libère la mémoire d'un canvas sans attendre le ramasse-miettes (iOS). */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

let webpSupport: Promise<boolean> | null = null;

export const browserPhotoPreparationEnv: PhotoPreparationEnv = {
  async read(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  },

  async decode(file) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    const decoded: BrowserDecodedPhoto = {
      image,
      // naturalWidth/naturalHeight suivent l'orientation EXIF
      // (`image-orientation: from-image`, défaut des navigateurs actuels).
      width: image.naturalWidth,
      height: image.naturalHeight,
      release() {
        URL.revokeObjectURL(url);
        image.removeAttribute("src");
      },
    };
    return decoded;
  },

  async resize(photo, width, height, opaque) {
    const { image } = photo as BrowserDecodedPhoto;
    let source: CanvasImageSource = image;
    let sw = photo.width;
    let sh = photo.height;
    let intermediate: HTMLCanvasElement | null = null;
    // Divisions successives par deux : une réduction nette, sans le
    // crénelage d'un seul grand pas.
    while (sw / 2 >= width && sh / 2 >= height) {
      const nw = Math.round(sw / 2);
      const nh = Math.round(sh / 2);
      const step = createCanvas(nw, nh);
      const ctx = step.getContext("2d");
      if (ctx === null) throw new Error("canvas");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, sw, sh, 0, 0, nw, nh);
      if (intermediate !== null) releaseCanvas(intermediate);
      intermediate = step;
      source = step;
      sw = nw;
      sh = nh;
    }
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("canvas");
    if (opaque) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, width, height);
    if (intermediate !== null) releaseCanvas(intermediate);
    return {
      encode: (type, quality) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)),
      release: () => releaseCanvas(canvas),
    };
  },

  canEncodeWebp() {
    webpSupport ??= new Promise<boolean>((resolve) => {
      const probe = createCanvas(1, 1);
      // Safari rend un PNG quand on lui demande un WebP qu'il ne sait pas encoder.
      probe.toBlob((blob) => {
        releaseCanvas(probe);
        resolve(blob !== null && blob.type === "image/webp");
      }, "image/webp");
    });
    return webpSupport;
  },

  now: () => performance.now(),
};
