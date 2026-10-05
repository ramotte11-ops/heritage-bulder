import { selectGalleryState, type A13GalleryStateId } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import { solveV2, type V2Stop } from "@/lib/memorial/gallery/gallery-v2";
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
 *
 * STOP policy (dette D7): three outcomes, never confused —
 * - `absent`: 0–1 media, no Gallery by product contract;
 * - `resolved`: a GREEN composition (V2 PASS, or G6 / 7+);
 * - `unresolved`: the V2 runtime returned a STOP (or threw) for G2–G5. No
 *   other engine is tried — never the legacy V1/V1.1 builder, never an
 *   approximate composition, never fewer media: `entries` is empty, there
 *   is no CTA, and `anomaly` carries the typed code, rule and detail (the
 *   technical detail is for logs, never for the public UI). What a visitor
 *   sees in that case is the product host's decision (`A13DesktopGallery`
 *   renders no Gallery and reports it).
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

export type DesktopGalleryOutcome = "absent" | "resolved" | "unresolved";

/** Why a G2–G5 composition is unresolved: a V2 STOP, or the solver threw. */
export interface DesktopGalleryAnomaly {
  code: V2Stop | "V2_SOLVER_EXCEPTION";
  rule: string;
  detail: string;
}

export interface DesktopGalleryRun<M> {
  /** Selected state (kept when unresolved: the G2–G5 state that failed). */
  stateId: A13GalleryStateId | null;
  outcome: DesktopGalleryOutcome;
  /** "PASS", "GALLERY_ABSENT", a V2 STOP code, "V2_SOLVER_EXCEPTION", or a caption STOP (G6 / 7+, composition resolved). */
  status: string;
  /** Set only when `outcome` is "unresolved". */
  anomaly: DesktopGalleryAnomaly | null;
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
  if (!stateId) return { stateId: null, outcome: "absent", status: "GALLERY_ABSENT", anomaly: null, mediaCount: media.length, entries: [], hasCta: false };
  if (stateId === "G2" || stateId === "G3" || stateId === "G4" || stateId === "G5") {
    const unresolved = (anomaly: DesktopGalleryAnomaly): DesktopGalleryRun<M> => ({ stateId, outcome: "unresolved", status: anomaly.code, anomaly, mediaCount: media.length, entries: [], hasCta: false });
    let v2: ReturnType<typeof solveV2>;
    try {
      v2 = solveV2({ state: stateId, sources: [...media], captions: media.map((m, i) => captionOf(m, i)), measurer, titleMask });
    } catch (error) {
      return unresolved({ code: "V2_SOLVER_EXCEPTION", rule: "exception", detail: error instanceof Error ? error.message : String(error) });
    }
    if (v2.status !== "PASS") return unresolved({ code: v2.status, rule: v2.stop?.rule ?? "unknown", detail: v2.stop?.detail ?? "" });
    return {
      stateId,
      outcome: "resolved",
      status: v2.status,
      anomaly: null,
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
    outcome: "resolved",
    anomaly: null,
    status: unresolved.length ? `CAPTION_COLLISION_UNRESOLVED_STOP(${unresolved.join(",")})` : "PASS",
    mediaCount: media.length,
    entries: gs.entries.map((e) => ({ slot: e.slot, layout: e.layout, caption: e.caption, media: media[e.media.i], mediaIndex: e.media.i })),
    hasCta: gs.hasCta,
  };
}
