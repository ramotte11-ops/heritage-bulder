import "server-only";

import sharp from "sharp";
import {
  CONTRIBUTION_PHOTO_MAX_BYTES,
  CONTRIBUTION_PHOTO_MAX_INPUT_PIXELS,
  CONTRIBUTION_PHOTO_MAX_SIDE,
  CONTRIBUTION_PHOTO_WEBP_QUALITY,
} from "@/config/contributions";
import { detectImageMimeType } from "@/lib/media/image-signature";

/**
 * M8-E2 — O5 : traitement serveur d'une photographie de proche.
 *
 * SERVER ONLY (dépendance native `sharp`).
 *
 * Un visiteur anonyme peut contourner la préparation du navigateur et
 * envoyer n'importe quel fichier. Le serveur est donc la garantie :
 *  1. le type est lu dans les OCTETS (signature JPEG, PNG ou WebP), jamais
 *     déclaré ; tout le reste (SVG, HEIC, GIF, script, archive) est refusé ;
 *  2. décodage complet par libvips, avec `failOn: "error"` (fichier
 *     tronqué ou corrompu refusé) et un plafond de 50 Mpx vérifié AVANT
 *     décodage (bombe de décompression refusée) ;
 *  3. orientation EXIF appliquée aux pixels (`rotate()`), puis oubliée ;
 *  4. plus grand côté ramené à 2000 px, sans agrandissement ;
 *  5. ré-encodage WebP (qualité 85), première image seulement (une image
 *     animée devient fixe) ;
 *  6. AUCUNE métadonnée conservée : sharp n'écrit ni EXIF (GPS, appareil,
 *     date), ni XMP, ni IPTC, ni profil ICC sans `withMetadata()`, qui
 *     n'est jamais appelé ici (vérifié par les tests sur la sortie).
 * Seule la sortie de cette fonction est jamais stockée comme photo
 * finale : les octets reçus ne deviennent jamais visibles.
 *
 * Paramètres (2000 px, qualité 85) : valeurs du contrat M8-P § 12 ; les
 * réglages artistiques définitifs suivront des essais sur photos réelles.
 */

export type ContributionPhotoRefusal = "not_an_image" | "too_large" | "too_many_pixels" | "corrupted";

export type ContributionPhotoResult =
  | { ok: true; bytes: Uint8Array; mimeType: "image/webp"; width: number; height: number; sizeBytes: number }
  | { ok: false; reason: ContributionPhotoRefusal };

export async function processContributionPhoto(input: Uint8Array): Promise<ContributionPhotoResult> {
  if (input.byteLength === 0) return { ok: false, reason: "not_an_image" };
  if (input.byteLength > CONTRIBUTION_PHOTO_MAX_BYTES) return { ok: false, reason: "too_large" };
  if (detectImageMimeType(input.subarray(0, 16)) === null) return { ok: false, reason: "not_an_image" };

  const options = {
    failOn: "error" as const,
    limitInputPixels: CONTRIBUTION_PHOTO_MAX_INPUT_PIXELS,
    pages: 1,
  };

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(input, options).metadata();
    width = meta.width;
    height = meta.height;
  } catch (error) {
    return { ok: false, reason: isPixelLimit(error) ? "too_many_pixels" : "corrupted" };
  }
  if (!width || !height) return { ok: false, reason: "corrupted" };
  if (width * height > CONTRIBUTION_PHOTO_MAX_INPUT_PIXELS) return { ok: false, reason: "too_many_pixels" };

  try {
    const { data, info } = await sharp(input, options)
      .rotate()
      .resize({
        width: CONTRIBUTION_PHOTO_MAX_SIDE,
        height: CONTRIBUTION_PHOTO_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CONTRIBUTION_PHOTO_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      sizeBytes: data.byteLength,
    };
  } catch (error) {
    return { ok: false, reason: isPixelLimit(error) ? "too_many_pixels" : "corrupted" };
  }
}

function isPixelLimit(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}
