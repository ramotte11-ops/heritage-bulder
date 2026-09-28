import { A13_CTA_7PLUS, A13_STATE_SLOTS, type A13GalleryStateId } from "@/config/gallery-a13-multi-state-manifests";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { A13_V2_FIXTURES, A13_V2_MANIFESTS, type V2StateId } from "@/config/gallery-a13-v2-manifests";
import { fixtureSources, solveV2, type V2Result } from "@/lib/memorial/gallery/gallery-v2";
import { buildG6FamilyState } from "@/lib/memorial/gallery/gallery-state";
import { paperFor, type PhotoSource, type PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { measureComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import type { CaptionLayout, CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import type { GlyphMask, InkBounds } from "@/lib/memorial/gallery/title-glyph-mask";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * A13 Desktop Dark V1.1 — Light/Dark GEOMETRY PARITY (pilot gate).
 *
 * The parity contract (`parity-and-qa.v1.1.json`): for each fixture the
 * runtime captures the geometric snapshot BEFORE the theme is
 * materialised; Light and Dark snapshots must be strictly identical
 * (`BYTE_IDENTICAL_GEOMETRY_SNAPSHOT`), otherwise
 * `THEME_GEOMETRY_PARITY_STOP` — never corrected with a Dark coordinate.
 *
 * This module is theme-free by construction: it runs the UNCHANGED Light
 * V2.1 engine (`solveV2` for G2–G5, `buildG6FamilyState` — closed V2.1
 * composition — for G6 exact and Signature 7+) and serialises its output.
 * It never imports a Dark token: the only theme-dependent things a pipeline
 * can feed it are the ones a browser measures (caption font metrics, title
 * glyph mask), and the pilot measures those in each theme independently.
 *
 * Minimal matrix: 6 states × 3 ratio sets × 2 caption states = 36 pairs.
 */

export const PARITY_STATES = ["G2", "G3", "G4", "G5", "G6", "G6_SIGNATURE_7PLUS"] as const satisfies readonly A13GalleryStateId[];
export const PARITY_RATIO_SETS = ["master-like", "mixed-natural", "extremes"] as const;
export const PARITY_CAPTIONS = ["none", "32-chars-two-lines"] as const;
export type ParityState = (typeof PARITY_STATES)[number];
export type ParityRatioSet = (typeof PARITY_RATIO_SETS)[number] | "reference-green";
export type ParityCaptions = (typeof PARITY_CAPTIONS)[number] | "pool-32";

/** The V2 fixture matrix's 32-character caption (`maximum-32`). */
export const PARITY_CAPTION_32 = "MAMAN ET MAMIE, À MIMIZAN, 1966.";

export interface ParityMedia extends PhotoSource {
  mediaId: string;
  /** A V2 fixture ratio id, `master:<slotId>` (Master window ratio) or
   * `pool:<i>` (GREEN reference media of the multi-state pool). */
  ratioId: string;
  focal: { x: number; y: number } | null;
}

export interface ParityFixture {
  id: string;
  state: ParityState;
  ratioSet: ParityRatioSet;
  captions: ParityCaptions;
  media: ParityMedia[];
  captionTexts: (string | null)[];
  locale: "fr";
  viewport: { width: 1670; height: 941 };
}

const isV2 = (s: ParityState): s is V2StateId => s === "G2" || s === "G3" || s === "G4" || s === "G5";

/** Master window ratio of a closed G6 / 7+ slot (same formula as V2's
 * `masterMediaRatio`: reference paper minus margins and bottom band). */
function referenceWindowRatio(s: A13Slot): number {
  const { width: W, height: H } = s.referenceSize;
  const p = paperFor(W, H, s.bottomBandOverridePx);
  return (W - 2 * p.margin) / (H - p.margin - p.bottomBand);
}

function mediaFor(state: ParityState, ratioSet: ParityRatioSet): ParityMedia[] {
  if (ratioSet === "reference-green") {
    const n = state === "G6_SIGNATURE_7PLUS" ? 7 : 6;
    return A13_PILOT_MEDIA_POOL.slice(0, n).map((m, i) => ({ mediaId: `${ratioSet}#${i}:pool:${i}`, ratioId: `pool:${i}`, width: m.width, height: m.height, focal: m.focal ?? null }));
  }
  if (isV2(state)) {
    const m = A13_V2_MANIFESTS[state];
    const srcs = fixtureSources(state, ratioSet);
    const cycle = A13_V2_FIXTURES.assignments.find((a) => a.id === ratioSet)!.cycle;
    return srcs.map((s, i) => {
      const ratioId = cycle ? cycle[i % cycle.length] : `master:${m.slots[i].slotId}`;
      return { mediaId: `${ratioSet}#${i}:${ratioId}`, ratioId, width: s.width, height: s.height, focal: null };
    });
  }
  const slots = A13_STATE_SLOTS[state];
  // ≥ 7 media select the Signature state: six shown, the 7th exists.
  const count = state === "G6_SIGNATURE_7PLUS" ? 7 : 6;
  const cycle = A13_V2_FIXTURES.assignments.find((a) => a.id === ratioSet)!.cycle;
  return Array.from({ length: count }, (_, i) => {
    const ratioId = cycle ? cycle[i % cycle.length] : i < slots.length ? `master:${slots[i].slotId}` : "landscape";
    const r = ratioId.startsWith("master:") ? referenceWindowRatio(slots[i]) : A13_V2_FIXTURES.ratios[ratioId as keyof typeof A13_V2_FIXTURES.ratios];
    return { mediaId: `${ratioSet}#${i}:${ratioId}`, ratioId, width: r * 1000, height: 1000, focal: null };
  });
}

/**
 * Supplementary pairs (NOT part of the 36): G6 exact and Signature 7+ on
 * their GREEN reference media (`A13_PILOT_MEDIA_POOL`, the Light multi-state
 * board's own media), without captions and with the pool's own 32-char
 * captions.
 */
export function supplementaryParityFixtures(): ParityFixture[] {
  return (["G6", "G6_SIGNATURE_7PLUS"] as const).flatMap((state) =>
    (["none", "pool-32"] as const).map((captions) => {
      const media = mediaFor(state, "reference-green");
      return {
        id: `${state}:reference-green:${captions}`,
        state,
        ratioSet: "reference-green" as const,
        captions,
        media,
        captionTexts: media.map((_, i) => (captions === "none" ? null : A13_PILOT_MEDIA_POOL[i].captions["32"])),
        locale: "fr" as const,
        viewport: { width: 1670 as const, height: 941 as const },
      };
    }),
  );
}

/** The 36 fixtures, in state → ratio set → caption order. */
export function parityFixtures(): ParityFixture[] {
  return PARITY_STATES.flatMap((state) =>
    PARITY_RATIO_SETS.flatMap((ratioSet) =>
      PARITY_CAPTIONS.map((captions) => {
        const media = mediaFor(state, ratioSet);
        return {
          id: `${state}:${ratioSet}:${captions}`,
          state,
          ratioSet,
          captions,
          media,
          captionTexts: media.map(() => (captions === "none" ? null : PARITY_CAPTION_32)),
          locale: "fr" as const,
          viewport: { width: 1670 as const, height: 941 as const },
        };
      }),
    ),
  );
}

export interface EngineEntry {
  slot: A13Slot;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  media: ParityMedia;
}

export interface EngineRun {
  fixture: ParityFixture;
  stateId: ParityState;
  status: string;
  entries: EngineEntry[];
  hasCta: boolean;
  v2: V2Result | null;
}

/**
 * Runs the Light V2.1 engine ONCE for a fixture — exactly the calls the
 * Desktop runtime makes (`runDesktopGallery`: `solveV2` for G2–G5,
 * `buildG6FamilyState` for G6 / Signature 7+). No theme argument exists.
 */
export function runLightEngine(fx: ParityFixture, measurer: CaptionMeasurer | null, titleMask: GlyphMask): EngineRun {
  if (isV2(fx.state)) {
    const v2 = solveV2({ state: fx.state, sources: fx.media, captions: fx.captionTexts, measurer, titleMask });
    return {
      fixture: fx,
      stateId: fx.state,
      status: v2.status,
      entries: v2.slots.map((s, i) => ({ slot: s.slot, layout: s.layout, caption: s.caption, media: fx.media[i] })),
      hasCta: false,
      v2,
    };
  }
  const texts = new Map(fx.media.map((m, i) => [m.mediaId, fx.captionTexts[i]]));
  const gs = buildG6FamilyState(fx.media, (m) => texts.get(m.mediaId) ?? null, measurer);
  const unresolved = gs.entries.filter((e) => e.caption?.status === "CAPTION_COLLISION_UNRESOLVED").map((e) => e.slot.slotId);
  return {
    fixture: fx,
    stateId: gs.stateId as ParityState,
    status: unresolved.length ? `CAPTION_COLLISION_UNRESOLVED_STOP(${unresolved.join(",")})` : "PASS",
    entries: gs.entries.map((e) => ({ slot: e.slot, layout: e.layout, caption: e.caption, media: e.media })),
    hasCta: gs.hasCta,
    v2: null,
  };
}

/** Deterministic digest of a glyph mask (FNV-1a over its rows). */
export function maskDigest(mask: GlyphMask): string {
  let h = 0x811c9dc5;
  const s = JSON.stringify([mask.y0, mask.rows]);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}/${s.length}`;
}

export interface TitleGlyphInput {
  heading: InkBounds;
  microcopy: InkBounds;
  mask: GlyphMask;
}

/**
 * The geometry snapshot of one engine run (contract `snapshotFields`),
 * captured before any theme is applied. Full-precision numbers: the
 * comparison is on the serialised bytes.
 */
export function geometrySnapshot(run: EngineRun, title: TitleGlyphInput) {
  const v2 = run.v2;
  const comp = v2 ? null : measureComposition(run.entries);
  return {
    fixture: {
      id: run.fixture.id,
      state: run.fixture.state,
      mediaIds: run.fixture.media.map((m) => m.mediaId),
      intrinsicRatios: run.fixture.media.map((m) => m.width / m.height),
      focalPoints: run.fixture.media.map((m) => m.focal),
      captions: run.fixture.captionTexts,
      locale: run.fixture.locale,
      viewport: run.fixture.viewport,
    },
    selectedState: run.stateId,
    slotIds: run.entries.map((e) => e.slot.slotId),
    mediaIndexBySlot: Object.fromEntries(run.entries.map((e) => [e.slot.slotId, e.slot.mediaIndex])),
    slots: run.entries.map((e, i) => {
      const r = v2?.slots[i];
      const c = e.caption;
      return {
        slotId: e.slot.slotId,
        mediaId: e.media.mediaId,
        centerX: e.slot.center.x,
        centerY: e.slot.center.y,
        outerX: e.layout.outer.x,
        outerY: e.layout.outer.y,
        outerWidth: e.layout.outer.width,
        outerHeight: e.layout.outer.height,
        photoWindowX: e.layout.window.x,
        photoWindowY: e.layout.window.y,
        photoWindowWidth: e.layout.window.width,
        photoWindowHeight: e.layout.window.height,
        photo: e.layout.photo,
        band: e.layout.band,
        scale: r ? r.scale : Math.sqrt(e.layout.areaFactor),
        areaFactor: e.layout.areaFactor,
        rotationDeg: e.slot.rotationDeg,
        zIndex: e.slot.zIndex,
        containOrCropDecision: {
          mode: e.layout.mode,
          mediaClass: e.layout.mediaClass,
          mediaRatio: e.layout.mediaRatio,
          windowRatio: e.layout.windowRatio,
          visibleFraction: e.layout.visibleFraction,
        },
        captionGlyphBounds: c
          ? {
              status: c.status,
              shiftX: c.shiftX,
              lines: c.lines.map((l) => ({ text: l.text, x: l.x, baseline: l.baseline, metrics: l.metrics })),
              ink: c.ink,
              protectedBox: c.protectedBox,
              exceedsUsefulWidth: c.exceedsUsefulWidth,
            }
          : null,
        occlusionDecisions: r
          ? {
              visiblePhoto: r.visiblePhoto,
              visibleOuter: r.visibleOuter,
              captionVisibleInk: r.captionVisibleInk,
              minima: r.minima,
              hitTarget: r.hitTarget,
              captionCollidingWith: c?.collidingWith ?? null,
              captionCollisionAreaPx2: c?.collisionAreaPx2 ?? null,
            }
          : {
              photoOccludedFraction: comp!.slots[i].photoOccludedFraction,
              photoOccludedBy: comp!.slots[i].photoOccludedBy,
              captionCollidingWith: c?.collidingWith ?? null,
              captionCollisionAreaPx2: c?.collisionAreaPx2 ?? null,
            },
      };
    }),
    titleGlyphBounds: { heading: title.heading, microcopy: title.microcopy, maskBounds: title.mask.bounds, maskDigest: maskDigest(title.mask) },
    solverCandidateId: v2
      ? v2.status === "PASS"
        ? `${v2.search ?? "best-first"}#${v2.jointCandidates}|${v2.slots.map((s) => `${s.slotId}@s${s.scale}:d${s.translation.x},${s.translation.y}`).join("|")}`
        : `STOP#${v2.jointCandidates}`
      : `${run.stateId}:closed-V2.1-composition`,
    solverStopCode: v2 ? (v2.status === "PASS" ? null : v2.status) : run.status === "PASS" ? null : run.status,
    solverStopDetail: v2?.stop ?? null,
    signals: v2?.signals ?? [],
    cta: run.hasCta ? { contractId: A13_CTA_7PLUS.contractId, geometry: A13_CTA_7PLUS.geometry, zIndex: A13_CTA_7PLUS.zIndex } : null,
  };
}

export type GeometrySnapshot = ReturnType<typeof geometrySnapshot>;

/** Serialised bytes compared by the gate. */
export function snapshotBytes(s: unknown): string {
  return JSON.stringify(s);
}

/** First differing JSON path between two values (null when identical). */
export function firstDifference(a: unknown, b: unknown, path = "$"): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object`;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.join("\u0000") !== kb.join("\u0000")) return `${path}: keys ${ka.join(",")} ≠ ${kb.join(",")}`;
  for (const k of ka) {
    const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}
