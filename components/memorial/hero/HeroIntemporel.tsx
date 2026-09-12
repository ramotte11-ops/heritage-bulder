"use client";

import { useState, type CSSProperties } from "react";
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
  HERO_INTEMPOREL_FRAME,
  HERO_INTEMPOREL_LAYOUT,
  HERO_INTEMPOREL_PHOTO,
} from "@/config/hero-intemporel-tokens";
import { cormorantGaramond, laBelleAurore } from "@/components/builder/fonts";
import styles from "./HeroIntemporel.module.css";

/**
 * Mission 035 — the real Hero Intemporel renderer.
 *
 * "ONE Hero architecture" (mission brief section 3): this component
 * knows nothing about the Builder, T08, or any Guided Flow step — it
 * takes a `HeroContent` and a resolved photo, and renders exactly the
 * Studio-validated composition. `HeroRevealStep` (T08) is its first
 * caller; a future Live Preview and the published memorial page are
 * meant to render this SAME component, never a fork of it (never "a
 * Hero built specially for T08").
 *
 * ## Sources of truth (mission brief section 4 — "Claude assemble,
 * Claude ne redessine pas")
 *
 * Every number in `config/hero-intemporel-tokens.ts` is transcribed
 * verbatim from the Studio handoff's own `hero-master-tokens.json`.
 * Every image is one of the package's own WebP/SVG assets under
 * `public/assets/hero/intemporel/` — nothing here is a CSS
 * approximation of a paper texture, a botanical, a seal, or a frame.
 * The three validated references (Light desktop, Light mobile, Dark
 * mobile — `HANDOFF/references/*_VALIDATED.png`) are what this
 * composition was assembled against; Dark desktop reuses the exact
 * Light desktop geometry with only the variant's own colors/materials
 * swapped, per mission brief section 7 ("aucun déplacement de calque
 * pour Dark desktop").
 *
 * The handoff's own tokens give an outer box for the collage, the
 * identity block and the seal, plus EXACT boxes for the photo and its
 * frame — but not a per-millimeter position for every individual
 * decorative paper sliver inside the collage (the postcard peeking out,
 * the two deckled paper sheets, the accent paper, the botanical spray,
 * the paperclip). Those are assembled from the package's own real
 * assets, placed inside the given `collage` box with small, deliberately
 * modest offsets/rotations to match the validated references visually —
 * documented here as the one place this mission exercised layout
 * judgment the tokens themselves did not specify, never as invented art
 * direction (no shape, gradient, or generic "card" was drawn to stand in
 * for any of them).
 *
 * ## Responsive (mission brief section 8)
 *
 * Every positioned element carries BOTH its desktop and mobile
 * percentages as CSS custom properties (`--xd`/`--xm`, etc.) via inline
 * style; `HeroIntemporel.module.css` is the ONE place the
 * `960px` breakpoint (`HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX`) decides
 * which pair is actually used. This is a single DOM tree (nothing
 * duplicated for screen readers) whose layout is entirely CSS-driven —
 * never a client-side "isMobile" branch re-rendering different markup,
 * and never `prefers-color-scheme`-flavoured logic of any kind (that
 * dimension is `skinVariant`, an explicit prop, always).
 *
 * ## Light/Dark (mission brief section 6)
 *
 * `<SkinScope skin="intemporel" skinVariant={skinVariant}>` is the ONLY
 * place ambiance is decided — the same renderer, scoped by the same two
 * DOM attributes `lib/memorial/skin-runtime.ts` already defines
 * (`data-heritage-skin`/`data-heritage-skin-variant`). Every
 * variant-specific asset/color is selected by a plain lookup keyed on
 * that same `skinVariant` prop — never `window.matchMedia`.
 *
 * ## Photo + crop (mission brief section 9 — Mission 034's engine, reused)
 *
 * `resolveHeroCropGeometry` (lib/memorial/hero-crop-geometry.ts, built by
 * Mission 034 for exactly this reuse) is the only crop math anywhere in
 * this component — no second formula. The photo's own natural size is
 * read off the decoded `<img>` (`onLoad`), identical to `HeroCropStep`;
 * until it resolves, geometry renders against the same defensive square
 * fallback that module already documents. The photo itself never
 * rotates (section 9's invariant, always `rotate(0)`); only the
 * decorative frame around it carries the Studio's own rotation values.
 *
 * ## Content (mission brief sections 11-12)
 *
 * Every visible piece of family content is read straight from `hero`
 * and `editorialContext` — no new field, no invented microcopy standing
 * in for family data. Purely decorative Studio copy this package does
 * not hand over as approved text (the reference's own handwritten
 * "Merci d'avoir été toi" note, and the italic secondary paragraph under
 * the short phrase) is cleanly omitted rather than invented (section 12
 * — "les microcopies décoratives non déjà approuvées peuvent être
 * omises proprement").
 */
