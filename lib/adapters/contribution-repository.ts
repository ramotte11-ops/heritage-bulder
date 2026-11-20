import type { ContributionTextType, ContributionType } from "@/config/contributions";


/**
 * M8-E2 — le contrat sur les RPC Contributions de M8-E1
 * (supabase/migrations/20261119090000_m8_e1_contributions.sql) et de
 * M8-E2 (20261120090000_m8_e2_owner_contribution_settings.sql).
 *
 * Toutes les opérations passent par des fonctions SECURITY DEFINER
 * exécutables par `service_role` seul ; l'adaptateur Supabase ne
 * fonctionne donc qu'avec le client service_role. Les opérations
 * familiales reçoivent un `ownerId` VÉRIFIÉ par le serveur (session),
 * jamais une valeur venue du navigateur ; la base le revérifie.
 *
 * Les résultats sont exactement ceux des fonctions ; un résultat inconnu
 * est lu comme `refused` (échec fermé).
 */

export type ContributionStatus = "pending" | "published" | "hidden" | "rejected";

export type DepositOutcome = "published" | "pending" | "duplicate" | "rate_limited" | "refused";

export interface DepositResult {
  outcome: DepositOutcome;
  contributionId: string | null;
  /** Pour `duplicate` : l'état de la contribution déjà enregistrée. */
  status: ContributionStatus | null;
}

export type PhotoReservationOutcome = "reserved" | "rate_limited" | "pending_full" | "refused";

export interface PublicContributionRow {
  id: string;
  type: ContributionType;
  authorName: string;
  content: string | null;
  caption: string | null;
  publishedAt: string;
  media: { mediaId: string; storagePath: string; width: number | null; height: number | null } | null;
}

export interface ContributionCursor {
  publishedAt: string;
  id: string;
}

export type ModerationAction = "approve" | "reject" | "hide" | "unhide";
export type ModerationOutcome = "updated" | "unchanged" | "invalid_transition" | "refused";

export interface PendingCount {
  memorialId: string;
  pendingStories: number;
  pendingPhotos: number;
  pendingTotal: number;
}

export interface ContributionFeatures {
  condolences: boolean;
  stories: boolean;
  photos: boolean;
}

export type CategoriesOutcome = "updated" | "unchanged" | "stale_revision" | "refused";

export interface OwnerContributionSettings {
  outcome: "ok" | "corrupted" | "refused";
  features: ContributionFeatures | null;
  firstPublished: boolean | null;
  draftRevision: number | null;
  contributionsDigest: boolean | null;
}

/** M8-E3 — vue d'ensemble publique : catégories EN VIGUEUR et nombres publiés. */
export interface PublicContributionsOverview {
  categories: ContributionFeatures;
  published: { condolences: number; stories: number; photos: number };
}

export interface ContributionRepository {
  /** M8-E3 : `null` si l'hommage n'est pas public ou si la rubrique est masquée. */
  readPublicOverview(slug: string): Promise<PublicContributionsOverview | null>;
  /** Hommage public désigné par son slug, sinon `null` (aucune raison donnée). */
  findPublicMemorialId(slug: string): Promise<string | null>;
  submit(input: { slug: string; type: ContributionTextType; authorName: string; content: string; idempotencyKey: string }): Promise<DepositResult>;
  reservePhoto(input: { slug: string; mediaId: string; storagePath: string; declaredMimeType: string }): Promise<PhotoReservationOutcome>;
  finalizePhoto(input: {
    slug: string;
    mediaId: string;
    authorName: string;
    caption: string | null;
    idempotencyKey: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
  }): Promise<DepositResult>;
  /** M8-E4 : `types` (facultatif) restreint aux catégories demandées (scène O8). */
  readPublic(input: { slug: string; limit: number; before: ContributionCursor | null; types?: readonly ContributionType[] }): Promise<PublicContributionRow[]>;
  /** M8-E4 : relecture de 1 à 100 contributions précises, aux règles de la lecture publique. */
  readPublicByIds(input: { slug: string; ids: readonly string[] }): Promise<PublicContributionRow[]>;

  moderate(input: { ownerId: string; contributionId: string; action: ModerationAction }): Promise<{ outcome: ModerationOutcome; status: ContributionStatus | null }>;
  remove(input: { ownerId: string; contributionId: string }): Promise<{
    outcome: "removed" | "refused";
    memorialId: string | null;
    cleanupClaimId: string | null;
    storagePath: string | null;
  }>;
  countPending(input: { ownerId: string; memorialId: string | null }): Promise<PendingCount[]>;
  setCategories(input: { ownerId: string; memorialId: string; features: ContributionFeatures; expectedRevision: number | null }): Promise<{
    outcome: CategoriesOutcome;
    draftRevision: number | null;
  }>;
  readOwnerSettings(input: { ownerId: string; memorialId: string }): Promise<OwnerContributionSettings>;
  setDigestPreference(input: { ownerId: string; enabled: boolean }): Promise<boolean>;
}

/** Lecture familiale des contributions (session `authenticated`, RLS messages_select_own). */
export interface FamilyContributionRow {
  id: string;
  type: ContributionType | "memory_message";
  status: ContributionStatus;
  authorName: string;
  content: string | null;
  caption: string | null;
  mediaId: string | null;
  createdAt: string;
  publishedAt: string | null;
  moderatedAt: string | null;
}

export interface FamilyContributionReader {
  /**
   * Du plus récent au plus ancien (created_at desc, id desc). Curseur composé
   * (M8-E5) : `beforeId` départage les contributions de même `created_at`,
   * pour qu'aucune ne soit sautée en bordure de page.
   */
  list(input: { memorialId: string; status: ContributionStatus | null; limit: number; beforeCreatedAt: string | null; beforeId?: string | null }): Promise<FamilyContributionRow[]>;
}
