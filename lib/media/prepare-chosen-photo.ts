import type { MediaPurpose } from "@/config/media";
import { MediaActionError } from "./media-error-copy";
import { preparePhotoForUpload } from "./photo-preparation";
import type { PhotoPreparationReport } from "./photo-preparation";
import { precheckPhotoFile } from "./precheck-upload";

/**
 * Optimisation photographique V1 — la photo CHOISIE par la famille
 * devient le fichier ENVOYÉ, pour le Hero comme pour la Galerie.
 *
 * Rend uniquement le fichier optimisé (`photo-preparation.ts`), repassé
 * par le pré-contrôle d'envoi existant ; sinon lève une
 * `MediaActionError`, que l'écran traduit comme toute autre erreur média.
 * Il n'existe aucun chemin où l'original serait envoyé à la place.
 *
 * Le parcours d'envoi sécurisé qui suit (réservation → envoi signé →
 * finalisation, avec ses vérifications côté serveur) est inchangé.
 */
export interface PreparedChosenPhoto {
  file: File;
  report: PhotoPreparationReport;
}

export async function prepareChosenPhotoWithReport(file: File, purpose: MediaPurpose): Promise<PreparedChosenPhoto> {
  let prepared: Awaited<ReturnType<typeof preparePhotoForUpload>>;
  try {
    prepared = await preparePhotoForUpload(file, purpose);
  } catch {
    // Un incident imprévu du navigateur (mémoire, canvas) : la photo
    // n'a pas pu être préparée — jamais un envoi de l'original.
    throw new MediaActionError("invalid_file");
  }
  if (!prepared.ok) throw new MediaActionError(prepared.code);
  const refused = precheckPhotoFile(prepared.file);
  if (refused) throw new MediaActionError(refused);
  return prepared;
}

export async function prepareChosenPhoto(file: File, purpose: MediaPurpose): Promise<File> {
  return (await prepareChosenPhotoWithReport(file, purpose)).file;
}
