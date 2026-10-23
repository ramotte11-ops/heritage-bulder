import { OFFERING_KINDS, type OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import type { SymbolicOfferingRepository } from "@/lib/adapters/symbolic-offering-repository";

/**
 * Offrandes symboliques V1 — C1: the one server-side entry point that
 * records a visitor's gesture.
 *
 * Pure except for the injected repository. It validates what a request
 * could carry — every field arrives `unknown` — before anything reaches
 * the database, then maps the database outcome to the only answer a
 * visitor will ever get: `ok` or not. Every refusal (invalid input,
 * closed memorial, ceiling reached, infrastructure error) is the same
 * opaque failure to the caller; `reason` exists for server-side
 * diagnosis only and must never be shown to a visitor.
 *
 * C1 wires this to no route: there is no public memorial page yet, and
 * no Server Action exports it (see server-record-symbolic-offering.ts).
 */
export interface RecordSymbolicOfferingDeps {
  repository: SymbolicOfferingRepository;
}

export interface RecordSymbolicOfferingRequest {
  slug: unknown;
  kind: unknown;
  idempotencyKey: unknown;
}

export type RecordSymbolicOfferingResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "refused" | "rate_limited" | "error" };

/** A bound on what a slug lookup will ever be asked for. The real slug
 * format is decided by the future publication flow, not here. */
export const SYMBOLIC_OFFERING_SLUG_MAX_LENGTH = 200;

/** PostgreSQL's own uuid input format (same rule as lib/admin/support-search.ts). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOfferingKind(value: unknown): value is OfferingKind {
  return typeof value === "string" && (OFFERING_KINDS as readonly string[]).includes(value);
}

function readSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim();
  return slug.length > 0 && slug.length <= SYMBOLIC_OFFERING_SLUG_MAX_LENGTH ? slug : null;
}

export async function recordSymbolicOffering(
  deps: RecordSymbolicOfferingDeps,
  request: RecordSymbolicOfferingRequest,
): Promise<RecordSymbolicOfferingResult> {
  const slug = readSlug(request.slug);
  const kind = request.kind;
  const idempotencyKey = request.idempotencyKey;
  if (slug === null || !isOfferingKind(kind) || typeof idempotencyKey !== "string" || !UUID.test(idempotencyKey)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const outcome = await deps.repository.record({ slug, kind, idempotencyKey: idempotencyKey.toLowerCase() });
    switch (outcome) {
      case "recorded":
      case "duplicate":
        // A duplicate is the retry of a gesture already recorded: the
        // visitor sees the same confirmation, and nothing is stored twice.
        return { ok: true };
      case "rate_limited":
        return { ok: false, reason: "rate_limited" };
      default:
        return { ok: false, reason: "refused" };
    }
  } catch {
    return { ok: false, reason: "error" };
  }
}
