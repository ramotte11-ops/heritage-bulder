"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
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
 * Mission 035 v3 (QG micro-audit before visual validation) — the real
 * Hero Intemporel renderer, on the Studio's "runtime master" strategy
 * (README_QG.txt, HERITAGE_HERO_RUNTIME_MASTERS_V1.zip): one near-
 * complete PNG per (skin_variant × breakpoint); the code injects only
 * the family's photo and text into the zones the Studio specifies.
 *
 * v3 corrects three things the QG's micro-audit found in v2, none of
 * them a change of strategy:
 *
 *   1. The context label ("Mémoire & Hommage" / "Annonce & Hommage")
 *      is back — it was wrongly dropped in v2 on an overly literal
 *      reading of "le code injecte uniquement photo/nom/dates/phrase".
 *      It is not a new family field: it is HERITAGE system copy already
 *      approved at Mission 024 (`context.announcementTitle`/
 *      `context.remembranceTitle`, `lib/i18n/dictionaries/*.ts`),
 *      derived purely from `editorialContext`, in all three languages.
 *   2. The photo window's rotation is no longer a `transform: rotate()`
 *      applied to an ancestor of the photo `<img>` — see "Photo
 *      placement" below for why that was a real defect, not just an
 *      unclear comment, and what replaced it.
 *   3. `displayedName` now actually FITS its zone: a real client-side
 *      fitting algorithm (`useFitDisplayName` below), not a CSS
 *      `clamp()` that quietly lets an outlier name overflow four or
 *      five lines.
 *
 * ## Photo placement — the v2 defect and the v3 fix (mission section 2)
 *
 * v2 positioned a box at the window's center and applied
 * `transform: rotate(photoWindowRotationDeg)` to it, with the photo
 * `<img>` inside carrying its own `transform: rotate(0deg)` — on the
 * theory that an explicit `0deg` on the child kept the FAMILY PHOTO
 * itself unrotated. That reasoning was wrong: CSS `transform` does not
 * cascade/accumulate the way `color` does, but a rotated ancestor still
 * rotates everything painted inside it on screen — a child's own
 * `rotate(0deg)` contributes zero ADDITIONAL rotation on top of what it
 * already inherits from its ancestor's transformed rendering, it does
 * not cancel that ancestor's rotation. `HeroIntemporel.test.tsx`'s new
 * "photo pixels are never rotated" suite renders the real component and
 * asserts, from actual computed styles, that no element in the photo
 * `<img>`'s ancestor chain carries any rotation — a geometric proof,
 * not a comment.
 *
 * The fix reuses the exact rotated rectangle the Studio gives
 * (`photoWindowPolygonPx` — the same rectangle `photoWindowCenterPx`/
 * `photoWindowLocalSizePx`/`photoWindowRotationDeg` describe
 * parametrically, mission section 2's own "réutiliser... le polygon
 * fourni") as a `clip-path: polygon(...)`, on an AXIS-ALIGNED,
 * never-rotated wrapper sized to that polygon's own bounding box:
 *
 *   1. `photoMask()` computes the polygon's bounding box in the
 *      master's own pixel space, and expresses the wrapper's
 *      left/top/width/height as a percentage of the master canvas —
 *      exactly like every other zone in this file, no rotation.
 *   2. Each polygon point is re-expressed as a percentage of THAT
 *      wrapper's own box (not the master canvas) and joined into a
 *      `clip-path: polygon(...)` — a shape, not a coordinate-space
 *      transform, so nothing painted inside the wrapper is rotated by
 *      it, and the visible cut still lands exactly on the Studio's real
 *      rotated rectangle (proven by the wrapper's bounding-box math
 *      reproducing the given polygon's own center/size to the sub-pixel
 *      — see this module's own test suite).
 *   3. Inside the wrapper, a second, smaller, ALSO axis-aligned box
 *      (`photoWindowLocalSizePx`, i.e. the rectangle BEFORE the Studio
 *      rotated it — always 4:5) is centered — the wrapper's bounding
 *      box and this inner box share the same center by construction
 *      (a rectangle's bounding box, rotated about its own center, stays
 *      centered on that same point). This inner box is Mission 034's
 *      own crop window: `resolveHeroCropGeometry` runs against it
 *      completely unchanged, with no rotation concept added to it at
 *      any point — no second crop engine.
 *
 * There are two such (wrapper, inner box, photo `<img>`) triples, one
 * per breakpoint, shown/hidden by the same CSS media query that already
 * switches the two master `<img>`s — the same "one DOM tree, CSS-driven
 * breakpoint" discipline as everywhere else in this file, extended
 * rather than special-cased for the photo.
 *
 * ## Text zone (mission section 5, unchanged in spirit) — now WITH the
 * context label restored, and the name given a real fitting strategy.
 *
 * `text_zone_normalized` still lays out a plain conditional vertical
 * flow — context label, name, dates (if any), shortPhrase (if any) —
 * nothing rendered for a field that has no content, still no rigid
 * absolutely-positioned pile.
 *
 * `useFitDisplayName` (below) is what makes `displayedName` obey the
 * Studio's real rule ("1 ligne si possible, 2 lignes maximum, réduction
 * progressive de taille, minimum 56px desktop / 48px mobile") instead
 * of a `clamp()` that only bounds font-size, never line count. It never
 * truncates, ellipsizes, or drops a word — see its own docstring for
 * exactly what it does when even the floor size still wraps past 2
 * lines (mission section 3's own escape hatch).
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

interface PhotoMask {
  /** The polygon's own bounding box, as a percentage of the MASTER
   * canvas — this is the never-rotated wrapper's own position/size. */
  wrapper: PctBox;
  /** The un-rotated 4:5 crop window, as a percentage of the WRAPPER's
   * own box (not the master canvas) — centered inside it, per this
   * module's own docstring. */
  inner: PctBox;
  /** Each polygon point re-expressed as a percentage of the wrapper's
   * own box, ready to join into a `clip-path: polygon(...)`. */
  clipPath: string;
}

/**
 * See this module's own docstring, "Photo placement" — the ONE place
 * the Studio's rotated photo-window polygon is turned into an
 * axis-aligned wrapper + a `clip-path`, never a `transform: rotate()`.
 * Pure arithmetic, independent of any actual image — testable, and
 * tested, without rendering anything.
 */
export function photoMask(spec: HeroRuntimeMasterSpec): PhotoMask {
  const [canvasW, canvasH] = spec.dimensionsPx;
  const xs = spec.photoWindowPolygonPx.map(([x]) => x);
  const ys = spec.photoWindowPolygonPx.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxWidthPx = maxX - minX;
  const bboxHeightPx = maxY - minY;

  const wrapper: PctBox = {
    leftPct: (minX / canvasW) * 100,
    topPct: (minY / canvasH) * 100,
    widthPct: (bboxWidthPx / canvasW) * 100,
    heightPct: (bboxHeightPx / canvasH) * 100,
  };

  const clipPoints = spec.photoWindowPolygonPx.map(([x, y]) => {
    const xPct = ((x - minX) / bboxWidthPx) * 100;
    const yPct = ((y - minY) / bboxHeightPx) * 100;
    return `${xPct.toFixed(3)}% ${yPct.toFixed(3)}%`;
  });

  const [localW, localH] = spec.photoWindowLocalSizePx;
  const innerWidthPct = (localW / bboxWidthPx) * 100;
  const innerHeightPct = (localH / bboxHeightPx) * 100;
  const inner: PctBox = {
    leftPct: (100 - innerWidthPct) / 2,
    topPct: (100 - innerHeightPct) / 2,
    widthPct: innerWidthPct,
    heightPct: innerHeightPct,
  };

  return { wrapper, inner, clipPath: `polygon(${clipPoints.join(", ")})` };
}

function boxStyle(box: PctBox): CSSProperties {
  return {
    left: `${box.leftPct}%`,
    top: `${box.topPct}%`,
    width: `${box.widthPct}%`,
    height: `${box.heightPct}%`,
  };
}

/** The text zone's box, as CSS custom properties for both breakpoints —
 * mission section 5. */
function textZoneStyle(desktop: HeroRuntimeMasterSpec, mobile: HeroRuntimeMasterSpec): CSSProperties {
  const [xd, yd, wd, hd] = desktop.textZoneNormalized;
  const [xm, ym, wm, hm] = mobile.textZoneNormalized;
  return {
    "--tz-xd": `${xd * 100}%`,
    "--tz-yd": `${yd * 100}%`,
    "--tz-wd": `${wd * 100}%`,
    "--tz-hd": `${hd * 100}%`,
    "--tz-xm": `${xm * 100}%`,
    "--tz-ym": `${ym * 100}%`,
    "--tz-wm": `${wm * 100}%`,
    "--tz-hm": `${hm * 100}%`,
  } as CSSProperties;
}

/**
 * Counts the ACTUAL visual lines an element's text currently wraps
 * into, by asking a `Range` over its text content for its client rects
 * — one rect per visual line for wrapped inline content, the standard
 * DOM technique for this (an element's OWN `getClientRects()` would
 * just return its single border box, which is not what's needed here).
 */
function countVisualLines(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  // `Range.getClientRects` needs a real layout engine — environments
  // without one (jsdom in tests) simply don't implement it. Fail safe
  // to "1 line" rather than throwing: this hook must never crash the
  // render, only skip fitting where real measurement isn't possible.
  if (typeof range.getClientRects !== "function") return 1;
  const rects = range.getClientRects();
  return rects.length || 1;
}

/**
 * Mission 035 v3 section 3 — "construire une vraie stratégie de
 * fitting": 1 line if it fits at the nominal size, otherwise shrink in
 * 1px steps until it wraps into at most `maxLines`, never going below
 * `minPx`, NEVER truncating/ellipsizing/dropping a word (the full name
 * is always rendered — only its font-size ever changes).
 *
 * Runs client-side only (`useLayoutEffect`, after the browser has laid
 * out the real text against the real font — Cormorant Garamond, once
 * `next/font` has it available): the initial render (and any
 * server-rendered/no-JS view) shows the name at `maxPx`, exactly the
 * Studio's own nominal size, so there is no flash of unstyled/invisible
 * text — only a possible one-time downward adjustment once real
 * measurement is possible.
 *
 * If even `minPx` still wraps past `maxLines` (mission section 3's own
 * anticipated case — a name too long for this column at any allowed
 * size), this hook does NOT invent a further rule (no smaller floor, no
 * 3-line allowance, no truncation): it settles at `minPx` and reports
 * `linesAtFloor > maxLines` back to the caller, which is what
 * `HeroIntemporel`'s own docstring and the Mission 035 report surface
 * to the QG rather than silently shipping an invented fix.
 */
export function useFitDisplayName(
  text: string,
  maxPxDesktop: number,
  minPxDesktop: number,
  maxPxMobile: number,
  minPxMobile: number,
  maxLines: number,
): { ref: RefObject<HTMLHeadingElement | null>; fontSizePx: number | null; linesAtFloor: number | null } {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [result, setResult] = useState<{ fontSizePx: number | null; linesAtFloor: number | null }>({
    fontSizePx: null,
    linesAtFloor: null,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function fit() {
      if (!el) return;
      const isDesktop = window.innerWidth >= HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX;
      const maxPx = isDesktop ? maxPxDesktop : maxPxMobile;
      const minPx = isDesktop ? minPxDesktop : minPxMobile;

      let size = maxPx;
      el.style.fontSize = `${size}px`;
      let lines = countVisualLines(el);
      while (lines > maxLines && size > minPx) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        lines = countVisualLines(el);
      }

      setResult({ fontSizePx: size, linesAtFloor: size <= minPx ? lines : null });
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fit whenever the name itself changes; the size bounds are stable config constants.
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

  const nameTypography = HERO_INTEMPOREL_TYPOGRAPHY.displayedName;
  const {
    ref: nameRef,
    fontSizePx: nameFontSizePx,
    linesAtFloor,
  } = useFitDisplayName(
    hero.displayName ?? "",
    nameTypography.desktopPx,
    nameTypography.minDesktopPx,
    nameTypography.mobilePx,
    nameTypography.minMobilePx,
    nameTypography.maxLines,
  );

  useEffect(() => {
    if (nameRef.current) nameRef.current.setAttribute("data-lines-at-floor", String(linesAtFloor ?? ""));
  }, [linesAtFloor, nameRef]);

  const desktopMask = photoMask(desktop);
  const mobileMask = photoMask(mobile);

  function renderPhoto(mask: PhotoMask, breakpointClassName: string) {
    if (photo === null) return null;
    return (
      <div className={breakpointClassName} style={{ ...boxStyle(mask.wrapper), clipPath: mask.clipPath }}>
        <div className={styles.photoInner} style={boxStyle(mask.inner)}>
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
      </div>
    );
  }

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.hero} ${cormorantGaramond.variable} ${laBelleAurore.variable}`}>
        {renderPhoto(desktopMask, styles.photoWindowDesktop)}
        {renderPhoto(mobileMask, styles.photoWindowMobile)}

        {/* The Studio's own runtime masters — the whole artistic
            composition. Only one is ever visible at a time (this
            module's own CSS, switched at the 960px breakpoint). */}
        <img src={masterSrc.desktop} alt="" aria-hidden="true" className={styles.masterDesktop} />
        <img src={masterSrc.mobile} alt="" aria-hidden="true" className={styles.masterMobile} />

        <div className={styles.textZone} style={textZoneStyle(desktop, mobile)}>
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
