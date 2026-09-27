import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";

/**
 * A13 Desktop functional flow — family media fixture (PILOT ONLY, never
 * product content). N media in family order, cycling the seven synthetic
 * A13 test photos of the multi-state pool (3:4, 4:3, 1:1, 9:16, 16:9, 3:1,
 * 3:2) with their own caption sets. Each media has its own id and a unique
 * `src` (`#fam-NNN` fragment: same file, no extra request) so the Gallery,
 * the Full Album and the Viewer can be matched media by media.
 *
 * Captions: `mixte` (absent / one line / 24 / 32 characters, period 4),
 * `aucune`, `32`.
 */

export const A13_FLOW_CAPTION_SETS = ["mixte", "aucune", "32"] as const;
export type A13FlowCaptionSet = (typeof A13_FLOW_CAPTION_SETS)[number];

export function a13FamilyFixture(count: number, captions: A13FlowCaptionSet): A13FamilyMedia[] {
  return Array.from({ length: count }, (_, i) => {
    const p = A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length];
    const id = `fam-${String(i + 1).padStart(3, "0")}`;
    const mode = captions === "aucune" ? "aucune" : captions === "32" ? "32" : (["aucune", "une-ligne", "24", "32"] as const)[i % 4];
    return { mediaId: id, src: `${p.src}#${id}`, alt: `Souvenir ${i + 1}`, width: p.width, height: p.height, focal: p.focal ?? null, caption: p.captions[mode] };
  });
}
