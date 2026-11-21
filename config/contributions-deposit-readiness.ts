/**
 * M8-E4 — verrou de publication du dépôt public des contributions.
 *
 * Le moteur (`useContributionDeposit`) et le transport réel sont prêts et
 * testés, mais la fenêtre ne doit PAS être raccordée à l'hommage public tant
 * que chacune des réserves ci-dessous n'est pas levée par son autorité.
 * Deux barrières tant que ce verrou est fermé :
 *  - interface : aucune page de `app/hommage/` n'importe la fenêtre (test) ;
 *  - serveur (M8-E6-P) : les Server Actions de dépôt répondent `unavailable`
 *    sans rien lire ni écrire (app/hommage/[slug]/contribution-actions.ts),
 *    même une fois les migrations et le secret anti-robots en place.
 *
 * Confidentialité (M8-Q6) : les mentions par type et la notice
 * (`contributionsPrivacy.*`, FR/EN/ES) sont des PROPOSITIONS non validées
 * juridiquement ; le contact de retrait (contact@herelys.com) n'est pas
 * encore joignable. Configuration et blocages : config/contributions-privacy.ts.
 * Le verrou ne peut pas s'ouvrir tant que `privacyPublicationBlockers()`
 * n'est pas vide (test).
 */
export const CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false as const;

export const CONTRIBUTIONS_DEPOSIT_BLOCKERS = [
  { id: "Q6-legal", authority: "Juridique / PO", detail: "Validation juridique de la mention de confidentialité (FR/EN/ES)." },
  { id: "Q6-withdrawal-contact", authority: "PO / QG", detail: "contact@herelys.com retenu par la PO ; réception à créer et à vérifier par un essai réel." },
  { id: "E6-migrations", authority: "QG", detail: "Migrations M8 E1 à E4 appliquées sur le projet de production." },
  { id: "E6-form-secret", authority: "QG", detail: "CONTRIBUTIONS_FORM_TOKEN_SECRET posé dans l'environnement de production." },
  { id: "media-sweep", authority: "QG", detail: "GO du nettoyage des photos abandonnées, recommandé avant l'ouverture des photos." },
] as const;

/** Clés de texte provisoires (Q6) : jamais publiables tant que le verrou est fermé. */
export { PRIVACY_KEYS as CONTRIBUTIONS_DEPOSIT_PROVISIONAL_KEYS } from "./contributions-privacy";
