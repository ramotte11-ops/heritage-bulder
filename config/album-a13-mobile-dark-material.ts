/**
 * A13 — FULL ALBUM MOBILE DARK — runtime MATERIAL (rendering only).
 *
 * The Dark declination of the CLOSED Full Album Mobile Light (V1.2,
 * e450d76): SAME ENGINE, SAME GEOMETRY, SAME PARTITION, SAME MINIMUMS
 * (69 CSS px P3 / 9:16 exception included), DARK MATERIALS ONLY.
 *
 * Read by the rendering layer (`AlbumMobileTable`) after the Mobile layout
 * has fixed every geometry — never by the partition, the solver or the
 * layout (guarded by `album-dark.test.ts` on the import graph). The two
 * Studio assets take exactly the place of the Light TOP / BODY in the same
 * material layers (`layout.materials`: TOP once, BODY stacked with the
 * same crossfades), at the same 1024 × 1536 size: no length here is read
 * by the layout. Prints, captions and focus are the shared A13 Dark
 * material of `DynamicPolaroid` (the Album Dark tokens, value for value).
 */

/** Studio assets (`A13_FULL_ALBUM_MOBILE_DARK_RUNTIME_ASSETS_V1.zip`, GREEN QG/PO) — byte-identical copies. */
export const A13_ALBUM_MOBILE_DARK_MATERIALS = {
  /** Decorated TOP (botany, seal): painted ONCE at the top of the page. */
  top: {
    src: "/assets/album/a13-mobile-dark/a13-album-mobile-dark-top-v1.png",
    packageAsset: "A13_FULL_ALBUM_MOBILE_DARK_TOP_V1.png",
    sha256: "5035f992a01f64810b42f7eedbbd552937cfd1d3581b7d44b5048e6f7f39cec7",
    width: 1024,
    height: 1536,
  },
  /** Calm extensible BODY (no decorative event): stacked downward for the whole Album height. */
  body: {
    src: "/assets/album/a13-mobile-dark/a13-album-mobile-dark-body-extensible-v1.png",
    packageAsset: "A13_FULL_ALBUM_MOBILE_DARK_BODY_EXTENSIBLE_V1.png",
    sha256: "461dc143931c00229a4617a47e8035e42d12e96c73d2c163474cb62df5bb105e",
    width: 1024,
    height: 1536,
  },
  /**
   * Underlay of the material layer, seen only before a tile is decoded:
   * the BODY mean colour (the Album Desktop Dark fallback rule), never the
   * Light paper.
   */
  underlay: "#452816",
  recolor: false,
  filter: "none",
} as const;
