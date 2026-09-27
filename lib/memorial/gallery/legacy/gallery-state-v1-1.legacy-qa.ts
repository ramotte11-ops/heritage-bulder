import { A13_STATE_SLOTS, selectGalleryState, type A13GalleryStateId } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { isCalibratedState } from "@/config/gallery-a13-calibration-v1-1";
import { assignMediaToSlots, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { composeSlots, obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { calibrateState, type CalibratedSlot } from "@/lib/memorial/gallery/manifest-calibration";

/**
 * ⚠ LEGACY / QA ONLY — NOT A RUNTIME API (dette D6, fermée).
 *
 * The multi-state builder of the Desktop Light MULTI-STATE V1 era, kept
 * verbatim for the historical QA harnesses that document it (`/pilot/
 * a13-dynamic-polaroid` PilotQa, `/etats` StatesBoard, `/matrice` via the
 * V1.1 calibration matrix) and for their tests. Its G2–G5 branch (V1
 * manifests + V1.1 calibration) is SUPERSEDED: the only G2–G5 authority is
 * the V2 runtime (`solveV2`, simplified manifests V2 + patch V2.1), reached
 * through `runDesktopGallery`. G6 exact and Signature 7+ are the closed
 * V2.1 composition (`buildG6FamilyState`, the runtime one).
 *
 * Import guard: `gallery-authority.test.ts` fails if any module outside
 * `lib/memorial/gallery/legacy/`, the listed QA harnesses or tests imports
 * this file or the V1.1 calibration engine.
 */

export interface LegacyGalleryStateEntry<M> {
  slot: A13Slot;
  media: M;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  /** V1.1 calibration result (G2–G5 only). */
  calibration: CalibratedSlot | null;
}

export interface LegacyGalleryState<M> {
  stateId: A13GalleryStateId;
  mediaCount: number;
  entries: LegacyGalleryStateEntry<M>[];
  hasCta: boolean;
}

export function buildLegacyV11GalleryStateQa<M extends PhotoSource>(
  media: readonly M[],
  captionOf: (m: M) => string | null,
  measurer: CaptionMeasurer | null,
): LegacyGalleryState<M> | null {
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
