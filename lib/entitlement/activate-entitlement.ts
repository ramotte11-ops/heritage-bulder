import type { EntitlementStatus } from "@/config/entitlements";
import type { OfferId } from "@/config/offers";
import type { MemorialType } from "@/config/memorial";
import type { Skin } from "@/config/skins";
import { getMemorialTypeForOffer, isSkinAllowedForOffer } from "./offer-skin";

/**
 * Mission 006 — pure planning logic for turning one entitlement into a
 * memorial's initial `memorialType`/`skin`. No I/O, no Supabase, no
 * owner/memorial row ever created or written here — this is the clean
 * boundary a future activation flow (explicitly out of this mission's
 * scope) is meant to call before it does any of that.
 *
 * The minimal slice of an Entitlement this needs — never the whole
 * `Entitlement` type, so a caller doesn't need a real one on hand.
 */
export interface EntitlementActivationInput {
  status: EntitlementStatus;
  offerId: OfferId;
}

export type EntitlementActivationResult =
  | { ok: true; memorialType: MemorialType; skinId: Skin }
  | { ok: false; reason: string };

/**
 * Plans one activation attempt: is this entitlement usable, and is
 * `selectedSkin` one this offer actually grants access to?
 *
 * `selectedSkin` is an explicit parameter, never resolved internally —
 * this mission does not decide WHEN a skin gets chosen (at purchase, at
 * activation, or later); it only guarantees that whatever chooses it
 * cannot inject a skin the purchased offer doesn't allow. In V1, every
 * offer has exactly one allowed skin, so a caller has exactly one
 * legal value to pass; that stays true without this function changing
 * the day an offer grants more than one.
 *
 * Never throws — an invalid attempt comes back as
 * `{ ok: false, reason }`, not an exception, so a caller (a future
 * activation Server Action) can turn it into a form error without a
 * try/catch — same contract as lib/memorial/status-transitions.ts's
 * `transitionMemorial`.
 */
export function planEntitlementActivation(
  entitlement: EntitlementActivationInput,
  selectedSkin: Skin,
): EntitlementActivationResult {
  if (entitlement.status !== "available") {
    return {
      ok: false,
      reason: `Ce droit n'est plus disponible pour une activation (statut actuel : « ${entitlement.status} »).`,
    };
  }

  if (!isSkinAllowedForOffer(entitlement.offerId, selectedSkin)) {
    return {
      ok: false,
      reason: `Le skin « ${selectedSkin} » n'est pas autorisé par l'offre « ${entitlement.offerId} ».`,
    };
  }

  return {
    ok: true,
    memorialType: getMemorialTypeForOffer(entitlement.offerId),
    skinId: selectedSkin,
  };
}
