"use client";

import { useEffect, useRef, useState } from "react";
import { A13_MOBILE_CANVAS, A13_MOBILE_CTA, A13_MOBILE_INTERACTION, a13MobileProfileActive } from "@/config/gallery-a13-mobile-manifest";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { runMobileGallery } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { measureMobileTitleGlyphMask } from "@/lib/memorial/gallery/mobile-title-glyph-mask";
import { polygonHitsMask } from "@/lib/memorial/gallery/title-glyph-mask";
import { convexIntersectionArea } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { A13_MOBILE_CAPTION_SETS, A13_MOBILE_PILOT_TITLE, A13_MOBILE_RATIO_SETS, a13MobileFixture } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { A13MobileGalleryScene } from "@/components/memorial/gallery/A13MobileGalleryScene";

/**
 * QA matrix (PILOT ONLY): every state × media ratio set × caption set of
 * `QA_MATRIX.md`, run by the Mobile runtime IN THE BROWSER at the current
 * stage width, with the real La Belle Aurore measurer and the real rendered
 * title glyph mask — then every hard rule re-checked independently of the
 * solver. Result: `window.__a13MobileMatrix`.
 */

export interface MatrixRow {
  width: number;
  n: number;
  ratios: string;
  captions: string;
  state: string | null;
  outcome: string;
  status: string;
  anomaly: string | null;
  ms: number;
  cta: boolean;
  shownMedia: number[];
  familyOrder: boolean;
  checks: { territory: boolean; overflow: boolean; title: boolean; cta: boolean; hit: boolean };
  minHitCss: number | null;
  slots: { slotId: string; mediaIndex: number; scale: number; dx: number; dy: number; hitCss: number; visiblePhoto: number; captionLines: number; captionStatus: string | null; exceeds: boolean; inkOutsidePaperCss: number }[];
  signals: string[];
}

declare global {
  interface Window {
    __a13MobileMatrix?: { width: number; done: boolean; rows: MatrixRow[] };
  }
}

const EPS = 1e-6;

export function MobileMatrixRunner() {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [progress, setProgress] = useState("…");

  useEffect(() => {
    if (!font?.fontCheck || !titleRef.current || !rootRef.current) return;
    const width = rootRef.current.getBoundingClientRect().width;
    if (!a13MobileProfileActive(width)) {
      setProgress(`profil Mobile inactif (${width} px)`);
      return;
    }
    let alive = true;
    void (async () => {
      const title = await measureMobileTitleGlyphMask(titleRef.current!);
      if (!title || !alive) return;
      const rows: MatrixRow[] = [];
      window.__a13MobileMatrix = { width, done: false, rows };
      const safe = [
        { x: A13_MOBILE_CTA.safeBox.x, y: A13_MOBILE_CTA.safeBox.y },
        { x: A13_MOBILE_CTA.safeBox.x + A13_MOBILE_CTA.safeBox.width, y: A13_MOBILE_CTA.safeBox.y },
        { x: A13_MOBILE_CTA.safeBox.x + A13_MOBILE_CTA.safeBox.width, y: A13_MOBILE_CTA.safeBox.y + A13_MOBILE_CTA.safeBox.height },
        { x: A13_MOBILE_CTA.safeBox.x, y: A13_MOBILE_CTA.safeBox.y + A13_MOBILE_CTA.safeBox.height },
      ];
      for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 12])
        for (const ratios of A13_MOBILE_RATIO_SETS)
          for (const captions of A13_MOBILE_CAPTION_SETS) {
            if (n < 2 && (ratios !== "mixte" || captions !== "aucune")) continue;
            const media = a13MobileFixture(n, ratios, captions);
            const t0 = performance.now();
            const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: font.measurer, titleMask: title.mask, stageWidth: width });
            const ms = performance.now() - t0;
            const k = run.metrics.scale;
            const need = A13_MOBILE_INTERACTION.minTargetCssPx;
            const checks = { territory: true, overflow: true, title: true, cta: true, hit: true };
            for (const e of run.entries) {
              const t = e.mobileSlot.centerTerritory;
              if (e.center.x < t.x - EPS || e.center.x > t.x + t.width + EPS || e.center.y < t.y - EPS || e.center.y > t.y + t.height + EPS) checks.territory = false;
              const a = e.mobileSlot.paperOverflowAllowance;
              const xs = e.outer.map((p) => p.x);
              const ys = e.outer.map((p) => p.y);
              if (Math.min(...xs) < -a.left - EPS || Math.max(...xs) > A13_MOBILE_CANVAS.width + a.right + EPS || Math.min(...ys) < -a.top - EPS || Math.max(...ys) > A13_MOBILE_CANVAS.height + a.bottom + EPS) checks.overflow = false;
              if (polygonHitsMask(e.outer, title.mask)) checks.title = false;
              if (run.hasCta && convexIntersectionArea(e.outer, safe) > EPS) checks.cta = false;
              if (e.hitTarget.side * k < need - 1e-6) checks.hit = false;
            }
            const shown = run.entries.map((e) => e.mediaIndex);
            rows.push({
              width,
              n,
              ratios,
              captions,
              state: run.stateId,
              outcome: run.outcome,
              status: run.status,
              anomaly: run.anomaly ? `${run.anomaly.code} · ${run.anomaly.detail}` : null,
              ms,
              cta: run.hasCta,
              shownMedia: shown,
              familyOrder: run.entries.every((e, i) => e.mediaIndex === i && e.media === media[i]),
              checks,
              minHitCss: run.entries.length ? Math.min(...run.entries.map((e) => e.hitTarget.side * k)) : null,
              slots: run.entries.map((e) => ({
                slotId: e.mobileSlot.slotId,
                mediaIndex: e.mediaIndex,
                scale: e.scale,
                dx: e.center.x - e.pivotCenter.x,
                dy: e.center.y - e.pivotCenter.y,
                hitCss: e.hitTarget.side * k,
                visiblePhoto: e.visiblePhoto,
                captionLines: e.caption?.lines.length ?? 0,
                captionStatus: e.caption?.status ?? null,
                exceeds: e.caption?.exceedsUsefulWidth ?? false,
                // How far the caption ink runs past the paper's side edges (CSS px; 0 = on the paper).
                inkOutsidePaperCss: e.caption ? Math.max(0, -e.caption.ink.x, e.caption.ink.x + e.caption.ink.width - e.layout.outer.width) * k : 0,
              })),
              signals: run.signals,
            });
            setProgress(`${rows.length} compositions…`);
            await new Promise((r) => setTimeout(r, 0));
            if (!alive) return;
          }
      window.__a13MobileMatrix = { width, done: true, rows };
      setProgress(`${rows.length} compositions — terminé`);
    })();
    return () => {
      alive = false;
    };
  }, [font]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }} data-testid="a13-mobile-matrix">
      <A13CaptionFontProbe />
      <div ref={titleRef} style={{ position: "absolute", left: 0, top: 0, width: "100%", visibility: "hidden" }} aria-hidden="true" inert>
        <A13MobileGalleryScene stateId="title" title={A13_MOBILE_PILOT_TITLE.fr.title} subtitle={A13_MOBILE_PILOT_TITLE.fr.subtitle} entries={[]} />
      </div>
      <p style={{ font: "12px ui-monospace, monospace", padding: 12 }} data-testid="matrix-progress">
        QA matrice Mobile : {progress}
      </p>
    </div>
  );
}
