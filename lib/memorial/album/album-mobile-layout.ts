import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import type { V2Anchor, V2Slot } from "@/config/gallery-a13-v2-manifests";
import {
  A13_ALBUM_MOBILE_CAPTION as CAP,
  A13_ALBUM_MOBILE_DOMINANT_SLOT,
  A13_ALBUM_MOBILE_EXCEPTION_RATIO_TOLERANCE,
  A13_ALBUM_MOBILE_MINIMUM_EXCEPTIONS,
  A13_ALBUM_MOBILE_FRAME as FRAME,
  A13_ALBUM_MOBILE_GRAMMARS,
  A13_ALBUM_MOBILE_MATERIALS as MAT,
  A13_ALBUM_MOBILE_MINIMUMS as MIN,
  A13_ALBUM_MOBILE_PAPER,
  A13_ALBUM_MOBILE_PREFERRED_SCALE,
  A13_ALBUM_MOBILE_PROFILE_SCALE as S375,
  A13_ALBUM_MOBILE_SAFE_INSET,
  A13_ALBUM_MOBILE_SHADOW_OVERFLOW_CSS,
  A13_ALBUM_MOBILE_TERRITORY as TER,
  A13_ALBUM_MOBILE_WITNESS,
  profilePx,
  type AlbumMobileSlotId,
  type AlbumMobileStop,
} from "@/config/album-a13-mobile-light";
import type { PaperProfile, PhotoSource, PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { breakCaption, layoutCaption, type CaptionLayout, type CaptionMeasurer, type CaptionProfile } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { largestVisibleSquare } from "@/lib/memorial/gallery/gallery-v2";
import { unionCoverArea } from "@/lib/memorial/gallery/manifest-calibration";
import { SHARED_MEASURER_FONT_PX, scaleMeasurer } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { partitionAlbumMobile, type AlbumMobileGroupGrammar, type AlbumMobileGroupSpec } from "@/lib/memorial/album/album-partition";
import { GroupSession, shapeAt, visibleFraction, type AlbumSolverProfile, type GroupShape, type HardPrint } from "@/lib/memorial/album/album-group-solver";

/**
 * A13 Full Album MOBILE LIGHT — the Mobile profile of the shared Album
 * engine (Handoff V1.1). Pure, theme-free, viewport-free geometry.
 *
 * 1. Partition (`partitionAlbumMobile`): TOP3, PAIR_A / PAIR_B alternating,
 *    a final CLOSURE3 for an odd remainder; strict family order.
 * 2. Each group is solved LOCALLY by the shared `GroupSession` (same
 *    candidate streams, same best-first, same repair) with the Mobile
 *    profile — 1024 frame, territory ±42 / ±34 source px and scale
 *    0.92…1.06 around its witness, papers inside x 24…1000 — and with the
 *    PRECEDING group as context (its prints must stay identifiable and
 *    reachable under the incoming group): nothing global, no random.
 * 3. Hard rules, 375 profile: visible photo ≥ 0.28, visible paper ≥ 1936
 *    CSS px², a 44 × 44 CSS px visible square, dominant (P1) short side
 *    ≥ 96 CSS px, secondary short side ≥ 72 CSS px — V1.2: P3 with a 9:16
 *    media ≥ 69 CSS px, the only exception. A minimum no scale of the
 *    territory can reach is a STOP (ITEM_INACCESSIBLE): no fallback.
 * 4. The geometry is solved once in source px; a viewport only applies
 *    s = W / 1024 (proportional at 390 / 430). The media count never
 *    enters a scale.
 * 5. Captions (per viewport, 11 / 13 CSS px): the band grows DOWNWARD to
 *    22 (one line) or 34 (two lines) CSS px; the photo window and every
 *    position are unchanged; an occluded caption is a PASS.
 * 6. Page height = the lowest real paper edge (shadows excluded) + 164
 *    source px; materials: TOP once, BODY stacked with crossfades.
 */

export interface AlbumMobileMedia extends PhotoSource {
  mediaId: string;
  caption: string | null;
}

/** The Mobile Album print paper (source px): 12.5 margins, 14 CSS px thin band (375 profile). */
export const ALBUM_MOBILE_THIN_BAND = profilePx(A13_ALBUM_MOBILE_PAPER.thinBandCssAt375);
export const ALBUM_MOBILE_PAPER: PaperProfile = {
  photoSidePadding: { percent: 0, minPx: A13_ALBUM_MOBILE_PAPER.sideTopSourcePx, maxPx: A13_ALBUM_MOBILE_PAPER.sideTopSourcePx },
  bottomBand: { heightFactor: 0, minPx: ALBUM_MOBILE_THIN_BAND, maxPx: ALBUM_MOBILE_THIN_BAND },
};

/** Source-px thresholds of the 375 profile. */
export const ALBUM_MOBILE_HARD = {
  dominantShortSide: profilePx(MIN.dominantOuterPaperShortSideCssPx),
  secondaryShortSide: profilePx(MIN.secondaryOuterPaperShortSideCssPxAt375),
  hitTarget: profilePx(MIN.minTouchTargetCssPx),
  visibleArea: MIN.clickableVisibleAreaCssPx2 / S375 ** 2,
  visiblePhoto: MIN.identifiableVisiblePhotoFraction,
  safeX: [A13_ALBUM_MOBILE_SAFE_INSET, FRAME.width - A13_ALBUM_MOBILE_SAFE_INSET] as const,
} as const;

// ── Group placement ─────────────────────────────────────────────────────

const ADV_A = A13_ALBUM_MOBILE_GRAMMARS.PAIR_A.advanceRefPx!;
const ADV_B = A13_ALBUM_MOBILE_GRAMMARS.PAIR_B.advanceRefPx!;
/** CLOSURE3's witnesses sit at the Master's third body position (after PAIR_A + PAIR_B). */
const CLOSURE_MASTER_BODY_OFFSET = ADV_A + ADV_B;

/**
 * Vertical offset (source px) of a group's witnesses from their Master
 * position: TOP3 and the first PAIR_A / PAIR_B at 0, then the deterministic
 * advances (226 after a PAIR_A, 220 after a PAIR_B).
 */
export function albumMobileGroupOffset(spec: Pick<AlbumMobileGroupSpec, "grammar" | "bodyIndex">): number {
  if (spec.grammar === "TOP3") return 0;
  const j = spec.bodyIndex!;
  let before = 0;
  for (let i = 0; i < j; i++) before += i % 2 === 0 ? ADV_A : ADV_B;
  if (spec.grammar === "CLOSURE3") return before - CLOSURE_MASTER_BODY_OFFSET;
  return before - (spec.grammar === "PAIR_B" ? ADV_A : 0);
}

/** Paint order: a later group above an earlier one; zRank inside a group. */
export const albumMobileZ = (groupIndex: number, zRank: number) => groupIndex * 10 + zRank;

export function albumMobileGroupSlots(spec: AlbumMobileGroupSpec): V2Slot[] {
  const dy = albumMobileGroupOffset(spec);
  return A13_ALBUM_MOBILE_GRAMMARS[spec.grammar].slots.map((id, i) => {
    const w = A13_ALBUM_MOBILE_WITNESS[id];
    return {
      slotId: `g${spec.index}-${id}`,
      mediaIndex: i,
      role: id === A13_ALBUM_MOBILE_DOMINANT_SLOT ? "dominant" : "secondary",
      witness: {
        center: { x: w.center.x, y: w.center.y + dy },
        outerSize: w.outerReference,
        outerArea: w.outerReference.width * w.outerReference.height,
        rotationDeg: w.rotationDeg,
      },
      territory: { xMin: TER.centerDxRefPx[0], xMax: TER.centerDxRefPx[1], yMin: TER.centerDyRefPx[0], yMax: TER.centerDyRefPx[1] },
      scaleBounds: { preferred: [A13_ALBUM_MOBILE_PREFERRED_SCALE, A13_ALBUM_MOBILE_PREFERRED_SCALE], hard: [TER.scale[0], TER.scale[1]] },
      // The engine's centre anchor (A13Anchor "center"): the paper stays centred on the slot.
      anchor: "center" as V2Anchor,
      zIndex: albumMobileZ(spec.index, w.zRank),
    };
  });
}

const shortSide = (sh: GroupShape) => Math.min(sh.layout.outer.width, sh.layout.outer.height);
const slotOf = (v: V2Slot) => v.slotId.split("-").pop() as AlbumMobileSlotId;

/**
 * Paper short-side minimum of a print, CSS px of the 375 profile: dominant
 * 96, secondary 72, and the V1.2 targeted exception (P3 + a 9:16 media:
 * 69). Never generalised: any other slot or ratio keeps 72.
 */
export function albumMobileMinimumCss375(slot: AlbumMobileSlotId, role: "dominant" | "secondary", mediaRatio: number): number {
  if (role === "dominant") return MIN.dominantOuterPaperShortSideCssPx;
  const ex = A13_ALBUM_MOBILE_MINIMUM_EXCEPTIONS.find((e) => e.slotId === slot && Math.abs(mediaRatio / e.mediaRatio - 1) <= A13_ALBUM_MOBILE_EXCEPTION_RATIO_TOLERANCE);
  return ex ? ex.outerPaperShortSideMinimumCssPx : MIN.secondaryOuterPaperShortSideCssPxAt375;
}

interface SizeRule {
  /** Required short side, source px (375 profile). Out of reach → no candidate → STOP. */
  required: number;
}

function sizeRules(slots: V2Slot[], sources: readonly PhotoSource[]): SizeRule[] {
  return slots.map((v, i) => ({ required: profilePx(albumMobileMinimumCss375(slotOf(v), v.role as "dominant" | "secondary", sources[i].width / sources[i].height)) }));
}

function mobileProfile(rules: SizeRule[]): AlbumSolverProfile {
  return {
    id: "mobile-light",
    paper: ALBUM_MOBILE_PAPER,
    safeX: ALBUM_MOBILE_HARD.safeX,
    firstGroupMinY: 0,
    firstGroupZone: null,
    hitTargetPx: ALBUM_MOBILE_HARD.hitTarget,
    minVisibleOuterArea: ALBUM_MOBILE_HARD.visibleArea,
    minima: (slots) => slots.map(() => ({ photo: ALBUM_MOBILE_HARD.visiblePhoto, outer: 0 })),
    shapeAllowed: (i, sh) => shortSide(sh) >= rules[i].required - 1e-9,
  };
}

// ── Geometry (caption-free, viewport-free) ──────────────────────────────

export interface AlbumMobilePrint {
  mediaId: string;
  mediaIndex: number;
  groupIndex: number;
  localIndex: number;
  grammar: AlbumMobileGroupGrammar;
  witnessSlot: AlbumMobileSlotId;
  role: "dominant" | "secondary";
  /** Engine slot, PAGE frame (source px); zIndex = paint order. */
  slot: A13Slot;
  /** Caption-free paper (thin band). */
  layout: PolaroidLayout;
  scale: number;
  translation: Point;
  outer: Point[];
  photo: Point[];
  /** Paper short side at the 375 profile (CSS px), the role minimum, reached or not. */
  shortSideCss375: number;
  minimumCss375: number;
  minimumReached: boolean;
}

export interface AlbumMobileGroup {
  index: number;
  grammar: AlbumMobileGroupGrammar;
  start: number;
  size: number;
  offsetY: number;
  status: "PASS" | "ITEM_INACCESSIBLE";
  detail: string | null;
  visualTop: number;
  visualBottom: number;
  stats: { candidateRank: number; evaluated: number; repaired: boolean; ms: number };
}

export interface AlbumMobileGeometry {
  profile: "mobile-light";
  frame: typeof FRAME;
  count: number;
  groups: AlbumMobileGroup[];
  prints: AlbumMobilePrint[];
  /** Lowest caption-free paper edge (source px). */
  contentBottom: number;
  status: "PASS" | "ALBUM_ABSENT" | "ITEM_INACCESSIBLE";
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function solveAlbumMobileGeometry(media: readonly AlbumMobileMedia[]): AlbumMobileGeometry {
  const specs = partitionAlbumMobile(media.length);
  const base = { profile: "mobile-light" as const, frame: FRAME, count: media.length };
  if (!specs.length) return { ...base, groups: [], prints: [], contentBottom: 0, status: "ALBUM_ABSENT" };
  const groups: AlbumMobileGroup[] = [];
  const prints: AlbumMobilePrint[] = [];
  let context: HardPrint[] = [];
  for (const spec of specs) {
    const t0 = now();
    const slots = albumMobileGroupSlots(spec);
    const src = media.slice(spec.start, spec.start + spec.size);
    const rules = sizeRules(slots, src);
    const session = new GroupSession({ slots }, src, spec.index === 0, { profile: mobileProfile(rules), context });
    const cand = session.structuralStop ? null : session.candidate(0);
    let status: AlbumMobileGroup["status"] = "PASS";
    let detail: string | null = null;
    if (!cand) {
      status = "ITEM_INACCESSIBLE";
      const f = session.bestFailure?.[0];
      detail = session.structuralStop ?? `aucune solution locale (${session.evaluated} candidats)${f ? ` — ${f.slotId} ${f.rule} ${f.value.toFixed(3)} < ${f.minimum.toFixed(3)}` : ""}`;
    }
    const use = cand ?? session.fallback();
    const groupPrints = use.placements.map((p, i): AlbumMobilePrint => {
      const v = slots[i];
      const mediaIndex = spec.start + i;
      const ss = shortSide(p.shape);
      return {
        mediaId: media[mediaIndex].mediaId,
        mediaIndex,
        groupIndex: spec.index,
        localIndex: i,
        grammar: spec.grammar,
        witnessSlot: slotOf(v),
        role: v.role as "dominant" | "secondary",
        slot: { ...p.shape.slot, slotId: v.slotId, mediaIndex, center: { x: v.witness.center.x + p.d.x, y: v.witness.center.y + p.d.y }, zIndex: v.zIndex },
        layout: p.shape.layout,
        scale: p.shape.s,
        translation: p.d,
        outer: p.outer,
        photo: p.photo,
        shortSideCss375: ss * S375,
        minimumCss375: rules[i].required * S375,
        minimumReached: ss >= rules[i].required - 1e-6,
      };
    });
    prints.push(...groupPrints);
    context = groupPrints.map((p) => ({ id: p.slot.slotId, z: p.slot.zIndex, outer: p.outer, photo: p.photo, minima: { photo: ALBUM_MOBILE_HARD.visiblePhoto, outer: 0 } }));
    const ys = groupPrints.flatMap((p) => p.outer.map((q) => q.y));
    groups.push({
      index: spec.index,
      grammar: spec.grammar,
      start: spec.start,
      size: spec.size,
      offsetY: albumMobileGroupOffset(spec),
      status,
      detail,
      visualTop: Math.min(...ys),
      visualBottom: Math.max(...ys),
      stats: { candidateRank: use.rank, evaluated: session.evaluated + session.repairEvaluated, repaired: session.repaired, ms: now() - t0 },
    });
  }
  const contentBottom = Math.max(...prints.flatMap((p) => p.outer.map((q) => q.y)));
  return { ...base, groups, prints, contentBottom, status: groups.some((g) => g.status !== "PASS") ? "ITEM_INACCESSIBLE" : "PASS" };
}

// ── Captions (per viewport) ─────────────────────────────────────────────

export interface AlbumMobileCaptionedPrint extends AlbumMobilePrint {
  /** The paper as drawn: the thin band, or the band grown downward for the caption. */
  drawn: PolaroidLayout;
  /** Drawn outer paper polygon (page frame). */
  drawnOuter: Point[];
  caption: CaptionLayout | null;
  captionLines: 0 | 1 | 2;
  /** Band height as drawn (CSS px at this viewport). */
  bandCss: number;
}

export interface AlbumMaterialLayer {
  asset: "top" | "body";
  /** Top of the tile (source px); every tile is 1024 × 1536, never stretched. */
  y: number;
  height: number;
  /** Linear alpha 0 → 1 over its first `fadeIn` source px (crossfade with the layer below). */
  fadeIn: number;
}

export interface AlbumMobileLayout {
  geometry: AlbumMobileGeometry;
  stageWidth: number;
  /** CSS px per source px (= stageWidth / 1024, never a function of the count). */
  scale: number;
  prints: AlbumMobileCaptionedPrint[];
  /** Lowest real paper edge (caption bands included, shadows excluded), source px. */
  paperBottom: number;
  /** Page height (source px) = paperBottom + 164. */
  height: number;
  materials: AlbumMaterialLayer[];
  captionFontPx: number;
  status: AlbumMobileGeometry["status"];
}

export function albumMobileCaptionProfile(stageWidth: number, pageHeight: number): CaptionProfile {
  const s = stageWidth / FRAME.width;
  return {
    fontSizePx: CAP.fontSizeCssPx / s,
    lineHeight: CAP.lineHeightCssPx / CAP.fontSizeCssPx,
    safetyMarginPx: { x: CAP.paddingCssPx.inlineMin / s, y: CAP.paddingCssPx.topMin / s },
    shiftStepPx: 2 / s,
    maxShiftFactorOfBandWidth: 0.18,
    canvas: { width: FRAME.width, height: pageHeight },
    bandInsetPx: CAP.paddingCssPx.inlineMin / s,
  };
}

/** The caption-free paper grown DOWNWARD to a band of `bandPx` (window untouched). */
export function growBandDown(base: PolaroidLayout, bandPx: number): PolaroidLayout {
  const ext = bandPx - base.band.height;
  if (ext <= 1e-9) return base;
  const outer = { ...base.outer, height: base.outer.height + ext };
  return { ...base, outer, outerRatio: outer.width / outer.height, bottomBand: bandPx, band: { ...base.band, height: bandPx } };
}

export function albumMobileMaterialPlan(height: number, fades: { topBody: number; bodyBody: number } = { topBody: MAT.topBodyCrossfadeRefPx, bodyBody: MAT.bodyBodyCrossfadeRefPx }): AlbumMaterialLayer[] {
  const layers: AlbumMaterialLayer[] = [{ asset: "top", y: 0, height: MAT.top.height, fadeIn: 0 }];
  let end = MAT.top.height;
  while (end < height - 1e-9) {
    const fade = layers.length === 1 ? fades.topBody : fades.bodyBody;
    const y = end - fade;
    layers.push({ asset: "body", y, height: MAT.body.height, fadeIn: fade });
    end = y + MAT.body.height;
  }
  return layers;
}

export function layoutAlbumMobile(media: readonly AlbumMobileMedia[], measurer: CaptionMeasurer | null, stageWidth: number, geometry: AlbumMobileGeometry = solveAlbumMobileGeometry(media)): AlbumMobileLayout {
  const s = stageWidth / FRAME.width;
  const fontPx = CAP.fontSizeCssPx / s;
  const m = measurer ? scaleMeasurer(measurer, fontPx / SHARED_MEASURER_FONT_PX) : null;
  const inset = CAP.paddingCssPx.inlineMin / s;
  // 1 — the band of each print (line count only), grown downward.
  const drawn = geometry.prints.map((p) => {
    const text = media[p.mediaIndex].caption?.trim() || null;
    let lines: 0 | 1 | 2 = 0;
    if (text && m) lines = breakCaption(text, p.layout.band.width - 2 * inset, (t) => m.measure(t)).length >= 2 ? 2 : 1;
    const bandCss = lines === 0 ? p.layout.band.height * s : Math.max(p.layout.band.height * s, lines === 1 ? CAP.bandHeightCssPx.oneLine : CAP.bandHeightCssPx.twoLinesMax);
    const lay = growBandDown(p.layout, bandCss / s);
    return { p, text, lines, bandCss, lay, outer: slotRectToCanvas(p.slot, lay.outer) };
  });
  const paperBottom = drawn.length ? Math.max(...drawn.flatMap((d) => d.outer.map((q) => q.y))) : 0;
  const height = drawn.length ? paperBottom + MAT.endBreathingRefPx : 0;
  const profile = albumMobileCaptionProfile(stageWidth, height);
  // 2 — captions laid out against the papers painted above them (as drawn).
  const prints = drawn.map((d): AlbumMobileCaptionedPrint => {
    let caption: CaptionLayout | null = null;
    if (d.text && m) {
      const obstacles = drawn.filter((o) => o.p.slot.zIndex > d.p.slot.zIndex && convexIntersectionArea(d.outer, o.outer) > 1e-6).map((o) => ({ slotId: o.p.slot.slotId, polygon: o.outer }));
      caption = layoutCaption(d.p.slot, d.lay, d.text, m, obstacles, profile);
    }
    return { ...d.p, drawn: d.lay, drawnOuter: d.outer, caption, captionLines: d.lines, bandCss: d.bandCss };
  });
  return {
    geometry,
    stageWidth,
    scale: s,
    prints,
    paperBottom,
    height,
    materials: drawn.length ? albumMobileMaterialPlan(height) : [],
    captionFontPx: fontPx,
    status: geometry.status,
  };
}

// ── Contract verification (STOP conditions) ─────────────────────────────

export interface AlbumMobileFinding {
  stop: AlbumMobileStop;
  detail: string;
}

export interface AlbumMobileVerifyInput {
  media: readonly AlbumMobileMedia[];
  layout: AlbumMobileLayout;
  /** Group sizes as rendered (default: the layout's groups). */
  groupSizes?: number[];
  /** The canonical geometry to compare with (default: solved again, cold). */
  reference?: AlbumMobileGeometry;
  theme?: "light" | "dark";
}

function polyArea(p: Point[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return Math.abs(a) / 2;
}

/** Accessibility of every print under every higher paper (caption-free papers, 375 profile). */
export function albumMobileAccess(prints: readonly Pick<AlbumMobilePrint, "slot" | "outer" | "photo" | "mediaIndex">[], useOuter: (p: (typeof prints)[number]) => Point[] = (p) => p.outer) {
  return prints.map((p) => {
    const covers = prints.filter((o) => o.slot.zIndex > p.slot.zIndex && convexIntersectionArea(useOuter(p), useOuter(o)) > 1e-6).map(useOuter);
    const vo = covers.length ? visibleFraction(useOuter(p), covers) : 1;
    const hit = largestVisibleSquare(useOuter(p), covers, 0);
    return {
      mediaIndex: p.mediaIndex,
      visiblePhoto: covers.length ? visibleFraction(p.photo, covers) : 1,
      visibleAreaCss375: vo * polyArea(useOuter(p)) * S375 ** 2,
      hitSideCss375: hit.side * S375,
      /** Centre of the largest visible square (page frame, source px). */
      hitCenter: hit.center,
    };
  });
}

export function verifyAlbumMobile({ media, layout, groupSizes, reference, theme = "light" }: AlbumMobileVerifyInput): AlbumMobileFinding[] {
  const out: AlbumMobileFinding[] = [];
  const g = layout.geometry;
  // THEME / DESKTOP: Mobile Light profile, 1024 frame, Light only.
  if (theme !== "light" || g.profile !== "mobile-light" || g.frame.width !== 1024) out.push({ stop: "THEME_OR_DESKTOP_GEOMETRY_MUTATION", detail: `profil ${g.profile} / cadre ${g.frame.width} / thème ${theme}` });
  // ORDER: prints 0…n−1, ids in family order, contiguous groups.
  const order = layout.prints.map((p) => p.mediaIndex);
  if (order.length !== media.length || order.some((v, i) => v !== i) || layout.prints.some((p, i) => p.mediaId !== media[i].mediaId)) out.push({ stop: "MEDIA_ORDER_CHANGED", detail: `ordre ${order.slice(0, 12).join(",")}…` });
  // SINGLETON: every group ≥ 2, the canonical partition.
  const sizes = groupSizes ?? g.groups.map((x) => x.size);
  const canonical = partitionAlbumMobile(media.length).map((x) => x.size);
  if (sizes.some((x) => x < 2) || sizes.join(",") !== canonical.join(",")) out.push({ stop: "SINGLETON_GROUP", detail: `groupes ${sizes.join("+")} (canonique ${canonical.join("+")})` });
  // CROP / DISTORTION: the whole photo, at its own ratio, inside its window.
  for (const p of layout.prints) {
    const l = p.drawn;
    const r = media[p.mediaIndex].width / media[p.mediaIndex].height;
    if (Math.abs(l.photo.width / l.photo.height - r) > 1e-6 * r) out.push({ stop: "PHOTO_DISTORTION", detail: `media ${p.mediaIndex + 1} : ${(l.photo.width / l.photo.height).toFixed(4)} ≠ ${r.toFixed(4)}` });
    if (l.photo.x < -1e-6 || l.photo.y < -1e-6 || l.photo.x + l.photo.width > l.window.width + 1e-6 || l.photo.y + l.photo.height > l.window.height + 1e-6 || l.visibleFraction < 1) out.push({ stop: "DESTRUCTIVE_CROP", detail: `media ${p.mediaIndex + 1} : photo hors fenêtre` });
  }
  // GLOBAL SCALE: every print is its canonical local solution (no factor from the count); s = W / 1024.
  const ref = reference ?? solveAlbumMobileGeometry(media);
  if (Math.abs(layout.scale - layout.stageWidth / 1024) > 1e-12) out.push({ stop: "GLOBAL_SCALE_FROM_MEDIA_COUNT", detail: `échelle ${layout.scale} ≠ ${layout.stageWidth}/1024` });
  for (const p of layout.prints) {
    const q = ref.prints[p.mediaIndex];
    if (!q) continue;
    const ratio = (p.layout.outer.width * p.layout.outer.height) / (q.layout.outer.width * q.layout.outer.height);
    if (Math.abs(ratio - 1) > 1e-9 || Math.abs(p.slot.center.x - q.slot.center.x) > 1e-6 || Math.abs(p.slot.center.y - q.slot.center.y) > 1e-6) {
      out.push({ stop: "GLOBAL_SCALE_FROM_MEDIA_COUNT", detail: `media ${p.mediaIndex + 1} : aire × ${ratio.toFixed(4)}, centre (${p.slot.center.x.toFixed(1)}, ${p.slot.center.y.toFixed(1)}) ≠ solution locale` });
      break;
    }
  }
  // HORIZONTAL SCROLL: every paper inside the page (the shadow may pass by ≤ 6 CSS px).
  const xs = layout.prints.flatMap((p) => p.drawnOuter.map((q) => q.x));
  const allow = A13_ALBUM_MOBILE_SHADOW_OVERFLOW_CSS / layout.scale;
  if (xs.length && (Math.min(...xs) < -1e-6 || Math.max(...xs) > FRAME.width + 1e-6)) out.push({ stop: "HORIZONTAL_SCROLL", detail: `papier ${Math.min(...xs).toFixed(1)}…${Math.max(...xs).toFixed(1)} hors 0…1024 (ombre ≤ ${allow.toFixed(1)})` });
  // SIZE: the paper short side at the 375 profile (caption-free) never below its minimum — 96 / 72, or 69 for P3 + 9:16 (V1.2).
  for (const p of layout.prints) {
    const m = media[p.mediaIndex];
    const min = albumMobileMinimumCss375(p.witnessSlot, p.role, m.width / m.height);
    const ss = Math.min(p.layout.outer.width, p.layout.outer.height) * S375;
    if (ss < min - 1e-9) out.push({ stop: "ITEM_INACCESSIBLE", detail: `media ${p.mediaIndex + 1} (${p.witnessSlot}) : petit côté ${ss.toFixed(2)} px < minimum ${min} px (profil 375)` });
  }
  // ACCESS: every memory identifiable and reachable (caption-free papers — a caption never stops).
  const acc = albumMobileAccess(layout.prints);
  for (const a of acc) {
    if (a.visiblePhoto < MIN.identifiableVisiblePhotoFraction - 1e-9 || a.visibleAreaCss375 < MIN.clickableVisibleAreaCssPx2 - 1e-6 || a.hitSideCss375 < MIN.minTouchTargetCssPx - 1e-6)
      out.push({ stop: "ITEM_INACCESSIBLE", detail: `media ${a.mediaIndex + 1} : photo ${a.visiblePhoto.toFixed(3)}, aire ${a.visibleAreaCss375.toFixed(0)} px², cible ${a.hitSideCss375.toFixed(1)} px` });
  }
  if (g.status === "ITEM_INACCESSIBLE") out.push({ stop: "ITEM_INACCESSIBLE", detail: g.groups.find((x) => x.status !== "PASS")?.detail ?? "groupe" });
  // MATERIAL: TOP once at 0, BODY tiles unstretched, crossfades 112 then 64, the page covered.
  out.push(...verifyAlbumMobileMaterials(layout.materials, layout.height));
  return out;
}

export function verifyAlbumMobileMaterials(layers: readonly AlbumMaterialLayer[], height: number): AlbumMobileFinding[] {
  const out: AlbumMobileFinding[] = [];
  if (!layers.length) return out;
  const tops = layers.filter((l) => l.asset === "top");
  if (tops.length !== 1 || layers[0].asset !== "top" || layers[0].y !== 0) out.push({ stop: "VISIBLE_MATERIAL_SEAM", detail: `TOP ×${tops.length}` });
  for (let i = 1; i < layers.length; i++) {
    const l = layers[i];
    const prev = layers[i - 1];
    const fade = i === 1 ? MAT.topBodyCrossfadeRefPx : MAT.bodyBodyCrossfadeRefPx;
    const overlap = prev.y + prev.height - l.y;
    if (l.asset !== "body" || l.height !== MAT.body.height || Math.abs(l.fadeIn - fade) > 1e-9 || Math.abs(overlap - fade) > 1e-9)
      out.push({ stop: "VISIBLE_MATERIAL_SEAM", detail: `couche ${i} : fondu ${l.fadeIn}, recouvrement ${overlap} (attendu ${fade})` });
  }
  const last = layers[layers.length - 1];
  if (last.y + last.height < height - 1e-9) out.push({ stop: "VISIBLE_MATERIAL_SEAM", detail: `matière ${last.y + last.height} < page ${height}` });
  return out;
}

// ── Negative controls (QA only): each injection must raise its STOP ─────

export interface AlbumMobileNegativeResult {
  injection: string;
  expected: AlbumMobileStop;
  raised: AlbumMobileStop[];
  pass: boolean;
}

export function albumMobileNegativeControls(media: readonly AlbumMobileMedia[], layout: AlbumMobileLayout): AlbumMobileNegativeResult[] {
  const ref = layout.geometry;
  const run = (injection: string, expected: AlbumMobileStop, input: AlbumMobileVerifyInput): AlbumMobileNegativeResult => {
    const raised = [...new Set(verifyAlbumMobile({ reference: ref, ...input }).map((f) => f.stop))];
    return { injection, expected, raised, pass: raised.includes(expected) };
  };
  const res: AlbumMobileNegativeResult[] = [];
  // 1 — media permutation (two memories swapped).
  const perm = layout.prints.map((p) => ({ ...p }));
  [perm[1], perm[2]] = [{ ...perm[2], mediaIndex: 1 }, { ...perm[1], mediaIndex: 2 }];
  perm[1].mediaId = layout.prints[2].mediaId;
  perm[2].mediaId = layout.prints[1].mediaId;
  res.push(run("permutation média", "MEDIA_ORDER_CHANGED", { media, layout: { ...layout, prints: perm } }));
  // 2 — crop `cover`: the photo fills the window, overflowing it.
  const cover = layout.prints.map((p, i) => {
    if (i !== 0) return p;
    const w = p.drawn.window;
    const r = p.drawn.photo.width / p.drawn.photo.height;
    const k = Math.max(w.width / p.drawn.photo.width, w.height / p.drawn.photo.height) * 1.15;
    const pw = p.drawn.photo.width * k;
    const ph = pw / r;
    return { ...p, drawn: { ...p.drawn, photo: { x: (w.width - pw) / 2, y: (w.height - ph) / 2, width: pw, height: ph }, visibleFraction: (w.width * w.height) / (pw * ph) } };
  });
  res.push(run("crop cover", "DESTRUCTIVE_CROP", { media, layout: { ...layout, prints: cover } }));
  // 3 — a global scale from the count: every paper × (1 − n / 400).
  const f = 1 - media.length / 400;
  const scaled = layout.prints.map((p) => ({ ...p, layout: { ...p.layout, outer: { ...p.layout.outer, width: p.layout.outer.width * f, height: p.layout.outer.height * f } }, slot: { ...p.slot, center: { x: p.slot.center.x * f, y: p.slot.center.y * f } } }));
  res.push(run("scale global dépendant du nombre", "GLOBAL_SCALE_FROM_MEDIA_COUNT", { media, layout: { ...layout, prints: scaled } }));
  // 4 — a singleton: the last group split as …+2+1 (or 1 alone).
  const sizes = ref.groups.map((x) => x.size);
  const single = [...sizes.slice(0, -1), sizes[sizes.length - 1] - 1, 1];
  res.push(run("singleton", "SINGLETON_GROUP", { media, layout, groupSizes: single }));
  // 5 — a hard seam: BODY tiles with no crossfade.
  const hard = albumMobileMaterialPlan(Math.max(layout.height, 3200), { topBody: 0, bodyBody: 0 });
  res.push(run("couture franche", "VISIBLE_MATERIAL_SEAM", { media, layout: { ...layout, materials: hard, height: Math.max(layout.height, 3200) } }));
  // 6 — a z-rank making a memory inaccessible: media 3 slid under media 1 and sent to the bottom.
  const target = layout.prints[0];
  const zr = layout.prints.map((p, i) => {
    if (i !== 2) return p;
    const d = { x: target.slot.center.x - p.slot.center.x, y: target.slot.center.y - p.slot.center.y };
    const mv = (poly: Point[]) => poly.map((q) => ({ x: q.x + d.x, y: q.y + d.y }));
    return { ...p, slot: { ...p.slot, center: target.slot.center, zIndex: -1 }, outer: mv(p.outer), photo: mv(p.photo), drawnOuter: mv(p.drawnOuter) };
  });
  res.push(run("z-rank inaccessible", "ITEM_INACCESSIBLE", { media, layout: { ...layout, prints: zr }, reference: { ...ref, prints: zr } }));
  return res;
}

/** Visible share of each caption's glyph ink under the papers drawn above it (QA observation, never a STOP). */
export function albumMobileCaptionInk(layout: AlbumMobileLayout): (number | null)[] {
  return layout.prints.map((p) => {
    if (!p.caption?.lines.length) return null;
    const covers = layout.prints.filter((o) => o.slot.zIndex > p.slot.zIndex && convexIntersectionArea(p.drawnOuter, o.drawnOuter) > 1e-6).map((o) => o.drawnOuter);
    let total = 0;
    let covered = 0;
    for (const l of p.caption.lines) {
      const ink = slotRectToCanvas(p.slot, {
        x: p.drawn.outer.x + l.x - l.metrics.actualBoundingBoxLeft,
        y: p.drawn.outer.y + l.baseline - l.metrics.actualBoundingBoxAscent,
        width: l.metrics.actualBoundingBoxLeft + l.metrics.actualBoundingBoxRight,
        height: l.metrics.actualBoundingBoxAscent + l.metrics.actualBoundingBoxDescent,
      });
      total += polyArea(ink);
      covered += unionCoverArea(ink, covers.filter((c) => convexIntersectionArea(ink, c) > 1e-6));
    }
    return total > 1e-9 ? Math.max(0, 1 - covered / total) : 1;
  });
}

/** Byte-level snapshot of the geometry (determinism). */
export function albumMobileSnapshot(l: AlbumMobileLayout) {
  return JSON.stringify({
    groups: l.geometry.groups.map((g) => ({ ...g, stats: null })),
    prints: l.prints.map((p) => ({ i: p.mediaIndex, slot: p.slot, outer: p.layout.outer, window: p.layout.window, photo: p.layout.photo, drawn: p.drawn.outer, s: p.scale, d: p.translation, cap: p.caption?.lines.map((x) => [x.text, x.x, x.baseline]) ?? null })),
    height: l.height,
    materials: l.materials,
  });
}
