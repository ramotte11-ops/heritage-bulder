import type { CSSProperties } from "react";
import { A13_ALBUM_MOBILE_FRAME, A13_ALBUM_MOBILE_MATERIALS } from "@/config/album-a13-mobile-light";
import type { Language } from "@/config/languages";
import type { AlbumMobileLayout } from "@/lib/memorial/album/album-mobile-layout";
import { translate, translateWith } from "@/lib/i18n/translate";
import { laBelleAurore } from "@/components/builder/fonts";
import { DynamicPolaroid } from "@/components/memorial/gallery/DynamicPolaroid";
import styles from "./AlbumMobileTable.module.css";

/**
 * A13 Full Album MOBILE LIGHT — the rendered table (Handoff V1.1).
 *
 * ONE canvas in the 1024 reference frame (`--k = 100cqw / 1024`, the
 * viewport scale s = W / 1024 — never a function of the media count), its
 * height the Album's own (`layout.height`): the page grows, memories never
 * shrink.
 *
 * - Materials (`layout.materials`): the photo-free TOP painted ONCE at the
 *   top, then the BODY stacked downward, each tile its native 1024 × 1536
 *   ratio (no stretch, no mirror), faded in by a linear alpha mask over
 *   112 (TOP→BODY) / 64 (BODY→BODY) source px; the material layer is
 *   clipped to the page (`overflow: hidden` on that layer only). The Master
 *   is never drawn.
 * - Prints: the shared `DynamicPolaroid` (same paper, window, caption
 *   renderer, activation), each with its caption band grown downward
 *   (`print.drawn`); DOM order = strict family order; depth = z-index only;
 *   groups are `display: contents` wrappers carrying diagnostics. First
 *   group eager, later groups `loading="lazy"`; every box comes from media
 *   metadata, so nothing moves when an image decodes.
 * - Every print is a real control (role button, Enter / Space, tap) that
 *   opens the shared Viewer (callback).
 */

export interface AlbumMobileTableMedia {
  mediaId: string;
  src: string;
  alt: string;
}

export interface AlbumMobileTableProps {
  layout: AlbumMobileLayout;
  media: readonly AlbumMobileTableMedia[];
  language: Language;
  onActivate?: (mediaId: string, mediaIndex: number) => void;
  eagerGroups?: number;
  qa?: boolean;
}

const k = (v: number) => `calc(${v} * var(--k))`;

export function AlbumMobileTable({ layout, media, language, onActivate, eagerGroups = 1, qa = false }: AlbumMobileTableProps) {
  const n = layout.prints.length;
  const g = layout.geometry;
  return (
    <section
      className={`${styles.stage} ${laBelleAurore.variable}`}
      aria-label={translate(language, "album.label")}
      data-testid="album-memory-table"
      data-album-profile="mobile-light"
      data-album-count={g.count}
      data-album-groups={g.groups.length}
      data-album-status={layout.status}
    >
      <div className={styles.canvas} style={{ height: k(layout.height) } as CSSProperties} data-album-height={layout.height.toFixed(3)} data-album-mobile-canvas="">
        <div className={styles.material} aria-hidden="true" data-testid="album-material">
          {layout.materials.map((m, i) => {
            const asset = A13_ALBUM_MOBILE_MATERIALS[m.asset];
            const mask = m.fadeIn > 0 ? `linear-gradient(to bottom, transparent 0, #000 ${k(m.fadeIn)})` : undefined;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                className={styles.tile}
                src={asset.src}
                alt=""
                width={asset.width}
                height={asset.height}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                style={{ top: k(m.y), height: k(m.height), ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }}
                data-material={m.asset}
                data-material-y={m.y}
                data-material-fade={m.fadeIn}
              />
            );
          })}
        </div>
        {g.groups.map((grp) => (
          <div key={grp.index} className={styles.group} data-album-group={grp.index} data-album-grammar={grp.grammar} data-album-size={grp.size} data-album-group-status={grp.status}>
            {layout.prints
              .filter((p) => p.groupIndex === grp.index)
              .map((p) => {
                const m = media[p.mediaIndex];
                const name = p.caption?.lines.length ? p.caption.lines.map((l) => l.text).join(" ") : translateWith(language, "memory.position", { index: p.mediaIndex + 1, total: n });
                return (
                  <DynamicPolaroid
                    key={p.slot.slotId}
                    slot={p.slot}
                    layout={p.drawn}
                    src={m.src}
                    alt={m.alt}
                    caption={p.caption}
                    captionFontSizePx={layout.captionFontPx}
                    qa={qa}
                    imageLoading={grp.index < eagerGroups ? "eager" : "lazy"}
                    {...(onActivate ? { onActivate: () => onActivate(p.mediaId, p.mediaIndex), activateLabel: name } : {})}
                  />
                );
              })}
          </div>
        ))}
        {qa ? (
          <svg className={styles.qaLayer} viewBox={`0 0 ${A13_ALBUM_MOBILE_FRAME.width} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true" data-testid="album-mobile-qa">
            {layout.materials.slice(1).map((m, i) => (
              <rect key={`fade${i}`} className={styles.qaFade} x={0} y={m.y} width={A13_ALBUM_MOBILE_FRAME.width} height={m.fadeIn} />
            ))}
            <line className={styles.qaEnd} x1={0} x2={A13_ALBUM_MOBILE_FRAME.width} y1={layout.paperBottom} y2={layout.paperBottom} />
            {g.groups.map((grp) => (
              <g key={grp.index}>
                <line className={styles.qaTop} x1={0} x2={A13_ALBUM_MOBILE_FRAME.width} y1={grp.visualTop} y2={grp.visualTop} />
                <text className={styles.qaLabel} x={8} y={grp.visualTop + 26}>
                  {`g${grp.index} · ${grp.grammar} · media ${grp.start + 1}–${grp.start + grp.size} · Δy ${grp.offsetY}${grp.status !== "PASS" ? ` · ${grp.status}` : ""}`}
                </text>
              </g>
            ))}
            {layout.prints.map((p) => (
              <text key={p.slot.slotId} className={styles.qaIndex} x={p.slot.center.x} y={p.slot.center.y}>
                {`${p.mediaIndex + 1}${p.role === "dominant" ? "★" : ""}`}
              </text>
            ))}
          </svg>
        ) : null}
      </div>
    </section>
  );
}
