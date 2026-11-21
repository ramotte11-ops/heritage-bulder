/**
 * Lot 2 — la signature facultative d'une offrande (prénom ou surnom), telle
 * que le serveur l'accepte avant de l'envoyer à sign_symbolic_offering_v1().
 *
 * Mêmes règles que la base (contrainte `symbolic_offerings_signature_shape`) :
 * 1 à 40 caractères (points de code, comme `char_length`), sans espace aux
 * extrémités, sans caractère de contrôle ni caractère invisible de mise en
 * forme. Ici on NORMALISE d'abord (NFC, invisibles retirés, espaces
 * resserrés) ; ce qui reste vide ou trop long est refusé (`null`).
 *
 * Pur, sans dépendance : utilisable côté serveur comme dans les tests.
 */
export const OFFERING_SIGNATURE_MAX_LENGTH = 40;

// Contrôles C0/C1 (dont retours à la ligne et tabulations : remplacés par
// une espace), puis invisibles de mise en forme retirés : espace de largeur
// nulle, marques et forçages de direction du texte, joint de mot, BOM.
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const SPACES = /\s+/g;

export function normalizeOfferingSignature(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Borne avant tout traitement : une chaîne démesurée n'est jamais parcourue.
  if (value.length > OFFERING_SIGNATURE_MAX_LENGTH * 8) return null;
  const normalized = value.normalize("NFC").replace(CONTROL, " ").replace(INVISIBLE, "").replace(SPACES, " ").trim();
  const length = [...normalized].length;
  return length >= 1 && length <= OFFERING_SIGNATURE_MAX_LENGTH ? normalized : null;
}
