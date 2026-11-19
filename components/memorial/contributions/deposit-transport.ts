import { MEDIA_BUCKET } from "@/config/media";
import { prepareChosenPhoto } from "@/lib/media/prepare-chosen-photo";

/**
 * M8-E4 (préparation) — le contrat entre la fenêtre de dépôt et le serveur.
 *
 * La fenêtre ne connaît que ces trois opérations ; la version réelle les
 * branche sur les Server Actions E2 (app/hommage/[slug]/contribution-actions.ts),
 * la page pilote sur une simulation. Aucune clé n'est manipulée ici : le
 * navigateur ne reçoit qu'un jeton de formulaire signé, une permission
 * d'envoi pour UN objet et un ticket photo.
 */
export type DepositStatus =
  | { status: "published" | "pending" | "busy" | "expired" | "refused" | "unavailable" | "upload_incomplete" }
  | { status: "invalid"; field: "authorName" | "text" | "caption" | "photo" | "request" };

export interface ContributionDepositTransport {
  open(): Promise<{ status: "ready"; formToken: string } | { status: string }>;
  depositText(input: { type: "condolence" | "testimonial"; authorName: string; text: string; formToken: string; website: string }): Promise<DepositStatus>;
  depositPhoto(input: { file: File; authorName: string; caption: string; formToken: string; website: string }): Promise<DepositStatus>;
}

type Action<I, O> = (input: I) => Promise<O>;

/** Les Server Actions E2, telles que la page publique les transmet (liées à rien : le slug est passé ici). */
export interface ContributionDepositActions {
  openContributionWindow: (slug: string) => Promise<{ status: string; formToken?: string }>;
  depositContributionText: Action<{ slug: string; type: string; authorName: string; text: string; formToken: string; website: string }, { status: string; field?: string }>;
  beginContributionPhoto: Action<
    { slug: string; declaredMimeType: string; formToken: string; website: string },
    { status: string; mediaId?: string; uploadUrl?: string; uploadToken?: string; photoTicket?: string }
  >;
  completeContributionPhoto: Action<
    { slug: string; mediaId: string; photoTicket: string; authorName: string; caption: string; formToken: string; website: string },
    { status: string; field?: string }
  >;
}

const KNOWN = new Set(["published", "pending", "busy", "expired", "refused", "unavailable", "upload_incomplete", "invalid"]);

function toStatus(r: { status: string; field?: string }): DepositStatus {
  if (!KNOWN.has(r.status)) return { status: "unavailable" };
  if (r.status === "invalid") {
    const field = (["authorName", "text", "caption", "photo", "request"] as const).find((f) => f === r.field) ?? "request";
    return { status: "invalid", field };
  }
  return { status: r.status as Exclude<DepositStatus["status"], "invalid"> } as DepositStatus;
}

/**
 * Le transport réel (à brancher en E4, après validation PO). La photographie
 * est d'abord préparée dans le navigateur (orientation, dimensions, WebP,
 * métadonnées retirées), puis envoyée directement au stockage sur le seul
 * chemin réservé ; le serveur la retraite de toute façon (O5).
 */
export function createContributionDepositTransport(slug: string, actions: ContributionDepositActions): ContributionDepositTransport {
  return {
    async open() {
      const r = await actions.openContributionWindow(slug);
      return r.status === "ready" && typeof r.formToken === "string" ? { status: "ready", formToken: r.formToken } : { status: r.status };
    },
    async depositText(input) {
      return toStatus(await actions.depositContributionText({ slug, ...input }));
    },
    async depositPhoto({ file, authorName, caption, formToken, website }) {
      let prepared: File;
      try {
        // M8-E4 : le profil dédié `contribution` (2 000 px, cible PO O5) ; le
        // serveur Sharp revalide, réoriente, ré-encode et nettoie de toute façon.
        prepared = await prepareChosenPhoto(file, "contribution");
      } catch {
        return { status: "invalid", field: "photo" };
      }
      const begun = await actions.beginContributionPhoto({ slug, declaredMimeType: prepared.type, formToken, website });
      if (begun.status !== "ready" || !begun.mediaId || !begun.uploadToken || !begun.photoTicket) return toStatus(begun);
      const { getBrowserSupabaseClient } = await import("@/lib/supabase/browser-client");
      const path = new URL(begun.uploadUrl ?? "", "https://invalid.local").pathname.split(`/${MEDIA_BUCKET}/`)[1];
      if (!path) return { status: "unavailable" };
      const { error } = await getBrowserSupabaseClient().storage.from(MEDIA_BUCKET).uploadToSignedUrl(decodeURIComponent(path), begun.uploadToken, prepared, { contentType: prepared.type });
      if (error) return { status: "unavailable" };
      return toStatus(await actions.completeContributionPhoto({ slug, mediaId: begun.mediaId, photoTicket: begun.photoTicket, authorName, caption, formToken, website }));
    },
  };
}
