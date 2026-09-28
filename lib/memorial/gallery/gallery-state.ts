import { A13_STATE_SLOTS, selectGalleryState } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import { assignMediaToSlots, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { composeSlots, obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";

/**
 * A13 Gallery — G6 exact and G6 Signature 7+: the closed V2.1 composition
 * (GREEN), and ONLY these two states.
 *
 * One authority per state (dette D6, fermée):
 * - G2…G5 → V2 runtime (`solveV2`, simplified manifests V2 + patch V2.1);
 * - G6 exact (6 media) and Signature 7+ (≥ 7) → this module;
 * - the functional entry point that dispatches on the media count is
 *   `runDesktopGallery` (`gallery-desktop-runtime.ts`).
 * This builder refuses 0–5 media: it can never produce a G2–G5 layout. The
 * superseded V1-manifest / V1.1-calibration builder survives only as
 * `legacy/gallery-state-v1-1.legacy-qa.ts`, for the historical QA
 * harnesses (import-guarded by `gallery-authority.test.ts`).
 *
 * Composition: the state's closed manifest, filled strictly
 * `media[i] → slot[i]` (Signature shows media[0…5] and carries the CTA),
 * laid out by the unchanged V2.1 engine; captions last, by the unchanged
 * V2.1 caption engine.
 */

export type G6FamilyStateId = "G6" | "G6_SIGNATURE_7PLUS";

export interface G6FamilyEntry<M> {
  slot: A13Slot;
  media: M;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
}

export interface G6FamilyState<M> {
  stateId: G6FamilyStateId;
  mediaCount: number;
  entries: G6FamilyEntry<M>[];
  hasCta: boolean;
}

export function buildG6FamilyState<M extends PhotoSource>(
  media: readonly M[],
  captionOf: (m: M) => string | null,
  measurer: CaptionMeasurer | null,
): G6FamilyState<M> {
  const stateId = selectGalleryState(media.length);
  if (stateId !== "G6" && stateId !== "G6_SIGNATURE_7PLUS") {
    throw new Error(
      `buildG6FamilyState: ${media.length} media → ${stateId ?? "no gallery"}. Only G6 exact / Signature 7+ are composed here; G2–G5 belong to the V2 runtime — use runDesktopGallery.`,
    );
  }
  const assigned = assignMediaToSlots(A13_STATE_SLOTS[stateId], media);
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
