"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ViewerTheme } from "@/config/viewer-a13-desktop-v2";
import { useMemoryViewer, type MemoryViewerMedia, type ViewerOrigin, type ViewerReport } from "@/components/memorial/viewer/MemoryViewer";
import { validateViewerCaption, type ViewerGeometry } from "@/lib/memorial/viewer/viewer-layout";
import { viewerCaptionStops } from "@/lib/memorial/viewer/viewer-dom-qa";
import { createViewerCaptionMeasure, readViewerCaptionLines, viewerCaptionDivergence } from "@/lib/memorial/viewer/viewer-caption-measure";
import styles from "../a13-album-light/page.module.css";

/**
 * A13 Viewer Desktop V2 — QA harness (PILOT ONLY).
 *
 * `?ratio=3:2|2:3|1:1|2.39:1|9:16|4:3|5:1|0.4:1|master&caption=none|short|32|33&theme=light|dark`
 * renders one trigger print; activating it opens the shared `MemoryViewer`.
 * Every open/close report is published on `window.__viewerQa`.
 *
 * Media: the synthetic A13 test photos; `2:3`, `5:1` and `0.4:1` are
 * centre-cropped copies of a test photo at that exact ratio (fixture media,
 * never distorted — the Viewer itself never crops). `master` is served by
 * the browser QA from the Studio Master (QA only, never an asset).
 *
 * `negatif=` injects a deliberate defect the rendered checks must catch
 * (QA only): cover, distorsion, dark-geometrie, filtre, ellipsis, cible,
 * scroll, focus, mouvement, viewport.
 *
 * Caption measurement QA (`A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1`):
 * `window.__viewerQa.openWith({ ratio, caption, origin })` opens the shared
 * Viewer on a generated image of that exact ratio with any caption (corpus
 * replay through the real pipeline); `captionStops()` re-runs the rendered
 * caption checks on the open Viewer (after a QA DOM injection);
 * `scaled2027()` re-measures the open caption the FORBIDDEN way (27 px then
 * × fontSize/27) and returns the divergence against the rendered lines —
 * the negative control of the divergence check.
 */

declare global {
  interface Window {
    __viewerQa?: {
      reports: ViewerReport[];
      validation: unknown;
      media: MemoryViewerMedia | null;
      openWith?: (o: { ratio: number; caption: string | null; origin?: ViewerOrigin }) => void;
      captionStops?: () => ReturnType<typeof viewerCaptionStops>;
      scaled2027?: () => ReturnType<typeof viewerCaptionDivergence>;
    };
  }
}

/** A generated image of an exact ratio (QA fixture, never an asset). */
const ratioImages = new Map<number, string>();
function ratioImage(r: number) {
  if (!ratioImages.has(r)) {
    const c = document.createElement("canvas");
    c.width = Math.round(r >= 1 ? 2400 : 2400 * r);
    c.height = Math.round(r >= 1 ? 2400 / r : 2400);
    const ctx = c.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, "#c89b5e");
    grad.addColorStop(1, "#6b4426");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
    ratioImages.set(r, c.toDataURL("image/jpeg", 0.8));
  }
  return ratioImages.get(r)!;
}

/** The open Viewer's geometry, from its last open report. */
const lastGeometry = (reports: ViewerReport[]) => {
  const r = [...reports].reverse().find((x) => x.kind === "open");
  return r && r.kind === "open" ? (JSON.parse(r.engine) as ViewerGeometry) : null;
};

const BASE = "/pilot/a13-dynamic-polaroid";
interface Case {
  src: string;
  w: number;
  h: number;
  crop?: number;
  alt: string;
}
const CASES: Record<string, Case> = {
  "3:2": { src: `${BASE}/p2-paysage-3x2.jpg`, w: 1800, h: 1200, alt: "Photo de test — paysage 3:2" },
  "2:3": { src: `${BASE}/p1-portrait-3x4.jpg`, w: 1200, h: 1600, crop: 2 / 3, alt: "Photo de test — portrait 2:3" },
  "1:1": { src: `${BASE}/p3-carre-1x1.jpg`, w: 1400, h: 1400, alt: "Photo de test — carré" },
  "2.39:1": { src: `${BASE}/p6b-panorama-239x100.jpg`, w: 2390, h: 1000, alt: "Photo de test — panorama 2.39:1" },
  "9:16": { src: `${BASE}/p4-portrait-etroit-9x16.jpg`, w: 1080, h: 1920, alt: "Photo de test — portrait très vertical 9:16" },
  "4:3": { src: `${BASE}/p2-paysage-4x3.jpg`, w: 1600, h: 1200, alt: "Photo de test — paysage 4:3" },
  "5:1": { src: `${BASE}/p6-panorama-3x1.jpg`, w: 2700, h: 900, crop: 5, alt: "Photo de test — ratio extrême 5:1" },
  "0.4:1": { src: `${BASE}/p4-portrait-etroit-9x16.jpg`, w: 1080, h: 1920, crop: 0.4, alt: "Photo de test — ratio extrême 0.4:1" },
  master: { src: "/pilot/a13-viewer/qa-master-photo.jpg", w: 1112, h: 622, alt: "Photo témoin du Master Studio" },
};
const CAPTIONS: Record<string, string | null> = {
  none: null,
  short: "Notre belle famille",
  master: "Été 2010 · Cabourg",
  "32": "MAMAN ET MAMIE, À MIMIZAN, 1966.",
  "33": "MAMAN ET MAMIE, À MIMIZAN, 1966.!",
  "24": "Maman, un soir à Gordes.",
  naturelle: "Maman et mamie, à Mimizan, 1966.",
};

