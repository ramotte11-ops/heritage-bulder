import type { CSSProperties } from "react";
import type { AlbumLayout } from "@/lib/memorial/album/album-layout";
import { A13_ALBUM_CANVAS, A13_ALBUM_TOP_ZONE } from "@/config/album-a13-grammars";
import { A13_ALBUM_DARK_BACKGROUNDS, type AlbumTheme } from "@/config/album-a13-dark-material";
import { laBelleAurore } from "@/components/builder/fonts";
import { DynamicPolaroid } from "@/components/memorial/gallery/DynamicPolaroid";
import styles from "./AlbumMemoryTable.module.css";

/**
 * A13 — ALBUM COMPLET DESKTOP LIGHT — the extensible memory table (pilot).
 *
 * ALBUM = PARCOURIR. One vertical table, never a grid: the solved
 * `AlbumLayout` (pure, theme-free) is drawn as ONE canvas in the canonical
 * 1670 frame (`--k = 100cqw / 1670`, capped at 1670 px), exactly like the
 * Gallery scene, but its height is the Album's own: the page grows, the
 * memories never shrink.
 *
 * - every tirage is the GREEN `DynamicPolaroid` (same paper, window,
 *   caption, activation); no second Polaroid engine;
 * - DOM order = strict family order (media 0…N−1); depth is only the
 *   z-index computed by the layout, so keyboard order never follows depth;
 * - groups are technical only: a `display: contents` wrapper (no box, no
 *   stacking context, no background, no separator) carries `data-album-*`
 *   diagnostics;
 * - space is reserved before decoding: the canvas height and every print
 *   box come from media metadata (width, height), so an image load never
 *   moves anything. First group eager, later groups `loading="lazy"`;
 * - TOP: the photo-free top art export does not exist yet (Handoff §10);
 *   nothing decorative is drawn — the Master ornament zone is only kept
 *   free by the first group. BODY: the Light table material (colour
 *   sampled on the Master + a quiet non-directional microtexture), one
 *   layer for the whole height, no repeated decor;
 * - The geometry has no theme input (Light V1.2 is the geometry authority).
 * - Theme (Album Desktop Dark V1): MATERIAL ONLY, applied after the layout.
 *   Dark marks the root `data-a13-theme="dark"` (the key of the Dark rules
 *   of this sheet and of `DynamicPolaroid`) and passes `theme="dark"` to the
 *   same `DynamicPolaroid` (slot-seeded paper, grain, sheen, visual
 *   shadows, caption ink, focus colour). The body layer paints the Studio
 *   TOP once, then the BODY repeated downward. The layout, the DOM order,
 *   every box, transform and z-index are the Light ones; Light renders
 *   exactly as before (no attribute, no theme prop).
 * - V1.1 §5: paint order = (depositEpoch, localZRank, mediaIndex), carried
 *   by each slot's z-index; no group clipping, no `overflow: hidden`, no
 *   group isolation — an incoming group is painted over the table.
 */

export interface AlbumMemoryTableMedia {
  mediaId: string;
  src: string;
  alt: string;
}

export interface AlbumMemoryTableProps {
  layout: AlbumLayout;
  media: readonly AlbumMemoryTableMedia[];
  /** Future Viewer entry point: the whole print opens this memory. */
  onActivate?: (mediaId: string, mediaIndex: number) => void;
  /** Groups whose photos load eagerly (default: the first). */
  eagerGroups?: number;
  qa?: boolean;
  label?: string;
  /** Material theme (default Light). Never an input of the geometry. */
  theme?: AlbumTheme;
}

const k = (v: number) => `calc(${v} * var(--k))`;

