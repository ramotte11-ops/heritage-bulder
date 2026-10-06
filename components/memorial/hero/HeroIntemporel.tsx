"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { HeroContent } from "@/types/hero";
import { translate } from "@/lib/i18n/translate";
import { formatHeroDateRange } from "@/lib/memorial/format-hero-date";
import {
  NEUTRAL_HERO_CROP,
  resolveHeroCropGeometry,
  type HeroCropImageSize,
} from "@/lib/memorial/hero-crop-geometry";
import { SkinScope } from "@/components/memorial/SkinScope";
import {
  HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX,
  HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME,
  HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME,
  HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME,
  HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME,
  HERO_INTEMPOREL_MOBILE_SEPARATOR_GEOMETRY,
  HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT,
  HERO_INTEMPOREL_RUNTIME_MASTER_SPECS,
  HERO_INTEMPOREL_RUNTIME_MASTER_SRC,
  HERO_INTEMPOREL_TYPOGRAPHY,
  type HeroRuntimeMasterSpec,
} from "@/config/hero-intemporel-tokens";
import {
  heroDesktopDarkPhotoClipPoints,
  heroDesktopDarkPhotoCssTransform,
} from "@/lib/memorial/hero-desktop-dark-photo-runtime";
import {
  heroDesktopLightPhotoClipPoints,
  heroDesktopLightPhotoCssTransform,
} from "@/lib/memorial/hero-desktop-light-photo-runtime";
import { heroMobileDarkPhotoCssTransform } from "@/lib/memorial/hero-mobile-dark-photo-runtime";
import { heroMobileLightPhotoCssTransform } from "@/lib/memorial/hero-mobile-light-photo-runtime";
import { cormorantGaramond, laBelleAurore } from "@/components/builder/fonts";
import styles from "./HeroIntemporel.module.css";

