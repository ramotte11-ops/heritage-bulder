import {
  CONTRIBUTION_MAX_CODE_POINTS_PER_CHARACTER,
  CONTRIBUTION_TEXT_LIMITS,
  type ContributionTextField,
} from "@/config/contributions";

/**
 * M8-E2 — module partagé « contribution-text » (Q2, O7).
 *
 * Utilisé à l'identique par le formulaire (compteur affiché) et par le
 * serveur, qui fait foi. Aucun import serveur : sûr dans un composant
 * client.
 *
 * Méthode (contrat M8-P, § 3) :
 *  1. normaliser : `\r\n` et `\r` deviennent `\n`, forme NFC, espaces de
 *     bord retirés ;
 *  2. compter les caractères VISIBLES (graphèmes, `Intl.Segmenter`) ; un
 *     retour à la ligne compte pour un ;
 *  3. refuser au-delà de la limite du champ, et tout caractère visible de
 *     plus de 10 points de code (Q2).
 *
 * Conséquence vérifiée par les tests : un texte accepté ici fait au plus
 * 10 N points de code, en NFC, sans `\r` — il passe donc toujours le filet
 * de la base (messages_*_q2). La base n'est jamais plus stricte que le
 * compteur.
 */

export function normalizeContributionText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").normalize("NFC").trim();
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function graphemesOf(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

export function countVisibleCharacters(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}

export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

// Caractères de contrôle C0/C1 (sauf \n et \t), et indicateurs de
// direction isolés qui permettent de maquiller un texte affiché.
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;

export type ContributionTextRefusal = "empty" | "too_long" | "too_complex" | "invalid";

export type ContributionTextCheck =
  | { ok: true; value: string; visibleCharacters: number }
  | { ok: false; reason: ContributionTextRefusal };

/**
 * Valide un champ arrivé `unknown` (il peut être forgé). Renvoie la valeur
 * NORMALISÉE à enregistrer — jamais la saisie brute.
 */
export function checkContributionText(field: ContributionTextField, raw: unknown): ContributionTextCheck {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  // Garde de coût avant toute normalisation : au-delà de 10 N unités, le
  // texte ne peut de toute façon pas être conforme.
  const limit = CONTRIBUTION_TEXT_LIMITS[field];
  if (raw.length > limit * CONTRIBUTION_MAX_CODE_POINTS_PER_CHARACTER * 2 + 64) return { ok: false, reason: "too_long" };
  if (!raw.isWellFormed()) return { ok: false, reason: "invalid" };
  const value = normalizeContributionText(raw);
  if (value.length === 0) return { ok: false, reason: "empty" };
  if (FORBIDDEN_CONTROL.test(value)) return { ok: false, reason: "invalid" };
  // Un nom tient sur une ligne.
  if (field === "authorName" && /[\n\t]/.test(value)) return { ok: false, reason: "invalid" };
  const graphemes = graphemesOf(value);
  if (graphemes.length > limit) return { ok: false, reason: "too_long" };
  if (graphemes.some((g) => countCodePoints(g) > CONTRIBUTION_MAX_CODE_POINTS_PER_CHARACTER)) {
    return { ok: false, reason: "too_complex" };
  }
  return { ok: true, value, visibleCharacters: graphemes.length };
}

/** La légende est facultative : vide ou absente devient `null`. */
export function checkOptionalCaption(raw: unknown): { ok: true; value: string | null } | { ok: false; reason: ContributionTextRefusal } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw === "string" && normalizeContributionText(raw).length === 0) return { ok: true, value: null };
  const checked = checkContributionText("caption", raw);
  return checked.ok ? { ok: true, value: checked.value } : checked;
}

/** Le filet de la base (Q2), reproduit pour prouver qu'il n'est jamais plus strict. */
export function passesDatabaseNet(field: ContributionTextField, value: string): boolean {
  const ceiling = CONTRIBUTION_TEXT_LIMITS[field] * CONTRIBUTION_MAX_CODE_POINTS_PER_CHARACTER;
  return (
    value.trim().length > 0 &&
    countCodePoints(value) <= ceiling &&
    value === value.normalize("NFC") &&
    !value.includes("\r")
  );
}
