/**
 * Récit de vie V2 — typographie d'AFFICHAGE du texte des familles.
 *
 * En français, « ! », « ? », « ; » et « : » suivent une espace. Saisie au
 * clavier, c'est une espace ordinaire : le navigateur peut alors couper la
 * ligne juste avant la ponctuation, qui se retrouve seule en début de ligne.
 * À l'affichage seulement, on remplace cette espace par une espace insécable
 * (U+00A0, même largeur) : la ponctuation reste collée au mot précédent, rien
 * d'autre ne bouge.
 *
 * - Les données enregistrées ne sont jamais modifiées : la fonction reçoit
 *   le texte à afficher et en renvoie une copie.
 * - Seules les espaces DÉJÀ saisies sont concernées : aucune espace n'est
 *   ajoutée, aucune n'est retirée. Un texte anglais ou espagnol sans espace
 *   avant la ponctuation (« Hello! », « ¿Qué? ») est donc rendu tel quel ;
 *   s'il en contient une, elle devient simplement insécable.
 * - « 10:30 », « https:// » : pas d'espace avant « : », rien ne change.
 */
const SPACES_BEFORE_PUNCTUATION = /[ \t]+(?=[!?;:])/g;

export function bindSpaceBeforePunctuation(text: string): string {
  return text.replace(SPACES_BEFORE_PUNCTUATION, " ");
}
