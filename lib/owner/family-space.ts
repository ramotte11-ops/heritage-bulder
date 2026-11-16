import type { OwnedMemorialSummary } from "@/lib/adapters/owned-memorial-list-repository";
import type { FamilyTributeDetails } from "@/lib/adapters/family-space-repository";
import type { OwnerFreePublicationStatus } from "@/lib/adapters/owner-free-publication-status-repository";
import type { Language } from "@/config/languages";
import type { HeroDate, HeroPhoto } from "@/types/hero";

/**
 * Espace famille (Lot 1) — the pure rules of the family dashboard. No I/O:
 * everything here is decided from what the two repositories already
 * returned, so it is tested without a database.
 */

/** What a tribute card says about itself. Only real, stored facts. */
export type FamilyTributeState =
  /** Never published: `draft` or `ready`. */
  | "in_preparation"
  /** Published AND publicly consultable right now. */
  | "published"
  /** Published once, being edited: the public copy is not consultable. */
  | "editing"
  /** Published, but the free notice's public period has ended. */
  | "no_longer_visible"
  | "archived";

export interface FamilyTribute {
  id: string;
  displayName: string | null;
  language: Language | null;
  state: FamilyTributeState;
  /** « 1948 – 2023 », one year, or `null` when nothing is entered. */
  years: string | null;
  /** The Hero's own photo reference, `null` until the family adds one. */
  photo: HeroPhoto | null;
  /** Only while the public page would answer (decided upstream). */
  publicSlug: string | null;
  freeDeadlines: { publishUntil: string | null; draftUntil: string | null } | null;
}

function yearOf(date: HeroDate | null): string | null {
  if (date === null) return null;
  if (date.precision === "year") return String(date.year);
  const year = date.date.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/** Years only, like the Studio card; nothing when nothing is entered. */
export function tributeYears(birth: HeroDate | null, death: HeroDate | null): string | null {
  const from = yearOf(birth);
  const to = yearOf(death);
  if (from && to) return `${from} – ${to}`;
  return from ?? to;
}

/**
 * The card's state. `publicSlug` is the upstream, fail-closed decision
 * « the public page answers » (`SupabaseOwnedMemorialListRepository`); the
 * raw status only names WHY a tribute is not consultable. An unknown
 * status reads as a preparation — the safest wording, with no public link.
 */
export function tributeState(
  status: FamilyTributeDetails["status"] | undefined,
  publicSlug: string | null,
): FamilyTributeState {
  if (publicSlug !== null) return "published";
  switch (status) {
    case "published":
      return "no_longer_visible";
    case "editing":
      return "editing";
    case "archived":
      return "archived";
    default:
      return "in_preparation";
  }
}

export function buildFamilyTributes(
  memorials: readonly OwnedMemorialSummary[],
  details: ReadonlyMap<string, FamilyTributeDetails>,
): FamilyTribute[] {
  return memorials.map((memorial) => {
    const detail = details.get(memorial.id);
    return {
      id: memorial.id,
      displayName: memorial.displayName,
      language: memorial.language,
      state: tributeState(detail?.status, memorial.publicSlug),
      years: tributeYears(detail?.birth ?? null, detail?.death ?? null),
      photo: detail?.photo ?? null,
      publicSlug: memorial.publicSlug,
      freeDeadlines: memorial.freeDeadlines ?? null,
    };
  });
}

/**
 * The tribute whose attentions the dashboard shows. `requestedId` is a
 * URL claim: it is honoured only when it names one of the family's OWN
 * tributes (the list comes from the server-resolved Owner). Default: the
 * most recent tribute that has been published (the only ones that can
 * receive gestures), else the most recent one.
 */
export function selectTribute(tributes: readonly FamilyTribute[], requestedId: string | null): FamilyTribute | null {
  if (tributes.length === 0) return null;
  if (requestedId !== null) {
    const requested = tributes.find((tribute) => tribute.id === requestedId);
    if (requested) return requested;
  }
  const published = tributes.filter((tribute) => tribute.state !== "in_preparation");
  return published.at(-1) ?? tributes.at(-1) ?? null;
}

/**
 * Whether « Créer un nouvel hommage » may be offered. The limit is the
 * account's official counter (`owner_free_publication_status_v1`); when it
 * is unavailable the entry stays open — the database refuses a tribute
 * beyond the limit at save time anyway, and nothing is lost.
 */
export function canCreateTribute(publication: OwnerFreePublicationStatus): boolean {
  return publication.status === "unknown" || publication.activeFreeDrafts < publication.maxFreeDrafts;
}
