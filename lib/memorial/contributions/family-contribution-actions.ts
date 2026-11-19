"use server";

import {
  countPendingContributions,
  listFamilyContributions,
  moderateContribution,
  readFamilyContributionSettings,
  removeContribution,
  setContributionCategories,
  setContributionsDigestPreference,
  type FamilyFailure,
} from "./family-contributions";
import { createFamilyContributionDeps } from "./server-contributions";

/**
 * M8-E2 — Server Actions FAMILIALES des Contributions : contrats prêts
 * pour le Tableau de bord du chef de projet n° 01 (aucun écran ici).
 *
 * Chaque action résout le propriétaire depuis la session validée
 * (lib/auth/heritage-session.ts) ; aucun identifiant de propriétaire
 * n'est jamais accepté du navigateur. Résultats : `ok`, `denied` (pas de
 * session, pas à vous, ou n'existe pas — indistincts), `invalid`,
 * `unavailable`, et pour la modération `invalid_transition`, pour les
 * catégories `stale_revision`.
 */

async function run<T>(op: (deps: ReturnType<typeof createFamilyContributionDeps>) => Promise<T>): Promise<T | FamilyFailure> {
  let deps;
  try {
    deps = createFamilyContributionDeps();
  } catch {
    console.error("Contributions: server configuration missing");
    return { status: "unavailable" };
  }
  return op(deps);
}

/** Compteur « à examiner » : tous les hommages du compte, ou un seul. */
export async function getPendingContributionCounts(memorialId?: unknown) {
  return run((deps) => countPendingContributions(deps, { memorialId }));
}

/** Liste d'un hommage (par défaut les contributions à examiner). */
export async function getFamilyContributions(input: { memorialId: unknown; status?: unknown; limit?: unknown; before?: unknown }) {
  const i = (input ?? {}) as Record<string, unknown>;
  return run((deps) => listFamilyContributions(deps, { memorialId: i.memorialId, status: i.status, limit: i.limit, before: i.before }));
}

/** action : "approve" | "reject" | "hide" | "unhide". */
export async function moderateFamilyContribution(contributionId: unknown, action: unknown) {
  return run((deps) => moderateContribution(deps, { contributionId, action }));
}

export async function deleteFamilyContribution(contributionId: unknown) {
  return run((deps) => removeContribution(deps, { contributionId }));
}

export async function getContributionSettings(memorialId: unknown) {
  return run((deps) => readFamilyContributionSettings(deps, { memorialId }));
}

/** features : { condolences, stories, photos } ; effet immédiat après publication (O9). */
export async function updateContributionCategories(memorialId: unknown, features: unknown, expectedRevision?: unknown) {
  return run((deps) => setContributionCategories(deps, { memorialId, features, expectedRevision }));
}

/** Récapitulatif quotidien (O12), désactivé par défaut. Aucun e-mail n'est envoyé à cette étape. */
export async function updateContributionsDigestPreference(enabled: unknown) {
  return run((deps) => setContributionsDigestPreference(deps, { enabled }));
}
