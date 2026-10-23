import type { AllowedImageMimeType } from "@/config/media";

/**
 * Optimisation photographique V1 — le fichier est-il COMPLET ?
 *
 * Un navigateur décode SANS ERREUR une photographie tronquée (transfert
 * interrompu, copie incomplète depuis une messagerie) : la partie
 * manquante est simplement remplie de gris. Préparée telle quelle, elle
 * serait envoyée et affichée durablement incomplète. Le seul indice
 * fiable est la fin du conteneur, lue dans les octets — sans décodage,
 * sans dépendance, comme `image-signature.ts` et `image-dimensions.ts` :
 *
 *  - PNG : le chunk final `IEND` est présent.
 *  - WebP : la longueur déclarée par l'en-tête RIFF est entièrement là.
 *  - JPEG : le marqueur de fin d'image `EOI` (FF D9) suit le début des
 *    données compressées (`SOS`). On le cherche APRÈS le `SOS` : la
 *    vignette EXIF porte son propre `EOI`, plus haut ; et des données
 *    peuvent légitimement suivre l'`EOI` (photos animées Google/Samsung,
 *    qui y accolent une vidéo) — la fin du fichier n'est donc pas
 *    exigée. Dans les données compressées, un octet FF est toujours
 *    suivi de 00 ou d'un marqueur de reprise : FF D9 n'y apparaît
 *    qu'en fin d'image.
 *
 * Ce n'est pas un décodeur : un fichier complet peut encore être
 * illisible, et le décodage du navigateur en jugera.
 */

/** Lecture d'une plage d'octets du fichier, `[start, end[`. */
export type ReadRange = (start: number, end: number) => Promise<Uint8Array>;

const SCAN_CHUNK_BYTES = 1024 * 1024;
/** Zone de fin où chercher `IEND` (quelques octets parasites tolérés). */
const PNG_TAIL_BYTES = 4096;

/**
 * Position du premier `SOS` (début des données compressées) ; `"beyond"`
 * quand les segments qui le précèdent dépassent l'en-tête lu ; null pour
 * une structure de segments invalide.
 */
export function findJpegScanStart(head: Uint8Array): number | "beyond" | null {
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= head.length) {
    if (head[offset] !== 0xff) return null;
    const marker = head[offset + 1];
    // Octets de remplissage FF FF… avant un marqueur.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xda) return offset;
    // Marqueurs autonomes, sans longueur.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const length = (head[offset + 2] << 8) | head[offset + 3];
    if (length < 2) return null;
    offset += 2 + length;
  }
  return "beyond";
}

function hasPngEnd(tail: Uint8Array): boolean {
  for (let i = tail.length - 8; i >= 0; i -= 1) {
    // Type de chunk « IEND », précédé de sa longueur nulle.
    if (tail[i] === 0x49 && tail[i + 1] === 0x45 && tail[i + 2] === 0x4e && tail[i + 3] === 0x44) {
      return i >= 4 && tail[i - 4] === 0 && tail[i - 3] === 0 && tail[i - 2] === 0 && tail[i - 1] === 0;
    }
  }
  return false;
}

async function hasJpegEnd(head: Uint8Array, size: number, read: ReadRange): Promise<boolean> {
  // Cas courant : le fichier se termine par EOI.
  const last = await read(size - 2, size);
  if (last[0] === 0xff && last[1] === 0xd9) return true;
  const scanStart = findJpegScanStart(head);
  if (scanStart === null) return false;
  // `SOS` au-delà de l'en-tête lu (segments démesurés) : laissé au décodage.
  if (scanStart === "beyond") return head.length < size;
  let previous = 0;
  for (let start = scanStart; start < size; start += SCAN_CHUNK_BYTES) {
    const chunk = await read(start, Math.min(size, start + SCAN_CHUNK_BYTES));
    if (previous === 0xff && chunk[0] === 0xd9) return true;
    for (let i = 0; i + 1 < chunk.length; i += 1) {
      if (chunk[i] === 0xff && chunk[i + 1] === 0xd9) return true;
    }
    previous = chunk[chunk.length - 1];
  }
  return false;
}

export async function isImageComplete(
  type: AllowedImageMimeType,
  head: Uint8Array,
  size: number,
  read: ReadRange,
): Promise<boolean> {
  switch (type) {
    case "image/png": {
      const start = Math.max(0, size - PNG_TAIL_BYTES);
      return hasPngEnd(await read(start, size));
    }
    case "image/webp": {
      if (head.length < 8) return false;
      const riffSize = (head[4] | (head[5] << 8) | (head[6] << 16) | (head[7] << 24)) >>> 0;
      return size >= riffSize + 8;
    }
    case "image/jpeg":
      return hasJpegEnd(head, size, read);
  }
}