export interface HeroIntemporelProps {
  hero: HeroContent;
  photo: { media: Media; readUrl: string } | null;
  skinVariant: SkinVariant;
  editorialContext: EditorialContext;
  language: Language;
}

const VARIANT_ASSETS = {
  light: {
    background: "/assets/hero/intemporel/light/hero-bg-fiber-light.webp",
    accentPaper: "/assets/hero/intemporel/light/hero-paper-accent-sage-light.webp",
    paperMain: "/assets/hero/intemporel/light/hero-paper-main-light.webp",
  },
  dark: {
    background: "/assets/hero/intemporel/dark/hero-bg-fiber-dark.webp",
    accentPaper: "/assets/hero/intemporel/dark/hero-paper-accent-olive-dark.webp",
    paperMain: "/assets/hero/intemporel/dark/hero-paper-main-dark.webp",
  },
} as const satisfies Record<SkinVariant, Record<string, string>>;

const COMMON_ASSETS = {
  postcard: "/assets/hero/intemporel/common/hero-postcard-intemporel.webp",
  deckled1: "/assets/hero/intemporel/common/hero-paper-layer-deckled-01.webp",
  deckled2: "/assets/hero/intemporel/common/hero-paper-layer-deckled-02.webp",
  frame: "/assets/hero/intemporel/common/hero-photo-frame-intemporel.webp",
  paperclip: "/assets/hero/intemporel/common/hero-paperclip-aged-brass.webp",
  botanicalMain: "/assets/hero/intemporel/common/hero-botanical-main-intemporel.webp",
  botanicalCorner: "/assets/hero/intemporel/common/hero-botanical-corner-intemporel.webp",
  seal: "/assets/hero/intemporel/common/hero-seal-tree-intemporel.webp",
  heartDivider: "/assets/hero/intemporel/common/hero-heart-divider-intemporel.svg",
  leafDivider: "/assets/hero/intemporel/common/hero-leaf-divider-intemporel.svg",
} as const;

const UNRESOLVED_IMAGE_SIZE: HeroCropImageSize = { naturalWidth: 0, naturalHeight: 0 };

interface Box {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number;
  rotationDeg?: number;
}

/** Both breakpoints' geometry as CSS custom properties — see this
 * module's own docstring, "Responsive". `heightPct` is only set on boxes
 * the Studio tokens actually give an explicit height for (collage,
 * identity); every other element sizes its height from its own
 * intrinsic image ratio (or, for the photo window, the fixed 4:5 ratio
 * Mission 034's engine already enforces) — never a height guessed here. */
function boxStyle(desktop: Box, mobile: Box): CSSProperties {
  const style: Record<string, string> = {
    "--xd": `${desktop.xPct}%`,
    "--yd": `${desktop.yPct}%`,
    "--wd": `${desktop.widthPct}%`,
    "--rotd": `${desktop.rotationDeg ?? 0}deg`,
    "--xm": `${mobile.xPct}%`,
    "--ym": `${mobile.yPct}%`,
    "--wm": `${mobile.widthPct}%`,
    "--rotm": `${mobile.rotationDeg ?? 0}deg`,
  };
  if (desktop.heightPct !== undefined) style["--hd"] = `${desktop.heightPct}%`;
  if (mobile.heightPct !== undefined) style["--hm"] = `${mobile.heightPct}%`;
  return style as CSSProperties;
}

