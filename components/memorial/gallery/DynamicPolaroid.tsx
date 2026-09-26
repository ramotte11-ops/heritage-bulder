import type { CSSProperties } from "react";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import styles from "./DynamicPolaroid.module.css";

/**
 * A13 Dynamic Polaroid — one physical print (PILOT, Desktop Light, V2).
 *
 * One indivisible DOM unit: paper + photo window + inner stroke + bottom
 * band + caption + double shadow. Every length is `N × --k` (one canonical
 * 1670-frame pixel at the current rendered width): the canvas scales
 * uniformly, nothing reflows.
 *
 * The slot is a zero-size frame at the reference centre, rotated by the
 * manifest angle; the print is placed in that frame from
 * `layoutDynamicPolaroid` (origin = reference centre). Shadows are
 * `box-shadow`s of the print itself, so they rotate with it (contract §6).
 * The caption lives in the print's own bottom band, centred in the slot's
 * caption safe zone — never lifted into a floating layer.
 */

export interface DynamicPolaroidProps {
  slot: A13Slot;
  layout: PolaroidLayout;
  src: string;
  alt: string;
  caption: string | null;
  /** QA overlays: reference box, anchor, safe zone, source photo bounds. */
  qa?: boolean;
}

function k(v: number) {
  return `calc(${v} * var(--k))`;
}

function box(r: Rect): CSSProperties {
  return { left: k(r.x), top: k(r.y), width: k(r.width), height: k(r.height) };
}

function anchorPoint(slot: A13Slot) {
  const { width: w, height: h } = slot.referenceSize;
  const x = slot.anchor.startsWith("left") ? -w / 2 : slot.anchor.startsWith("right") ? w / 2 : 0;
  const y = slot.anchor.includes("bottom") ? h / 2 : slot.anchor.includes("top") ? -h / 2 : 0;
  return { x, y };
}

export function DynamicPolaroid({ slot, layout, src, alt, caption, qa = false }: DynamicPolaroidProps) {
  const slotStyle: CSSProperties = {
    left: k(slot.center.x),
    top: k(slot.center.y),
    zIndex: slot.zIndex,
    transform: `rotate(${slot.rotationDeg}deg)`,
  };
  const ref = slot.referenceSize;
  const anchor = anchorPoint(slot);

  return (
    <div
      className={styles.slot}
      style={slotStyle}
      data-slot-id={slot.slotId}
      data-media-index={slot.mediaIndex}
      data-mode={layout.mode}
    >
      <figure className={styles.print} style={box(layout.outer)} data-print={slot.slotId}>
        <div className={styles.window} style={box(layout.window)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className={styles.photo} style={box(layout.photo)} draggable={false} />
        </div>
        <figcaption className={styles.safeZone} style={box(layout.safeZone)}>
          {caption ? (
            <span className={styles.caption} data-testid={`caption-${slot.slotId}`}>
              {caption}
            </span>
          ) : null}
        </figcaption>
        <div className={styles.stroke} aria-hidden="true" />
        {qa ? (
          <>
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
            <div className={styles.qaSafeZone} style={box(layout.safeZone)} aria-hidden="true" />
          </>
        ) : null}
      </figure>
      {qa ? (
        <>
          <div
            className={styles.qaReference}
            style={box({ x: -ref.width / 2, y: -ref.height / 2, width: ref.width, height: ref.height })}
            aria-hidden="true"
          >
            <span className={styles.qaLabel}>
              {slot.slotId} · media[{slot.mediaIndex}] · z{slot.zIndex} · {slot.rotationDeg}°
            </span>
          </div>
          <div className={styles.qaAnchor} style={{ left: k(anchor.x), top: k(anchor.y) }} aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}
