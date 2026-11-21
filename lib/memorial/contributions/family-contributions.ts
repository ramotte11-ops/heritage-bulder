import "server-only";

import { MEDIA_READ_URL_TTL_SECONDS } from "@/config/media";
import type {
  ContributionFeatures,
  ContributionRepository,
  ContributionStatus,
  FamilyContributionReader,
  FamilyContributionRow,
  ModerationAction,
  PendingCount,
} from "@/lib/adapters/contribution-repository";
import type { MediaObjectStore } from "@/lib/adapters/media-object-store";
import type { MediaRepository } from "@/lib/adapters/media-repository";
import { isMediaIdentifier, isPathWithinMemorial } from "@/lib/media/media-path";
import { retireContributionMedia, type ContributionMediaCleanupDeps } from "./contribution-media-cleanup";

/**
 * M8-E2 — contrats serveur des opérations familiales sur les
 * Contributions, pour le Tableau de bord (chef de projet n° 01) et pour
 * A15 après publication. Aucun écran ici.
 *
 * SERVER ONLY. Sécurité, à CHAQUE opération :
 *  - l'identité vient de la session validée, jamais du navigateur :
 *    `resolveOwnerId()` (opérations de compte) ou
 *    `authorizeMemorial(memorialId)` (opérations d'un hommage), branchés
 *    sur lib/auth/heritage-session.ts ;
 *  - la base revérifie la propriété (p_owner_id) dans chaque RPC
 *    service_role (M8-E1), y compris pour une contribution désignée par
 *    son seul id ;
 *  - toute refusée répond `denied`, sans distinguer « pas à vous » de
 *    « n'existe pas ».
 */

export interface FamilyContributionDeps extends ContributionMediaCleanupDeps {
  repository: ContributionRepository;
  /** Lecture par la SESSION de la famille (RLS messages_select_own). */
  createReader: () => Promise<FamilyContributionReader>;
  mediaRepository: Pick<MediaRepository, "findById">;
  objectStore: Pick<MediaObjectStore, "createReadUrl" | "removeByPrefix">;
  /** Propriétaire de la session, ou `null` (visiteur, compte sans hommage). */
  resolveOwnerId: () => Promise<string | null>;
  /** Propriétaire VÉRIFIÉ de cet hommage pour la session, ou `null`. */
  authorizeMemorial: (memorialId: string) => Promise<string | null>;
  now: () => Date;
}

export type FamilyFailure = { status: "denied" } | { status: "invalid" } | { status: "unavailable" };
const DENIED = { status: "denied" } as const;
const INVALID = { status: "invalid" } as const;
const UNAVAILABLE = { status: "unavailable" } as const;

const MODERATION_ACTIONS: readonly ModerationAction[] = ["approve", "reject", "hide", "unhide"];
const STATUSES: readonly ContributionStatus[] = ["pending", "published", "hidden", "rejected"];

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/** Compteur toujours visible (O12) : par hommage du propriétaire, ou pour un seul. */
export async function countPendingContributions(
  deps: FamilyContributionDeps,
  input: { memorialId?: unknown } = {},
): Promise<{ status: "ok"; counts: PendingCount[] } | FamilyFailure> {
  try {
    let ownerId: string | null;
    let memorialId: string | null = null;
    if (input.memorialId !== undefined && input.memorialId !== null) {
      if (!isMediaIdentifier(input.memorialId)) return DENIED;
      memorialId = input.memorialId;
      ownerId = await deps.authorizeMemorial(memorialId);
    } else {
      ownerId = await deps.resolveOwnerId();
    }
    if (ownerId === null) return DENIED;
    return { status: "ok", counts: await deps.repository.countPending({ ownerId, memorialId }) };
  } catch {
    return UNAVAILABLE;
  }
}

export interface FamilyContribution extends Omit<FamilyContributionRow, "mediaId"> {
  photo: { url: string; width: number | null; height: number | null } | null;
}

/** Curseur de la page suivante : le dernier élément reçu. */
export interface FamilyContributionsCursor {
  createdAt: string;
  id: string;
}

function readCursor(before: unknown): { createdAt: string | null; id: string | null } | undefined {
  if (before === undefined || before === null) return { createdAt: null, id: null };
  const isDate = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
  // Forme historique E2 (createdAt seul), conservée pour compatibilité.
  if (isDate(before)) return { createdAt: before, id: null };
  const c = before as Record<string, unknown>;
  if (typeof before === "object" && isDate(c.createdAt) && isMediaIdentifier(c.id)) return { createdAt: c.createdAt, id: c.id };
  return undefined;
}

