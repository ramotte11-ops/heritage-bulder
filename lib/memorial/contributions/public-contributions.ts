import type { ContributionFeatures } from "@/lib/adapters/contribution-repository";
import type { ContributionType } from "@/config/contributions";
import { CONTRIBUTIONS_SCENE_CAPACITY, CONTRIBUTIONS_VIEW_ALL_FROM } from "./contributions-scene";

/**
 * M8-E3 — décisions PO O8 et P1, en fonctions pures (aucune donnée, aucun
 * import serveur : utilisables par l'hôte public et testables seules).
 *
 * P1 — Album : toutes les contributions publiées des catégories EN VIGUEUR,
 *   catégories mélangées, de la plus récente à la plus ancienne
 *   (published_at desc, puis id desc pour départager).
 * O8 — scène : au plus 4 ; pour chaque catégorie disponible, dans l'ordre
 *   condoléances, récits, photos, la plus récente ; puis les plus récentes
 *   restantes, toutes catégories confondues ; présentées de la plus récente
 *   à la plus ancienne. Aucun contenu fictif.
 */

export interface PublishedContribution {
  id: string;
  type: ContributionType;
  publishedAt: string;
}

const CATEGORY_OF: Record<ContributionType, keyof ContributionFeatures> = {
  condolence: "condolences",
  testimonial: "stories",
  photo: "photos",
};

export function isCategoryOpen(categories: ContributionFeatures, type: ContributionType): boolean {
  return categories[CATEGORY_OF[type]] === true;
}

/** Ordre P1 : published_at desc, id desc (comparaison d'instants, pas de chaînes). */
export function compareP1(a: PublishedContribution, b: PublishedContribution): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** L'Album P1 : seulement les catégories en vigueur, ordre P1, sans doublon. */
export function albumOrder<T extends PublishedContribution>(items: readonly T[], categories: ContributionFeatures): T[] {
  const seen = new Set<string>();
  return items
    .filter((c) => isCategoryOpen(categories, c.type) && !seen.has(c.id) && (seen.add(c.id), true))
    .sort(compareP1);
}

/** La scène O8. */
export function selectSceneContributions<T extends PublishedContribution>(items: readonly T[], categories: ContributionFeatures): T[] {
  const ordered = albumOrder(items, categories);
  const chosen: T[] = [];
  for (const type of ["condolence", "testimonial", "photo"] as const) {
    if (chosen.length >= CONTRIBUTIONS_SCENE_CAPACITY) break;
    const latest = ordered.find((c) => c.type === type);
    if (latest) chosen.push(latest);
  }
  for (const c of ordered) {
    if (chosen.length >= CONTRIBUTIONS_SCENE_CAPACITY) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.sort(compareP1);
}

export type ContributionsPublicState =
  /** Aucune catégorie en vigueur : la rubrique n'est pas affichée (O9). */
  | { kind: "closed" }
  /** Catégories ouvertes, aucune contribution publiée : Master M0. */
  | { kind: "empty" }
  /** 1 à 3 : toutes ; dès 4 : la scène M5 et « Voir tous ». */
  | { kind: "contributions"; viewAll: boolean };

export function contributionsPublicState(categories: ContributionFeatures, total: number): ContributionsPublicState {
  if (!categories.condolences && !categories.stories && !categories.photos) return { kind: "closed" };
  if (total <= 0) return { kind: "empty" };
  return { kind: "contributions", viewAll: total >= CONTRIBUTIONS_VIEW_ALL_FROM };
}
