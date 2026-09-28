"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { selectGalleryState } from "@/config/gallery-a13-multi-state-manifests";
import type { Language } from "@/config/languages";
import { measureTitleGlyphMask, type TitleGlyphMeasure } from "@/lib/memorial/gallery/title-glyph-mask";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { runDesktopGallery, type A13FamilyMedia, type DesktopGalleryRun } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13CaptionFontProbe, A13PilotScene, type A13PilotSceneProps } from "@/components/memorial/gallery/A13PilotScene";
import { useMemoryViewer, type ViewerReport } from "@/components/memorial/viewer/MemoryViewer";

/**
 * A13 Gallery Desktop — the functional section: family media → GREEN state
 * (`runDesktopGallery`) → rendered scene, with the interaction contract
 * closed for EVERY state (G2…G5, G6 exact, Signature 7+):
 * - every visible print is interactive (whole print, click, Enter/Space —
 *   `DynamicPolaroid`'s existing contract) and opens the shared Viewer
 *   Desktop V2 with its media, natural size, caption, theme, origin Gallery;
 * - the CTA exists for Signature 7+ only; its action is `onSeeMore`, the
 *   host's navigation to the Full Album of the SAME media (the navigation
 *   itself belongs to the memorial page — an A13 frontier, not decided
 *   here). Light and Dark call the same action.
 *
 * Geometry: nothing here computes or changes a position. The title glyph
 * mask (G2–G5 V2.1 title authority) is measured from a hidden 1670 px
 * scene once the fonts are loaded, exactly as the GREEN pilots do; until
 * then the scene's box is reserved (hidden, inert), so the section never
 * shifts the page when the prints arrive (CLS 0).
 *
 * STOP policy (dette D7): the run's `outcome` is exposed (`onRun`,
 * `data-gallery-outcome` = absent | resolved | unresolved). When the V2
 * runtime cannot resolve G2–G5, NO Gallery is rendered — no empty scene,
 * no other engine — and the anomaly is logged once (`console.error`, the
 * repo's convention); nothing technical reaches the visitor. A visible
 * replacement, if any, is the product host's decision, not this section's.
 */

/** The scene's material theme (kept off the Dark token module: only the rendering layer reads it). */
type GalleryTheme = NonNullable<A13PilotSceneProps["theme"]>;

export interface A13DesktopGalleryProps {
  media: readonly A13FamilyMedia[];
  theme: GalleryTheme;
  title: string;
  subtitle: string;
  /** CTA label resolved by the host (i18n authority lives outside A13). */
  ctaLabel: { text: string; lang: Language };
  /** Signature 7+ CTA action: open the Full Album of these media. */
  onSeeMore: () => void;
  onViewerReport?: (report: ViewerReport) => void;
  /** QA: the run actually rendered. */
  onRun?: (run: DesktopGalleryRun<A13FamilyMedia>) => void;
}

export function A13DesktopGallery({ media, theme, title, subtitle, ctaLabel, onSeeMore, onViewerReport, onRun }: A13DesktopGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [titleMask, setTitleMask] = useState<TitleGlyphMeasure | null>(null);
  const viewer = useMemoryViewer(onViewerReport);

  useEffect(() => {
    if (!font?.fontCheck || !titleRef.current) return;
    let alive = true;
    void measureTitleGlyphMask(titleRef.current).then((t) => {
      if (alive && t) setTitleMask(t);
    });
    return () => {
      alive = false;
    };
  }, [font]);

  const run = useMemo(() => (font && titleMask ? runDesktopGallery(media, (m) => m.caption, font.measurer, titleMask.mask) : null), [media, font, titleMask]);
  // One log per distinct anomaly (a re-render or a recomputation never duplicates it).
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!run) return;
    if (run.outcome === "unresolved") {
      const key = `${run.stateId}|${run.mediaCount}|${run.anomaly?.code}|${run.anomaly?.detail}`;
      if (logged.current !== key) {
        logged.current = key;
        console.error("Gallery Desktop: composition unresolved (no Gallery rendered):", run.stateId, run.anomaly?.code, run.anomaly?.rule, run.anomaly?.detail);
      }
    } else logged.current = null;
    onRun?.(run);
  }, [run, onRun]);

  return (
    <div ref={rootRef} data-testid="a13-desktop-gallery" data-gallery-state={run?.stateId ?? (run ? "absent" : "pending")} data-gallery-outcome={run?.outcome ?? "pending"} data-gallery-status={run?.status ?? "pending"}>
      <A13CaptionFontProbe />
      {/* Title glyph mask source: the same scene, empty, at scale 1 (1670 px), off-screen. */}
      <div ref={titleRef} style={{ position: "absolute", width: 1670, left: -20000, top: 0 }} aria-hidden="true" inert>
        <A13PilotScene stateId="title" theme={theme} title={title} subtitle={subtitle} entries={[]} />
      </div>
      {!run && selectGalleryState(media.length) ? (
        // Pending (font + title mask): the scene's exact box is reserved, invisible — no layout shift when the prints arrive.
        <div style={{ visibility: "hidden" }} aria-hidden="true" inert data-testid="a13-desktop-gallery-pending">
          <A13PilotScene stateId="pending" theme={theme} title={title} subtitle={subtitle} entries={[]} />
        </div>
      ) : null}
      {run?.outcome === "resolved" && run.stateId ? (
        <A13PilotScene
          stateId={run.stateId}
          theme={theme}
          title={title}
          subtitle={subtitle}
          entries={run.entries.map((e) => ({ slot: e.slot, layout: e.layout, src: e.media.src, alt: e.media.alt, caption: e.caption }))}
          cta={run.hasCta ? { label: ctaLabel.text, lang: ctaLabel.lang, onActivate: onSeeMore } : null}
          onActivate={(slotId) => {
            const e = run.entries.find((x) => x.slot.slotId === slotId);
            if (!e) return;
            const m = e.media;
            viewer.open({ mediaId: m.mediaId, src: m.src, alt: m.alt, naturalWidth: m.width, naturalHeight: m.height, caption: m.caption }, theme, "gallery");
          }}
        />
      ) : null}
      {viewer.node}
    </div>
  );
}
