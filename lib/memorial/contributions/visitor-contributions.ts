import "server-only";

import {
  CONTRIBUTION_PAGE_SIZE,
  CONTRIBUTION_PAGE_SIZE_MAX,
  CONTRIBUTION_PHOTO_MAX_BYTES,
  CONTRIBUTION_TEXT_TYPES,
  type ContributionTextType,
  type ContributionType,
} from "@/config/contributions";
import { MEDIA_READ_URL_TTL_SECONDS } from "@/config/media";
import type { ContributionPhotoStore } from "@/lib/adapters/contribution-photo-store";
import type { ContributionCursor, ContributionRepository, DepositResult } from "@/lib/adapters/contribution-repository";
import type { MediaObjectStore } from "@/lib/adapters/media-object-store";
import type { MediaRepository } from "@/lib/adapters/media-repository";
import { isAllowedImageMimeType } from "@/lib/media/image-signature";
import { buildMediaObjectPath, isMediaIdentifier, isPathWithinMemorial } from "@/lib/media/media-path";
import { isPublicSlugShape } from "@/lib/memorial/public/read-public-memorial";
import { checkContributionText, checkOptionalCaption } from "./contribution-text";
import { retireContributionMedia, type ContributionMediaCleanupDeps } from "./contribution-media-cleanup";
import {
  issueFormToken,
  issuePhotoTicket,
  verifyFormToken,
  verifyPhotoTicket,
  type FormTokenSecrets,
} from "./form-token";
import type { processContributionPhoto } from "./photo-processing";

/**
 * M8-E2 — le moteur serveur des dépôts de visiteurs.
 *
 * SERVER ONLY. Ce module ne lit aucune session : un visiteur est anonyme.
 * Tout argument arrive `unknown` et peut être forgé. Le serveur fait foi :
 *  1. forme du slug (celle de la publication) ;
 *  2. champ piège vide (R4) et jeton de formulaire valide (Q3 : signé pour
 *     CET hommage, ≥ 3 s, ≤ 2 h) ;
 *  3. textes normalisés et comptés (contribution-text, Q2/O7) ;
 *  4. puis la base décide seule (M8-E1) : hommage public, rubrique non
 *     masquée, catégorie en vigueur (O9), idempotence (nonce du jeton),
 *     doublon de moins de 10 min, plafonds R2/R3, statut initial D2.
 *
 * Le visiteur ne reçoit jamais la raison d'un refus de la base ; il
 * reçoit seulement de quoi afficher le bon message (publiée, en attente,
 * R5, à corriger, indisponible).
 */

export interface VisitorContributionDeps extends ContributionMediaCleanupDeps {
  repository: ContributionRepository;
  objectStore: Pick<MediaObjectStore, "createUploadPermission" | "createReadUrl" | "statObject" | "removeByPrefix">;
  mediaRepository: Pick<MediaRepository, "findById">;
  photoStore: ContributionPhotoStore;
  processPhoto: typeof processContributionPhoto;
  /** `null` : secret absent ou trop court — dépôt fermé (échec fermé). */
  secrets: FormTokenSecrets | null;
  generateId: () => string;
  now: () => Date;
}

export type VisitorFailure =
  /** Champ à corriger (le formulaire peut dire lequel). */
  | { status: "invalid"; field: "authorName" | "text" | "caption" | "photo" | "request" }
  /** R5 : « Un petit moment de patience » (R2 rate_limited ou R3 pending_full). */
  | { status: "busy" }
  /** Le jeton a plus de 2 h : rouvrir la fenêtre (nouveau jeton). */
  | { status: "expired" }
  /** Hommage fermé, catégorie désactivée, jeton forgé, robot… sans détail. */
  | { status: "refused" }
  /** Configuration ou infrastructure indisponible. */
  | { status: "unavailable" };

export type VisitorDepositResult = { status: "published" | "pending" } | VisitorFailure;

