"use server";

import { isPublicSlugShape } from "@/lib/memorial/public/read-public-memorial";
import { recordSymbolicOfferingOnServer } from "@/lib/memorial/symbolic-offerings/server-record-symbolic-offering";
import { signSymbolicOfferingOnServer } from "@/lib/memorial/symbolic-offerings/server-sign-symbolic-offering";

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

/**
 * Lot 2 — signature facultative du geste que le visiteur vient de déposer :
 * rattachée à CE geste (slug + sa clé d'idempotence), jamais à un autre ;
 * `signSymbolicOfferingOnServer` normalise et valide, puis
 * `sign_symbolic_offering_v1` (service_role) décide seul : geste existant,
 * pas encore signé, moins de 30 minutes. Réponse booléenne seulement. La
 * signature, donnée personnelle, n'est jamais journalisée ; un échec laisse
 * le geste intact.
 */
export async function signSymbolicOfferingAction(slug: unknown, idempotencyKey: unknown, signature: unknown): Promise<boolean> {
  if (!isPublicSlugShape(slug)) return false;
  const result = await signSymbolicOfferingOnServer({ slug, idempotencyKey, signature });
  if (!result.ok && result.reason === "error") {
    // Diagnostic serveur seulement, sans donnée de visiteur.
    console.error("Symbolic offering signature not recorded: infrastructure error");
  }
  return result.ok;
}
