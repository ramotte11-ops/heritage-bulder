/**
 * A skin determines a memorial's visual identity (colors, typography,
 * layout). The client picks an offer, not a skin directly — the offer
 * determines the skin (Mission 000, principle 11). No visual definition of
 * a skin exists yet; this only reserves its place as a configuration value.
 */

export const SKINS = ["intemporel"] as const;

export type Skin = (typeof SKINS)[number];
