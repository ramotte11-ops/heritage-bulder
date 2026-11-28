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
export const CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = true as const;

/**
 * A15-R — BRANCHE DE RECETTE `recette/a15-contributions` UNIQUEMENT.
 * Ne jamais fusionner dans `main` (ordre de mission QG A15-R).
 *
 * Le verrou ci-dessus est ouvert pour une recette technique ISOLÉE, pas pour
 * le public : les textes Q6 restent des propositions non validées
 * juridiquement (`privacyPublicationBlockers()` n'est pas vide, et la lettre
 * l'affiche). Une seconde barrière, propre à cette branche, limite
 * l'ouverture aux seuls hommages FICTIFS de la recette :
 *
 *  - `CONTRIBUTIONS_RECETTE_SLUGS` (variable serveur, non secrète) : liste
 *    des slugs autorisés, séparés par des virgules ;
 *  - absente, vide ou mal formée : AUCUN hommage n'est ouvert (échec fermé),
 *    la page et les quatre actions de dépôt se comportent comme sur `main`.
 *
 * Tout le reste (jeton anti-robots, plafonds R2/R3/R5, catégories O9,
 * offre gratuite, droits de la famille, base) est inchangé.
 */
export const CONTRIBUTIONS_DEPOSIT_RECETTE = true as const;

/** Un slug d'hommage public : même forme que PUBLIC_SLUG_PATTERN (lib/memorial/public/read-public-memorial.ts). */
const RECETTE_SLUG = /^[0-9a-f]{12,64}$/;
/** Une recette porte sur quelques hommages fictifs, jamais davantage. */
const RECETTE_MAX_SLUGS = 4;

/** Les slugs ouverts à la recette ; vide = aucun (échec fermé). */
export function contributionsRecetteSlugs(env: Record<string, string | undefined> = process.env): readonly string[] {
  const raw = env.CONTRIBUTIONS_RECETTE_SLUGS;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const slugs = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (slugs.length === 0 || slugs.length > RECETTE_MAX_SLUGS || !slugs.every((s) => RECETTE_SLUG.test(s))) return [];
  return slugs;
}

/** Le dépôt est-il ouvert pour CET hommage ? Verrou d'abord, puis liste de recette. */
export function contributionsDepositOpenFor(slug: unknown, env: Record<string, string | undefined> = process.env): boolean {
  if (!CONTRIBUTIONS_DEPOSIT_PUBLIC_READY) return false;
  if (typeof slug !== "string") return false;
  return contributionsRecetteSlugs(env).includes(slug);
}

export const CONTRIBUTIONS_DEPOSIT_BLOCKERS = [
  { id: "Q6-legal", authority: "Juridique / PO", detail: "Validation juridique de la mention de confidentialité (FR/EN/ES)." },
  { id: "Q6-withdrawal-contact", authority: "PO / QG", detail: "contact@herelys.com retenu par la PO ; réception à créer et à vérifier par un essai réel." },
  { id: "E6-migrations", authority: "QG", detail: "Migrations M8 E1 à E4 appliquées sur le projet de production." },
  { id: "E6-form-secret", authority: "QG", detail: "CONTRIBUTIONS_FORM_TOKEN_SECRET posé dans l'environnement de production." },
  { id: "media-sweep", authority: "QG", detail: "GO du nettoyage des photos abandonnées, recommandé avant l'ouverture des photos." },
] as const;

/** Clés de texte provisoires (Q6) : jamais publiables tant que le verrou est fermé. */
export { PRIVACY_KEYS as CONTRIBUTIONS_DEPOSIT_PROVISIONAL_KEYS } from "./contributions-privacy";
