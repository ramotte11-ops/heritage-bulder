import { A13_STATE_SLOTS, selectGalleryState, type A13GalleryStateId } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { composeSlots, obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";

/**
 * A13 multi-state gallery — state selection + V2.1 engine, nothing else.
 *
 * The media COUNT selects one closed manifest (`selectGalleryState`); the
 * manifest's slots are then filled strictly `media[i] → slot[i]` and laid
 * out by the unchanged V2.1 engine (`composeSlots`, `layoutCaption`). For
 * ≥ 7 media the Signature state shows exactly its six slots — media[0…5] —
 * and carries the CTA; every other state never does.
 */

export interface GalleryStateEntry<M> {
  slot: A13Slot;
  media: M;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
}

export interface GalleryState<M> {
  stateId: A13GalleryStateId;
  mediaCount: number;
  entries: GalleryStateEntry<M>[];
  hasCta: boolean;
}

export function buildGalleryState<M extends PhotoSource>(
  media: readonly M[],
  captionOf: (m: M) => string | null,
  measurer: CaptionMeasurer | null,
): GalleryState<M> | null {
  const stateId = selectGalleryState(media.length);
  if (!stateId) return null;
  const slots = A13_STATE_SLOTS[stateId];
  const assigned = assignMediaToSlots(slots, media);
  const composed = composeSlots(assigned.map(({ slot, media: m }) => ({ slot, source: m })));
  const entries = composed.map(({ slot, layout }, i) => {
    const m = assigned[i].media as M;
    const text = captionOf(m);
    return {
      slot,
      media: m,
      layout: layout!,
      caption: measurer && text ? layoutCaption(slot, layout!, text, measurer, obstaclesAbove(composed, slot)) : null,
    };
  });
  return { stateId, mediaCount: media.length, entries, hasCta: stateId === "G6_SIGNATURE_7PLUS" };
}
