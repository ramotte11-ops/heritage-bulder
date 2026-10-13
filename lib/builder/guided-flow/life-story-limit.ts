import { RECIT_RUNTIME_MAX_CHARACTERS_EACH } from "@/config/recit-de-vie-runtime-tokens";
import { countLifeStoryCodePoints, normalizeLifeStoryText } from "@/lib/memorial/life-story-content";

/**
 * Récit de vie — limite de saisie des chapitres A10/A11/A12 (GO PO).
 *
 * Le compte est celui que le Récit affiche : texte normalisé (NFC, blancs
 * réunis en une espace, bords retirés), en points de code Unicode.
 *
 * Règle, appliquée à la SAISIE seulement (jamais aux données) :
 * - une modification est acceptée si le texte reste dans la limite, OU s'il
 *   ne s'allonge pas ;
 * - un texte déjà enregistré au-delà de la limite s'affiche donc en entier,
 *   peut être raccourci ou corrigé librement, mais pas allongé ;
 * - rien n'est jamais tronqué, effacé ni remplacé : une frappe ou un collage
 *   qui ferait dépasser la limite est simplement refusé, en entier.
 *
 * L'enregistrement côté serveur n'impose aucune limite (voir
 * docs/recit-de-vie-limite-240.md) : un brouillon existant n'est jamais
 * refusé ni modifié.
 */
export const LIFE_STORY_MAX_CHARACTERS = RECIT_RUNTIME_MAX_CHARACTERS_EACH;

export function countLifeStoryCharacters(raw: string): number {
  return countLifeStoryCodePoints(normalizeLifeStoryText(raw));
}

export function acceptLifeStoryEdit(previousRaw: string, nextRaw: string, max: number = LIFE_STORY_MAX_CHARACTERS): boolean {
  const next = countLifeStoryCharacters(nextRaw);
  return next <= max || next <= countLifeStoryCharacters(previousRaw);
}

export type LifeStoryLimitStatus = "within" | "reached" | "over";

export function lifeStoryLimitStatus(raw: string, max: number = LIFE_STORY_MAX_CHARACTERS): LifeStoryLimitStatus {
  const count = countLifeStoryCharacters(raw);
  return count > max ? "over" : count === max ? "reached" : "within";
}
