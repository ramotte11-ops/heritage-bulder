import type { CSSProperties } from "react";
import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { CaptionLayout } from "@/lib/memorial/gallery/caption-layout";
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
 * The caption (V2.1) lives in the print's own bottom band as SVG text:
 * each line is drawn at the exact start x / baseline computed by
 * `layoutCaption` from the real La Belle Aurore metrics, so the ink the QA
 * measures is the ink on screen. It is never lifted into a floating layer
 * and is not rendered at all until the font is confirmed loaded.
 */

export interface DynamicPolaroidProps {
  slot: A13Slot;
  layout: PolaroidLayout;
  src: string;
  alt: string;
  /** Measured caption, or null (absent, or font not yet confirmed). */
  caption: CaptionLayout | null;
  /** QA overlays: reference box, anchor, source photo bounds, ink boxes. */
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
        <figcaption className={styles.band} style={box(layout.band)}>
          {caption ? <span className={styles.srOnly}>{caption.lines.map((l) => l.text).join(" ")}</span> : null}
        </figcaption>
        {caption ? (
          <svg
            className={styles.captionSvg}
            style={box({ x: 0, y: 0, width: layout.outer.width, height: layout.outer.height })}
            viewBox={`0 0 ${layout.outer.width} ${layout.outer.height}`}
            aria-hidden="true"
            data-testid={`caption-${slot.slotId}`}
            data-status={caption.status}
          >
            {caption.lines.map((l, i) => (
              <text key={i} x={l.x} y={l.baseline} className={styles.captionText}>
                {l.text}
              </text>
            ))}
            {qa ? (
              <>
                <rect className={styles.qaProtected} {...caption.protectedBox} />
                <rect className={styles.qaInk} {...caption.ink} />
              </>
            ) : null}
          </svg>
        ) : null}
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
