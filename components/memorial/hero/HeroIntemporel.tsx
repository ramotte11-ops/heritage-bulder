"use client";

import { useState, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
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
  HERO_INTEMPOREL_RUNTIME_MASTER_SPECS,
  HERO_INTEMPOREL_RUNTIME_MASTER_SRC,
  type HeroRuntimeMasterSpec,
} from "@/config/hero-intemporel-tokens";
import { cormorantGaramond, laBelleAurore } from "@/components/builder/fonts";
import styles from "./HeroIntemporel.module.css";

/**
 * Mission 035 (QG strategy change) — the real Hero Intemporel renderer,
 * REBUILT on the Studio's "runtime master" strategy: `README_QG.txt`
 * (`HERITAGE_HERO_RUNTIME_MASTERS_V1.zip`) — "Le Studio fournit le Hero
 * quasi assemblé. Le code ne doit plus recomposer visuellement le
 * design asset par asset."
 *
 * This REPLACES the earlier asset-by-asset version of this same file
 * (14 individually-positioned papers/botanicals/postcard/seal/frame
 * layers, a 14-level z-index table) — the QG and PO refused that
 * reconstruction, not the architecture around it (T08, Guided Flow,
 * skin_variant persistence, Mission 034's crop engine: all untouched).
 *
 * ## The whole doctrine, in one sentence
 *
 * The code renders exactly THREE things: the Studio's own runtime
 * master PNG (one per skin_variant × breakpoint, chosen whole, never
 * cropped/rescaled into the other breakpoint's master), the family
 * photo (positioned into the master's own transparent photo window),
 * and the family's text (name/dates/shortPhrase, positioned into the
 * master's own text zone). No paper, botanical, postcard, seal,
 * paperclip, texture or shadow is drawn by this component — all of it
 * is pixels inside the master.
 *
 * ## Photo placement (mission section 4)
 *
 * Every runtime master's photo window is a ROTATED rectangle — its own
 * `center`, local `width×height` (always 4:5, `photo_window_ratio:
 * 0.8`) and `rotation_deg`, transcribed verbatim into
 * `config/hero-intemporel-tokens.ts` from `runtime-master-specs.json`.
 * This component positions a `position:absolute` box at that exact
 * center (as a percentage of the master's own canvas — `left`/`top` at
 * the center point, `transform: translate(-50%, -50%) rotate(deg)` to
 * both center AND rotate the box about that point, `transform-origin`
 * defaulting to the box's own center, i.e. exactly the point the
 * Studio's polygon was generated around), sized to the window's own
 * local (un-rotated) width/height. The photo image inside it is then
 * exactly Mission 034's own crop geometry, reused unchanged — the
 * window's 4:5 aspect IS the crop engine's own fixed ratio, so nothing
 * new is computed. The photo never rotates on its own (Mission 034's
 * invariant); only the window box around it carries the master's
 * rotation, and `overflow: hidden` on that box is what makes the photo
 * appear "cut" exactly to the window's shape once both are painted.
 * This box sits BEHIND the master image (a lower z-index) — the
 * master's own window is genuinely alpha-transparent there (verified
 * against the real PNG's alpha channel, never assumed), so the photo
 * shows through precisely where the Studio cut the hole.
 *
 * ## Text placement (mission section 5)
 *
 * `text_zone_normalized` (`[x, y, width, height]`, each a fraction of
 * the master's own canvas) is the one box the family's `displayedName`,
 * date range and `shortPhrase` are laid out in — top-aligned, a plain
 * conditional vertical flow (never a rigid absolutely-positioned pile),
 * each line present only when its own content exists (mission brief
 * section 11's rule, unchanged from the previous version of this
 * component). No context label, no divider ornaments, no secondary
 * editorial paragraph are drawn here any more: the mission's own
 * "le code injecte uniquement: photo du défunt; displayedName; dates;
 * shortPhrase" is exhaustive — any of that decor the family sees is
 * whatever the master itself already bakes in for that variant.
 *
 * ## Responsive (mission section 7) and Light/Dark (section 8)
 *
 * `skinVariant` alone picks WHICH of the 4 masters' own numbers apply;
 * the `960px` breakpoint (`HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX`)
 * picks desktop vs. mobile within that variant — never
 * `prefers-color-scheme`, never a mechanically-rescaled desktop master
 * standing in for mobile (the Studio's own dedicated mobile master is
 * always used below 960px). Both the photo window and the text zone
 * carry their own desktop/mobile percentages as CSS custom properties,
 * switched together with the two master `<img>`s themselves (only one
 * of which is ever visible) in `HeroIntemporel.module.css`, so it
 * remains one DOM tree whose layout is entirely CSS-driven — no
 * client-side viewport branch re-rendering different markup.
 */
