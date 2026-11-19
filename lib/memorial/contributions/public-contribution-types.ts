import type { ContributionType } from "@/config/contributions";

/**
 * M8-E3 — types des contributions publiques, partagés entre le moteur
 * serveur (visitor-contributions.ts, server-only) et la rubrique cliente
 * (ContributionsV1Section). Aucun code ici : rien de serveur n'atteint le
 * navigateur.
 */

export interface PublicContribution {
  id: string;
  type: ContributionType;
  authorName: string;
  text: string | null;
  caption: string | null;
  publishedAt: string;
  photo: { url: string; width: number | null; height: number | null } | null;
}

export interface PublicContributionsInitial {
  /** Catégories EN VIGUEUR au moment de la visite (O9). */
  categories: { condolences: boolean; stories: boolean; photos: boolean };
  /** Contributions publiées lisibles des catégories en vigueur (vue d'ensemble). */
  total: number;
  /** Ordre P1 (la base les rend ainsi). */
  items: PublicContribution[];
  /** `false` : plus de PUBLIC_CONTRIBUTIONS_PRELOAD_MAX ; les suivantes restent à charger. */
  complete: boolean;
  nextCursor: string | null;
}
