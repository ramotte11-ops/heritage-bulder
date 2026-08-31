import { OFFERS, type OfferId } from "@/config/offers";
import type { MemorialType } from "@/config/memorial";
import type { Skin } from "@/config/skins";

/**
 * Mission 006 — pure lookups over config/offers.ts. No I/O, no
 * Supabase, no owner/entitlement/memorial row ever touched here.
 * Nothing in this file knows a memorial type is ever named "person" —
 * it only reads whatever config/offers.ts declares.
 */

/** The memorial type this offer produces. Always derived from
 * `offerId` — never stored redundantly on an Entitlement (see
 * types/entitlement.ts's Mission 006 docstring). */
export function getMemorialTypeForOffer(offerId: OfferId): MemorialType {
  return OFFERS[offerId].memorialType;
}

/** The set of skins this offer grants access to. Non-empty; may hold
 * more than one skin once a culture ships variants — see
 * config/offers.ts's docstring. */
export function getAllowedSkins(offerId: OfferId): readonly Skin[] {
  return OFFERS[offerId].allowedSkins;
}

/** Is `skinId` one this offer actually grants access to? The single
 * check every future write of `Memorial.skin` must pass — see
 * activate-entitlement.ts. */
export function isSkinAllowedForOffer(offerId: OfferId, skinId: Skin): boolean {
  return OFFERS[offerId].allowedSkins.includes(skinId);
}