export interface HeroIntemporelProps {
  hero: HeroContent;
  photo: { media: Media; readUrl: string } | null;
  skinVariant: SkinVariant;
  language: Language;
}

const UNRESOLVED_IMAGE_SIZE: HeroCropImageSize = { naturalWidth: 0, naturalHeight: 0 };

/** The photo window's box, as CSS custom properties for both
 * breakpoints — see this module's own docstring, "Photo placement". */
function windowBoxStyle(desktop: HeroRuntimeMasterSpec, mobile: HeroRuntimeMasterSpec): CSSProperties {
  const pct = (spec: HeroRuntimeMasterSpec) => ({
    x: (spec.photoWindowCenterPx[0] / spec.dimensionsPx[0]) * 100,
    y: (spec.photoWindowCenterPx[1] / spec.dimensionsPx[1]) * 100,
    w: (spec.photoWindowLocalSizePx[0] / spec.dimensionsPx[0]) * 100,
    h: (spec.photoWindowLocalSizePx[1] / spec.dimensionsPx[1]) * 100,
  });
  const d = pct(desktop);
  const m = pct(mobile);
  return {
    "--win-xd": `${d.x}%`,
    "--win-yd": `${d.y}%`,
    "--win-wd": `${d.w}%`,
    "--win-hd": `${d.h}%`,
    "--win-rotd": `${desktop.photoWindowRotationDeg}deg`,
    "--win-xm": `${m.x}%`,
    "--win-ym": `${m.y}%`,
    "--win-wm": `${m.w}%`,
    "--win-hm": `${m.h}%`,
    "--win-rotm": `${mobile.photoWindowRotationDeg}deg`,
  } as CSSProperties;
}

/** The text zone's box, as CSS custom properties for both breakpoints —
 * see this module's own docstring, "Text placement". */
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

export function HeroIntemporel({ hero, photo, skinVariant, language }: HeroIntemporelProps) {
  const [imageSize, setImageSize] = useState<HeroCropImageSize>(UNRESOLVED_IMAGE_SIZE);

  const masterSrc = HERO_INTEMPOREL_RUNTIME_MASTER_SRC[skinVariant];
  const { desktop, mobile } = HERO_INTEMPOREL_RUNTIME_MASTER_SPECS[skinVariant];

  const crop = hero.photo?.crop ?? NEUTRAL_HERO_CROP;
  const geometry = resolveHeroCropGeometry(imageSize, crop);

  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.hero} ${cormorantGaramond.variable} ${laBelleAurore.variable}`}>
        {photo !== null && (
          <div className={styles.photoWindow} style={windowBoxStyle(desktop, mobile)}>
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
            composition. Only one is ever visible at a time (this
            module's own CSS, switched at the 960px breakpoint). */}
        <img src={masterSrc.desktop} alt="" aria-hidden="true" className={styles.masterDesktop} />
        <img src={masterSrc.mobile} alt="" aria-hidden="true" className={styles.masterMobile} />

        <div className={styles.textZone} style={textZoneStyle(desktop, mobile)}>
          <h1 className={styles.displayedName}>{hero.displayName}</h1>
          {dateRangeText !== null && <p className={styles.dates}>{dateRangeText}</p>}
          {hero.shortPhrase !== null && <p className={styles.shortPhrase}>{hero.shortPhrase}</p>}
        </div>
      </div>
    </SkinScope>
  );
}