/**
 * Mission 035 v4 (Studio V3 FINAL runtime masters) — the real Hero
 * Intemporel renderer.
 *
 * ## What changed from v3 (the QG micro-audit pass) to v4 (this pass)
 *
 * The Studio's new masters (`HERITAGE_HERO_RUNTIME_MASTERS_V3_FINAL.zip`)
 * carry NO raster text and NO raster UI at all
 * (`contains_raster_text_or_ui: false` on every one), and — the
 * significant simplification — every photo window is now a plain,
 * AXIS-ALIGNED rectangle (`config/hero-intemporel-tokens.ts`'s
 * `photoWindowPx`; no rotation field exists anywhere in the new
 * manifest). v3's entire `photoMask()`/`clip-path`/bounding-box
 * machinery existed ONLY to fit a family photo into a ROTATED window
 * without rotating the photo's own pixels — with no rotation left to
 * counteract, that legacy mechanism is gone. The four later QG-validated
 * Photo Runtimes deliberately add their own exact projective matrices:
 * one mask-backed Mobile Light plane, one alpha-overlay Mobile Dark
 * plane, and two explicitly clipped Desktop planes. None approximates
 * the contract with a CSS rotation.
 *
 * The doctrine otherwise carries forward unchanged: this component
 * renders exactly the Studio's own master PNG (one per skin_variant ×
 * breakpoint), the family photo (positioned into the master's own
 * transparent photo window), and the family's text (context label,
 * name, dates, shortPhrase — positioned into the master's own text
 * zone). No paper, botanical, postcard, seal, paperclip, frame, texture
 * or shadow is drawn by this component — all of it is pixels inside the
 * master.
 *
 * ## Photo placement (mission section 4)
 *
 * Outside the four contracted Photo Runtime territories,
 * `photoWindowPx` (`{x, y, width, height}`, in the master's own pixel
 * space) remains one axis-aligned, absolutely-positioned box —
 * left/top/width/height as a percentage of the master canvas, exactly
 * like the text zone below it, no different mechanism. Inside it,
 * Mission 034's own `resolveHeroCropGeometry` runs completely
 * unchanged: the window's 4:5 ratio IS the crop engine's own fixed
 * ratio, so nothing new is computed, and there is still no second crop
 * engine anywhere in this codebase. T07 and T08 render the identical
 * geometry for the identical `HeroCrop` — the crop the family confirmed
 * at T07 is exactly what they see at T08. Each contracted runtime uses
 * that same saved 4:5 crop as its source plane before applying its
 * validated homography and mask/clip.
 *
 * ## Mobile text contract REV1 (320–430px only)
 *
 * Inside the 320–430px band — the band the four-layer Mobile Light/Dark
 * photo runtimes already own — the text follows
 * `HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT` (config/hero-intemporel-tokens.ts)
 * instead of the legacy flow below: NAME → DATES → TRAITS+CŒUR → optional
 * phrase, each centered on its variant's native box, sized in Hero-width
 * units, no context label. Light uses the separator baked into its frozen
 * plate (never a second one); Dark draws the runtime separator
 * reproduced from that same ornament. Below 320px, 431–959px and Desktop
 * keep the legacy flow; the context label is additionally hidden on
 * Desktop (HeroIntemporel.module.css).
 *
 * ## Text zone + context label (mission sections 1, 5, 10)
 *
 * `text_zone_normalized` lays out a plain conditional vertical flow —
 * context label ("Mémoire & Hommage" / "Annonce & Hommage", Mission
 * 024's own approved copy in `context.announcementTitle`/
 * `context.remembranceTitle`, EN/FR/ES via the existing i18n system,
 * never hardcoded), name, dates (if any, joined by an en dash — never
 * an orphaned separator when only one is present), shortPhrase (if
 * any) — nothing rendered, and no space reserved, for a field that has
 * no content.
 *
 * ## Name fitting (mission section 6, QG-locked three-tier rule)
 *
 * See `useFitDisplayName` below and
 * `HERO_INTEMPOREL_TYPOGRAPHY.displayedName`'s own docstring for the
 * exact tiers. Never truncates, ellipsizes, or drops a word at any
 * tier — only the font-size ever changes.
 *
 * ## Responsive (mission section 8) and Light/Dark (section 9)
 *
 * `skinVariant` alone picks WHICH of the 4 masters' own numbers apply;
 * the `960px` breakpoint picks desktop vs. mobile within that variant —
 * never `prefers-color-scheme`, never a mechanically-rescaled desktop
 * master standing in for mobile. Both the photo window and the text
 * zone carry their own desktop/mobile percentages as CSS custom
 * properties, switched together with the two master `<img>`s
 * themselves (only one of which is ever visible) in
 * `HeroIntemporel.module.css` — one DOM tree, CSS-driven breakpoint.
 *
 * ## Header/UI (mission section 7)
 *
 * The Studio's masters carry no logo, language indicator or CTA at all
 * now (by design — "le master ne porte plus l'UI"). This component
 * still renders none of its own: the HERITAGE logo header is already
 * real, live HTML surrounding every Guided Flow screen including this
 * one (`components/builder/BuilderScreen.tsx`, reused unchanged — the
 * mission's own "réutiliser les composants existants du Builder"), and
 * the actual "Continuer avec cette ambiance" CTA is
 * `HeroRevealStep.tsx`'s own real, accessible, keyboard-focusable
 * `<button type="submit">` (never a decorative fake one). Every
 * rendered string already goes through `translate(language, ...)`, so
 * "langue" is live in the sense that matters — the content itself is in
 * the family's own chosen language — rather than a second, redundant
 * language-switcher UI this Builder has no existing pattern for
 * (T01/`LanguageStep` is the one and only place language is chosen).
 *
 * ## Width — capped by the renderer itself (Étape 2, QG D2)
 *
 * `.hero` carries its own `max-width` (the desktop master's native
 * 1536px) in `HeroIntemporel.module.css`, so the Memorial assembler
 * never has to re-state it. `HeroRevealStep`'s `.stage` still caps at
 * the same value, which leaves T08 pixel-identical.
 */
export interface HeroIntemporelProps {
  hero: HeroContent;
  /**
   * Only the short-lived signed URL is consumed — never the `Media` row
   * (Étape 2, QG C1): the Memorial assembler hands this renderer a
   * resolved `{ readUrl }` and must never ship `storagePath`/`ownerId`
   * to the client. Callers that hold a `{ media, readUrl }` (T08) still
   * pass it unchanged.
   */
  photo: { readUrl: string } | null;
  skinVariant: SkinVariant;
  editorialContext: EditorialContext;
  language: Language;
}

const UNRESOLVED_IMAGE_SIZE: HeroCropImageSize = { naturalWidth: 0, naturalHeight: 0 };

