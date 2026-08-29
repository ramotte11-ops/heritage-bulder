/**
 * Entitlement source/status configuration. Mirrors the CHECK constraints
 * in supabase/migrations/20260829153000_entitlements.sql.
 */

export const ENTITLEMENT_SOURCES = ["etsy", "direct"] as const;

export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

export const ENTITLEMENT_STATUSES = ["available", "redeemed", "revoked"] as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];
