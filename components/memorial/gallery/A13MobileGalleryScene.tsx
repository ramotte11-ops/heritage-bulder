import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import {
  A13_MOBILE_BACKGROUND,
  A13_MOBILE_CANVAS,
  A13_MOBILE_CTA,
  A13_MOBILE_LAYER_Z,
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
 * A13 Gallery — MOBILE LIGHT scene: the ONE common photo-free Mobile
 * background + the state's prints (the SHARED `DynamicPolaroid`, unchanged)
 * + the runtime title + the Signature 7+ CTA. Nothing else: no foreground,
 * no botanical layer, no ornament, no baked text. The decor never passes in
 * front of a print (the background is layer 0).
 *
 * Geometry is received already computed (`runMobileGallery`): each entry's
 * slot is centred on its paper centre, rotated by the manifest angle,
 * stacked by its paint order. The scene only draws it in the 941 × 1672
 * frame (`--k`).
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

/** QA overlay (pilot only), source px. */
export interface A13MobileSceneQa {
  territories: { slotId: string; rect: A13MobileRect }[];
  witnesses: { slotId: string; polygon: { x: number; y: number }[] }[];
  centers: { slotId: string; center: { x: number; y: number }; pivotCenter: { x: number; y: number } }[];
  hitSquares: { slotId: string; side: number; center: { x: number; y: number } }[];
  maskRects: { x: number; y: number; width: number; height: number }[];
  ctaSafeBox: A13MobileRect | null;
}

type Activation = { onActivate?: (slotId: string) => void; language: Language } | { onActivate?: undefined; language?: Language };

export type A13MobileGallerySceneProps = {
  entries: A13MobileSceneEntry[];
  title: string;
  subtitle: string;
  /** Diagnostic attribute only. */
  stateId?: string;
  cta?: A13MobileSceneCta | null;
  /** Caption size in source px (per viewport), passed to every print. */
  captionFontSizePx?: number;
  qa?: A13MobileSceneQa | null;
} & Activation;

const box = (r: A13MobileRect) => ({
  left: `calc(${r.x} * var(--k))`,
  top: `calc(${r.y} * var(--k))`,
  width: `calc(${r.width} * var(--k))`,
  height: `calc(${r.height} * var(--k))`,
});

export function A13MobileGalleryScene({ entries, title, subtitle, stateId, cta = null, captionFontSizePx, qa = null, onActivate, language }: A13MobileGallerySceneProps) {
  return (
    <div className={`${styles.stage} ${laBelleAurore.variable}`} data-testid="a13-mobile-scene" data-state={stateId} data-profile="mobile">
      <div className={styles.canvas} data-a13-mobile-canvas="">
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
        <header className={styles.titleBlock} style={{ zIndex: A13_MOBILE_LAYER_Z.runtimeTitle }}>
          <h2 className={`${styles.title} ${ebGaramond.className}`}>{title}</h2>
          <p className={`${styles.subtitle} ${ebGaramondItalic.className}`}>{subtitle}</p>
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
          <svg className={styles.qaLayer} style={{ zIndex: 990 }} viewBox={`0 0 ${A13_MOBILE_CANVAS.width} ${A13_MOBILE_CANVAS.height}`} aria-hidden="true" data-testid="qa-mobile">
            {qa.maskRects.length ? <path className={styles.qaMask} d={qa.maskRects.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}z`).join("")} data-testid="qa-title-mask" /> : null}
            {qa.territories.map(({ slotId, rect }) => (
              <rect key={`t-${slotId}`} className={styles.qaTerritory} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
            {qa.witnesses.map(({ slotId, polygon }) => (
              <polygon key={`w-${slotId}`} className={styles.qaWitness} points={polygon.map((p) => `${p.x},${p.y}`).join(" ")} />
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
            {qa.ctaSafeBox ? <rect className={styles.qaSafe} x={qa.ctaSafeBox.x} y={qa.ctaSafeBox.y} width={qa.ctaSafeBox.width} height={qa.ctaSafeBox.height} /> : null}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