interface PctBox {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

function photoWindowBox(spec: HeroRuntimeMasterSpec): PctBox {
  const [canvasW, canvasH] = spec.dimensionsPx;
  const { x, y, width, height } = spec.photoWindowPx;
  return {
    leftPct: (x / canvasW) * 100,
    topPct: (y / canvasH) * 100,
    widthPct: (width / canvasW) * 100,
    heightPct: (height / canvasH) * 100,
  };
}

function textZoneBox(spec: HeroRuntimeMasterSpec): PctBox {
  const [xFrac, yFrac, wFrac, hFrac] = spec.textZoneNormalized;
  return { leftPct: xFrac * 100, topPct: yFrac * 100, widthPct: wFrac * 100, heightPct: hFrac * 100 };
}

/** Both breakpoints' geometry as CSS custom properties, switched by the
 * 960px media query in HeroIntemporel.module.css. */
function boxStyleVars(prefix: string, desktop: PctBox, mobile: PctBox): CSSProperties {
  return {
    [`--${prefix}-xd`]: `${desktop.leftPct}%`,
    [`--${prefix}-yd`]: `${desktop.topPct}%`,
    [`--${prefix}-wd`]: `${desktop.widthPct}%`,
    [`--${prefix}-hd`]: `${desktop.heightPct}%`,
    [`--${prefix}-xm`]: `${mobile.leftPct}%`,
    [`--${prefix}-ym`]: `${mobile.topPct}%`,
    [`--${prefix}-wm`]: `${mobile.widthPct}%`,
    [`--${prefix}-hm`]: `${mobile.heightPct}%`,
  } as CSSProperties;
}

/**
 * Counts the ACTUAL visual lines an element's text currently wraps
 * into, via a `Range` over its text content — one client rect per
 * visual line for wrapped inline content (the standard DOM technique;
 * the element's OWN `getClientRects()` would just return its single
 * border box). Environments with no real layout engine (jsdom in
 * tests) simply don't implement `Range.getClientRects` — this fails
 * safe to "1 line" there rather than throwing, so this hook can never
 * crash a render, only skip fitting where real measurement isn't
 * possible.
 */
function countVisualLines(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (typeof range.getClientRects !== "function") return 1;
  const rects = range.getClientRects();
  return rects.length || 1;
}

export interface FitDisplayNameResult {
  ref: RefObject<HTMLHeadingElement | null>;
  fontSizePx: number | null;
  lines: number | null;
  /** True only once the algorithm has gone below the Studio's normal
   * minimum — mission section 6's documented "fallback extrême", never
   * silently indistinguishable from an ordinary tier-2 shrink. */
  usedExtremeFallback: boolean;
}

/**
 * QG Hero 375px long-name collision fix (post-Hero-Runtime-Fidelity
 * mini-mission). A forensic measurement against the real mobile master
 * PNGs (`hero-runtime-{light,dark}-mobile.png`) found that the botanical
 * decoration baked into the master is NOT at a fixed pixel distance from
 * the text zone's left edge — it is a fixed FRACTION of the Hero's own
 * rendered width (the master scales uniformly with the Hero box). Tier
 * 4's `extremeFallbackMinPx` (40px), by contrast, is a fixed ABSOLUTE
 * size, chosen once for "mobile" as a whole. At a wide-enough mobile
 * viewport (measured safe at 390px and 430px) that mismatch never
 * matters — 40px text stays comfortably clear of the branch. At the
 * narrowest real phone widths (measured colliding at 375px, confirmed
 * via a row-by-row pixel scan of the actual asset and cross-checked
 * against the live render), the SAME 40px text occupies a larger
 * fraction of a proportionally smaller box, and its last wrapped line
 * reaches into the branch.
 *
 * `NARROW_MOBILE_SAFE_AREA_MAX_WIDTH_PX`/`NARROW_MOBILE_SAFE_AREA_RATIO`/
 * `NARROW_MOBILE_SAFE_AREA_MIN_FONT_PX` below are that measurement's
 * direct result — QG-refined once already (an initial 75%/40px pass was
 * safe but visually over-fragmented "Marie-Charlotte de La Fontaine-
 * Delacroix-Beaumont du Plessis-Grandchamp" into 7 lines; QG's own
 * side-by-side comparison of three real-rendered options chose "Option
 * C" below for the best editorial result at the largest measured
 * margin). At 375px, the branch's leftmost extent (in the vertical band
 * a 4-line extreme name at this width reaches) sits comfortably clear of
 * 88% of `.displayedName`'s own (already-indented) available width —
 * measured margin ~40-45px, the most generous of the three options QG
 * compared, and still real/deliberate, not a bare minimum fit.
 * `NARROW_MOBILE_SAFE_AREA_MIN_FONT_PX` (32px) is a SEPARATE, narrow-
 * mobile-only floor — it never changes `extremeFallbackMinPx` (40px),
 * which stays exactly as Mission 035 v4 defined it for every other tier,
 * width and breakpoint (390px/430px/desktop mobile Tier 4 included).
 * This pair touches `.displayedName` ONLY inside Tier 4 (see `fit()`
 * below) and only under `NARROW_MOBILE_SAFE_AREA_MAX_WIDTH_PX`: Tiers
 * 1-3 — every normal name, "Éléonore Vasseur" included (measured at
 * 237.6px for its own widest line, comfortably inside the untouched,
 * full-width Tier 1-3 box) — never see either constant, and
 * 390px/430px/desktop take the exact original code path, unmodified.
 *
 * Mission 035 v4 section 6 (QG-locked) — the three-tier fitting
 * strategy this builds on; see `HERO_INTEMPOREL_TYPOGRAPHY.displayedName`'s
 * own docstring for the exact rule Tiers 1-4 implement. Runs client-side
 * only (`useLayoutEffect`, after the browser has laid out the real text
 * against the real font): the initial render (and any
 * server-rendered/no-JS view) shows the name at the nominal size —
 * `HeroIntemporel.module.css`'s own fallback — so there is no flash of
 * unstyled/invisible text, only a possible one-time downward adjustment
 * once real measurement is possible.
 *
 * NEVER truncates, ellipsizes, or drops a word at any tier — the full
 * name is always the element's `textContent`; only `fontSizePx` (every
 * tier) and, now, `maxWidth` (Tier 4, narrow mobile only) ever change.
 */
/** The Mobile Text Contract REV1 band, in the exact form the CSS module
 * switches on — so the fitting engine and the layout can never disagree
 * about which contract applies. */
const MOBILE_TEXT_CONTRACT_MEDIA_QUERY = `(min-width: ${HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT.contractedWidthCssPx.min}px) and (max-width: ${HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT.contractedWidthCssPx.max}px)`;

export interface MobileContractNameFit {
  fontSizePx: number;
  lines: number;
  usedExtremeFallback: boolean;
}

/**
 * Mobile Text Contract REV1 (`TYPOGRAPHY_CORRECTED.md`) — the
 * deterministic long-name engine, as a pure function of the Hero's own
 * width and a line-count probe (so it is unit-testable without a layout
 * engine):
 *
 *   1. nominal 10vw;
 *   2. wrap naturally, up to 2 lines;
 *   3. still more: reduce in 1px steps, never below the 7.6vw floor;
 *   4. still more at that floor: the exceptional 3rd line is allowed;
 *   5. still more: reduce in 1px steps, never below the 6.8vw extreme floor;
 *   6. never truncate or ellipsize — whatever remains is rendered whole.
 *
 * No legacy 72/48/40/32px value or 88% narrow cap takes part here.
 */
export function fitMobileContractName(
  heroWidthPx: number,
  measureLinesAt: (fontSizePx: number) => number,
): MobileContractNameFit {
  const t = HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT.typography.name;
  const nominalPx = (heroWidthPx * t.vw) / 100;
  const normalMinPx = (heroWidthPx * t.normalMinVw) / 100;
  const extremeMinPx = (heroWidthPx * t.extremeMinVw) / 100;

  let size = nominalPx;
  let lines = measureLinesAt(size);
  while (lines > t.maxLinesNormal && size > normalMinPx) {
    size = Math.max(normalMinPx, size - 1);
    lines = measureLinesAt(size);
  }
  if (lines <= t.maxLinesExtreme) return { fontSizePx: size, lines, usedExtremeFallback: false };

  while (lines > t.maxLinesExtreme && size > extremeMinPx) {
    size = Math.max(extremeMinPx, size - 1);
    lines = measureLinesAt(size);
  }
  return { fontSizePx: size, lines, usedExtremeFallback: size < normalMinPx };
}

const NARROW_MOBILE_SAFE_AREA_MAX_WIDTH_PX = 380;
const NARROW_MOBILE_SAFE_AREA_RATIO = 0.88;
/** A dedicated floor for Tier 4 on narrow mobile ONLY — deliberately
 * separate from `HERO_INTEMPOREL_TYPOGRAPHY.displayedName.extremeFallbackMinPx`
 * (40px), which remains the shared floor for every other width/breakpoint.
 * QG-validated ("Option C") as still comfortably legible at this one,
 * already-rare combination (Tier 4 AND narrower than 380px). */
const NARROW_MOBILE_SAFE_AREA_MIN_FONT_PX = 32;

export function useFitDisplayName(text: string): FitDisplayNameResult {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [result, setResult] = useState<{ fontSizePx: number | null; lines: number | null; usedExtremeFallback: boolean }>(
    { fontSizePx: null, lines: null, usedExtremeFallback: false },
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const t = HERO_INTEMPOREL_TYPOGRAPHY.displayedName;

    const mobileContract =
      typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_TEXT_CONTRACT_MEDIA_QUERY) : null;
    let disposed = false;

    function fit() {
      if (!el) return;

      // Mobile Text Contract REV1 (320–430px): its own engine, sized
      // against the Hero's own width, never the legacy tiers below.
      if (mobileContract?.matches) {
        el.style.maxWidth = "";
        const heroWidthPx = el.parentElement?.getBoundingClientRect().width || window.innerWidth;
        const fitted = fitMobileContractName(heroWidthPx, (px) => {
          el.style.fontSize = `${px}px`;
          return countVisualLines(el);
        });
        el.style.fontSize = `${fitted.fontSizePx}px`;
        setResult(fitted);
        return;
      }

      const isDesktop = window.innerWidth >= HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX;
      const maxPx = isDesktop ? t.desktopPx : t.mobilePx;
      const normalMinPx = isDesktop ? t.minNormalDesktopPx : t.minNormalMobilePx;

      const setSize = (px: number) => {
        el.style.fontSize = `${px}px`;
      };

      // Reset any narrow-mobile safe-area cap a PREVIOUS call of this
      // same effect left behind (e.g. a resize from a narrow phone to a
      // wider one, or a text change) before measuring anything below —
      // Tiers 1-3 must always measure against the element's normal,
      // uncapped width.
      el.style.maxWidth = "";

      // Tier 1/2 — nominal size, then shrink (never below the NORMAL
      // floor) until it wraps into <= maxLinesNormal. A name that
      // already fits in 1 line at nominal never enters the loop at all
      // — "cible normale: 1 ligne" falls out of this for free.
      let size = maxPx;
      setSize(size);
      let lines = countVisualLines(el);
      while (lines > t.maxLinesNormal && size > normalMinPx) {
        size -= 1;
        setSize(size);
        lines = countVisualLines(el);
      }

      if (lines <= t.maxLinesNormal) {
        setResult({ fontSizePx: size, lines, usedExtremeFallback: false });
        return;
      }

      // Tier 3 — still over the normal cap at the normal floor: allow
      // one more line (mission's own "exception extrême: maximum 3
      // lignes") WITHOUT shrinking further yet.
      if (lines <= t.maxLinesExtreme) {
        setResult({ fontSizePx: normalMinPx, lines, usedExtremeFallback: false });
        return;
      }

      // Tier 4 — the documented fallback extrême: still over even the
      // 3-line allowance at the normal floor.
      //
      // QG Hero 375px long-name collision fix ("Option C", QG-validated):
      // only here, and only on narrow mobile (see this hook's own top
      // docstring for the measured evidence), cap the element's own
      // width to the measured safe fraction BEFORE shrinking, so the
      // shrink loop's own `countVisualLines` re-measurement — and
      // therefore the final wrapped width — reflects the safe area, not
      // the full zone. The shrink floor is ALSO narrowed for this one
      // case only (`extremeFloorPx`) — `t.extremeFallbackMinPx` itself
      // is never reassigned, so every other width/breakpoint keeps
      // exactly Mission 035 v4's own 40px floor.
      let extremeFloorPx: number = t.extremeFallbackMinPx;
      if (!isDesktop && window.innerWidth <= NARROW_MOBILE_SAFE_AREA_MAX_WIDTH_PX) {
        el.style.maxWidth = `${NARROW_MOBILE_SAFE_AREA_RATIO * 100}%`;
        extremeFloorPx = NARROW_MOBILE_SAFE_AREA_MIN_FONT_PX;
        // `lines` above was measured against the now-stale, uncapped
        // width — re-measure immediately so the loop below (and its
        // entry condition) reflects the real, narrower box.
        lines = countVisualLines(el);
      }

      // Shrink further, the smallest amount needed, down to (never past)
      // the applicable floor.
      while (lines > t.maxLinesExtreme && size > extremeFloorPx) {
        size -= 1;
        setSize(size);
        lines = countVisualLines(el);
      }
      setResult({ fontSizePx: size, lines, usedExtremeFallback: size < normalMinPx });
    }

    fit();
    window.addEventListener("resize", fit);
    // Re-measure once the real webfonts are in: a measurement taken
    // against a fallback face would count lines for the wrong glyphs.
    document.fonts?.ready.then(() => {
      if (!disposed) fit();
    });
    return () => {
      disposed = true;
      window.removeEventListener("resize", fit);
    };
  }, [text]);

  return { ref, ...result };
}

