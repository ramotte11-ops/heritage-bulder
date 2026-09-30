"use client";

import { useEffect, useRef, useState } from "react";
import {
  A13_MOBILE_CANVAS,
  A13_MOBILE_CAPTION,
  A13_MOBILE_CTA,
  A13_MOBILE_GROUP_TRANSLATION,
  A13_MOBILE_INTERACTION,
  A13_MOBILE_TITLE_BLOCK,
  a13MobileProfileActive,
  resolveByViewport,
  type A13MobileRect,
} from "@/config/gallery-a13-mobile-manifest";
import { LANGUAGES } from "@/config/languages";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { runMobileGallery } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { measureMobileTitleInk, type MobileTitleInkMeasure } from "@/lib/memorial/gallery/mobile-title-ink";
import { convexIntersectionArea, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { A13_MOBILE_CAPTION_SETS, A13_MOBILE_PILOT_TITLE, A13_MOBILE_RATIO_SETS, a13MobileFixture } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { A13MobileGalleryScene } from "@/components/memorial/gallery/A13MobileGalleryScene";

/**
 * QA matrix (PILOT ONLY): every state × media ratio set × caption set of
 * `QA_MATRIX.md` (V1.5), run by the Mobile runtime IN THE BROWSER at the
 * current stage width with the real La Belle Aurore measurer — then every
 * hard rule re-checked independently of the solver (territory, stage
 * overflow, protected title block, caption safe zones, CTA safe box, 44 px
 * targets, stage height and group translation). The rendered title block
 * (FR / EN / ES) is measured once per width. Result:
 * `window.__a13MobileMatrix`.
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
  basis: string | null;
  search: { stage: string; expansions: number };
  ms: number;
  cta: boolean;
  shownMedia: number[];
  familyOrder: boolean;
  translateY: number;
  stageHeight: number;
  checks: { territory: boolean; overflow: boolean; titleBlock: boolean; safeZone: boolean; cta: boolean; hit: boolean; captions: boolean; stage: boolean };
  minHitCss: number | null;
  slots: {
    slotId: string;
    mediaIndex: number;
    scale: number;
    dx: number;
    dy: number;
    hitCss: number;
    visiblePhoto: number;
    captionLines: number;
    captionStatus: string | null;
    exceeds: boolean;
    /** Band widening (source px), or null. */
    widening: { from: number; to: number; envelope: number } | null;
    /** How far the caption ink runs past the band's side edges (CSS px; 0 = inside the band). */
    inkOutsideBandCss: number;
    /** Safe zone height vs the 42 px band (CSS px). */
    safeZoneHeightCss: number | null;
  }[];
  signals: string[];
}

export interface TitleRow {
  width: number;
  lang: string;
  measure: MobileTitleInkMeasure | null;
  block: A13MobileRect;
  checks: { oneLine: boolean; maxWidth: boolean; inkInBlock: boolean; fonts: boolean };
}

declare global {
  interface Window {
    __a13MobileMatrix?: { width: number; done: boolean; rows: MatrixRow[]; titles: TitleRow[] };
  }
}

