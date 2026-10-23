import { notFound } from "next/navigation";
import { PhotoPreparationPilot } from "./PhotoPreparationPilot";

/**
 * Optimisation photographique V1 — banc d'essai (développement seulement).
 *
 * Exécute le VRAI module de préparation (`lib/media/photo-preparation.ts`)
 * dans le navigateur sur les photos choisies, et affiche pour chacune le
 * rapport (poids, dimensions, format, qualité, durée) et l'image produite.
 * Rien n'est envoyé : aucun appel serveur, aucune écriture.
 *
 * Inaccessible en production (`notFound`), comme les autres pilotes ;
 * n'appartient à aucun parcours.
 */
export default function PhotoPreparationPilotPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PhotoPreparationPilot />;
}