const NEGATIVES: Record<string, string> = {
  cover: `[data-viewer-photo]{object-fit:cover!important;height:70%!important}`,
  distorsion: `[data-viewer-photo]{object-fit:fill!important;height:70%!important}`,
  "dark-geometrie": `[data-a13-viewer-theme="dark"] [data-viewer-print]{width:1000px!important;height:700px!important}`,
  filtre: `[data-a13-viewer-theme="dark"] [data-viewer-photo]{filter:brightness(.85) saturate(.8)!important}`,
  ellipsis: `[data-viewer-caption]{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;width:40%!important}`,
  cible: `[data-viewer-close]{width:26px!important;height:26px!important}`,
  mouvement: `[data-viewer-print]{transform:translateY(12px)!important}`,
  viewport: `[data-viewer-print]{margin-left:1200px!important}`,
};

function useCaseMedia(ratio: string, caption: string | null): MemoryViewerMedia | null {
  const c = CASES[ratio] ?? CASES["3:2"];
  const [cropped, setCropped] = useState<{ key: string; src: string; w: number; h: number } | null>(null);
  const key = `${ratio}`;
  useEffect(() => {
    if (!c.crop) return;
    let alive = true;
    const img = new Image();
    img.src = c.src;
    void img.decode().then(() => {
      const r = c.crop!;
      const cw = Math.min(img.naturalWidth, img.naturalHeight * r);
      const ch = cw / r;
      const cv = document.createElement("canvas");
      cv.width = Math.round(cw);
      cv.height = Math.round(ch);
      cv.getContext("2d")!.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, 0, 0, cv.width, cv.height);
      if (alive) setCropped({ key, src: cv.toDataURL("image/jpeg", 0.92), w: cv.width, h: cv.height });
    });
    return () => {
      alive = false;
    };
  }, [c, key]);
  return useMemo(() => {
    if (c.crop) return cropped && cropped.key === key ? { mediaId: `viewer-${ratio}`, src: cropped.src, alt: c.alt, naturalWidth: cropped.w, naturalHeight: cropped.h, caption } : null;
    return { mediaId: `viewer-${ratio}`, src: c.src, alt: c.alt, naturalWidth: c.w, naturalHeight: c.h, caption };
  }, [c, cropped, key, ratio, caption]);
}