const UNAVAILABLE = { status: "unavailable" } as const;
const REFUSED = { status: "refused" } as const;

function isHoneypotFilled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

type TokenGate = { ok: true; secrets: FormTokenSecrets; nonce: string } | { ok: false; result: VisitorFailure };

function gate(deps: VisitorContributionDeps, slug: unknown, formToken: unknown, honeypot: unknown): TokenGate & { slug?: string } {
  if (!isPublicSlugShape(slug)) return { ok: false, result: REFUSED };
  if (deps.secrets === null) return { ok: false, result: UNAVAILABLE };
  if (isHoneypotFilled(honeypot)) return { ok: false, result: REFUSED };
  const checked = verifyFormToken(deps.secrets, formToken, slug, deps.now());
  if (!checked.ok) return { ok: false, result: checked.reason === "expired" ? { status: "expired" } : REFUSED };
  return { ok: true, secrets: deps.secrets, nonce: checked.nonce, slug };
}

function fromDeposit(result: DepositResult): VisitorDepositResult {
  switch (result.outcome) {
    case "published":
      return { status: "published" };
    case "pending":
      return { status: "pending" };
    case "duplicate":
      // Un rejeu (réseau, double clic) : le succès qu'il était déjà. Une
      // contribution masquée ou refusée depuis n'est pas révélée.
      return { status: result.status === "published" ? "published" : "pending" };
    case "rate_limited":
      return { status: "busy" };
    default:
      return REFUSED;
  }
}

/** Ouverture de la fenêtre de dépôt : un jeton signé pour cet hommage. */
export function openContributionForm(deps: Pick<VisitorContributionDeps, "secrets" | "now">, slug: unknown): { status: "ready"; formToken: string } | VisitorFailure {
  if (!isPublicSlugShape(slug)) return REFUSED;
  if (deps.secrets === null) return UNAVAILABLE;
  return { status: "ready", formToken: issueFormToken(deps.secrets, slug, deps.now()) };
}

/** Condoléance (publiée tout de suite) ou récit (en attente d'approbation). */
export async function submitContributionText(
  deps: VisitorContributionDeps,
  input: { slug: unknown; type: unknown; authorName: unknown; text: unknown; formToken: unknown; honeypot?: unknown },
): Promise<VisitorDepositResult> {
  const g = gate(deps, input.slug, input.formToken, input.honeypot);
  if (!g.ok) return g.result;
  const type = CONTRIBUTION_TEXT_TYPES.find((t) => t === input.type) as ContributionTextType | undefined;
  if (!type) return { status: "invalid", field: "request" };
  const name = checkContributionText("authorName", input.authorName);
  if (!name.ok) return { status: "invalid", field: "authorName" };
  const text = checkContributionText(type === "condolence" ? "condolence" : "story", input.text);
  if (!text.ok) return { status: "invalid", field: "text" };
  try {
    return fromDeposit(await deps.repository.submit({ slug: g.slug!, type, authorName: name.value, content: text.value, idempotencyKey: g.nonce }));
  } catch {
    return UNAVAILABLE;
  }
}

export type PhotoStartResult =
  | { status: "ready"; mediaId: string; uploadUrl: string; uploadToken: string; photoTicket: string }
  | VisitorFailure;

/**
 * Étape 1 de la photo : réservation (R2 réservations, R3 en attente), puis
 * une permission d'envoi pour CE SEUL objet. Le chemin est toujours
 * `<memorial>/<media>/original.webp` : c'est la forme finale, après
 * traitement ; les octets bruts déposés à ce chemin y sont remplacés par
 * le serveur avant toute mise à disposition.
 */
