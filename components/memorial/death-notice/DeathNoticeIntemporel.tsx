"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { HeroContent } from "@/types/hero";
import type { DeathNoticeContent } from "@/types/death-notice";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { formatHeroDateRange } from "@/lib/memorial/format-hero-date";
import {
  DEATH_NOTICE_INTEMPOREL_ASSETS,
  DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX,
  DEATH_NOTICE_INTEMPOREL_GEOMETRY,
  DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY,
  type DeathNoticeSceneGeometry,
} from "@/config/death-notice-intemporel-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { cormorantGaramond } from "@/components/builder/fonts";
import styles from "./DeathNoticeIntemporel.module.css";

/**
 * Mission 039B — A03: the real Death Notice ("Avis de décès") editorial
 * renderer, Intemporel skin, Studio pack
 * `A03_RUNTIME_CORRECTIONS_V3_1_1_QA_CANONICAL`.
 *
 * ## SCENE TOP + SCENE MIDDLE×N + SCENE BOTTOM (mission brief section 3, 6)
 *
 * The Studio's decor is exactly three assets per format×variant, stacked
 * in normal document flow (`<img>`, `width: 100%; height: auto` — the
 * browser's own intrinsic-ratio scaling, which IS the mission's scale
 * rule `renderedSceneWidth / nativeCanvasWidth` applied uniformly, never
 * a second hand-rolled computation): SCENE TOP once, SCENE MIDDLE
 * repeated exactly `N` times, SCENE BOTTOM once. No asset is stretched,
 * cropped, or re-ratioed.
 *
 * ## Why ONE format renders at a time, not both (CSS-switched) like Hero
 *
 * `HeroIntemporel` renders both its Desktop and Mobile masters
 * unconditionally (CSS `display` switches which one shows) because each
 * is exactly one fixed image. A03's SCENE MIDDLE is repeated `N` times,
 * and `N` is computed independently per format (the same family content
 * wraps to a different height at each width) — rendering both formats'
 * full stacks simultaneously would mean tracking two independent `N`
 * values and downloading up to `2 × (TOP + N×MIDDLE + BOTTOM)` heavy
 * PNGs at once for no visible benefit (only one is ever shown). This
 * component instead decides the active format in JS (`window.innerWidth`
 * against `DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX`, the same
 * threshold every other fit hook in this codebase already compares
 * against) and renders only that format's stack, recomputed on resize —
 * a deliberate, documented divergence from Hero's simpler convention,
 * not an oversight.
 *
 * ## Content is HTML/CSS, decor is Studio pixels (mission brief section 7)
 *
 * The content overlay (eyebrow, title, name, dates, announcement, detail
 * blocks, functional rules/pictograms) is ordinary HTML/CSS, absolutely
 * positioned over the background stack, starting at `anchors_y_px.eyebrow`
 * (scaled) and flowing downward in normal document flow from there — see
 * `config/death-notice-intemporel-tokens.ts`'s own docstring for why the
 * OTHER anchors are reference deltas for the nominal case, not fixed
 * per-element pins (a pinned `dates_top` would collide with a two-line
 * name). No family text is ever baked into an asset; no decorative
 * element (the rameau, the seal, the torn edges) is ever reconstructed in
 * CSS — both live entirely inside the Studio's own TOP/BOTTOM pixels.
 *
 * ## Allongement dynamique — the N formula (mission brief section 6)
 *
 * `useSceneRuntime` below measures the content overlay's own real
 * rendered height (`useLayoutEffect`, after real layout against the real
 * font — no iterative layout loop, one measure-then-set pass, mirroring
 * `useFitDisplayName`'s own discipline in `HeroIntemporel.tsx`) and
 * derives:
 *
 *   requiredSceneHeight = dynamicContentBottom + bottomArtReserve
 *   N = max(1, ceil((requiredSceneHeight - TOP_H - BOTTOM_H) / MIDDLE_H))
 *
 * entirely in RENDERED px (every `geometry.json` figure scaled by
 * `renderedSceneWidth / nativeCanvasWidth` first), so no back-and-forth
 * unit conversion is needed. Recomputed whenever the family's displayed
 * content changes (autosave, resume) or the viewport is resized
 * (`ResizeObserver` on the wrapper — justified here because the scale
 * itself depends on the wrapper's actual rendered width, not just the
 * breakpoint; cleaned up on unmount).
 *
 * ## Long name (mission brief section 9)
 *
 * See `useFitLongName` below — the exact three/four-tier rule the
 * mission brief locks, transcribed into
 * `DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY.name`. Never truncates, ellipsizes,
 * or drops a word at any tier.
 *
 * ## Details (mission brief section 8)
 *
 * `visibleBlocks` filters to only the precisions the family actually
 * entered — an absent block leaves no reserved space (mission brief: "un
 * bloc absent disparaît totalement"). The desktop grid rule (1 -> full
 * width, 2 -> two columns, 3 -> 2+1 full, 4 -> 2+2, 5 -> 2+2+1 full) falls
 * out of one CSS rule: two columns always, and the LAST block spans both
 * columns exactly when the total count is odd (`DeathNoticeIntemporel.module.css`'s
 * own `.blockFull`). Mobile is always one column (CSS alone).
 *
 * ## Light/Dark (mission brief section 12)
 *
 * `skinVariant` alone picks the asset set and the ink tokens — never
 * `prefers-color-scheme` (see `lib/memorial/skin-runtime.ts`'s own
 * doctrine, reused unchanged).
 *
 * ## Animation (mission brief section 13)
 *
 * A plain opacity+translateY entrance, `prefers-reduced-motion` disables
 * it — see the module stylesheet.
 */
