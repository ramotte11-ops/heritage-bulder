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

// V1 segmentation (QG/PO doctrine) — see config/offers.ts's OFFER_IDS
// comment for the full correspondence and why `africain` is retired.
export const SKINS = ["intemporel", "musulman", "juif", "hindou"] as const;

export type Skin = (typeof SKINS)[number];

/**
 * Mission 029B — a skin's light/dark declination.
 *
 * `SkinVariant` is an INDEPENDENT dimension from `Skin`, never a second
 * skin identity. HERITAGE V1 keeps exactly the four `SKINS` above; each
 * one now has two visual siblings (`4 skins × 2 variants = 8 renders`),
 * never `musulman-light` / `musulman-dark` as distinct skin ids. See
 * AGENTS.md Mission 029B sections 2-4 for the full doctrine this
 * encodes.
 *
 * This is NOT `prefers-color-scheme`, the OS/browser dark mode, or any
 * other system/device setting — see Mission 029B section 3. It is a
 * HERITAGE artistic ambiance persisted on the Memorial itself (section
 * 5): a dark memorial stays dark regardless of the visitor's device.
 * Nothing in this codebase may resolve a `SkinVariant` from
 * `window.matchMedia` or a `@media (prefers-color-scheme: …)` rule for
 * this purpose — `lib/memorial/skin-runtime.ts` is the one place a raw
 * value becomes a validated `SkinVariant`, and it never falls back to
 * either member of this list (section 10).
 */
export const SKIN_VARIANTS = ["light", "dark"] as const;

export type SkinVariant = (typeof SKIN_VARIANTS)[number];
