"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_MOBILE_GROUP_TRANSLATION } from "@/config/gallery-a13-mobile-manifest";
import { a13MobileAuthorityFrame } from "@/config/a13-responsive-bridge";
import type { Language } from "@/config/languages";
import type { A13Theme } from "@/config/gallery-a13-dark-material";
import { translate } from "@/lib/i18n/translate";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { runMobileGallery, selectMobileGalleryState, type MobileGalleryRun } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { A13MobileGalleryScene, type A13MobileSceneQa } from "@/components/memorial/gallery/A13MobileGalleryScene";

/**
 * A13 Gallery — MOBILE LIGHT section (Handoff V1.7), the Mobile counterpart
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
 * - Captions are laid out with the real La Belle Aurore metrics (wrapping,
 *   shift, narrow bands): the run waits until the font is confirmed loaded;
 *   until then the state's stage box is reserved (hidden, inert), so the
 *   section never shifts the page. (The composition itself never depends
 *   on the captions — V1.6.)
 * - STOP policy (shared, dette D7): when the Mobile runtime cannot resolve
 *   a state, NO Gallery is rendered, the anomaly is logged once
 *   (`console.error`) and exposed (`data-gallery-outcome`, `onRun`);
 *   nothing technical reaches the visitor.
 * - Responsive Bridge V1 (`responsive`, the product host only): 431–1023 px
 *   is the Tablet vertical family — the run is the 430 one
 *   (`runMobileGallery` at stage width 430: same state, slots, solver
 *   decisions, captions, CTA) painted on the real W-wide stage with
 *   `remap` W / 430 (`config/a13-responsive-bridge.ts`). Without it, only
 *   375–430 renders, exactly as before.
 */

export interface A13MobileGalleryProps {
  media: readonly A13FamilyMedia[];
  title: string;
  subtitle: string;
  /** Language of the product text (CTA, accessible names); family text is never translated. */
  language: Language;
  onSeeMore: () => void;
  onActivateMemory?: (mediaIndex: number) => void;
  /** QA: the run actually rendered. */
  onRun?: (run: MobileGalleryRun<A13FamilyMedia>) => void;
  /** QA overlay (pilot only). */
  qa?: boolean;
  /** Material theme (default Light): the same run, Dark materials only. */
  theme?: A13Theme;
  /** Responsive Bridge V1: also render 431–1023 px as the Tablet family (the 430 run, remapped). Default false: 375–430 only. */
  responsive?: boolean;
}

export function A13MobileGallery({ media, title, subtitle, language, onSeeMore, onActivateMemory, onRun, qa = false, theme = "light", responsive = false }: A13MobileGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // The Mobile authority's frame: W itself (375–430), or 430 remapped to W (Tablet, bridged hosts only).
  const frame = width === null ? null : a13MobileAuthorityFrame(width, responsive);
  const active = frame !== null;
  const sourceWidth = frame?.sourceWidth ?? null;
  const remap = frame?.remap ?? 1;

  const run = useMemo(
    () => (sourceWidth !== null && font?.fontCheck ? runMobileGallery({ media, captionOf: (m) => m.caption, measurer: font.measurer, stageWidth: sourceWidth, devicePixelRatio: window.devicePixelRatio || 1 }) : null),
    [sourceWidth, media, font],
  );

  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!run) return;
    if (run.outcome === "unresolved") {
      const key = `${run.stateId}|${run.mediaCount}|${run.stageWidth}|${run.anomaly?.code}|${run.anomaly?.detail}`;
      if (logged.current !== key) {
        logged.current = key;
        console.error("Gallery Mobile: composition unresolved (no Gallery rendered):", run.stateId, run.anomaly?.code, run.anomaly?.rule, run.anomaly?.detail);
      }
    } else logged.current = null;
    onRun?.(run);
  }, [run, onRun]);

  const qaLayer: A13MobileSceneQa | null =
    qa && run?.outcome === "resolved"
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
          safeZones: run.entries.flatMap((e) => (e.captionDiagnostic ? [{ slotId: e.mobileSlot.slotId, polygon: e.captionDiagnostic.safeZone }] : [])),
          titleBlock: run.metrics.titleBlock,
          ctaSafeBox: run.cta?.safeBox ?? null,
        }
      : null;

  const state = active ? selectMobileGalleryState(media.length) : null;
  return (
    <div
      ref={rootRef}
      style={{ position: "relative", width: "100%" }}
      data-testid="a13-mobile-gallery"
      data-gallery-profile={width === null ? "pending" : (frame?.family ?? "inactive")}
      {...(frame?.family === "tablet" ? { "data-a13-source-width": frame.sourceWidth, "data-a13-remap": frame.remap } : {})}
      data-gallery-state={run?.stateId ?? (run ? "absent" : "pending")}
      data-gallery-outcome={run?.outcome ?? "pending"}
      data-gallery-status={run?.status ?? "pending"}
    >
      <A13CaptionFontProbe />
      {!run && state && sourceWidth !== null ? (
        <div style={{ visibility: "hidden" }} aria-hidden="true" inert data-testid="a13-mobile-gallery-pending">
          <A13MobileGalleryScene stateId="pending" title={title} subtitle={subtitle} entries={[]} stageWidth={sourceWidth} stageHeight={A13_MOBILE_GROUP_TRANSLATION[state].stageHeightSource} theme={theme} remap={remap} />
        </div>
      ) : null}
      {run?.outcome === "resolved" && run.stateId ? (
        <A13MobileGalleryScene
          stateId={run.stateId}
          title={title}
          subtitle={subtitle}
          stageWidth={run.stageWidth}
          stageHeight={run.stageHeight}
          translateY={run.translateY}
          entries={run.entries.map((e) => ({ slot: e.slot, layout: e.layout, src: e.media.src, alt: e.media.alt, caption: e.caption }))}
          captionFontSizePx={run.metrics.captionFontPx}
          cta={run.cta ? { label: translate(language, "gallery.seeMoreMemories"), lang: language, onActivate: onSeeMore, box: run.cta.box } : null}
          language={language}
          onActivate={(slotId) => {
            const e = run.entries.find((x) => x.slot.slotId === slotId);
            if (e) onActivateMemory?.(e.mediaIndex);
          }}
          qa={qaLayer}
          theme={theme}
          remap={remap}
        />
      ) : null}
    </div>
  );
}
