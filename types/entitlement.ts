import type { EntitlementSource, EntitlementStatus } from "@/config/entitlements";
import type { OfferId } from "@/config/offers";

/**
 * The right to create exactly one memorial, issued by a purchase.
 * Mirrors the `entitlements` table
 * (supabase/migrations/20260829153000_entitlements.sql, as amended by
 * Mission 006's 20260831160000_entitlement_offer_model.sql).
 *
 * This is a purchase activation record, not the owner's permanent access
 * mechanism — see Mission 000 answer G. `ownerId` is only set once the
 * entitlement has been redeemed.
 *
 * There is deliberately no `memorialId` here (Mission 002 correction):
 * `Memorial.entitlementId` is the single source of truth for this
 * relationship. To find an entitlement's memorial (if any), query
 * memorials by `entitlementId` — see types/memorial.ts and
 * supabase/README.md.
 *
 * Mission 006: `offerId` replaces the earlier `skinId`. An entitlement
 * records WHICH OFFER was purchased — never a skin. `offerId` is the
 * single source of truth for both `memorialType` and the set of skins
 * this entitlement grants access to (`OFFERS[offerId]` in
 * config/offers.ts); neither is duplicated here. The skin actually used
 * lives exclusively on `Memorial.skin` (types/memorial.ts), validated
 * against `OFFERS[offerId].allowedSkins` at Memorial creation/update
 * time (lib/entitlement/) — never persisted on the entitlement itself,
 * so that WHEN a skin gets chosen (at purchase, at activation, or later
 * in a dedicated step) stays an open product decision the schema does
 * not lock in. See this mission's report for the full rationale.
 */
export interface Entitlement {
  id: string;
  source: EntitlementSource;
  externalOrderId: string | null;
  offerId: OfferId;
  status: EntitlementStatus;
  ownerId: string | null;
  createdAt: string; // ISO 8601
  redeemedAt: string | null; // ISO 8601
  updatedAt: string; // ISO 8601
}
