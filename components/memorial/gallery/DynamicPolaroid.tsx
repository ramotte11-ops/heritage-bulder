import type { CSSProperties } from "react";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import styles from "./DynamicPolaroid.module.css";

/**
 * A13 Dynamic Polaroid — one physical print (PILOT, Desktop Light).
 *
 * One indivisible DOM unit: paper + photo window + liseré + bottom band +
 * caption + double shadow (contract "Unité DOM indivisible"). Every length
 * is `N × --k`, where `--k` is one canonical 1670-frame pixel at the
 * current rendered width (set by the scene) — the whole canvas scales
 * uniformly, nothing reflows.
 *
 * The geometry is entirely `layoutDynamicPolaroid`'s: this component never
 * measures, sorts, nudges or re-centres anything. The photo is positioned
 * as an explicit rect that always keeps the source ratio (no stretch, no
 * `object-fit` guesswork); the window clips it only in `cover-safe-crop`.
 */

export interface DynamicPolaroidProps {
  slot: A13Slot;
  layout: PolaroidLayout;
  src: string;
  alt: string;
  caption: string | null;
  /** QA overlays: envelope, anchor, full source photo bounds. */
  qa?: boolean;
}

function k(v: number) {
  return `calc(${v} * var(--k))`;
}

function box(r: Rect): CSSProperties {
  return { left: k(r.x), top: k(r.y), width: k(r.width), height: k(r.height) };
}

export function DynamicPolaroid({ slot, layout, src, alt, caption, qa = false }: DynamicPolaroidProps) {
  const env = slot.maxEnvelope;
  const slotStyle: CSSProperties = {
    left: k(slot.anchor.x - env.width / 2),
    top: k(slot.anchor.y - env.height / 2),
    width: k(env.width),
    height: k(env.height),
    zIndex: slot.zIndex,
    transform: `rotate(${slot.rotationDeg}deg)`,
  };
  const bandTop = layout.window.y + layout.window.height;
  const framedWindow = layout.mode !== "contain-paper";

  return (
    <div
      className={styles.slot}
      style={slotStyle}
      data-slot-id={slot.slotId}
      data-media-index={slot.mediaIndex}
      data-mode={layout.mode}
    >
      <figure className={styles.print} style={box(layout.outer)}>
        <div className={`${styles.window} ${framedWindow ? styles.windowFramed : ""}`} style={box(layout.window)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className={`${styles.photo} ${framedWindow ? "" : styles.photoFramed}`}
            style={box(layout.photo)}
            draggable={false}
          />
        </div>
        <figcaption
          className={styles.band}
          style={{ top: k(bandTop), height: k(layout.outer.height - bandTop), paddingInline: k(layout.window.x) }}
        >
          {caption ? (
            <span className={styles.caption} data-testid={`caption-${slot.slotId}`}>
              {caption}
            </span>
          ) : null}
        </figcaption>
        {qa ? (
          <div
            className={styles.qaSource}
            style={box({
              x: layout.window.x + layout.photo.x,
              y: layout.window.y + layout.photo.y,
              width: layout.photo.width,
              height: layout.photo.height,
            })}
            aria-hidden="true"
          />
        ) : null}
      </figure>
      {qa ? (
        <>
          <div className={styles.qaEnvelope} aria-hidden="true">
            <span className={styles.qaLabel}>
              {slot.slotId} · media[{slot.mediaIndex}] · z{slot.zIndex}
            </span>
          </div>
          <div className={styles.qaAnchor} aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}
