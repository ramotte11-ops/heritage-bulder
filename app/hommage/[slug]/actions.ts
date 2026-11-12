"use server";

import { isPublicSlugShape } from "@/lib/memorial/public/read-public-memorial";
import { recordSymbolicOfferingOnServer } from "@/lib/memorial/symbolic-offerings/server-record-symbolic-offering";

/**
 * QG 016 — Offrandes symboliques V1 : l'action serveur de la page publique.
 *
 * Un visiteur anonyme dépose un geste (bougie, lys, cœur) sur un hommage
 * publié. Tout argument arrive `unknown` et peut être forgé : le slug doit
 * avoir la seule forme que produit la publication, puis
 * `recordSymbolicOfferingOnServer` valide le geste et la clé d'idempotence
 * avant d'appeler `record_symbolic_offering_v1` (service_role), qui décide
 * seul : mémorial publié et publiquement visible, rubrique non désactivée
 * dans la copie publiée, ouverture, plafonds par mémorial, idempotence.
 *
 * Le visiteur ne reçoit qu'un booléen : jamais la raison d'un refus.
 */
export async function depositSymbolicOffering(slug: unknown, kind: unknown, idempotencyKey: unknown): Promise<boolean> {
  if (!isPublicSlugShape(slug)) return false;
  const result = await recordSymbolicOfferingOnServer({ slug, kind, idempotencyKey });
  if (!result.ok && result.reason === "error") {
    // Diagnostic serveur seulement, sans donnée de visiteur.
    console.error("Symbolic offering not recorded: infrastructure error");
  }
  return result.ok;
}
