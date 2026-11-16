import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import type { HeroDate, HeroPhoto } from "@/types/hero";
import type { MemorialStatus } from "@/types/memorial";

/**
 * Espace famille (Lot 1) — what the family dashboard reads beyond the
 * existing `OwnedMemorialListRepository` (which keeps deciding the list,
 * the public link and the free deadlines, unchanged).
 *
 * Two questions only:
 *   1. per tribute, its real status and the Hero facts a card shows (years,
 *      main photo reference) — never the draft content itself;
 *   2. per tribute, the symbolic offerings actually received.
 *
 * Read-only. Implementations must run under the family's own session, so
 * row-level security is the lock (`memorials_select_own`,
 * `memorial_drafts_select_own`, `symbolic_offerings_select_own`): a foreign
 * memorial id can only ever yield nothing.
 */
export interface FamilyTributeDetails {
  memorialId: string;
  /** `null` when the stored value is not a known status: the card then
   * falls back to « en préparation » wording without any public link. */
  status: MemorialStatus | null;
  birth: HeroDate | null;
  death: HeroDate | null;
  /** The Hero's own photo reference — the one the family already chose. */
  photo: HeroPhoto | null;
}

export interface FamilyOffering {
  id: string;
  kind: OfferingKind;
  createdAt: string; // ISO 8601
}

export type FamilyOfferingCounts = Readonly<Record<OfferingKind, number>>;

export interface FamilyOfferingPage {
  offerings: FamilyOffering[];
  /** Whether older gestures exist beyond this page. */
  hasMore: boolean;
}

export interface FamilySpaceRepository {
  /** Details for the Owner's tributes, keyed by memorial id. A tribute
   * with no readable draft simply has no Hero facts. Rejects on failure. */
  listTributeDetails(ownerId: string): Promise<Map<string, FamilyTributeDetails>>;
  /** Real totals per gesture for one tribute. Rejects on failure. */
  countOfferings(memorialId: string): Promise<FamilyOfferingCounts>;
  /** Gestures of one tribute, newest first. Rejects on failure. */
  listOfferings(memorialId: string, range: { offset: number; limit: number }): Promise<FamilyOfferingPage>;
}
