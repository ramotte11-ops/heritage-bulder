import { A13_STATE_SLOTS, selectGalleryState, type A13GalleryStateId } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { isCalibratedState } from "@/config/gallery-a13-calibration-v1-1";
import { assignMediaToSlots, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { composeSlots, obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { calibrateState, type CalibratedSlot } from "@/lib/memorial/gallery/manifest-calibration";

/**
 * A13 multi-state gallery — state selection + V2.1 engine (+ V1.1
 * calibration for G2–G5), nothing else.
 *
 * The media COUNT selects one closed manifest (`selectGalleryState`); the
 * manifest's slots are then filled strictly `media[i] → slot[i]`.
 * - G2–G5: `calibrateState` (V1.1) — V2.1 layout, then the largest uniform
 *   scale-down s ≤ 1 per Polaroid that satisfies the local constraints;
 * - G6 exact and G6 Signature 7+: the unchanged V2.1 composition (GREEN).
 * Captions are laid out last by the unchanged V2.1 caption engine. For ≥ 7
 * media the Signature state shows exactly media[0…5] and carries the CTA.
 */

export interface GalleryStateEntry<M> {
  slot: A13Slot;
  media: M;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  /** V1.1 calibration result (G2–G5 only). */
  calibration: CalibratedSlot | null;
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

  let calibrated: (CalibratedSlot | null)[];
  let composed: { slot: A13Slot; layout: PolaroidLayout | null }[];
  if (isCalibratedState(stateId)) {
    const cal = calibrateState(
      stateId,
      assigned.map(({ slot, media: m }) => ({ slot, source: m as M, captionText: captionOf(m as M) })),
      measurer,
    );
    calibrated = cal;
    composed = cal.map((c) => ({ slot: c.slot, layout: c.layout }));
  } else {
    composed = composeSlots(assigned.map(({ slot, media: m }) => ({ slot, source: m })));
    calibrated = composed.map(() => null);
  }

  const entries = composed.map(({ slot, layout }, i) => {
    const m = assigned[i].media as M;
    const text = captionOf(m);
    return {
      slot,
      media: m,
      layout: layout!,
      caption: measurer && text ? layoutCaption(slot, layout!, text, measurer, obstaclesAbove(composed, slot)) : null,
      calibration: calibrated[i],
    };
  });
  return { stateId, mediaCount: media.length, entries, hasCta: stateId === "G6_SIGNATURE_7PLUS" };
}
