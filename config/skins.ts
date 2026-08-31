/**
 * A skin determines a memorial's visual identity (colors, typography,
 * layout). The client picks an offer, not a skin directly — an offer
 * determines the *set* of skins it grants access to
 * (`config/offers.ts`'s `allowedSkins`), never a single skin value
 * baked in here (Mission 006). No visual definition of any skin exists
 * yet; this only reserves each one's place as a configuration value.
 *
 * V1 ships one skin per cultural offer, but nothing in this file (or in
 * `config/offers.ts`) limits an offer to exactly one — adding a second
 * or third skin to an existing culture is only ever a config change
 * (plus, the first time a literally new skin id is introduced, an
 * additive migration widening the `memorials.skin_id` CHECK — see
 * supabase/README.md).
 */

export const SKINS = ["intemporel", "maghreb", "africain", "indien", "juif"] as const;

export type Skin = (typeof SKINS)[number];