export function AlbumMemoryTable({ layout, media, onActivate, eagerGroups = 1, qa = false, label = "Album de souvenirs", theme = "light" }: AlbumMemoryTableProps) {
  const n = layout.prints.length;
  return (
    <section
      className={`${styles.stage} ${laBelleAurore.variable}`}
      aria-label={label}
      data-testid="album-memory-table"
      data-album-count={layout.count}
      data-album-groups={layout.groups.length}
      data-album-status={layout.status}
      {...(theme === "dark"
        ? {
            "data-a13-theme": "dark",
            // Material only: the Studio backgrounds, painted by the Dark rule of `.body`.
            style: {
              "--a13-dark-album-top": `url("${A13_ALBUM_DARK_BACKGROUNDS.top.src}")`,
              "--a13-dark-album-body": `url("${A13_ALBUM_DARK_BACKGROUNDS.body.src}")`,
            } as CSSProperties,
          }
        : {})}
    >
      <div className={styles.canvas} style={{ height: k(layout.height) } as CSSProperties} data-album-height={layout.height.toFixed(2)}>
        <div className={styles.body} aria-hidden="true" />
        {layout.groups.map((g) => (
          <div
            key={g.index}
            className={styles.group}
            data-album-group={g.index}
            data-album-grammar={g.grammar}
            data-album-phase={g.phase ?? ""}
            data-album-size={g.size}
            data-album-group-status={g.status}
          >
            {layout.prints
              .filter((p) => p.groupIndex === g.index)
              .map((p) => {
                const m = media[p.mediaIndex];
                const name = p.caption?.lines.length ? p.caption.lines.map((l) => l.text).join(" ") : `Souvenir ${p.mediaIndex + 1} sur ${n}`;
                return (
                  <DynamicPolaroid
                    key={p.slot.slotId}
                    slot={p.slot}
                    layout={p.layout}
                    src={m.src}
                    alt={m.alt}
                    caption={p.caption}
                    qa={qa}
                    imageLoading={g.index < eagerGroups ? "eager" : "lazy"}
                    {...(theme === "dark" ? { theme: "dark" as const } : {})}
                    {...(onActivate ? { onActivate: () => onActivate(p.mediaId, p.mediaIndex), activateLabel: name } : {})}
                  />
                );
              })}
          </div>
        ))}
        {qa ? (
          <svg className={styles.qaLayer} viewBox={`0 0 ${A13_ALBUM_CANVAS.width} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true" data-testid="album-qa">
            <rect
              className={styles.qaTopZone}
              x={A13_ALBUM_TOP_ZONE.x0}
              y={A13_ALBUM_TOP_ZONE.y0}
              width={A13_ALBUM_TOP_ZONE.x1 - A13_ALBUM_TOP_ZONE.x0}
              height={A13_ALBUM_TOP_ZONE.y1 - A13_ALBUM_TOP_ZONE.y0}
            />
            {Array.from({ length: 13 }, (_, i) => (
              <line key={`lane${i}`} className={styles.qaLane} x1={80 + (i * 1510) / 12} x2={80 + (i * 1510) / 12} y1={0} y2={layout.height} />
            ))}
            {layout.groups.map((g) => (
              <g key={g.index}>
                <line className={styles.qaTop} x1={0} x2={A13_ALBUM_CANVAS.width} y1={g.visualTop} y2={g.visualTop} />
                <line className={styles.qaBottom} x1={0} x2={A13_ALBUM_CANVAS.width} y1={g.visualBottom} y2={g.visualBottom} />
                <text className={styles.qaLabel} x={8} y={g.visualTop + 22}>
                  {`g${g.index} · ${g.grammar} · ${g.size} · media ${g.start}–${g.start + g.size - 1}${g.seam ? ` · ${g.seam.state} dx ${g.seam.dx} · chevauchement ${Math.round(g.seam.overlap)} · contact ${g.seam.contactLanes}` : ""}${g.status !== "PASS" ? ` · ${g.status}` : ""}`}
                </text>
              </g>
            ))}
            {layout.prints.map((p) => (
              <text key={p.slot.slotId} className={styles.qaIndex} x={p.slot.center.x} y={p.slot.center.y}>
                {p.mediaIndex + 1}
              </text>
            ))}
          </svg>
        ) : null}
      </div>
    </section>
  );
}
