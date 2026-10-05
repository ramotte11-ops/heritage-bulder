import type { CSSProperties, KeyboardEvent } from "react";
import type { A13Slot } from "@/config/gallery-a13-desktop-manifest";
import type { PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { CaptionLayout } from "@/lib/memorial/gallery/caption-layout";
import type { A13Theme } from "@/config/gallery-a13-dark-material";
import { darkPrintMaterial } from "@/lib/memorial/gallery/theme-material";
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
 *
 * Theme (A13 Desktop Dark V1.1): `theme` is MATERIAL ONLY. It never reaches
 * a length, a transform, a z-index or the photo: Dark adds, on the print,
 * the CSS custom properties of its paper (slot-seeded colour, grain,
 * sheen) that the Dark rules of the stylesheet paint — nothing else. The
 * geometry styles below are computed identically for both themes.
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
  /**
   * Gallery V2 (G2–G5 pilot): the whole print opens the memory (click, tap,
   * Enter, Space). Absent — as for G6 exact and Signature 7+ — the print
   * renders exactly as before (no role, no tab stop, no handler).
   */
  onActivate?: () => void;
  activateLabel?: string;
  /** Material theme, applied after the geometry (default Light, unchanged). */
  theme?: A13Theme;
  /**
   * A13 Album (extensible memory table): native image loading of the photo.
   * Absent — as for every Gallery state — no attribute is rendered and the
   * print is byte-identical to before. The print box is fully sized by the
   * geometry, so decoding never moves anything.
   */
  imageLoading?: "eager" | "lazy";
  /**
   * A13 Mobile Light: caption font size in the print's source px (the
   * caption SVG's user units), resolved per viewport from the Mobile CSS
   * token — the size the Mobile caption layout measured with. Absent — as
   * for every Desktop state — no attribute is rendered and the stylesheet's
   * Desktop 27 px applies, byte-identical to before.
   */
  captionFontSizePx?: number;
}

/**
 * A13 Mobile Light V1.5 — a narrow print whose caption needed a WIDER
 * bottom band (`layout.band` reaching past the paper's sides): one paper
 * in a T shape. Its material, texture (aligned tiles), inner stroke (inset
 * along the T outline) and double shadow (drop shadows of the whole shape)
 * are the Light print's own. Never produced on Desktop, where the band is
 * the paper's width: the print renders exactly as before.
 */
function widenedStroke(layout: PolaroidLayout) {
  const { width: W, height: H } = layout.outer;
  const { x: bx, y: by, width: bw } = layout.band;
  const d = 0.6;
  return [
    [d, d],
    [W - d, d],
    [W - d, by + d],
    [bx + bw - d, by + d],
    [bx + bw - d, H - d],
    [bx + d, H - d],
    [bx + d, by + d],
    [d, by + d],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
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

export function DynamicPolaroid({ slot, layout, src, alt, caption, qa = false, onActivate, activateLabel, theme = "light", imageLoading, captionFontSizePx }: DynamicPolaroidProps) {
  const slotStyle: CSSProperties = {
    left: k(slot.center.x),
    top: k(slot.center.y),
    zIndex: slot.zIndex,
    transform: `rotate(${slot.rotationDeg}deg)`,
  };
  const ref = slot.referenceSize;
  const anchor = anchorPoint(slot);
  const widened = layout.band.x < -1e-9;

  return (
    <div
      className={styles.slot}
      style={slotStyle}
      data-slot-id={slot.slotId}
      data-media-index={slot.mediaIndex}
      {...(onActivate ? { "data-interactive": "" } : {})}
      data-mode={layout.mode}
    >
      <figure
        className={widened ? `${styles.print} ${styles.printWidened}` : styles.print}
        style={theme === "dark" ? { ...box(layout.outer), ...(darkPrintMaterial(slot.slotId) as CSSProperties) } : box(layout.outer)}
        data-print={slot.slotId}
        {...(onActivate
          ? {
              role: "button",
              tabIndex: 0,
              "aria-label": activateLabel ?? alt,
              onClick: onActivate,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onActivate();
                }
              },
            }
          : {})}
      >
        {widened ? <div className={styles.bandWing} style={{ ...box(layout.band), backgroundPosition: `${k(-layout.band.x)} ${k(-layout.band.y)}` }} aria-hidden="true" data-band-wing="" /> : null}
        <div className={styles.window} style={box(layout.window)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className={styles.photo}
            style={box(layout.photo)}
            draggable={false}
            {...(imageLoading ? { loading: imageLoading, decoding: "async" as const } : {})}
          />
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
              <text key={i} x={l.x} y={l.baseline} className={styles.captionText} {...(captionFontSizePx !== undefined ? { style: { fontSize: `${captionFontSizePx}px` } } : {})}>
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
        {widened ? (
          <svg
            className={styles.strokeShape}
            style={box({ x: 0, y: 0, width: layout.outer.width, height: layout.outer.height })}
            viewBox={`0 0 ${layout.outer.width} ${layout.outer.height}`}
            aria-hidden="true"
          >
            <polygon points={widenedStroke(layout)} />
          </svg>
        ) : (
          <div className={styles.stroke} aria-hidden="true" />
        )}
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
