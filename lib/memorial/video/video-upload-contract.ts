import type { MemorialStatus } from "@/types/memorial";

/**
 * VID-06 — le CONTRAT du futur téléversement des vidéos (lot Mux suivant).
 *
 * Rien ici n'envoie de fichier : VID-06 prépare les interfaces, sans activer
 * Mux, sans secret, sans ressource payante. `VIDEO_HOSTING_OPERATIONAL` vaut
 * `false` et l'action serveur (`app/builder/[memorialId]/video-actions.ts`)
 * répond `not_operational` même à une famille autorisée : jamais une fausse
 * réussite.
 *
 * Ce qui est déjà vrai et testé, côté serveur :
 *  - la préparation (titres, durées, ordre, aperçu local) est ouverte à
 *    toutes les familles, invitées comprises, et ne touche aucun réseau ;
 *  - tout accès DISTANT est refusé sans l'offre complète : la décision lit
 *    `memorials.access_level` côté serveur, jamais une déclaration du
 *    navigateur, et échoue fermée sur toute valeur inattendue.
 */

/** Interrupteur du lot Mux : `false` tant que le GO n'est pas donné. */
export const VIDEO_HOSTING_OPERATIONAL = false;

export interface VideoUploadFacts {
  /** La session est-elle celle du propriétaire du mémorial (autorisation déjà rejouée) ? */
  actorIsOwner: boolean;
  /** `memorials.access_level`, tel que lu côté serveur — non fiable par nature. */
  accessLevel: unknown;
  /** `memorials.status`, tel que lu côté serveur. */
  memorialStatus: MemorialStatus | string | null;
}

export type VideoUploadRefusal = "not_owner" | "offer_not_complete" | "archived" | "unknown_status";

export type VideoUploadDecision = { decision: "allow" } | { decision: "deny"; reason: VideoUploadRefusal };

const KNOWN_STATUSES: readonly string[] = ["draft", "ready", "published", "editing", "archived"];

/**
 * Le téléversement distant d'une vidéo est-il permis ? Seul le propriétaire,
 * seulement avec l'offre complète (`complet`), jamais sur un mémorial
 * archivé. Toute autre valeur — `avis`, `null`, une chaîne inconnue, un
 * statut inconnu — refuse.
 */
export function decideVideoUpload(facts: VideoUploadFacts): VideoUploadDecision {
  if (!facts.actorIsOwner) return { decision: "deny", reason: "not_owner" };
  if (typeof facts.memorialStatus !== "string" || !KNOWN_STATUSES.includes(facts.memorialStatus)) {
    return { decision: "deny", reason: "unknown_status" };
  }
  if (facts.memorialStatus === "archived") return { decision: "deny", reason: "archived" };
  if (facts.accessLevel !== "complet") return { decision: "deny", reason: "offer_not_complete" };
  return { decision: "allow" };
}

/**
 * Ce que l'action serveur répond. `not_operational` : la famille y aurait
 * droit, mais le téléversement n'est pas encore ouvert (lot Mux). Aucune
 * variante « réussie » n'existe tant que `VIDEO_HOSTING_OPERATIONAL` est faux.
 */
export type VideoUploadActionResult =
  | { status: "refused"; reason: VideoUploadRefusal }
  | { status: "not_operational" };

// ------------------------------------------------- Interfaces du lot Mux

/**
 * Le futur hébergeur, vu du serveur HERITAGE (implémentation Mux au lot
 * suivant, module serveur uniquement). Déclaré ici pour fixer le contrat ;
 * AUCUNE implémentation n'existe dans VID-06.
 */
export interface VideoHostingPort {
  /**
   * Adresse de téléversement direct, à usage unique, limitée à l'origine du
   * site (`corsOrigin`) ; `passthrough` relie l'envoi à la vidéo du brouillon.
   * Réglages prévus : lecture signée, `max_resolution_tier` 1080p (décision
   * O1), lecture plafonnée à 720p.
   */
  createDirectUpload(input: { memorialId: string; videoId: string; corsOrigin: string }): Promise<VideoUploadGrant>;
  /** Suppression de l'asset (vidéo retirée, mémorial supprimé) : coût et RGPD. */
  deleteAsset(assetId: string): Promise<void>;
}

export interface VideoUploadGrant {
  uploadId: string;
  /** Adresse d'envoi par morceaux reprenables (multiples de 256 Ko). */
  uploadUrl: string;
  expiresAt: string;
}

/**
 * Ce que le webhook signé de l'hébergeur rapportera, une fois vérifié. La
 * durée retenue est `countedHostedDurationSeconds` (video-hommage.ts) ; un
 * dépassement des 600 s fait supprimer l'asset et prévenir la famille.
 */
export type HostedVideoEvent =
  | { kind: "asset_created"; videoId: string; assetId: string }
  | { kind: "asset_ready"; videoId: string; assetId: string; playbackId: string; assetDurationSeconds: number; videoTrackDurationSeconds?: number; frameRate?: number }
  | { kind: "asset_errored"; videoId: string; assetId: string }
  | { kind: "asset_deleted"; videoId: string; assetId: string };