/**
 * Liste d'un hommage pour la famille (par défaut : à examiner), du plus
 * récent au plus ancien, page par page. M8-E5 : passer `before = nextCursor`
 * de la page précédente ({ createdAt, id }) ; `nextCursor` vaut `null` quand
 * il n'y a plus rien. Les photos en attente sont visibles de la famille
 * seule, par URL signée courte (5 min : relire la page pour la renouveler) ;
 * uniquement des médias `ready`, donc traités.
 */
export async function listFamilyContributions(
  deps: FamilyContributionDeps,
  input: { memorialId: unknown; status?: unknown; limit?: unknown; before?: unknown },
): Promise<{ status: "ok"; items: FamilyContribution[]; nextCursor: FamilyContributionsCursor | null } | FamilyFailure> {
  if (!isMediaIdentifier(input.memorialId)) return DENIED;
  const memorialId = input.memorialId;
  const status = input.status === undefined ? "pending" : input.status === null ? null : STATUSES.find((s) => s === input.status);
  if (status === undefined) return INVALID;
  const cursor = readCursor(input.before);
  if (cursor === undefined) return INVALID;
  const limit = typeof input.limit === "number" && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 100) : 50;
  try {
    if ((await deps.authorizeMemorial(memorialId)) === null) return DENIED;
    const reader = await deps.createReader();
    const rows = await reader.list({ memorialId, status, limit, beforeCreatedAt: cursor.createdAt, beforeId: cursor.id });
    const items: FamilyContribution[] = [];
    for (const { mediaId, ...row } of rows) {
      let photo: FamilyContribution["photo"] = null;
      if (mediaId !== null) {
        const media = await deps.mediaRepository.findById({ memorialId, mediaId });
        if (media && media.status === "ready" && (media.purpose as string) === "contribution" && isPathWithinMemorial(media.storagePath, memorialId)) {
          photo = {
            url: await deps.objectStore.createReadUrl({ path: media.storagePath, expiresInSeconds: MEDIA_READ_URL_TTL_SECONDS }),
            width: media.width,
            height: media.height,
          };
        }
      }
      items.push({ ...row, photo });
    }
    const last = rows.at(-1);
    return { status: "ok", items, nextCursor: rows.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null };
  } catch {
    return UNAVAILABLE;
  }
}

