import type { EntitlementSource, EntitlementStatus } from "@/config/entitlements";
import type { Skin } from "@/config/skins";

/**
 * The right to create exactly one memorial, issued by a purchase.
 * Mirrors the `entitlements` table
 * (supabase/migrations/20260829153000_entitlements.sql).
 *
 * This is a purchase activation record, not the owner's permanent access
 * mechanism — see Mission 000 answer G. `ownerId`/`memorialId` are only
 * set once the entitlement has been redeemed.
 */
export interface Entitlement {
  id: string;
  source: EntitlementSource;
  externalOrderId: string | null;
  skinId: Skin;
  status: EntitlementStatus;
  ownerId: string | null;
  memorialId: string | null;
  createdAt: string; // ISO 8601
  redeemedAt: string | null; // ISO 8601
  updatedAt: string; // ISO 8601
}
