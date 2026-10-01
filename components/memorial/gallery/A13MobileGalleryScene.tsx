import type { CSSProperties } from "react";
import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import {
  A13_MOBILE_BACKGROUND,
  A13_MOBILE_CANVAS,
  A13_MOBILE_CTA,
  A13_MOBILE_LAYER_Z,
  A13_MOBILE_SEPARATOR_ART,
  A13_MOBILE_TITLE_BLOCK,
  resolveByViewport,
  type A13MobileRect,
} from "@/config/gallery-a13-mobile-manifest";
import type { Language } from "@/config/languages";
import type { PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { CaptionLayout } from "@/lib/memorial/gallery/caption-layout";
import { translateWith } from "@/lib/i18n/translate";
import { ebGaramond, ebGaramondItalic, laBelleAurore } from "@/components/builder/fonts";
import { DynamicPolaroid } from "./DynamicPolaroid";
import styles from "./A13MobileGalleryScene.module.css";

/**
 * A13 Gallery — MOBILE LIGHT scene (Handoff V1.6): the ONE common
 * photo-free Mobile background + the state's prints (the SHARED
 * `DynamicPolaroid`) + the runtime title block + the Signature 7+ CTA.
 * Nothing else: no foreground, no botanical layer, no baked text. The
 * decor never passes in front of a print (the background is layer 0).
 *
 * - Stage: 941 source px wide (`--k`), `stageHeight` high (the state's
 *   `stageHeightSource`). The background keeps its 941 × 1672 raster at
 *   the top, unstretched; the extension below it is the shared A13 Light
 *   paper (paper token + texture), no decor, no repetition.
 * - Prints: received already solved in the GROUP frame
 *   (`runMobileGallery`); ONE container translates the whole group by the
 *   state's `translateY` — no slot is ever moved on its own.
 * - Title block (stage frame, CSS px per viewport from
 *   `A13_MOBILE_TITLE_BLOCK`): a centred stack from y = 0 — separator
 *   (runtime inline SVG: two short rules + the shared leaf sprig,
 *   `aria-hidden`), gap, title (one line), gap, subtitle; the header box
 *   IS the protected block. Inert for the pointer.
 * - CTA (7+): stage frame box, a real button.
 */

export interface A13MobileSceneEntry {
  slot: A13Slot;
  layout: PolaroidLayout;
  src: string;
  alt: string;
  caption: CaptionLayout | null;
}

export interface A13MobileSceneCta {
  label: string;
  lang: Language;
  onActivate?: () => void;
}

type Pts = { x: number; y: number }[];

/** QA overlay (pilot only), source px. Group-frame items are drawn inside the translated group. */
export interface A13MobileSceneQa {
  territories: { slotId: string; rect: A13MobileRect }[];
  witnesses: { slotId: string; polygon: Pts }[];
  centers: { slotId: string; center: { x: number; y: number }; pivotCenter: { x: number; y: number } }[];
  hitSquares: { slotId: string; side: number; center: { x: number; y: number } }[];
  safeZones: { slotId: string; polygon: Pts }[];
  /** Stage frame. */
  titleBlock: A13MobileRect | null;
  ctaSafeBox: A13MobileRect | null;
}

type Activation = { onActivate?: (slotId: string) => void; language: Language } | { onActivate?: undefined; language?: Language };

export type A13MobileGallerySceneProps = {
  entries: A13MobileSceneEntry[];
  title: string;
  subtitle: string;
  /** Stage width in CSS px (375–430): the title block's per-viewport values. */
  stageWidth: number;
  /** Stage height, source px (default: the background's 1672). */
  stageHeight?: number;
  /** The state's ONE group translation, source px (default 0). */
  translateY?: number;
  /** Diagnostic attribute only. */
  stateId?: string;
  cta?: A13MobileSceneCta | null;
  /** Caption size in source px (per viewport), passed to every print. */
  captionFontSizePx?: number;
  qa?: A13MobileSceneQa | null;
} & Activation;

const k = (v: number) => `calc(${v} * var(--k))`;
const box = (r: A13MobileRect) => ({ left: k(r.x), top: k(r.y), width: k(r.width), height: k(r.height) });
const pts = (p: Pts) => p.map((q) => `${q.x},${q.y}`).join(" ");

/** Runtime separator: two short rules + the shared leaf sprig (contract parts, CSS px). */
function Separator({ width, height }: { width: number; height: number }) {
  const p = A13_MOBILE_TITLE_BLOCK.separator.partsPercent;
  const t = A13_MOBILE_TITLE_BLOCK.separator.ruleThicknessCss;
  const art = A13_MOBILE_SEPARATOR_ART;
  const rule = Math.round((height - t) / 2);
  const x = (pc: number) => (pc * width) / 100;
  return (
    <svg className={styles.separator} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-a13-separator="" focusable="false">
      <rect x={0} y={rule} width={x(p.leftRule)} height={t} fill={art.ruleColor} />
      <svg
        x={x(p.leftRule + p.leftGap)}
        y={0}
        width={x(p.sprig)}
        height={height}
        viewBox={`${art.sprigViewBox.x} ${art.sprigViewBox.y} ${art.sprigViewBox.width} ${art.sprigViewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <image href={art.sprigSrc} width={art.sprigFile.width} height={art.sprigFile.height} />
      </svg>
      <rect x={width - x(p.rightRule)} y={rule} width={x(p.rightRule)} height={t} fill={art.ruleColor} />
    </svg>
  );
}

export function A13MobileGalleryScene({
  entries,
  title,
  subtitle,
  stageWidth,
  stageHeight = A13_MOBILE_CANVAS.height,
  translateY = 0,
  stateId,
  cta = null,
  captionFontSizePx,
  qa = null,
  onActivate,
  language,
}: A13MobileGallerySceneProps) {
  const tb = A13_MOBILE_TITLE_BLOCK;
  const v = (t: Parameters<typeof resolveByViewport>[0]) => resolveByViewport(t, stageWidth);
  const extension = Math.round((stageHeight - A13_MOBILE_BACKGROUND.height) * 1e6) / 1e6;
  const titleBlock: CSSProperties = { top: `${tb.topCss}px`, width: `${v(tb.protectedBlockWidthCss)}px`, height: `${v(tb.protectedBlockBottomCss)}px`, zIndex: A13_MOBILE_LAYER_Z.runtimeTitle };
  return (
    <div className={`${styles.stage} ${laBelleAurore.variable}`} data-testid="a13-mobile-scene" data-state={stateId} data-profile="mobile">
      <div className={styles.canvas} style={{ aspectRatio: `${A13_MOBILE_CANVAS.width} / ${stageHeight}` }} data-a13-mobile-canvas="" data-stage-height={stageHeight}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={A13_MOBILE_BACKGROUND.src}
          alt=""
          aria-hidden="true"
          className={styles.background}
          style={{ zIndex: A13_MOBILE_LAYER_Z.background }}
          draggable={false}
          width={A13_MOBILE_BACKGROUND.width}
          height={A13_MOBILE_BACKGROUND.height}
        />
        {extension > 0 ? (
          <div className={styles.extension} style={{ top: k(A13_MOBILE_BACKGROUND.height), height: k(extension), zIndex: A13_MOBILE_LAYER_Z.background }} aria-hidden="true" data-testid="stage-extension" />
        ) : null}
        <div className={styles.group} style={{ transform: `translateY(${k(translateY)})` }} data-testid="print-group" data-translate-y={translateY}>
          {entries.map(({ slot, layout, src, alt, caption }, i) => (
            <DynamicPolaroid
              key={slot.slotId}
              slot={slot}
              layout={layout}
              src={src}
              alt={alt}
              caption={caption}
              captionFontSizePx={captionFontSizePx}
              {...(onActivate && language
                ? {
                    onActivate: () => onActivate(slot.slotId),
                    // Caption when present (family content, as is), otherwise the product position label.
                    activateLabel: caption?.lines.length ? caption.lines.map((l) => l.text).join(" ") : translateWith(language, "memory.position", { index: i + 1, total: entries.length }),
                  }
                : {})}
            />
          ))}
        </div>
        <header className={styles.titleBlock} style={titleBlock} data-testid="title-block">
          <Separator width={v(tb.separator.widthCss)} height={v(tb.separator.heightCss)} />
          <h2
            className={`${styles.title} ${ebGaramond.className}`}
            style={{ marginTop: `${v(tb.separatorToTitleGapCss)}px`, fontSize: `${v(tb.title.fontSizeCss)}px`, maxWidth: `${v(tb.title.maxWidthCss)}px` }}
          >
            {title}
          </h2>
          <p className={`${styles.subtitle} ${ebGaramondItalic.className}`} style={{ marginTop: `${v(tb.titleToSubtitleGapCss)}px` }}>
            {subtitle}
          </p>
        </header>
        {cta ? (
          <button
            type="button"
            className={`${styles.cta} ${ebGaramondItalic.className}`}
            lang={cta.lang}
            data-testid="cta-7plus"
            style={{ ...box(A13_MOBILE_CTA.box), zIndex: A13_MOBILE_CTA.zIndex }}
            onClick={cta.onActivate}
          >
            <span className={styles.ctaLabel} data-testid="cta-7plus-label">
              {cta.label}
            </span>
          </button>
        ) : null}
        {qa ? (
          <svg className={styles.qaLayer} style={{ zIndex: 990 }} viewBox={`0 0 ${A13_MOBILE_CANVAS.width} ${stageHeight}`} aria-hidden="true" data-testid="qa-mobile">
            {qa.titleBlock ? <rect className={styles.qaBlock} x={qa.titleBlock.x} y={qa.titleBlock.y} width={qa.titleBlock.width} height={qa.titleBlock.height} data-testid="qa-title-block" /> : null}
            <g transform={`translate(0 ${translateY})`}>
              {qa.territories.map(({ slotId, rect }) => (
                <rect key={`t-${slotId}`} className={styles.qaTerritory} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
              ))}
              {qa.witnesses.map(({ slotId, polygon }) => (
                <polygon key={`w-${slotId}`} className={styles.qaWitness} points={pts(polygon)} />
              ))}
              {qa.safeZones.map(({ slotId, polygon }) => (
                <polygon key={`s-${slotId}`} className={styles.qaSafeZone} points={pts(polygon)} />
              ))}
              {qa.hitSquares.map(({ slotId, side, center }) =>
                side > 0 ? <rect key={`h-${slotId}`} className={styles.qaHit} x={center.x - side / 2} y={center.y - side / 2} width={side} height={side} /> : null,
              )}
              {qa.centers.map(({ slotId, center, pivotCenter }) => (
                <g key={`c-${slotId}`}>
                  <circle className={styles.qaPivotCenter} cx={pivotCenter.x} cy={pivotCenter.y} r={7} />
                  <circle className={styles.qaCenter} cx={center.x} cy={center.y} r={6} />
                  <text className={styles.qaLabel} x={center.x + 10} y={center.y - 10}>
                    {slotId}
                  </text>
                </g>
              ))}
            </g>
            {qa.ctaSafeBox ? <rect className={styles.qaSafe} x={qa.ctaSafeBox.x} y={qa.ctaSafeBox.y} width={qa.ctaSafeBox.width} height={qa.ctaSafeBox.height} /> : null}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
