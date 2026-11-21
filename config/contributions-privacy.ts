import type { Language } from "@/config/languages";
import type { TranslationKey } from "@/lib/i18n/keys";
import { DICTIONARIES, translateWith } from "@/lib/i18n/translate";

/**
 * M8-Q6 — confidentialité des Contributions des proches : le SEUL endroit
 * où se règlent le contact de retrait et le statut juridique des textes.
 *
 * Les textes (FR/EN/ES) sont dans l'espace `contributionsPrivacy.*` des
 * dictionnaires ; ils ne contiennent jamais l'adresse elle-même, seulement
 * la variable `{contact}`, remplie ici. Changer de contact = changer ce
 * fichier, jamais les traductions.
 *
 * ÉTAT : PROPOSITION non validée juridiquement (docs/contributions-q6-…).
 * Rien de ceci n'est public : le verrou de dépôt est fermé, et il ne peut
 * pas s'ouvrir tant que `privacyPublicationBlockers()` n'est pas vide
 * (config/contributions-deposit-readiness.test.ts).
 */

export const CONTRIBUTIONS_WITHDRAWAL_CONTACT = {
  /** Décision PO (M8-Q6) : demandes de retrait et assistance HERITAGE. */
  email: "contact@herelys.com",
  /**
   * La réception n'a PAS été vérifiée (boîte non créée à la date de M8-Q6).
   * Ne passer à `true` qu'après un essai réel : message envoyé depuis une
   * adresse extérieure ET reçu dans cette boîte (procédure : dossier Q6).
   */
  reachable: false,
} as const;

/** `proposal` tant que le juridique n'a pas validé les textes des trois langues. */
export const CONTRIBUTIONS_PRIVACY_LEGAL_STATUS: "proposal" | "validated" = "proposal";

export type PrivacyKind = "condolence" | "testimonial" | "photo";

export const PRIVACY_MENTION_KEYS: Readonly<Record<PrivacyKind, TranslationKey>> = {
  condolence: "contributionsPrivacy.mentionCondolence",
  testimonial: "contributionsPrivacy.mentionStory",
  photo: "contributionsPrivacy.mentionPhoto",
};

/** La notice détaillée, dans l'ordre d'affichage. */
export const PRIVACY_NOTICE_KEYS: readonly TranslationKey[] = [
  "contributionsPrivacy.noticeReceived",
  "contributionsPrivacy.noticeVisibility",
  "contributionsPrivacy.noticeFamily",
  "contributionsPrivacy.noticePhotos",
  "contributionsPrivacy.noticeWithdrawal",
  "contributionsPrivacy.noticeController",
  "contributionsPrivacy.noticeRetention",
  "contributionsPrivacy.noticeRights",
];

/** Toutes les clés Q6 (pour la complétude des trois langues). */
export const PRIVACY_KEYS: readonly TranslationKey[] = [
  "contributionsPrivacy.status",
  ...Object.values(PRIVACY_MENTION_KEYS),
  "contributionsPrivacy.contactPending",
  "contributionsPrivacy.learnMore",
  "contributionsPrivacy.noticeTitle",
  ...PRIVACY_NOTICE_KEYS,
];

/** Marqueurs des arbitrages juridiques restant à rédiger : jamais publiables. */
export const PRIVACY_PENDING_MARKERS = ["[À DÉFINIR", "[TO BE DEFINED", "[POR DEFINIR"] as const;

const LANGUAGES_Q6: readonly Language[] = ["fr", "en", "es"];

/** Le contact tel qu'il s'affiche : l'adresse seule si elle est joignable, sinon signalée « en cours de mise en service ». */
export function withdrawalContactLabel(language: Language): string {
  const { email, reachable } = CONTRIBUTIONS_WITHDRAWAL_CONTACT;
  return reachable ? email : translateWith(language, "contributionsPrivacy.contactPending", { email });
}

/** Un texte Q6, le contact rempli. */
export function privacyText(language: Language, key: TranslationKey): string {
  return translateWith(language, key, { contact: withdrawalContactLabel(language) });
}

/**
 * Ce qui empêche de publier les textes Q6. Vide = publiable. Le verrou de
 * dépôt public ne peut pas s'ouvrir tant que cette liste n'est pas vide.
 */
export function privacyPublicationBlockers(
  dictionaries: Record<string, Record<string, string>> = DICTIONARIES as unknown as Record<string, Record<string, string>>,
  state: { legal: "proposal" | "validated"; reachable: boolean } = { legal: CONTRIBUTIONS_PRIVACY_LEGAL_STATUS, reachable: CONTRIBUTIONS_WITHDRAWAL_CONTACT.reachable },
): string[] {
  const out: string[] = [];
  if (state.legal !== "validated") out.push("legal: textes non validés juridiquement");
  if (!state.reachable) out.push(`contact: réception de ${CONTRIBUTIONS_WITHDRAWAL_CONTACT.email} non vérifiée`);
  for (const lang of LANGUAGES_Q6) {
    const dict = dictionaries[lang] ?? {};
    for (const key of PRIVACY_KEYS) {
      const text = dict[key];
      if (typeof text !== "string" || text.trim() === "") out.push(`${lang}: ${key} absente`);
      else if (PRIVACY_PENDING_MARKERS.some((m) => text.includes(m))) out.push(`${lang}: ${key} contient un arbitrage à définir`);
    }
  }
  return out;
}