const EPS = 1e-6;
const poly = (r: A13MobileRect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

export function MobileMatrixRunner() {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const font = useCaptionMeasurer(rootRef);
  const [width, setWidth] = useState<number | null>(null);
  const [progress, setProgress] = useState("…");

  useEffect(() => {
    if (rootRef.current) setWidth(rootRef.current.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    if (!font?.fontCheck || width === null || !a13MobileProfileActive(width)) return;
    let alive = true;
    void (async () => {
      const rows: MatrixRow[] = [];
      const titles: TitleRow[] = [];
      window.__a13MobileMatrix = { width, done: false, rows, titles };
      const k = width / A13_MOBILE_CANVAS.width;
      const tb = A13_MOBILE_TITLE_BLOCK;
      const block = { x: (A13_MOBILE_CANVAS.width - resolveByViewport(tb.protectedBlockWidthCss, width) / k) / 2, y: 0, width: resolveByViewport(tb.protectedBlockWidthCss, width) / k, height: resolveByViewport(tb.protectedBlockBottomCss, width) / k };
      for (const lang of LANGUAGES) {
        const el = titleRefs.current[lang];
        const measure = el ? await measureMobileTitleInk(el) : null;
        const inside = (b: { xMin: number; xMax: number; yMin: number; yMax: number }) => b.xMin >= block.x - 0.5 && b.xMax <= block.x + block.width + 0.5 && b.yMin >= block.y - 0.5 && b.yMax <= block.y + block.height + 0.5;
        titles.push({
          width,
          lang,
          measure,
          block,
          checks: {
            oneLine: measure?.titleLines === 1,
            maxWidth: !!measure && measure.titleAdvanceCss <= resolveByViewport(tb.title.maxWidthCss, width) + 0.5,
            inkInBlock: !!measure && inside(measure.heading) && inside(measure.subtitle) && inside(measure.separator),
            fonts: !!measure?.fontsChecked,
          },
        });
      }
      for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 12])
        for (const ratios of A13_MOBILE_RATIO_SETS)
          for (const captions of A13_MOBILE_CAPTION_SETS) {
            if (n < 2 && (ratios !== "mixte" || captions !== "aucune")) continue;
            const media = a13MobileFixture(n, ratios, captions);
            const t0 = performance.now();
            const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: font.measurer, stageWidth: width });
            const ms = performance.now() - t0;
            const need = A13_MOBILE_INTERACTION.minTargetCssPx;
            const checks = { territory: true, overflow: true, titleBlock: true, safeZone: true, cta: true, hit: true, captions: true, stage: true };
            const T = run.stateId ? A13_MOBILE_GROUP_TRANSLATION[run.stateId].translateYSource : 0;
            if (run.stateId && (run.translateY !== T || run.stageHeight !== A13_MOBILE_GROUP_TRANSLATION[run.stateId].stageHeightSource)) checks.stage = false;
            // Stage items in the group frame (−T).
            const title = poly({ ...block, y: block.y - T });
            const safe = poly({ ...A13_MOBILE_CTA.safeBox, y: A13_MOBILE_CTA.safeBox.y - T });
            for (const e of run.entries) {
              const t = e.mobileSlot.centerTerritory;
              if (e.center.x < t.x - EPS || e.center.x > t.x + t.width + EPS || e.center.y < t.y - EPS || e.center.y > t.y + t.height + EPS) checks.territory = false;
              const a = e.mobileSlot.paperOverflowAllowance;
              const xs = e.papers.flat().map((p) => p.x);
              const ys = e.papers.flat().map((p) => p.y);
              if (Math.min(...xs) < -a.left - EPS || Math.max(...xs) > A13_MOBILE_CANVAS.width + a.right + EPS || Math.min(...ys) < -T - a.top - EPS || Math.max(...ys) > run.stageHeight - T + a.bottom + EPS) checks.overflow = false;
              if (e.papers.some((p) => convexIntersectionArea(p, title) > EPS)) checks.titleBlock = false;
              if (run.hasCta && e.papers.some((p) => convexIntersectionArea(p, safe) > EPS)) checks.cta = false;
              if (e.hitTarget.side * k < need - 1e-6) checks.hit = false;
              if (e.safeZone)
                for (const q of run.entries)
                  if (q.mobileSlot.paintOrder > e.mobileSlot.paintOrder && q.papers.some((p) => convexIntersectionArea(p, e.safeZone!) > EPS)) checks.safeZone = false;
              const text = e.media.caption;
              if (!!text !== !!e.caption || !!e.caption !== !!e.safeZone) checks.captions = false;
              if (e.caption && (e.caption.lines.length > A13_MOBILE_CAPTION.maxLines || e.caption.exceedsUsefulWidth || e.caption.status !== "placed")) checks.captions = false;
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
              basis: run.anomaly?.basis ?? null,
              search: { stage: run.search.stage, expansions: run.search.expansions },
              ms,
              cta: run.hasCta,
              shownMedia: shown,
              familyOrder: run.entries.every((e, i) => e.mediaIndex === i && e.media === media[i]),
              translateY: run.translateY,
              stageHeight: run.stageHeight,
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
                widening: e.bandWidening,
                inkOutsideBandCss: e.caption ? Math.max(0, e.layout.band.x - e.caption.ink.x, e.caption.ink.x + e.caption.ink.width - (e.layout.band.x + e.layout.band.width)) * k : 0,
                safeZoneHeightCss: e.caption ? e.caption.protectedBox.height * k : null,
              })),
              signals: run.signals,
            });
            setProgress(`${rows.length} compositions…`);
            await new Promise((r) => setTimeout(r, 0));
            if (!alive) return;
          }
      window.__a13MobileMatrix = { width, done: true, rows, titles };
      setProgress(`${rows.length} compositions — terminé`);
    })();
    return () => {
      alive = false;
    };
  }, [font, width]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }} data-testid="a13-mobile-matrix">
      <A13CaptionFontProbe />
      {width !== null
        ? LANGUAGES.map((lang) => (
            <div
              key={lang}
              ref={(el) => {
                titleRefs.current[lang] = el;
              }}
              style={{ position: "absolute", left: 0, top: 0, width: "100%", visibility: "hidden" }}
              aria-hidden="true"
              inert
            >
              <A13MobileGalleryScene stateId="title" title={A13_MOBILE_PILOT_TITLE[lang].title} subtitle={A13_MOBILE_PILOT_TITLE[lang].subtitle} entries={[]} stageWidth={width} />
            </div>
          ))
        : null}
      <p style={{ font: "12px ui-monospace, monospace", padding: 12 }} data-testid="matrix-progress">
        QA matrice Mobile : {width !== null && !a13MobileProfileActive(width) ? `profil Mobile inactif (${width} px)` : progress}
      </p>
    </div>
  );
}
