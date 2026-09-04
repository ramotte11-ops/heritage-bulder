import type { AdminSupportRepository } from "@/lib/adapters/admin-support-repository";
import type { Entitlement } from "@/types/entitlement";
import type { MemorialSupportSummary, OwnerSupportSummary } from "@/types/admin-support";
import { isValidEmail } from "@/lib/auth/validate-email";

/**
 * Mission 015A — the support lookup, as a pure function.
 *
 * No Supabase import, no session, no authorization: it takes a
 * repository and a query and returns what support should see. That is
 * what makes it testable with plain objects, and it is deliberately NOT
 * where the Admin gate lives — the gate is upstream, in
 * ./admin-session.ts, so that no code path can reach these reads without
 * passing it.
 *
 * ## Three exact lookups, no search engine
 *
 * Every mode is an exact match on a value support already has in front
 * of them: an address a family wrote in, an id from a URL or a previous
 * ticket. There is no partial match, no `LIKE`, no ranking, no "list
 * everything and filter", no pagination and no date range. Those are the
 * first steps toward a CRM, and toward a screen that shows staff
 * thousands of families they had no reason to look at.
 *
 * ## Why an invalid id is its own answer
 *
 * A malformed UUID sent to PostgreSQL raises `22P02 invalid input
 * syntax`. If that were caught and reported as "no result", a typo would
 * be indistinguishable from a right that genuinely does not exist — and
 * support would close a ticket on a lie. Ids are validated here, before
 * any read, and a bad one comes back as `invalidQuery`.
 *
 * For the same reason no repository failure is caught anywhere in this
 * file. An outage must not be able to render as an empty result.
 */

export type AdminSupportQuery =
  | { kind: "ownerEmail"; value: string }
  | { kind: "entitlementId"; value: string }
  | { kind: "memorialId"; value: string };

export const ADMIN_SUPPORT_QUERY_KINDS = [
  "ownerEmail",
  "entitlementId",
  "memorialId",
] as const satisfies readonly AdminSupportQuery["kind"][];

export type AdminSupportQueryKind = (typeof ADMIN_SUPPORT_QUERY_KINDS)[number];

/** One right, with the memorial it produced when it has been redeemed. */
export interface EntitlementSupportView {
  entitlement: Entitlement;
  /** `null` when the right has not been redeemed — and therefore has no
   * memorial. Read from `memorials.entitlement_id`, never inferred. */
  memorial: MemorialSupportSummary | null;
}

export interface AdminSupportRecord {
  /**
   * `null` is a real, informative state, not a gap: a right that nobody
   * has redeemed yet has no owner. Support seeing "no owner" is how they
   * know the family never activated.
   */
  owner: OwnerSupportSummary | null;
  entitlements: EntitlementSupportView[];
}

export type AdminSupportSearchResult =
  | { status: "found"; record: AdminSupportRecord }
  /** The query was well-formed and matched nothing. */
  | { status: "notFound" }
  /** The query itself is unusable — nothing was read. */
  | {
      status: "invalidQuery";
      reason: "malformedEmail" | "malformedId" | "empty" | "invalidKind";
    };

export interface AdminSupportSearchDeps {
  adminSupportRepository: AdminSupportRepository;
}

/**
 * PostgreSQL's own uuid input format. Validated here so a typo never
 * reaches the database as an error that would have to be interpreted.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Pairs each right with its memorial, one lookup per right. */
async function withMemorials(
  repository: AdminSupportRepository,
  entitlements: Entitlement[],
): Promise<EntitlementSupportView[]> {
  return Promise.all(
    entitlements.map(async (entitlement) => ({
      entitlement,
      memorial: await repository.findMemorialSummaryByEntitlementId(entitlement.id),
    })),
  );
}

async function searchByOwnerEmail(
  repository: AdminSupportRepository,
  email: string,
): Promise<AdminSupportSearchResult> {
  const owner = await repository.findOwnerByEmail(email);
  if (!owner) return { status: "notFound" };

  const entitlements = await repository.findEntitlementsByOwnerId(owner.id);

  return {
    status: "found",
    record: { owner, entitlements: await withMemorials(repository, entitlements) },
  };
}

async function searchByEntitlementId(
  repository: AdminSupportRepository,
  entitlementId: string,
): Promise<AdminSupportSearchResult> {
  const entitlement = await repository.findEntitlementById(entitlementId);
  if (!entitlement) return { status: "notFound" };

  const memorial = await repository.findMemorialSummaryByEntitlementId(entitlement.id);

  // The owner is resolved from the right's own `ownerId`, never from the
  // memorial and never from anything the caller supplied.
  const owner = entitlement.ownerId
    ? await repository.findOwnerById(entitlement.ownerId)
    : null;

  return { status: "found", record: { owner, entitlements: [{ entitlement, memorial }] } };
}

async function searchByMemorialId(
  repository: AdminSupportRepository,
  memorialId: string,
): Promise<AdminSupportSearchResult> {
  const memorial = await repository.findMemorialSummaryById(memorialId);
  if (!memorial) return { status: "notFound" };

  // Walk back along the real relations: the memorial names its right and
  // its owner, and both are read by id.
  const entitlement = await repository.findEntitlementById(memorial.entitlementId);
  const owner = await repository.findOwnerById(memorial.ownerId);

  return {
    status: "found",
    record: {
      owner,
      // A memorial always has a right (`memorials.entitlement_id` is NOT
      // NULL). If the read comes back empty the data is inconsistent —
      // shown as a memorial with no right rather than papered over.
      entitlements: entitlement ? [{ entitlement, memorial }] : [],
    },
  };
}

export async function searchAdminSupport(
  { adminSupportRepository }: AdminSupportSearchDeps,
  query: AdminSupportQuery,
): Promise<AdminSupportSearchResult> {
  const value = typeof query.value === "string" ? query.value.trim() : "";
  if (value === "") return { status: "invalidQuery", reason: "empty" };

  switch (query.kind) {
    case "ownerEmail":
      return isValidEmail(value)
        ? searchByOwnerEmail(adminSupportRepository, value)
        : { status: "invalidQuery", reason: "malformedEmail" };

    case "entitlementId":
      return isUuid(value)
        ? searchByEntitlementId(adminSupportRepository, value)
        : { status: "invalidQuery", reason: "malformedId" };

    case "memorialId":
      return isUuid(value)
        ? searchByMemorialId(adminSupportRepository, value)
        : { status: "invalidQuery", reason: "malformedId" };
  }
}

/**
 * Narrows an untrusted string (a query parameter) to a supported search
 * mode. Returns null for anything else — the caller decides what to do,
 * and never falls back to a default mode: silently searching by
 * something other than what staff asked for is worse than refusing.
 */
export function parseAdminSupportQueryKind(value: unknown): AdminSupportQueryKind | null {
  return typeof value === "string" &&
    (ADMIN_SUPPORT_QUERY_KINDS as readonly string[]).includes(value)
    ? (value as AdminSupportQueryKind)
    : null;
}
