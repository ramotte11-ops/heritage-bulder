"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_MOBILE_CTA, a13MobileProfileActive } from "@/config/gallery-a13-mobile-manifest";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { runMobileGallery, selectMobileGalleryState, type MobileGalleryRun } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { measureMobileTitleGlyphMask, type MobileTitleGlyphMeasure } from "@/lib/memorial/gallery/mobile-title-glyph-mask";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { A13MobileGalleryScene, type A13MobileSceneQa } from "@/components/memorial/gallery/A13MobileGalleryScene";

/**
 * A13 Gallery — MOBILE LIGHT section (Handoff V1.4), the Mobile counterpart
 * of `A13DesktopGallery`, on the same shared data and interactions:
 * family media → Mobile composition (`runMobileGallery`) → rendered scene.
 *
 * - Profile: active ONLY when the stage (full-bleed, = viewport) is 375–430
 *   px wide; otherwise nothing is rendered here (`data-gallery-profile`
 *   says why). Which profile a page mounts is the product host's decision.
 * - Every visible print is interactive (whole print, tap, Enter/Space —
 *   `DynamicPolaroid`'s existing contract) and reports its family index
 *   through `onActivateMemory`; the CTA exists for Signature 7+ only and
 *   calls `onSeeMore`. (The Viewer and the Album are not part of this
 *   Mobile Gallery mission.)
 * - The title glyph mask is measured from a hidden copy of the scene at the
 *   same width once the fonts are loaded; until then the scene's box is
 *   reserved (hidden, inert), so the section never shifts the page.
 * - STOP policy (shared, dette D7): when the Mobile runtime cannot resolve
 *   a state, NO Gallery is rendered, the anomaly is logged once
 *   (`console.error`) and exposed (`data-gallery-outcome`, `onRun`);
 *   nothing technical reaches the visitor.
 */

export interface A13MobileGalleryProps {
  media: readonly A13FamilyMedia[];
  title: string;
  subtitle: string;
  /** Language of the product text (CTA, accessible names); family text is never translated. */
  language: Language;
  onSeeMore: () => void;
  onActivateMemory?: (mediaIndex: number) => void;
  /** QA: the run actually rendered, and the title measure it used. */
  onRun?: (run: MobileGalleryRun<A13FamilyMedia>, title: MobileTitleGlyphMeasure) => void;
  /** QA overlay (pilot only). */
  qa?: boolean;
}

export function A13MobileGallery({ media, title, subtitle, language, onSeeMore, onActivateMemory, onRun, qa = false }: A13MobileGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [width, setWidth] = useState<number | null>(null);
  const [titleMeasure, setTitleMeasure] = useState<MobileTitleGlyphMeasure | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const active = width !== null && a13MobileProfileActive(width);

  useEffect(() => {
    if (!active || !font?.fontCheck || !titleRef.current) return;
    let alive = true;
    void measureMobileTitleGlyphMask(titleRef.current).then((t) => {
      if (alive && t) setTitleMeasure(t);
    });
    return () => {
      alive = false;
    };
  }, [active, font, width, title, subtitle]);

  const measure = titleMeasure && width !== null && Math.abs(titleMeasure.stageWidth - width) < 0.5 ? titleMeasure : null;
  const run = useMemo(
    () => (active && font && measure ? runMobileGallery({ media, captionOf: (m) => m.caption, measurer: font.measurer, titleMask: measure.mask, stageWidth: measure.stageWidth }) : null),
    [active, media, font, measure],
  );

  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!run || !measure) return;
    if (run.outcome === "unresolved") {
      const key = `${run.stateId}|${run.mediaCount}|${run.stageWidth}|${run.anomaly?.code}|${run.anomaly?.detail}`;
      if (logged.current !== key) {
        logged.current = key;
        console.error("Gallery Mobile: composition unresolved (no Gallery rendered):", run.stateId, run.anomaly?.code, run.anomaly?.rule, run.anomaly?.detail);
      }
    } else logged.current = null;
    onRun?.(run, measure);
  }, [run, measure, onRun]);

  const qaLayer: A13MobileSceneQa | null =
    qa && run?.outcome === "resolved" && measure
      ? {
          territories: run.entries.map((e) => ({ slotId: e.mobileSlot.slotId, rect: e.mobileSlot.centerTerritory })),
          witnesses: run.entries.map((e) => {
            const s = e.mobileSlot;
            const a = (s.rotationDeg * Math.PI) / 180;
            const pts = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([sx, sy]) => {
              const dx = (sx * s.outerReference.width) / 2;
              const dy = (sy * s.outerReference.height) / 2;
              return { x: s.referenceCenter.x + dx * Math.cos(a) - dy * Math.sin(a), y: s.referenceCenter.y + dx * Math.sin(a) + dy * Math.cos(a) };
            });
            return { slotId: s.slotId, polygon: pts };
          }),
          centers: run.entries.map((e) => ({ slotId: e.mobileSlot.slotId, center: e.center, pivotCenter: e.pivotCenter })),
          hitSquares: run.entries.map((e) => ({ slotId: e.mobileSlot.slotId, side: e.hitTarget.side, center: e.hitTarget.center })),
          maskRects: measure.mask.rows.flatMap((row, i) => row.map(([x0, x1]) => ({ x: x0, y: measure.mask.y0 + i, width: x1 - x0 + 1, height: 1 }))),
          ctaSafeBox: run.hasCta ? A13_MOBILE_CTA.safeBox : null,
        }
      : null;

  const state = active ? selectMobileGalleryState(media.length) : null;
  return (
    <div
      ref={rootRef}
      style={{ position: "relative", width: "100%" }}
      data-testid="a13-mobile-gallery"
      data-gallery-profile={width === null ? "pending" : active ? "mobile" : "inactive"}
      data-gallery-state={run?.stateId ?? (run ? "absent" : "pending")}
      data-gallery-outcome={run?.outcome ?? "pending"}
      data-gallery-status={run?.status ?? "pending"}
    >
      <A13CaptionFontProbe />
      {active ? (
        // Title glyph-mask source: the same scene, empty, same width, hidden.
        <div ref={titleRef} style={{ position: "absolute", left: 0, top: 0, width: "100%", visibility: "hidden", pointerEvents: "none" }} aria-hidden="true" inert>
          <A13MobileGalleryScene stateId="title" title={title} subtitle={subtitle} entries={[]} />
        </div>
      ) : null}
      {!run && state ? (
        <div style={{ visibility: "hidden" }} aria-hidden="true" inert data-testid="a13-mobile-gallery-pending">
          <A13MobileGalleryScene stateId="pending" title={title} subtitle={subtitle} entries={[]} />
        </div>
      ) : null}
      {run?.outcome === "resolved" && run.stateId ? (
        <A13MobileGalleryScene
          stateId={run.stateId}
          title={title}
          subtitle={subtitle}
          entries={run.entries.map((e) => ({ slot: e.slot, layout: e.layout, src: e.media.src, alt: e.media.alt, caption: e.caption }))}
          captionFontSizePx={run.metrics.captionFontPx}
          cta={run.hasCta ? { label: translate(language, "gallery.seeMoreMemories"), lang: language, onActivate: onSeeMore } : null}
          language={language}
          onActivate={(slotId) => {
            const e = run.entries.find((x) => x.slot.slotId === slotId);
            if (e) onActivateMemory?.(e.mediaIndex);
          }}
          qa={qaLayer}
        />
      ) : null}
    </div>
  );
}