/** One contract box as left/width/vertical-center percentages of its
 * variant's own native scene. */
function contractBoxVars(prefix: string, box: readonly [number, number, number, number], canvas: readonly [number, number]) {
  const [canvasW, canvasH] = canvas;
  const [x0, y0, x1, y1] = box;
  return {
    [`--mt-${prefix}-x`]: `${(x0 / canvasW) * 100}%`,
    [`--mt-${prefix}-w`]: `${((x1 - x0) / canvasW) * 100}%`,
    [`--mt-${prefix}-cy`]: `${(((y0 + y1) / 2) / canvasH) * 100}%`,
    [`--mt-${prefix}-y1`]: `${(y1 / canvasH) * 100}%`,
  };
}

/** Mobile Text Contract REV1 — the variant's native boxes as CSS custom
 * properties, consumed only inside the 320–430px media query. */
function mobileTextContractVars(skinVariant: SkinVariant): CSSProperties {
  const m = HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT[skinVariant];
  const [canvasW, canvasH] = m.canvasPx;
  const [sx0, sy0, sx1, sy1] = m.separator.bbox;
  return {
    ...contractBoxVars("name", m.nameBox, m.canvasPx),
    ...contractBoxVars("dates", m.datesBox, m.canvasPx),
    ...contractBoxVars("phrase", m.phraseBox, m.canvasPx),
    "--mt-axis": `${(m.axisX / canvasW) * 100}%`,
    "--mt-sep-x": `${(sx0 / canvasW) * 100}%`,
    "--mt-sep-y": `${(sy0 / canvasH) * 100}%`,
    "--mt-sep-w": `${((sx1 - sx0) / canvasW) * 100}%`,
    "--mt-sep-h": `${((sy1 - sy0) / canvasH) * 100}%`,
  } as CSSProperties;
}

