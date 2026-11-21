import type { SymbolicOfferingSignatureRepository } from "@/lib/adapters/symbolic-offering-repository";
import { normalizeOfferingSignature } from "./offering-signature";
import { SYMBOLIC_OFFERING_SLUG_MAX_LENGTH } from "./record-symbolic-offering";

/**
 * Lot 2 — rattache la signature facultative d'un visiteur au geste qu'il
 * vient de déposer (déjà enregistré par recordSymbolicOffering).
 *
 * Pur, hormis le dépôt injecté. Tout argument arrive `unknown` : slug, clé
 * d'idempotence (UUID) et signature sont validés et la signature normalisée
 * AVANT la base ; la base revérifie tout (forme, geste, délai, une seule
 * signature). Le visiteur ne reçoit que `ok` : la raison d'un refus sert au
 * diagnostic serveur seulement. La signature n'est JAMAIS journalisée.
 *
 * Un échec ici ne touche jamais au geste, déjà enregistré.
 */
export interface SignSymbolicOfferingDeps {
  repository: SymbolicOfferingSignatureRepository;
}

export interface SignSymbolicOfferingRequest {
  slug: unknown;
  idempotencyKey: unknown;
  signature: unknown;
}

export type SignSymbolicOfferingResult = { ok: true } | { ok: false; reason: "invalid" | "refused" | "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim();
  return slug.length > 0 && slug.length <= SYMBOLIC_OFFERING_SLUG_MAX_LENGTH ? slug : null;
}

export async function signSymbolicOffering(
  deps: SignSymbolicOfferingDeps,
  request: SignSymbolicOfferingRequest,
): Promise<SignSymbolicOfferingResult> {
  const slug = readSlug(request.slug);
  const key = request.idempotencyKey;
  const signature = normalizeOfferingSignature(request.signature);
  if (slug === null || typeof key !== "string" || !UUID.test(key) || signature === null) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const outcome = await deps.repository.sign({ slug, idempotencyKey: key.toLowerCase(), signature });
    return outcome === "signed" || outcome === "already_signed" ? { ok: true } : { ok: false, reason: "refused" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
