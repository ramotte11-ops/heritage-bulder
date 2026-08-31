import type { MemorialType } from "./memorial";
import type { Skin } from "./skins";

/**
 * An Offer is what a customer actually buys — a HERITAGE product
 * configuration value, never a database table (same reasoning as
 * `Skin`/`MemorialType`/`Language`: it is a product rule, not
 * transactional data — see supabase/README.md).
 *
 * Mission 006's model, validated before implementation:
 *
 *   Offer      -> determines MemorialType, determines AllowedSkins
 *   Entitlement -> the right acquired on one Offer (config/entitlements.ts
 *                 + types/entitlement.ts's `offerId`) — never stores a
 *                 skin itself.
 *   Memorial   -> stores the skin actually selected
 *                 (types/memorial.ts's `skin`), which must belong to
 *                 `OFFERS[entitlement.offerId].allowedSkins` — validated
 *                 in application code (lib/entitlement/), never in SQL.
 *
 * `allowedSkins` is deliberately an array, not a single value: V1 ships
 * exactly one skin per offer, but nothing here limits it to one.
 * Growing a culture to 2 or 3 skins tomorrow is only ever an edit to
 * this array (plus, the first time a literally new skin id appears, an
 * additive migration widening `memorials.skin_id`'s CHECK) — never a
 * change to this type, to `Entitlement`, or to the Builder.
 *
 * Deliberately independent of any sales channel: nothing here (or
 * anywhere this type is used) references Etsy. See
 * config/entitlements.ts's `EntitlementSource` for where the channel
 * itself is represented.
 */

export const OFFER_IDS = ["occidental", "arabe", "africain", "indien", "juif"] as const;

export type OfferId = (typeof OFFER_IDS)[number];

export interface OfferDefinition {
  memorialType: MemorialType;
  /** Non-empty. The set of skins this offer grants access to — see this
   * file's docstring for why it's an array rather than a single skin. */
  allowedSkins: readonly Skin[];
}

export const OFFERS: Record<OfferId, OfferDefinition> = {
  occidental: { memorialType: "person", allowedSkins: ["intemporel"] },
  arabe: { memorialType: "person", allowedSkins: ["maghreb"] },
  africain: { memorialType: "person", allowedSkins: ["africain"] },
  indien: { memorialType: "person", allowedSkins: ["indien"] },
  juif: { memorialType: "person", allowedSkins: ["juif"] },
};