/** Dark only (REV1 `MAPPING_DARK.md`): the runtime traits+cœur — the
 * Light plate's own baked ornament, reproduced from its measured
 * geometry (`HERO_INTEMPOREL_MOBILE_SEPARATOR_GEOMETRY`). Purely
 * decorative; laid out (and visible) only inside the 320–430px band. */
function MobileRuntimeSeparator() {
  const g = HERO_INTEMPOREL_MOBILE_SEPARATOR_GEOMETRY;
  return (
    <svg
      className={styles.mobileSeparator}
      viewBox={g.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-hero-mobile-text-contract="runtime-separator"
    >
      <g stroke="currentColor" fill="none" strokeLinecap="butt" strokeLinejoin="round">
        <path d={`M${g.leftRule[0]} ${g.ruleY} H${g.leftRule[1]}`} strokeWidth={g.ruleStrokeWidth} />
        <path d={`M${g.rightRule[0]} ${g.ruleY} H${g.rightRule[1]}`} strokeWidth={g.ruleStrokeWidth} />
        <path d={g.heartPath} strokeWidth={g.heartStrokeWidth} />
      </g>
    </svg>
  );
}

export function HeroIntemporel({ hero, photo, skinVariant, editorialContext, language }: HeroIntemporelProps) {
  const [imageSize, setImageSize] = useState<HeroCropImageSize>(UNRESOLVED_IMAGE_SIZE);
  const mobileLightMaskId = `hero-mobile-light-photo-mask-${useId().replace(/:/g, "")}`;
  const desktopLightClipId = `hero-desktop-light-photo-clip-${useId().replace(/:/g, "")}`;
  const desktopDarkClipId = `hero-desktop-dark-photo-clip-${useId().replace(/:/g, "")}`;

  const masterSrc = HERO_INTEMPOREL_RUNTIME_MASTER_SRC[skinVariant];
  const { desktop, mobile } = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS[skinVariant];

  const crop = hero.photo?.crop ?? NEUTRAL_HERO_CROP;
  const geometry = resolveHeroCropGeometry(imageSize, crop);

  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);
  const contextLabel = translate(
    language,
    editorialContext === "announcement" ? "context.announcementTitle" : "context.remembranceTitle",
  );

  const { ref: nameRef, fontSizePx: nameFontSizePx } = useFitDisplayName(hero.displayName ?? "");

  const photoWindowVars = boxStyleVars("win", photoWindowBox(desktop), photoWindowBox(mobile));
  const textZoneVars = {
    ...boxStyleVars("tz", textZoneBox(desktop), textZoneBox(mobile)),
    ...mobileTextContractVars(skinVariant),
  } as CSSProperties;
  const mobileLightPhotoTransform = heroMobileLightPhotoCssTransform();
  const mobileDarkPhotoTransform = heroMobileDarkPhotoCssTransform();
  const desktopLightPhotoTransform = heroDesktopLightPhotoCssTransform();
  const desktopLightPhotoClipPoints = heroDesktopLightPhotoClipPoints();
  const desktopDarkPhotoTransform = heroDesktopDarkPhotoCssTransform();
  const desktopDarkPhotoClipPoints = heroDesktopDarkPhotoClipPoints();

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.hero} ${cormorantGaramond.variable} ${laBelleAurore.variable}`}>
        {photo !== null && (
          <>
            <div className={styles.photoWindow} style={photoWindowVars}>
              {/* Never a static asset next/image can optimize, and never
                  persisted — Mission 030's short-lived signed read URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.readUrl}
                alt={translate(language, "hero.photoAlt")}
                className={styles.photoImage}
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                }}
                style={{
                  left: `${geometry.leftPercent}%`,
                  top: `${geometry.topPercent}%`,
                  width: `${geometry.widthPercent}%`,
                  height: `${geometry.heightPercent}%`,
                }}
              />
            </div>

            {skinVariant === "light" && (
              <svg
                className={styles.mobileLightPhotoRuntime}
                viewBox="0 0 941 1672"
                preserveAspectRatio="xMidYMid meet"
                focusable="false"
                data-hero-mobile-light-layer="projected-masked-photo"
              >
                <defs>
                  <mask
                    id={mobileLightMaskId}
                    x="0"
                    y="0"
                    width="941"
                    height="1672"
                    maskUnits="userSpaceOnUse"
                    style={{ maskType: "luminance" }}
                  >
                    <image
                      href={HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.maskSrc}
                      x="0"
                      y="0"
                      width="941"
                      height="1672"
                      preserveAspectRatio="none"
                    />
                  </mask>
                </defs>
                <g mask={`url(#${mobileLightMaskId})`}>
                  <foreignObject x="0" y="0" width="941" height="1672">
                    <div
                      className={styles.mobileLightLogicalRaster}
                      style={{ transform: mobileLightPhotoTransform }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.readUrl}
                        alt={translate(language, "hero.photoAlt")}
                        className={styles.photoImage}
                        draggable={false}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                        }}
                        style={{
                          left: `${geometry.leftPercent}%`,
                          top: `${geometry.topPercent}%`,
                          width: `${geometry.widthPercent}%`,
                          height: `${geometry.heightPercent}%`,
                        }}
                      />
                    </div>
                  </foreignObject>
                </g>
              </svg>
            )}

            {skinVariant === "dark" && (
              <svg
                className={styles.mobileDarkPhotoRuntime}
                viewBox="0 0 982 1602"
                preserveAspectRatio="xMidYMid meet"
                focusable="false"
                data-hero-mobile-dark-layer="projected-photo"
              >
                <foreignObject x="0" y="0" width="982" height="1602">
                  <div
                    className={styles.mobileDarkLogicalRaster}
                    style={{ transform: mobileDarkPhotoTransform }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.readUrl}
                      alt={translate(language, "hero.photoAlt")}
                      className={styles.photoImage}
                      draggable={false}
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                      }}
                      style={{
                        left: `${geometry.leftPercent}%`,
                        top: `${geometry.topPercent}%`,
                        width: `${geometry.widthPercent}%`,
                        height: `${geometry.heightPercent}%`,
                      }}
                    />
                  </div>
                </foreignObject>
              </svg>
            )}

            {skinVariant === "light" && (
              <svg
                className={styles.desktopLightPhotoRuntime}
                viewBox="0 0 1672 941"
                preserveAspectRatio="xMidYMid meet"
                focusable="false"
                data-hero-desktop-light-layer="projected-clipped-photo"
              >
                <defs>
                  <clipPath id={desktopLightClipId} clipPathUnits="userSpaceOnUse">
                    <polygon points={desktopLightPhotoClipPoints} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${desktopLightClipId})`}>
                  <foreignObject x="0" y="0" width="1672" height="941">
                    <div
                      className={styles.desktopLightLogicalRaster}
                      style={{ transform: desktopLightPhotoTransform }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.readUrl}
                        alt={translate(language, "hero.photoAlt")}
                        className={styles.photoImage}
                        draggable={false}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                        }}
                        style={{
                          left: `${geometry.leftPercent}%`,
                          top: `${geometry.topPercent}%`,
                          width: `${geometry.widthPercent}%`,
                          height: `${geometry.heightPercent}%`,
                        }}
                      />
                    </div>
                  </foreignObject>
                </g>
              </svg>
            )}

            {skinVariant === "dark" && (
              <svg
                className={styles.desktopDarkPhotoRuntime}
                viewBox="0 0 1672 941"
                preserveAspectRatio="xMidYMid meet"
                focusable="false"
                data-hero-desktop-dark-layer="projected-clipped-photo"
              >
                <defs>
                  <clipPath id={desktopDarkClipId} clipPathUnits="userSpaceOnUse">
                    <polygon points={desktopDarkPhotoClipPoints} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${desktopDarkClipId})`}>
                  <foreignObject x="0" y="0" width="1672" height="941">
                    <div
                      className={styles.desktopDarkLogicalRaster}
                      style={{ transform: desktopDarkPhotoTransform }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.readUrl}
                        alt={translate(language, "hero.photoAlt")}
                        className={styles.photoImage}
                        draggable={false}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                        }}
                        style={{
                          left: `${geometry.leftPercent}%`,
                          top: `${geometry.topPercent}%`,
                          width: `${geometry.widthPercent}%`,
                          height: `${geometry.heightPercent}%`,
                        }}
                      />
                    </div>
                  </foreignObject>
                </g>
              </svg>
            )}
          </>
        )}

        {/* The Studio's own runtime masters — the whole artistic
            composition, no raster text or UI (V3 FINAL). Only one is
            ever visible at a time (this module's own CSS, switched at
            the 960px breakpoint). Never `next/image`: these are fixed,
            pre-optimized static assets shipped from `public/`, not
            per-request content worth its optimization pipeline. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={masterSrc.desktop} alt="" aria-hidden="true" className={styles.masterDesktop} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={masterSrc.mobile} alt="" aria-hidden="true" className={styles.masterMobile} />

        {skinVariant === "light" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME.plateSrc}
            alt=""
            aria-hidden="true"
            className={styles.mobileLightRuntimePlate}
            data-hero-mobile-light-layer="clean-plate"
          />
        )}

        {skinVariant === "dark" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME.overlaySrc}
            alt=""
            aria-hidden="true"
            className={styles.mobileDarkRuntimeOverlay}
            data-hero-mobile-dark-layer="authoritative-overlay"
          />
        )}

        {skinVariant === "light" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME.overlaySrc}
            alt=""
            aria-hidden="true"
            className={styles.desktopLightRuntimeOverlay}
            data-hero-desktop-light-layer="authoritative-overlay"
          />
        )}

        {skinVariant === "dark" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME.overlaySrc}
            alt=""
            aria-hidden="true"
            className={styles.desktopDarkRuntimeOverlay}
            data-hero-desktop-dark-layer="authoritative-overlay"
          />
        )}

        <div
          className={styles.textZone}
          style={textZoneVars}
          data-hero-mobile-light-layer={skinVariant === "light" ? "dynamic-content" : undefined}
          data-hero-mobile-dark-layer={skinVariant === "dark" ? "dynamic-content" : undefined}
          data-hero-desktop-light-layer={skinVariant === "light" ? "dynamic-content" : undefined}
          data-hero-desktop-dark-layer={skinVariant === "dark" ? "dynamic-content" : undefined}
        >
          <p className={styles.contextLabel}>{contextLabel}</p>
          <h1
            ref={nameRef}
            className={styles.displayedName}
            style={nameFontSizePx !== null ? { fontSize: `${nameFontSizePx}px` } : undefined}
          >
            {hero.displayName}
          </h1>
          {dateRangeText !== null && <p className={styles.dates}>{dateRangeText}</p>}
          {HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT[skinVariant].separator.mode === "runtime" && (
            <MobileRuntimeSeparator />
          )}
          {hero.shortPhrase !== null && <p className={styles.shortPhrase}>{hero.shortPhrase}</p>}
        </div>
      </div>
    </SkinScope>
  );
}
