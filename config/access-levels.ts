/**
 * HERITAGE Direct M1-A — access level a right grants, and that its
 * memorial inherits. Mirrors the CHECK constraints in
 * supabase/migrations/20261024180000_heritage_direct_access_foundation.sql.
 *
 * Always supplied explicitly when a right is created (D12): there is no
 * default level anywhere, in the schema or in the code.
 *
 * - `avis` — the free offer (direct channel only, no key, no order);
 * - `complet` — the complete offer, including every Etsy right.
 */

export const ACCESS_LEVELS = ["avis", "complet"] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];