export function ViewerPilotClient() {
  const q = useSearchParams();
  const ratio = q.get("ratio") && CASES[q.get("ratio")!] ? q.get("ratio")! : "3:2";
  const captionId = q.get("caption") && q.get("caption")! in CAPTIONS ? q.get("caption")! : "short";
  const theme: ViewerTheme = q.get("theme") === "dark" ? "dark" : "light";
  const negative = q.get("negatif");
  const caption = CAPTIONS[captionId];
  const validation = useMemo(() => validateViewerCaption(caption), [caption]);
  const media = useCaseMedia(ratio, caption);
  const [reports, setReports] = useState<ViewerReport[]>([]);
  const viewer = useMemoryViewer((r) => {
    window.__viewerQa?.reports.push(r);
    setReports((x) => [...x, r]);
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const openViewer = viewer.open;
  useEffect(() => {
    const reportsList = window.__viewerQa?.reports ?? [];
    window.__viewerQa = {
      reports: reportsList,
      validation,
      media,
      openWith: ({ ratio: r, caption: c, origin = "gallery" }) => {
        const img = ratioImage(r);
        const w = Math.round(r >= 1 ? 2400 : 2400 * r);
        const h = Math.round(r >= 1 ? 2400 / r : 2400);
        openViewer({ mediaId: `qa-${r}`, src: img, alt: "Image de test", naturalWidth: w, naturalHeight: h, caption: c }, theme, origin, "fr", triggerRef.current);
      },
      captionStops: () => {
        const root = document.querySelector<HTMLElement>("[data-a13-viewer]");
        const g = lastGeometry(reportsList);
        return root && g ? viewerCaptionStops(root, g) : [];
      },
      scaled2027: () => {
        const root = document.querySelector<HTMLElement>("[data-a13-viewer]");
        const g = lastGeometry(reportsList);
        const visible = root?.querySelector<HTMLElement>("[data-viewer-caption]");
        const source = root?.querySelector<HTMLElement>("[data-caption-style-source]");
        if (!root || !g?.caption || !visible || !source) return [];
        const host = document.createElement("div");
        host.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden";
        root.appendChild(host);
        const k = g.caption.fontSize / 27;
        // FORBIDDEN on purpose: measured at 27 px in the scaled-up width, then × fontSize/27.
        const at27 = createViewerCaptionMeasure(source, host).wrap(g.caption.text, 27, g.caption.lineHeight / k, g.caption.usableWidth / k);
        host.remove();
        const measured = (at27?.lines ?? []).map((l) => ({ text: l.text, x: l.x * k, y: l.y * k, width: l.width * k }));
        return viewerCaptionDivergence(measured, readViewerCaptionLines(visible) ?? []);
      },
    };
  }, [validation, media, openViewer, theme]);

  // Host-side negatives: a scroll jump / a lost focus right after the Viewer gives focus back.
  useEffect(() => {
    if (negative !== "scroll" && negative !== "focus") return;
    const onFocus = (e: FocusEvent) => {
      if (!(e.target as HTMLElement).matches?.("[data-viewer-trigger]") || !document.querySelector("[data-a13-viewer]")) return;
      if (negative === "scroll") window.scrollTo({ top: 0, behavior: "instant" });
      else (e.target as HTMLElement).blur();
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [negative]);

  const last = reports[reports.length - 1];
  return (
    <div className={styles.page} style={{ minHeight: "260vh" }}>
      {negative && NEGATIVES[negative] ? <style>{NEGATIVES[negative]}</style> : null}
      <div className={styles.panel}>
        <h1 className={styles.h1}>A13 · Viewer Desktop V2 · pilote runtime (QA)</h1>
        <div className={styles.controls}>
          <span>
            ratio :{" "}
            {Object.keys(CASES).map((r) => (
              <a key={r} href={`?ratio=${encodeURIComponent(r)}&caption=${captionId}&theme=${theme}`} aria-current={r === ratio}>
                {r}{" "}
              </a>
            ))}
          </span>
          <span>
            caption :{" "}
            {Object.keys(CAPTIONS).map((c) => (
              <a key={c} href={`?ratio=${encodeURIComponent(ratio)}&caption=${c}&theme=${theme}`} aria-current={c === captionId}>
                {c}{" "}
              </a>
            ))}
          </span>
          <span>
            thème :{" "}
            {(["light", "dark"] as const).map((t) => (
              <a key={t} href={`?ratio=${encodeURIComponent(ratio)}&caption=${captionId}&theme=${t}`} aria-current={t === theme}>
                {t}{" "}
              </a>
            ))}
          </span>
          <span className={styles.log} data-testid="viewer-validation">
            validation caption : {validation.ok ? "OK" : `${validation.reason} (${validation.length})`}
          </span>
        </div>
      </div>
      <div style={{ height: "90vh" }} />
      <div className={styles.panel}>
        {media ? (
          <button
            ref={triggerRef}
            type="button"
            data-viewer-trigger=""
            aria-label={`Ouvrir le souvenir — ${caption ?? media.alt}`}
            onClick={() => viewer.open(media, theme, "gallery", "fr")}
            style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.src} alt="" width={Math.round(160 * Math.min(1.6, media.naturalWidth / media.naturalHeight))} height={Math.round((160 * Math.min(1.6, media.naturalWidth / media.naturalHeight) * media.naturalHeight) / media.naturalWidth)} style={{ display: "block" }} />
          </button>
        ) : (
          "…"
        )}
        <pre className={styles.pre} data-testid="viewer-last-report">
          {last ? JSON.stringify({ kind: last.kind, stops: last.stops, ...(last.kind === "open" ? { codes: last.codes } : { focusTarget: last.focusTarget, scroll: [last.scrollSaved, last.scrollAfter] }) }, null, 1) : "—"}
        </pre>
      </div>
      {viewer.node}
    </div>
  );
}
