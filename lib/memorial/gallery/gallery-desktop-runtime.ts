import { selectGalleryState, type A13GalleryStateId } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { solveV2 } from "@/lib/memorial/gallery/gallery-v2";
import { buildG6FamilyState } from "@/lib/memorial/gallery/gallery-state";
import type { PhotoSource, PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { CaptionLayout, CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import type { GlyphMask } from "@/lib/memorial/gallery/title-glyph-mask";

/**
 * A13 Gallery Desktop — ONE entry point from a family media list to the
 * GREEN composition (pure, theme-free).
 *
 * It makes exactly the engine calls of the GREEN Light/Dark parity gate
 * (`runLightEngine`, `theme-parity.ts`), keyed on the media COUNT instead of
 * a QA fixture:
 * - 0–1 media → no Gallery (`GALLERY_ABSENT`);
 * - 2…5 → G2…G5 through the V2 runtime (`solveV2`, simplified manifests V2
 *   + contract patch V2.1 — the GREEN G2–G5 authority);
 * - 6 → G6 exact, ≥ 7 → G6 Signature 7+ through `buildG6FamilyState`
 *   (closed V2.1 composition, unchanged). Signature shows media[0…5] and
 *   carries the CTA; every other media stays in the Full Album.
 * Nothing is recomputed, reordered or recalibrated here: media[i] → slot[i].
 */

/**
 * One memorial media, in family order — the single input shared by the
 * Gallery, the Full Album and the Viewer (natural size, validated
 * accessible text, optional runtime caption ≤ 32 characters).
 */
export interface A13FamilyMedia extends PhotoSource {
  mediaId: string;
  src: string;
  alt: string;
  caption: string | null;
}

export interface DesktopGalleryEntry<M> {
  slot: A13Slot;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  media: M;
  /** Family index of the media shown in this slot. */
  mediaIndex: number;
}

export interface DesktopGalleryRun<M> {
  stateId: A13GalleryStateId | null;
  /** "PASS", "GALLERY_ABSENT", a V2 STOP code, or a caption STOP. */
  status: string;
  mediaCount: number;
  entries: DesktopGalleryEntry<M>[];
  hasCta: boolean;
}

export function runDesktopGallery<M extends PhotoSource>(
  media: readonly M[],
  captionOf: (m: M, index: number) => string | null,
  measurer: CaptionMeasurer | null,
  titleMask: GlyphMask,
): DesktopGalleryRun<M> {
  const stateId = selectGalleryState(media.length);
  if (!stateId) return { stateId: null, status: "GALLERY_ABSENT", mediaCount: media.length, entries: [], hasCta: false };
  if (stateId === "G2" || stateId === "G3" || stateId === "G4" || stateId === "G5") {
    const v2 = solveV2({ state: stateId, sources: [...media], captions: media.map((m, i) => captionOf(m, i)), measurer, titleMask });
    return {
      stateId,
      status: v2.status,
      mediaCount: media.length,
      entries: v2.slots.map((s, i) => ({ slot: s.slot, layout: s.layout, caption: s.caption, media: media[i], mediaIndex: i })),
      hasCta: false,
    };
  }
  // Positional wrappers: the family index survives even if two entries share one object.
  const wrapped = media.map((m, i) => ({ width: m.width, height: m.height, focal: m.focal, i }));
  const gs = buildG6FamilyState(wrapped, (w) => captionOf(media[w.i], w.i), measurer);
  const unresolved = gs.entries.filter((e) => e.caption?.status === "CAPTION_COLLISION_UNRESOLVED").map((e) => e.slot.slotId);
  return {
    stateId: gs.stateId,
    status: unresolved.length ? `CAPTION_COLLISION_UNRESOLVED_STOP(${unresolved.join(",")})` : "PASS",
    mediaCount: media.length,
    entries: gs.entries.map((e) => ({ slot: e.slot, layout: e.layout, caption: e.caption, media: media[e.media.i], mediaIndex: e.media.i })),
    hasCta: gs.hasCta,
  };
}