export interface DeathNoticeIntemporelProps {
  hero: HeroContent;
  deathNotice: DeathNoticeContent;
  editorialContext: EditorialContext;
  language: Language;
  skinVariant: SkinVariant;
}

const PRECISION_BLOCKS: readonly { field: DeathNoticePrecisionField; labelKey: TranslationKey }[] = [
  { field: "generalLocation", labelKey: "deathNotice.blockLocation" },
  { field: "familyMessage", labelKey: "deathNotice.blockFamilyMessage" },
  { field: "thought", labelKey: "deathNotice.blockThought" },
  { field: "quote", labelKey: "deathNotice.blockQuote" },
  { field: "other", labelKey: "deathNotice.blockOther" },
];

/** Same DOM technique `HeroIntemporel.tsx`'s `countVisualLines` already
 * uses. jsdom (tests) doesn't implement `Range.getClientRects` — fails
 * safe to "1 line" there rather than throwing. */
function countVisualLines(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (typeof range.getClientRects !== "function") return 1;
  const rects = range.getClientRects();
  return rects.length || 1;
}

export interface FitLongNameResult {
  ref: RefObject<HTMLHeadingElement | null>;
  fontSizePx: number | null;
  isFallback: boolean;
}

/**
 * Mission brief section 9 (QG-locked) — Mobile-only exceptional
 * fallback. "Cas normal" (1-2 lines, 38-50px) is CSS's own `clamp` on
 * `.name` (module stylesheet); this hook only engages once that still
 * wraps past `maxLinesNormal` lines at the CSS floor. Desktop never
 * enters an equivalent fallback (never below 48px, never past 2 lines by
 * shrinking further) — a name that still fails there is the mission's
 * own documented STOP condition, not a further client-side reduction.
 */
export function useFitLongName(text: string): FitLongNameResult {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [result, setResult] = useState<{ fontSizePx: number | null; isFallback: boolean }>({
    fontSizePx: null,
    isFallback: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const t = DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY.name;

    function fit() {
      if (!el) return;
      const isDesktop = window.innerWidth >= DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX;

      el.classList.remove(styles.nameFallback);

      // Tier 1/2 (both breakpoints, mission brief section 9): start at
      // the nominal max, shrink in whole px, never below that
      // breakpoint's own floor, until it wraps into <= 2 lines. A name
      // that already fits at nominal never enters the loop at all.
      const maxPx: number = isDesktop ? t.desktop.maxPx : t.mobile.maxPx;
      const floorPx: number = isDesktop ? t.desktop.minPx : t.mobile.minPx;
      let size: number = maxPx;
      el.style.fontSize = `${size}px`;
      let lines = countVisualLines(el);
      while (lines > 2 && size > floorPx) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        lines = countVisualLines(el);
      }

      if (lines <= 2) {
        setResult({ fontSizePx: size, isFallback: false });
        return;
      }

      // Desktop never goes further: still over 2 lines at the 48px floor
      // is the mission's own documented STOP condition — this hook does
      // not invent a further reduction, it simply stays at the floor
      // (full name, no truncation) for a human to escalate.
      if (isDesktop) {
        setResult({ fontSizePx: floorPx, isFallback: false });
        return;
      }

      // Mobile-only exceptional fallback (section 9.2) — the class must
      // be applied BEFORE this loop measures anything (see
      // HeroIntemporel/old A03's own bugfix note): measuring at the
      // wider pre-fallback box would undercount how many lines the text
      // wraps into once the narrower box applies.
      el.classList.add(styles.nameFallback);
      const fb = t.mobile.fallback;
      size = fb.targetPx;
      el.style.fontSize = `${size}px`;
      lines = countVisualLines(el);
      while (lines > fb.maxLines && size > fb.minPx) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        lines = countVisualLines(el);
      }
      setResult({ fontSizePx: size, isFallback: true });
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text]);

  return { ref, ...result };
}

type SceneFormat = "desktop" | "mobile";

interface SceneRuntimeState {
  format: SceneFormat;
  nMiddle: number;
}

/**
 * The N formula (mission brief section 6) — see this file's own top
 * docstring. `contentRef` measures the content overlay's real rendered
 * height; `wrapperRef` measures the scene's real rendered width (the
 * scale rule's own `renderedSceneWidth`). One measure-then-set pass per
 * effect run, never an iterative layout loop.
 */