export async function startContributionPhoto(
  deps: VisitorContributionDeps,
  input: { slug: unknown; declaredMimeType: unknown; formToken: unknown; honeypot?: unknown },
): Promise<PhotoStartResult> {
  const g = gate(deps, input.slug, input.formToken, input.honeypot);
  if (!g.ok) return g.result;
  if (!isAllowedImageMimeType(input.declaredMimeType)) return { status: "invalid", field: "photo" };
  try {
    const memorialId = await deps.repository.findPublicMemorialId(g.slug!);
    if (memorialId === null) return REFUSED;
    const mediaId = deps.generateId();
    const storagePath = buildMediaObjectPath({ memorialId, mediaId, mimeType: "image/webp" });
    const outcome = await deps.repository.reservePhoto({ slug: g.slug!, mediaId, storagePath, declaredMimeType: input.declaredMimeType });
    if (outcome === "rate_limited" || outcome === "pending_full") return { status: "busy" };
    if (outcome !== "reserved") return REFUSED;
    const permission = await deps.objectStore.createUploadPermission({ path: storagePath });
    return {
      status: "ready",
      mediaId,
      uploadUrl: permission.url,
      uploadToken: permission.token,
      photoTicket: issuePhotoTicket(g.secrets, g.slug!, mediaId, g.nonce),
    };
  } catch {
    return UNAVAILABLE;
  }
}

export type PhotoFinishResult = VisitorDepositResult | { status: "upload_incomplete" };

/**
 * Étape 2 de la photo, après l'envoi direct du navigateur : vérification,
 * traitement O5 (sharp), remplacement de l'objet par la version nettoyée,
 * puis finalisation en base (média ready + message photo en attente, D2).
 * Un fichier refusé est retiré tout de suite (octets supprimés).
 */
export async function finishContributionPhoto(
  deps: VisitorContributionDeps,
  input: { slug: unknown; mediaId: unknown; photoTicket: unknown; authorName: unknown; caption?: unknown; formToken: unknown; honeypot?: unknown },
): Promise<PhotoFinishResult> {
  const g = gate(deps, input.slug, input.formToken, input.honeypot);
  if (!g.ok) return g.result;
  if (!isMediaIdentifier(input.mediaId)) return REFUSED;
  const mediaId = input.mediaId;
  if (!verifyPhotoTicket(g.secrets, input.photoTicket, g.slug!, mediaId, g.nonce)) return REFUSED;
  const name = checkContributionText("authorName", input.authorName);
  if (!name.ok) return { status: "invalid", field: "authorName" };
  const caption = checkOptionalCaption(input.caption);
  if (!caption.ok) return { status: "invalid", field: "caption" };

  try {
    const memorialId = await deps.repository.findPublicMemorialId(g.slug!);
    if (memorialId === null) return REFUSED;
    const media = await deps.mediaRepository.findById({ memorialId, mediaId });
    if (media === null || (media.purpose as string) !== "contribution") return REFUSED;
    const storagePath = buildMediaObjectPath({ memorialId, mediaId, mimeType: "image/webp" });
    if (media.storagePath !== storagePath || !isPathWithinMemorial(storagePath, memorialId)) return REFUSED;

    const finalize = (m: { mimeType: string; sizeBytes: number; width: number; height: number }) =>
      deps.repository.finalizePhoto({
        slug: g.slug!,
        mediaId,
        authorName: name.value,
        caption: caption.value,
        idempotencyKey: g.nonce,
        ...m,
      });

    // Rejeu après une réponse perdue : la photo est déjà traitée et prête.
    // Jamais retraitée (pas de perte de qualité en cascade) : la base
    // répond `duplicate` avec l'état de la contribution.
    if (media.status === "ready") {
      if (media.sizeBytes === null || media.width === null || media.height === null) return REFUSED;
      return fromDeposit(await finalize({ mimeType: media.mimeType, sizeBytes: media.sizeBytes, width: media.width, height: media.height }));
    }

    const stat = await deps.objectStore.statObject({ path: storagePath });
    if (stat === null || stat.sizeBytes <= 0) return { status: "upload_incomplete" };
    const discard = () => retireContributionMedia(deps, { memorialId, ownerId: media.ownerId, mediaId, createdAt: media.createdAt });
    if (stat.sizeBytes > CONTRIBUTION_PHOTO_MAX_BYTES) {
      await discard();
      return { status: "invalid", field: "photo" };
    }
    const raw = await deps.photoStore.download({ path: storagePath, maxBytes: CONTRIBUTION_PHOTO_MAX_BYTES });
    if (raw === null) return { status: "upload_incomplete" };
    const processed = await deps.processPhoto(raw);
    if (!processed.ok) {
      await discard();
      return { status: "invalid", field: "photo" };
    }
    await deps.photoStore.replace({ path: storagePath, bytes: processed.bytes, contentType: processed.mimeType });
    const result = fromDeposit(await finalize({ mimeType: processed.mimeType, sizeBytes: processed.sizeBytes, width: processed.width, height: processed.height }));
    // Refus de la base (catégorie désactivée entre-temps, hommage fermé…) :
    // la photo n'a pas de message et ne doit pas rester stockée.
    if (result.status === "refused") await discard();
    return result;
  } catch {
    return UNAVAILABLE;
  }
}

