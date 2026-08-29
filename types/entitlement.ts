import type { EntitlementSource, EntitlementStatus } from "@/config/entitlements";
import type { Skin } from "@/config/skins";

/**
 * The right to create exactly one memorial, issued by a purchase.
 * Mirrors the `entitlements` table
 * (supabase/migrations/20260829153000_entitlements.sql).
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
 */
export interface Entitlement {
  id: string;
  source: EntitlementSource;
  externalOrderId: string | null;
  skinId: Skin;
  status: EntitlementStatus;
  ownerId: string | null;
  createdAt: string; // ISO 8601
  redeemedAt: string | null; // ISO 8601
  updatedAt: string; // ISO 8601
}
