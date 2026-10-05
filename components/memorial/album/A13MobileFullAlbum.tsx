"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { a13AlbumMobileActive } from "@/config/album-a13-mobile-light";
import { a13MobileAuthorityFrame, type A13MobileAuthorityFrame } from "@/config/a13-responsive-bridge";
import type { Language } from "@/config/languages";
import type { AlbumTheme } from "@/config/album-a13-dark-material";
import { layoutAlbumMobile, solveAlbumMobileGeometry, type AlbumMobileLayout } from "@/lib/memorial/album/album-mobile-layout";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { smallMobileAlbum } from "@/lib/memorial/gallery/gallery-small-mobile";
import { AlbumMobileTable } from "@/components/memorial/album/AlbumMobileTable";
import { useMemoryViewer, type ViewerReport } from "@/components/memorial/viewer/MemoryViewer";

/**
 * A13 Full Album MOBILE LIGHT — the functional section (Handoff V1.1): ALL
 * the family media, in family order, laid out by the Mobile profile of the
 * shared Album engine, every print opening the existing shared Viewer
 * (origin Album, Light). Mobile profile only (375–430 px); outside it
 * nothing is rendered here.
 *
 * - The geometry depends on the media only (solved once, viewport-free);
 *   a width change only rescales it and re-lays the captions.
 * - Captions wait for La Belle Aurore (real metrics); until then the
 *   caption-free page is drawn — the geometry never depends on them.
 * - STOP policy: an unresolved composition renders no Album; the anomaly is
 *   exposed (`data-album-status`, `onLayout`) and logged once.
 * - Theme (Full Album Mobile Dark): material only — the same layout, the
 *   Dark table, and the shared Viewer opened in the Album's theme.
 * - Responsive Bridge V1 (`responsive`, the product host only): 431–1023 px
 *   is the Tablet vertical family — the Mobile partition, grammars, solved
 *   groups and captions laid out at the 430 frame (`layoutAlbumMobile` at
 *   430), painted on the real W-wide table (`--k = W / 1024`), i.e. × W /
 *   430. The media count never enters the factor. 320–374 px is the Small
 *   Mobile family (V1.4.1): the 375 layout, centres compressed and one
 *   minimal shift per group (`smallMobileAlbum`), on a 375 table centred in
 *   the W stage. Without it, only 375–430 renders, exactly as before.
 */

export interface A13MobileFullAlbumProps {
  media: readonly A13FamilyMedia[];
  language: Language;
  onViewerReport?: (report: ViewerReport) => void;
  /** Activation witness (QA), called before the Viewer opens. */
  onActivateMemory?: (mediaId: string, mediaIndex: number) => void;
  /** QA: the layout actually rendered. */
  onLayout?: (layout: AlbumMobileLayout) => void;
  qa?: boolean;
  /** Material theme (default Light): the same layout, Dark materials only; the Viewer opens in it. */
  theme?: AlbumTheme;
  /** Responsive Bridge V1: also render 431–1023 px as the Tablet family (the 430 layout, remapped). Default false: 375–430 only. */
  responsive?: boolean;
  /** Host-owned Viewer: when given, a print asks the host to open the Viewer (origin Album) instead of this section's own — so it outlives a family switch. */
  onOpenMemory?: (mediaIndex: number) => void;
}

export function A13MobileFullAlbum({ media, language, onViewerReport, onActivateMemory, onLayout, qa = false, theme = "light", responsive = false, onOpenMemory }: A13MobileFullAlbumProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const viewer = useMemoryViewer(onViewerReport);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const albumMedia = useMemo(() => media.map(({ mediaId, width: w, height: h, caption }) => ({ mediaId, width: w, height: h, caption })), [media]);
  const geometry = useMemo(() => solveAlbumMobileGeometry(albumMedia), [albumMedia]);
  // The Mobile authority's frame: W itself (375–430), or 430 remapped to W (Tablet, bridged hosts only).
  const frame: A13MobileAuthorityFrame | null = width === null ? null : responsive ? a13MobileAuthorityFrame(width, true) : a13AlbumMobileActive(width) ? { family: "mobile", sourceWidth: width, remap: 1 } : null;
  const active = frame !== null;
  const sourceWidth = frame?.sourceWidth ?? null;
  const base = useMemo(() => (sourceWidth !== null ? layoutAlbumMobile(albumMedia, font?.fontCheck ? font.measurer : null, sourceWidth, geometry) : null), [sourceWidth, albumMedia, font, geometry]);
  // Small Mobile (320–374): the 375 layout, centres compressed, one minimal shift per group (FULL_ALBUM_CONTRACT V1.1).
  const small = useMemo(() => (frame?.family === "small" && width !== null && base?.status === "PASS" ? smallMobileAlbum(base, width) : null), [frame?.family, width, base]);
  const layout = small ? (small.status === "PASS" ? small.layout : null) : base;
  useEffect(() => {
    if (small && small.status !== "PASS") console.error("Album Small Mobile: composition unresolved (no Album rendered):", small.status, small.detail);
  }, [small]);

  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!layout) return;
    if (layout.status === "ITEM_INACCESSIBLE") {
      const key = `${layout.geometry.count}|${layout.geometry.groups.map((g) => g.status).join(",")}`;
      if (logged.current !== key) {
        logged.current = key;
        console.error("Album Mobile: composition unresolved (no Album rendered):", layout.geometry.groups.find((g) => g.status !== "PASS")?.detail);
      }
    }
    onLayout?.(layout);
  }, [layout, onLayout]);

  // Small Mobile: the 375 table, centred in the W stage, its material cropped.
  const frameSmall = (node: ReactNode) =>
    frame?.family === "small" && width !== null ? (
      <div style={{ width: "100%", overflow: "hidden" }} data-a13-small-mobile="">
        <div style={{ width: 375, marginLeft: (width - 375) / 2 }}>{node}</div>
      </div>
    ) : (
      node
    );

  return (
    <div
      ref={rootRef}
      data-testid="a13-mobile-full-album"
      data-album-count={media.length}
      data-album-status={small && small.status !== "PASS" ? small.status : (layout?.status ?? (active ? "pending" : "inactive"))}
      data-album-captions={font?.fontCheck ? "measured" : "pending"}
      {...(frame?.family === "tablet" ? { "data-album-family": "tablet", "data-a13-source-width": frame.sourceWidth, "data-a13-remap": frame.remap } : {})}
      {...(frame?.family === "small" ? { "data-album-family": "small" } : {})}
    >
      <A13CaptionFontProbe />
      {layout && layout.status === "PASS" ? (
        frameSmall(<AlbumMobileTable
          layout={layout}
          media={media.map(({ mediaId, src, alt }) => ({ mediaId, src, alt }))}
          language={language}
          qa={qa}
          theme={theme}
          onActivate={(mediaId, mediaIndex) => {
            onActivateMemory?.(mediaId, mediaIndex);
            if (onOpenMemory) return onOpenMemory(mediaIndex);
            const m = media[mediaIndex];
            viewer.open({ mediaId: m.mediaId, src: m.src, alt: m.alt, naturalWidth: m.width, naturalHeight: m.height, caption: m.caption }, theme, "album", language);
          }}
        />)
      ) : null}
      {viewer.node}
    </div>
  );
}
