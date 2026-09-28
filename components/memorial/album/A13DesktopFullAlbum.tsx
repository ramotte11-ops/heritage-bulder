"use client";

import { useMemo, useRef } from "react";
import type { AlbumTheme } from "@/config/album-a13-dark-material";
import type { Language } from "@/config/languages";
import { layoutAlbum } from "@/lib/memorial/album/album-layout";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { AlbumMemoryTable } from "@/components/memorial/album/AlbumMemoryTable";
import { useMemoryViewer, type ViewerReport } from "@/components/memorial/viewer/MemoryViewer";

/**
 * A13 Full Album Desktop — the functional section: ALL the family media, in
 * family order, laid out by the GREEN Album runtime (`layoutAlbum`, Light
 * V1.2 geometry, Dark material only), every print opening the shared
 * Viewer Desktop V2 (origin Album). It is what the Gallery's Signature 7+
 * CTA leads to: the six memories shown in the Gallery are part of it, no
 * media is lost, duplicated or reordered.
 */

export interface A13DesktopFullAlbumProps {
  media: readonly A13FamilyMedia[];
  theme: AlbumTheme;
  /** Language of the product text (Album and Viewer — i18n, dette D5). Family content is never translated. */
  language: Language;
  onViewerReport?: (report: ViewerReport) => void;
}

export function A13DesktopFullAlbum({ media, theme, language, onViewerReport }: A13DesktopFullAlbumProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const viewer = useMemoryViewer(onViewerReport);
  const layout = useMemo(() => layoutAlbum(media.map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption })), font?.measurer ?? null), [media, font]);

  return (
    <div ref={rootRef} data-testid="a13-desktop-full-album" data-album-count={media.length} data-album-status={layout.status}>
      <A13CaptionFontProbe />
      {layout.status === "ALBUM_ABSENT" ? null : (
        <AlbumMemoryTable
          layout={layout}
          media={media.map(({ mediaId, src, alt }) => ({ mediaId, src, alt }))}
          theme={theme}
          language={language}
          onActivate={(_mediaId, mediaIndex) => {
            const m = media[mediaIndex];
            viewer.open({ mediaId: m.mediaId, src: m.src, alt: m.alt, naturalWidth: m.width, naturalHeight: m.height, caption: m.caption }, theme, "album", language);
          }}
        />
      )}
      {viewer.node}
    </div>
  );
}