function useSceneRuntime(
  wrapperRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  geometry: Record<SkinVariant, { desktop: DeathNoticeSceneGeometry; mobile: DeathNoticeSceneGeometry }>,
  skinVariant: SkinVariant,
  deps: readonly unknown[],
): SceneRuntimeState {
  const [state, setState] = useState<SceneRuntimeState>({ format: "mobile", nMiddle: 1 });

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    function measure() {
      if (!wrapper || !content) return;
      const format: SceneFormat =
        window.innerWidth >= DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX ? "desktop" : "mobile";
      const g = geometry[skinVariant][format];
      const renderedWidth = wrapper.getBoundingClientRect().width;
      const scale = renderedWidth > 0 ? renderedWidth / g.nativeCanvasWidthPx : 1;

      const contentBottomPx = content.getBoundingClientRect().bottom - wrapper.getBoundingClientRect().top;
      const requiredSceneHeightPx = contentBottomPx + g.bottomArtReservePx * scale;
      const topHPx = g.sceneTopHeightPx * scale;
      const bottomHPx = g.sceneBottomHeightPx * scale;
      const middleHPx = g.sceneMiddleHeightPx * scale;

      const n = Math.max(1, Math.ceil((requiredSceneHeightPx - topHPx - bottomHPx) / middleHPx));

      setState((prev) => (prev.format === format && prev.nMiddle === n ? prev : { format, nMiddle: n }));
    }

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(wrapper);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinVariant, ...deps]);

  return state;
}

export function DeathNoticeIntemporel({
  hero,
  deathNotice,
  editorialContext,
  language,
  skinVariant,
}: DeathNoticeIntemporelProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);
  const contextLabel = translate(
    language,
    editorialContext === "announcement" ? "context.announcementTitle" : "context.remembranceTitle",
  );

  const visibleBlocks = PRECISION_BLOCKS.filter((block) => deathNotice.precisions[block.field] !== null).map(
    (block) => ({ ...block, text: deathNotice.precisions[block.field] as string }),
  );
  const oddTotal = visibleBlocks.length % 2 === 1;

  const { ref: nameRef, fontSizePx: nameFontSizePx, isFallback: nameIsFallback } = useFitLongName(
    hero.displayName ?? "",
  );

  const { format, nMiddle } = useSceneRuntime(wrapperRef, contentRef, DEATH_NOTICE_INTEMPOREL_GEOMETRY, skinVariant, [
    hero.displayName,
    hero.birth,
    hero.death,
    deathNotice.announcementText,
    deathNotice.precisions.generalLocation,
    deathNotice.precisions.familyMessage,
    deathNotice.precisions.thought,
    deathNotice.precisions.quote,
    deathNotice.precisions.other,
  ]);

  const assets = DEATH_NOTICE_INTEMPOREL_ASSETS;

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div ref={wrapperRef} className={`${styles.wrap} ${cormorantGaramond.variable}`} data-scene-format={format}>
        {/* SCENE TOP + SCENE MIDDLE×N + SCENE BOTTOM — the Studio's whole
            decorative composition, stacked in normal flow. Never
            stretched: each image keeps its own intrinsic ratio via
            `width: 100%; height: auto` (module stylesheet). */}
        <div className={styles.scene} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assets.top[skinVariant][format]} alt="" className={styles.sceneImg} />
          {Array.from({ length: nMiddle }).map((_, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={index} src={assets.middle[skinVariant][format]} alt="" className={styles.sceneImg} />
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assets.bottom[skinVariant][format]} alt="" className={styles.sceneImg} />
        </div>

        <div ref={contentRef} className={styles.content}>
          <p className={styles.eyebrow}>{contextLabel}</p>
          <h1 className={styles.title}>{translate(language, "deathNotice.previewTitle")}</h1>

          <div className={styles.branchSpace} aria-hidden="true" />

          <h2
            ref={nameRef}
            className={`${styles.name} ${nameIsFallback ? styles.nameFallback : ""}`}
            style={nameFontSizePx !== null ? { fontSize: `${nameFontSizePx}px` } : undefined}
          >
            {hero.displayName ?? ""}
          </h2>
          {dateRangeText !== null && <p className={styles.dates}>{dateRangeText}</p>}

          <div className={styles.rule} aria-hidden="true" />

          {deathNotice.announcementText !== null && (
            <p className={styles.announcement}>{deathNotice.announcementText}</p>
          )}

          {visibleBlocks.length > 0 && (
            <div className={styles.details}>
              {visibleBlocks.map((block, index) => {
                const isLast = index === visibleBlocks.length - 1;
                return (
                  <div
                    key={block.field}
                    className={`${styles.block} ${oddTotal && isLast ? styles.blockFull : ""}`}
                  >
                    <div className={styles.blockHeading}>
                      <span className={styles.blockDot} aria-hidden="true" />
                      <span className={styles.blockLabel}>{translate(language, block.labelKey)}</span>
                    </div>
                    <p
                      className={
                        block.field === "quote" ? `${styles.blockText} ${styles.blockTextQuote}` : styles.blockText
                      }
                    >
                      {block.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SkinScope>
  );
}