export function HeroIntemporel({ hero, photo, skinVariant, editorialContext, language }: HeroIntemporelProps) {
  const [imageSize, setImageSize] = useState<HeroCropImageSize>(UNRESOLVED_IMAGE_SIZE);

  const assets = VARIANT_ASSETS[skinVariant];
  const crop = hero.photo?.crop ?? NEUTRAL_HERO_CROP;
  const geometry = resolveHeroCropGeometry(imageSize, crop);

  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);
  const contextLabel = translate(
    language,
    editorialContext === "announcement" ? "context.announcementTitle" : "context.remembranceTitle",
  );

  const { desktop: photoD, mobile: photoM } = HERO_INTEMPOREL_PHOTO;
  const { desktop: frameD, mobile: frameM } = HERO_INTEMPOREL_FRAME;
  const { desktop: layoutD, mobile: layoutM } = HERO_INTEMPOREL_LAYOUT;

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.hero} ${cormorantGaramond.variable} ${laBelleAurore.variable}`}>
        {/* z0 — background canvas texture, full-bleed. */}
        <img src={assets.background} alt="" aria-hidden="true" className={styles.background} />

        {/* --- Collage's own decorative papers --------------------------
            Positioned relative to the `collage` box itself (plain CSS
            percentages in HeroIntemporel.module.css) — the Studio tokens
            give this box's own outer bounds but not a per-sheet
            coordinate for what fills it (see this module's own
            docstring). The photo/frame/paperclip below are NOT nested
            here: their own tokens are hero-relative, and CSS percentage
            positioning resolves against the nearest POSITIONED ancestor
            — nesting them inside this absolutely-positioned box would
            silently rescale every one of their percentages against the
            collage's own (smaller) dimensions instead of the hero's. */}
        <div
          className={styles.collage}
          style={boxStyle(layoutD.collage, layoutM.collage)}
          aria-hidden="true"
        >
          {/* z10 — the two big deckled paper sheets, the collage's own depth. */}
          <img
            src={COMMON_ASSETS.deckled1}
            alt=""
            aria-hidden="true"
            className={`${styles.paperDepth} ${styles.deckled1}`}
          />
          <img
            src={COMMON_ASSETS.deckled2}
            alt=""
            aria-hidden="true"
            className={`${styles.paperDepth} ${styles.deckled2}`}
          />

          {/* z20 — the vintage postcard, peeking from behind the stack. */}
          <img src={COMMON_ASSETS.postcard} alt="" aria-hidden="true" className={styles.postcard} />

          {/* z30 — the variant's own accent paper. */}
          <img src={assets.accentPaper} alt="" aria-hidden="true" className={styles.accentPaper} />

          {/* z80 — the botanical spray, traversing the whole collage. */}
          <img
            src={COMMON_ASSETS.botanicalMain}
            alt=""
            aria-hidden="true"
            className={styles.botanicalMain}
          />
        </div>

        {photo !== null && (
          <>
            {/* z50 — the family photo itself, positioned hero-relative
                (the Studio's own `photo.desktop`/`photo.mobile` tokens).
                Rotation is always 0 (mission brief section 9's
                invariant) — only the frame around it, below, carries the
                Studio's rotation. */}
            <div className={styles.photoWindow} style={boxStyle(photoD, photoM)}>
              {/* Never a static asset next/image can optimize, and
                  never persisted — Mission 030's short-lived signed
                  read URL. */}
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

            {/* z60 — the frame, its own opening exactly 4:5 and genuinely
                transparent there (the QG's own final correction —
                verified against the real asset's alpha channel, never
                assumed), rotated per the Studio's value, hero-relative
                like the photo above — rendered at its own intrinsic
                ratio (width set, height auto) so its real paper border
                is never distorted. */}
            <img
              src={COMMON_ASSETS.frame}
              alt=""
              aria-hidden="true"
              className={styles.frame}
              style={boxStyle(frameD, frameM)}
            />

            {/* z70 — the paperclip, above the frame, hero-relative too
                (pinned just above the frame's own top edge). */}
            <img
              src={COMMON_ASSETS.paperclip}
              alt=""
              aria-hidden="true"
              className={styles.paperclip}
              style={boxStyle(
                { xPct: frameD.xPct + frameD.widthPct * 0.34, yPct: frameD.yPct - 3, widthPct: frameD.widthPct * 0.22 },
                { xPct: frameM.xPct + frameM.widthPct * 0.34, yPct: frameM.yPct - 2, widthPct: frameM.widthPct * 0.22 },
              )}
            />
          </>
        )}

        {/* z40 — the identity block's own paper backing. */}
        <img
          src={assets.paperMain}
          alt=""
          aria-hidden="true"
          className={styles.paperMain}
          style={boxStyle(
            {
              xPct: layoutD.identity.xPct - 4,
              yPct: layoutD.identity.yPct - 8,
              widthPct: layoutD.identity.widthPct + 8,
              heightPct: layoutD.identity.heightPct + 16,
            },
            {
              xPct: layoutM.identity.xPct - 4,
              yPct: layoutM.identity.yPct - 4,
              widthPct: layoutM.identity.widthPct + 8,
              heightPct: layoutM.identity.heightPct + 8,
            },
          )}
        />

        {/* z100/z110 — the identity block: a conditional vertical flow,
            never a rigid absolutely-positioned pile (mission brief
            section 11). */}
        <div className={styles.identity} style={boxStyle(layoutD.identity, layoutM.identity)}>
          <p className={styles.contextLabel}>{contextLabel}</p>
          <h1 className={styles.displayedName}>{hero.displayName}</h1>
          {dateRangeText !== null && (
            <>
              <p className={styles.dates}>{dateRangeText}</p>
              <img
                src={COMMON_ASSETS.heartDivider}
                alt=""
                aria-hidden="true"
                className={styles.heartDivider}
              />
            </>
          )}
          {hero.shortPhrase !== null && (
            <>
              <p className={styles.shortPhrase}>{hero.shortPhrase}</p>
              <img
                src={COMMON_ASSETS.leafDivider}
                alt=""
                aria-hidden="true"
                className={styles.leafDivider}
              />
            </>
          )}
        </div>

        {/* z120 — the seal, plus its corner botanical, same corner. */}
        <img
          src={COMMON_ASSETS.botanicalCorner}
          alt=""
          aria-hidden="true"
          className={styles.botanicalCorner}
          style={boxStyle(
            { xPct: layoutD.seal.centerXPct - layoutD.seal.widthPct * 1.3, yPct: layoutD.seal.centerYPct - layoutD.seal.widthPct * 1.3, widthPct: layoutD.seal.widthPct * 3.2 },
            { xPct: layoutM.seal.centerXPct - layoutM.seal.widthPct * 1.3, yPct: layoutM.seal.centerYPct - layoutM.seal.widthPct * 1.3, widthPct: layoutM.seal.widthPct * 3.2 },
          )}
        />
        <img
          src={COMMON_ASSETS.seal}
          alt=""
          aria-hidden="true"
          className={styles.seal}
          style={boxStyle(
            { xPct: layoutD.seal.centerXPct - layoutD.seal.widthPct / 2, yPct: layoutD.seal.centerYPct - layoutD.seal.widthPct / 2, widthPct: layoutD.seal.widthPct },
            { xPct: layoutM.seal.centerXPct - layoutM.seal.widthPct / 2, yPct: layoutM.seal.centerYPct - layoutM.seal.widthPct / 2, widthPct: layoutM.seal.widthPct },
          )}
        />
      </div>
    </SkinScope>
  );
}