export interface PublicContribution {
  id: string;
  type: ContributionType;
  authorName: string;
  text: string | null;
  caption: string | null;
  publishedAt: string;
  photo: { url: string; width: number | null; height: number | null } | null;
}

export interface PublicContributionsPage {
  items: PublicContribution[];
  /** Curseur opaque pour la page suivante de l'Album (P1), ou `null`. */
  nextCursor: string | null;
}

export function encodeCursor(cursor: ContributionCursor): string {
  return Buffer.from(JSON.stringify([cursor.publishedAt, cursor.id]), "utf8").toString("base64url");
}

export function decodeCursor(value: unknown): ContributionCursor | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 200) return "invalid";
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return "invalid";
    const [publishedAt, id] = parsed;
    if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt)) || !isMediaIdentifier(id)) return "invalid";
    return { publishedAt, id };
  } catch {
    return "invalid";
  }
}

/**
 * Lecture publique (scène et Album) : contributions publiées des
 * catégories EN VIGUEUR, de la plus récente à la plus ancienne (P1 :
 * published_at desc, id desc), page par page. Les photos sont servies par
 * des URL signées courtes (5 min), jamais par un chemin de stockage.
 */
export async function readPublicContributions(
  deps: Pick<VisitorContributionDeps, "repository" | "objectStore">,
  input: { slug: unknown; limit?: unknown; cursor?: unknown },
): Promise<PublicContributionsPage | { status: "refused" | "unavailable" }> {
  if (!isPublicSlugShape(input.slug)) return REFUSED;
  const before = decodeCursor(input.cursor);
  if (before === "invalid") return REFUSED;
  const limit = typeof input.limit === "number" && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), CONTRIBUTION_PAGE_SIZE_MAX) : CONTRIBUTION_PAGE_SIZE;
  try {
    const rows = await deps.repository.readPublic({ slug: input.slug, limit, before });
    const items: PublicContribution[] = [];
    for (const row of rows) {
      let photo: PublicContribution["photo"] = null;
      if (row.type === "photo") {
        if (!row.media) continue;
        photo = {
          url: await deps.objectStore.createReadUrl({ path: row.media.storagePath, expiresInSeconds: MEDIA_READ_URL_TTL_SECONDS }),
          width: row.media.width,
          height: row.media.height,
        };
      }
      items.push({ id: row.id, type: row.type, authorName: row.authorName, text: row.content, caption: row.caption, publishedAt: row.publishedAt, photo });
    }
    const last = rows[rows.length - 1];
    return { items, nextCursor: rows.length === limit && last ? encodeCursor({ publishedAt: last.publishedAt, id: last.id }) : null };
  } catch {
    return UNAVAILABLE;
  }
}