/** Approuver, refuser, masquer, réafficher. Jamais de réécriture. */
export async function moderateContribution(
  deps: FamilyContributionDeps,
  input: { contributionId: unknown; action: unknown },
): Promise<{ status: "ok"; outcome: "updated" | "unchanged"; contributionStatus: ContributionStatus } | { status: "invalid_transition"; contributionStatus: ContributionStatus | null } | FamilyFailure> {
  if (!isMediaIdentifier(input.contributionId)) return DENIED;
  const action = MODERATION_ACTIONS.find((a) => a === input.action);
  if (!action) return INVALID;
  try {
    const ownerId = await deps.resolveOwnerId();
    if (ownerId === null) return DENIED;
    const result = await deps.repository.moderate({ ownerId, contributionId: input.contributionId, action });
    if (result.outcome === "refused" || result.status === null) return result.outcome === "invalid_transition" ? { status: "invalid_transition", contributionStatus: null } : DENIED;
    if (result.outcome === "invalid_transition") return { status: "invalid_transition", contributionStatus: result.status };
    return { status: "ok", outcome: result.outcome, contributionStatus: result.status };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Suppression définitive. Pour une photo : la base remet le média en
 * attente de nettoyage (réclamation) ; ses octets sont supprimés tout de
 * suite, la réclamation est close maintenant ou par le balayage (3 h).
 */
export async function removeContribution(
  deps: FamilyContributionDeps,
  input: { contributionId: unknown },
): Promise<{ status: "ok"; photoStorage: "none" | "removed" | "removed_claim_open" | "pending_retry" } | FamilyFailure> {
  if (!isMediaIdentifier(input.contributionId)) return DENIED;
  try {
    const ownerId = await deps.resolveOwnerId();
    if (ownerId === null) return DENIED;
    const result = await deps.repository.remove({ ownerId, contributionId: input.contributionId });
    if (result.outcome !== "removed" || result.memorialId === null) return DENIED;
    if (result.cleanupClaimId === null || result.storagePath === null) return { status: "ok", photoStorage: "none" };
    const memorialId = result.memorialId;
    const mediaId = result.storagePath.split("/")[1];
    if (!isPathWithinMemorial(result.storagePath, memorialId) || !isMediaIdentifier(mediaId)) return { status: "ok", photoStorage: "pending_retry" };
    const media = await deps.mediaRepository.findById({ memorialId, mediaId });
    if (media === null) return { status: "ok", photoStorage: "pending_retry" };
    const retired = await retireContributionMedia(deps, { memorialId, ownerId: media.ownerId, mediaId, createdAt: media.createdAt }, result.cleanupClaimId);
    return { status: "ok", photoStorage: retired === "failed" ? "pending_retry" : retired };
  } catch {
    return UNAVAILABLE;
  }
}

export interface FamilyContributionSettings {
  features: ContributionFeatures;
  /** Choix du brouillon illisibles : afficher le message calme d'A15. */
  corrupted: boolean;
  firstPublished: boolean;
  draftRevision: number | null;
  contributionsDigest: boolean;
}

/** État courant des interrupteurs (O9) et de la préférence (O12) d'un hommage. */
export async function readFamilyContributionSettings(
  deps: FamilyContributionDeps,
  input: { memorialId: unknown },
): Promise<{ status: "ok"; settings: FamilyContributionSettings } | FamilyFailure> {
  if (!isMediaIdentifier(input.memorialId)) return DENIED;
  try {
    const ownerId = await deps.authorizeMemorial(input.memorialId);
    if (ownerId === null) return DENIED;
    const read = await deps.repository.readOwnerSettings({ ownerId, memorialId: input.memorialId });
    if (read.outcome === "refused" || read.features === null) return DENIED;
    return {
      status: "ok",
      settings: {
        features: read.features,
        corrupted: read.outcome === "corrupted",
        firstPublished: read.firstPublished === true,
        draftRevision: read.draftRevision,
        contributionsDigest: read.contributionsDigest === true,
      },
    };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * O9 : activer ou désactiver immédiatement une catégorie. Après
 * publication, effet immédiat sur les dépôts et la lecture publique ; le
 * brouillon (A15) est aligné. `expectedRevision` (facultatif) protège un
 * Builder ouvert ailleurs : `stale_revision` demande de recharger.
 */
export async function setContributionCategories(
  deps: FamilyContributionDeps,
  input: { memorialId: unknown; features: unknown; expectedRevision?: unknown },
): Promise<{ status: "ok"; outcome: "updated" | "unchanged"; draftRevision: number | null } | { status: "stale_revision"; draftRevision: number | null } | FamilyFailure> {
  if (!isMediaIdentifier(input.memorialId)) return DENIED;
  const f = input.features as Record<string, unknown> | null;
  if (typeof f !== "object" || f === null || !isBool(f.condolences) || !isBool(f.stories) || !isBool(f.photos)) return INVALID;
  const expected = input.expectedRevision;
  if (expected !== undefined && expected !== null && !(typeof expected === "number" && Number.isSafeInteger(expected) && expected >= 0)) return INVALID;
  try {
    const ownerId = await deps.authorizeMemorial(input.memorialId);
    if (ownerId === null) return DENIED;
    const result = await deps.repository.setCategories({
      ownerId,
      memorialId: input.memorialId,
      features: { condolences: f.condolences, stories: f.stories, photos: f.photos },
      expectedRevision: typeof expected === "number" ? expected : null,
    });
    if (result.outcome === "refused") return DENIED;
    if (result.outcome === "stale_revision") return { status: "stale_revision", draftRevision: result.draftRevision };
    return { status: "ok", outcome: result.outcome, draftRevision: result.draftRevision };
  } catch {
    return UNAVAILABLE;
  }
}

/** O12 : récapitulatif quotidien, désactivé par défaut, réversible. Aucun envoi ici. */
export async function setContributionsDigestPreference(
  deps: FamilyContributionDeps,
  input: { enabled: unknown },
): Promise<{ status: "ok"; contributionsDigest: boolean } | FamilyFailure> {
  if (!isBool(input.enabled)) return INVALID;
  try {
    const ownerId = await deps.resolveOwnerId();
    if (ownerId === null) return DENIED;
    return { status: "ok", contributionsDigest: await deps.repository.setDigestPreference({ ownerId, enabled: input.enabled }) };
  } catch {
    return UNAVAILABLE;
  }
}
