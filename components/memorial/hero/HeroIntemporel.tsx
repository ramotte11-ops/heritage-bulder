"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { HeroContent } from "@/types/hero";
import type { Media } from "@/types/media";
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
  HERO_INTEMPOREL_RUNTIME_MASTER_SPECS,
  HERO_INTEMPOREL_RUNTIME_MASTER_SRC,
  HERO_INTEMPOREL_TYPOGRAPHY,
  type HeroRuntimeMasterSpec,
} from "@/config/hero-intemporel-tokens";
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
 * counteract, that whole mechanism is gone. A window that was never
 * rotated cannot suffer v2's original defect (a parent's
 * `transform: rotate()` visually rotating the photo inside it) by
 * construction, not by a masking trick — this file now contains no
 * `transform` of any kind on the photo or its ancestors, which is
 * strictly stronger than v3's proof that none of the transforms it did
 * use carried a rotation.
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
 * `photoWindowPx` (`{x, y, width, height}`, in the master's own pixel
 * space) becomes one axis-aligned, absolutely-positioned box —
 * left/top/width/height as a percentage of the master canvas, exactly
 * like the text zone below it, no different mechanism. Inside it,
 * Mission 034's own `resolveHeroCropGeometry` runs completely
 * unchanged: the window's 4:5 ratio IS the crop engine's own fixed
 * ratio, so nothing new is computed, and there is still no second crop
 * engine anywhere in this codebase. T07 and T08 render the identical
 * geometry for the identical `HeroCrop` — the crop the family confirmed
 * at T07 is exactly what they see at T08.
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
 */
export interface HeroIntemporelProps {
  hero: HeroContent;
  photo: { media: Media; readUrl: string } | null;
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
 * Mission 035 v4 section 6 (QG-locked) — the three-tier fitting
 * strategy; see `HERO_INTEMPOREL_TYPOGRAPHY.displayedName`'s own
 * docstring for the exact rule this implements. Runs client-side only
 * (`useLayoutEffect`, after the browser has laid out the real text
 * against the real font): the initial render (and any
 * server-rendered/no-JS view) shows the name at the nominal size —
 * `HeroIntemporel.module.css`'s own fallback — so there is no flash of
 * unstyled/invisible text, only a possible one-time downward adjustment
 * once real measurement is possible.
 *
 * NEVER truncates, ellipsizes, or drops a word at any tier — the full
 * name is always the element's `textContent`; only `fontSizePx` ever
 * changes.
 */
export function useFitDisplayName(text: string): FitDisplayNameResult {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [result, setResult] = useState<{ fontSizePx: number | null; lines: number | null; usedExtremeFallback: boolean }>(
    { fontSizePx: null, lines: null, usedExtremeFallback: false },
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const t = HERO_INTEMPOREL_TYPOGRAPHY.displayedName;

    function fit() {
      if (!el) return;
      const isDesktop = window.innerWidth >= HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX;
      const maxPx = isDesktop ? t.desktopPx : t.mobilePx;
      const normalMinPx = isDesktop ? t.minNormalDesktopPx : t.minNormalMobilePx;

      const setSize = (px: number) => {
        el.style.fontSize = `${px}px`;
      };

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
      // 3-line allowance at the normal floor. Shrink further, the
      // smallest amount needed, down to (never past) extremeFallbackMinPx.
      while (lines > t.maxLinesExtreme && size > t.extremeFallbackMinPx) {
        size -= 1;
        setSize(size);
        lines = countVisualLines(el);
      }
      setResult({ fontSizePx: size, lines, usedExtremeFallback: size < normalMinPx });
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text]);

  return { ref, ...result };
}

export function HeroIntemporel({ hero, photo, skinVariant, editorialContext, language }: HeroIntemporelProps) {
  const [imageSize, setImageSize] = useState<HeroCropImageSize>(UNRESOLVED_IMAGE_SIZE);

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
  const textZoneVars = boxStyleVars("tz", textZoneBox(desktop), textZoneBox(mobile));

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.hero} ${cormorantGaramond.variable} ${laBelleAurore.variable}`}>
        {photo !== null && (
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

        <div className={styles.textZone} style={textZoneVars}>
          <p className={styles.contextLabel}>{contextLabel}</p>
          <h1
            ref={nameRef}
            className={styles.displayedName}
            style={nameFontSizePx !== null ? { fontSize: `${nameFontSizePx}px` } : undefined}
          >
            {hero.displayName}
          </h1>
          {dateRangeText !== null && <p className={styles.dates}>{dateRangeText}</p>}
          {hero.shortPhrase !== null && <p className={styles.shortPhrase}>{hero.shortPhrase}</p>}
        </div>
      </div>
    </SkinScope>
  );
}
