import type { Skin } from "./skins";

/**
 * Product authority for memorials prepared without an account in V1.
 *
 * The cultural skin is contractually fixed while the independent
 * `skinVariant` remains the family's Light/Dark choice. Keeping this outside
 * the V3 draft avoids a schema migration for a value that is not a V1 choice;
 * a future cultural-skin feature can replace this authority without touching
 * the guest's editorial content or local photographs.
 */
export const GUEST_BUILDER_V1_SKIN: Skin = "intemporel";
