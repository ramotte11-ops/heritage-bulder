"use client";

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { laBelleAurore } from "@/components/builder/fonts";
import { A13_VIEWER_ASSETS, A13_VIEWER_CONTRACT, A13_VIEWER_MATERIAL, type ViewerTheme } from "@/config/viewer-a13-desktop-v2";
import { createCaptionMeasurer, type MeasurerReady } from "@/lib/memorial/gallery/caption-measurer";
import { layoutViewer, normalizeViewerCaption, viewerGeometrySnapshot, type ViewerGeometry } from "@/lib/memorial/viewer/viewer-layout";
import { viewerDomSnapshot, viewerDomStops, type MotionRecord, type ViewerStopFinding } from "@/lib/memorial/viewer/viewer-dom-qa";
import styles from "./MemoryViewer.module.css";

/**
 * A13 Viewer Desktop V2 — the ONE Viewer of the Gallery and the Album.
 *
 * VIEWER = CONTEMPLER: the visitor takes one photograph out of the pile.
 * Photo first — its natural ratio drives the print (`layoutViewer`, pure
 * and theme-free); the HERITAGE paper, the edge and the caption are built
 * around it. `theme` selects MATERIAL only (Studio tiles, inks, shadows):
 * Light and Dark share every length (GEOMETRY DIVERGENCE LIGHT/DARK: NONE).
 *
 * Behaviour (Handoff §6–§9):
 * - opening memorises the trigger, the scroll X/Y and the Gallery/Album
 *   container; locks the document without changing its available width;
 *   makes the background inert; renders a named modal dialog; focuses the
 *   close button after mounting;
 * - Tab / Shift+Tab stay in the Viewer, Escape closes, the native close
 *   button (48 × 48 target, discreet `×`) closes;
 * - closing unmounts the Viewer, restores the exact scroll, gives focus
 *   back to the trigger (or to the nearest Gallery/Album container when
 *   the trigger no longer exists), and never recomputes the composition;
 * - motion: 240 ms cubic-bezier(.22,1,.36,1) from opacity 0,
 *   translateY(12s), scale .985; closing 160 ms cubic-bezier(.4,0,1,1) to
 *   opacity 0, translateY(6s), scale .99; `prefers-reduced-motion: reduce`
 *   → 0 ms, no spatial transform. No flip, no bounce, no rotation.
 *
 * The photo is rendered at its natural ratio with `object-fit: contain`,
 * `filter: none`, `opacity: 1`, `mix-blend-mode: normal` — never cropped,
 * never processed. Before the first frame the intrinsic size is decoded
 * and the caption font confirmed, so the reserved box never shifts.
 */

export type ViewerOrigin = "gallery" | "album";

export interface MemoryViewerMedia {
  mediaId: string;
  src: string;
  /** Validated accessible text — never a raw filename. */
  alt: string;
  naturalWidth: number;
  naturalHeight: number;
  caption: string | null;
}

export interface ViewerOpenReport {
  kind: "open";
  origin: ViewerOrigin;
  theme: ViewerTheme;
  mediaId: string;
  engine: string;
  dom: ReturnType<typeof viewerDomSnapshot>;
  stops: ViewerStopFinding[];
  codes: string[];
  scrollAtOpen: { x: number; y: number };
  reduced: boolean;
  settledMs: number;
}

export interface ViewerCloseReport {
  kind: "close";
  origin: ViewerOrigin;
  theme: ViewerTheme;
  mediaId: string;
  via: "button" | "escape";
  scrollSaved: { x: number; y: number };
  scrollAfter: { x: number; y: number };
  focusTarget: "trigger" | "container" | "none";
  focusRestored: boolean;
  stops: ViewerStopFinding[];
}

export type ViewerReport = ViewerOpenReport | ViewerCloseReport;

export interface MemoryViewerProps {
  media: MemoryViewerMedia;
  theme: ViewerTheme;
  origin: ViewerOrigin;
  /** The print that opened the Viewer (focus is given back to it). */
  trigger: HTMLElement | null;
  /** Nearest Gallery/Album container — focus fallback. */
  container: HTMLElement | null;
  /** Called once the Viewer has closed (scroll and focus restored): unmount it. */
  onClosed: () => void;
  onReport?: (report: ViewerReport) => void;
}

const C = A13_VIEWER_CONTRACT;
const SLICE_OVERLAP = 0.75;
let measurerPromise: Promise<MeasurerReady> | null = null;

function parseShadow(s: string) {
  const m = /^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(s.trim())!;
  return { dx: parseFloat(m[1]), dy: parseFloat(m[2]), blur: parseFloat(m[3]), color: m[4] };
}

async function decodeImage(src: string, timeoutMs: number) {
  const img = new Image();
  img.src = src;
  if (typeof img.decode === "function") await Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
  return img;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const canAnimate = (el: Element | null): el is HTMLElement => !!el && typeof (el as HTMLElement).animate === "function";

function Paper({ g, theme }: { g: ViewerGeometry; theme: ViewerTheme }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { box, slices } = g.mask;
  const ox = -box.x;
  const oy = -box.y;
  const T = g.paperTextureSize;
  const inner = (A13_VIEWER_ASSETS.edgeMask.medianContour + 8) * g.s;
  const shadows = [A13_VIEWER_MATERIAL[theme].shadowMain, A13_VIEWER_MATERIAL[theme].shadowContact].map(parseShadow);
  return (
    <svg
      className={styles.paper}
      data-viewer-paper=""
      style={{ left: box.x, top: box.y }}
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${id}p`} patternUnits="userSpaceOnUse" x={ox} y={oy} width={T} height={T}>
          <image href={A13_VIEWER_ASSETS.paper[theme].src} width={T} height={T} preserveAspectRatio="none" />
        </pattern>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={box.w} height={box.h} style={{ maskType: "alpha" }}>
          {slices.map((q, i) => (
            // +0.75 px overlap: adjacent slices never leave an anti-aliasing hairline between them.
            <svg key={i} data-viewer-slice="" x={q.dx + ox} y={q.dy + oy} width={q.dw + SLICE_OVERLAP} height={q.dh + SLICE_OVERLAP} viewBox={`${q.sx} ${q.sy} ${q.sw} ${q.sh}`} preserveAspectRatio="none">
              <image href={A13_VIEWER_ASSETS.edgeMask.src} width={A13_VIEWER_ASSETS.edgeMask.size} height={A13_VIEWER_ASSETS.edgeMask.size} />
            </svg>
          ))}
          <rect x={inner} y={inner} width={Math.max(0, box.w - 2 * inner)} height={Math.max(0, box.h - 2 * inner)} fill="#fff" />
        </mask>
        {/* Two independent shadows (contact + main), cast by the masked paper: visual only, never dimensioning. */}
        <filter id={`${id}s`} filterUnits="userSpaceOnUse" x={-80} y={-80} width={box.w + 160} height={box.h + 200} colorInterpolationFilters="sRGB">
          {shadows.map((sh, i) => (
            <Fragment key={i}>
              <feGaussianBlur in="SourceAlpha" stdDeviation={sh.blur / 2} result={`b${i}`} />
              <feOffset in={`b${i}`} dx={sh.dx} dy={sh.dy} result={`o${i}`} />
              <feFlood floodColor={sh.color} result={`f${i}`} />
              <feComposite in={`f${i}`} in2={`o${i}`} operator="in" result={`s${i}`} />
            </Fragment>
          ))}
          <feMerge>
            <feMergeNode in="s0" />
            <feMergeNode in="s1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}s)`}>
        <rect x={0} y={0} width={box.w} height={box.h} fill={`url(#${id}p)`} mask={`url(#${id}m)`} />
      </g>
    </svg>
  );
}

export function MemoryViewer({ media, theme, origin, trigger, container, onClosed, onReport }: MemoryViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLElement>(null);
  const envRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const saved = useRef({ x: 0, y: 0, overflow: "", paddingRight: "", inerted: [] as Element[], restored: false, t0: 0 });
  const natural = useRef({ w: media.naturalWidth, h: media.naturalHeight });
  const closing = useRef(false);
  const motion = useRef<MotionRecord>({ open: null, reduced: false });
  const measurer = useRef<MeasurerReady | null>(null);
  const [geometry, setGeometry] = useState<ViewerGeometry | null>(null);
  const caption = normalizeViewerCaption(media.caption);

  const compute = useCallback(() => {
    const el = document.documentElement;
    return layoutViewer({ viewportW: el.clientWidth, viewportH: el.clientHeight, naturalW: natural.current.w, naturalH: natural.current.h, caption, measurer: measurer.current?.measurer ?? null });
  }, [caption]);

  const restoreDocument = useCallback(() => {
    const s = saved.current;
    if (s.restored) return;
    s.restored = true;
    const html = document.documentElement;
    html.style.overflow = s.overflow;
    html.style.paddingRight = s.paddingRight;
    for (const el of s.inerted) el.removeAttribute("inert");
    window.scrollTo({ left: s.x, top: s.y, behavior: "instant" });
  }, []);

  // Opening: memorise scroll, lock the document (same available width), inert background.
  useLayoutEffect(() => {
    const s = saved.current;
    s.t0 = performance.now();
    s.x = window.scrollX;
    s.y = window.scrollY;
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    s.overflow = html.style.overflow;
    s.paddingRight = html.style.paddingRight;
    html.style.overflow = "hidden";
    if (scrollbar > 0) html.style.paddingRight = `${parseFloat(getComputedStyle(html).paddingRight) + scrollbar}px`;
    s.inerted = [...document.body.children].filter((el) => el !== rootRef.current && !el.hasAttribute("inert"));
    for (const el of s.inerted) el.setAttribute("inert", "");
    return () => restoreDocument();
  }, [restoreDocument]);

  // Intrinsic size + caption font + material tiles before the first frame.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const tasks: Promise<unknown>[] = [
        decodeImage(media.src, 2500).then((img) => {
          if (img.naturalWidth && img.naturalHeight) natural.current = { w: img.naturalWidth, h: img.naturalHeight };
        }),
        ...[A13_VIEWER_ASSETS.environment[theme].src, A13_VIEWER_ASSETS.paper[theme].src, A13_VIEWER_ASSETS.edgeMask.src].map((src) => decodeImage(src, 2500)),
      ];
      if (caption && probeRef.current) {
        measurerPromise ??= createCaptionMeasurer(probeRef.current);
        tasks.push(measurerPromise.then((m) => (measurer.current = m)));
      }
      await Promise.all(tasks);
      if (alive) setGeometry(compute());
    })();
    return () => {
      alive = false;
    };
  }, [media.src, theme, caption, compute]);

  // First frame: focus the close button, play the opening, then report.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (!geometry || opened.current) return;
    opened.current = true;
    const reduced = reducedMotion();
    motion.current = { open: null, reduced };
    closeRef.current?.focus({ preventScroll: true });
    const done: Promise<unknown>[] = [];
    if (!reduced && canAnimate(printRef.current)) {
      const o = geometry.motion.open;
      const keyframes = [
        { opacity: String(o.fromOpacity), transform: `translateY(${o.fromTranslateY}px) scale(${o.fromScale})` },
        { opacity: "1", transform: "translateY(0px) scale(1)" },
      ];
      motion.current.open = { durationMs: o.durationMs, easing: o.easing, keyframes };
      const opts = { duration: o.durationMs, easing: o.easing };
      done.push(printRef.current.animate(keyframes, opts).finished);
      for (const el of [envRef.current, closeRef.current]) if (canAnimate(el)) done.push(el.animate([{ opacity: 0 }, { opacity: 1 }], opts).finished);
    }
    if (!onReport) return;
    void Promise.all(done.map((p) => p.catch(() => undefined))).then(() =>
      requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root || closing.current) return;
        onReport({
          kind: "open",
          origin,
          theme,
          mediaId: media.mediaId,
          engine: viewerGeometrySnapshot(geometry),
          dom: viewerDomSnapshot(root, motion.current),
          stops: viewerDomStops(root, geometry, reduced),
          codes: geometry.codes,
          scrollAtOpen: { x: saved.current.x, y: saved.current.y },
          reduced,
          settledMs: Math.round(performance.now() - saved.current.t0),
        });
      }),
    );
  }, [geometry, onReport, origin, theme, media.mediaId]);

  // Resize: the same continuous formula, recomputed (no animation).
  useEffect(() => {
    if (!geometry) return;
    const onResize = () => {
      if (!closing.current) setGeometry(compute());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [geometry, compute]);

  const close = useCallback(
    async (via: "button" | "escape") => {
      if (closing.current || !geometry) return;
      closing.current = true;
      if (!reducedMotion() && canAnimate(printRef.current)) {
        const c = geometry.motion.close;
        const opts = { duration: c.durationMs, easing: c.easing, fill: "forwards" as const };
        const anims = [
          printRef.current.animate(
            [
              { opacity: 1, transform: "translateY(0px) scale(1)" },
              { opacity: c.toOpacity, transform: `translateY(${c.toTranslateY}px) scale(${c.toScale})` },
            ],
            opts,
          ),
          ...[envRef.current, closeRef.current].flatMap((el) => (canAnimate(el) ? [el.animate([{ opacity: 1 }, { opacity: 0 }], opts)] : [])),
        ];
        await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
      }
      restoreDocument();
      const s = saved.current;
      let target: HTMLElement | null = null;
      let focusTarget: ViewerCloseReport["focusTarget"] = "none";
      if (trigger?.isConnected) {
        target = trigger;
        focusTarget = "trigger";
      } else if (container?.isConnected) {
        if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
        target = container;
        focusTarget = "container";
      }
      target?.focus({ preventScroll: true });
      onClosed();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const after = { x: window.scrollX, y: window.scrollY };
          const stops: ViewerStopFinding[] = [];
          if (Math.abs(after.x - s.x) > 0.5 || Math.abs(after.y - s.y) > 0.5) stops.push({ stop: "VIEWER_SCROLL_RESTORE_STOP", detail: `saved ${s.x},${s.y} → ${after.x},${after.y}` });
          const focusRestored = !!target && document.activeElement === target;
          if (!focusRestored) stops.push({ stop: "VIEWER_FOCUS_RESTORE_STOP", detail: `focus on ${document.activeElement?.tagName ?? "null"} (${focusTarget})` });
          onReport?.({ kind: "close", origin, theme, mediaId: media.mediaId, via, scrollSaved: { x: s.x, y: s.y }, scrollAfter: after, focusTarget, focusRestored, stops });
        }),
      );
    },
    [geometry, restoreDocument, trigger, container, onClosed, onReport, origin, theme, media.mediaId],
  );

  // Escape closes; Tab / Shift+Tab stay on the Viewer's only control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        void close("escape");
      } else if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!closing.current && rootRef.current && !rootRef.current.contains(e.target as Node)) closeRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [close]);

  const mat = A13_VIEWER_MATERIAL[theme];
  const rootStyle = {
    "--viewer-environment": mat.environment,
    "--viewer-environment-tile": `url("${A13_VIEWER_ASSETS.environment[theme].src}")`,
    "--viewer-caption-ink": mat.captionInk,
    "--viewer-close-ink": mat.closeInk,
  } as CSSProperties;
  const g = geometry;
  const label = `${C.accessibility.dialogLabel} — ${caption ?? media.alt}`;

  const node: ReactNode = (
    <div
      ref={rootRef}
      className={`${styles.root} ${laBelleAurore.variable}`}
      style={rootStyle}
      data-a13-viewer=""
      data-a13-viewer-theme={theme}
      data-viewer-origin={origin}
      data-viewer-state={g ? "open" : "preparing"}
    >
      <span className={styles.probe} aria-hidden="true">
        <span ref={probeRef} className={styles.probeText} data-caption-probe="">
          Aa
        </span>
      </span>
      <div ref={envRef} className={styles.environment} aria-hidden="true" data-viewer-environment="" />
      <div role="dialog" aria-modal="true" aria-label={label} className={styles.dialog}>
        {g ? (
          <figure ref={printRef} className={styles.print} data-viewer-print="" style={{ left: Math.round(g.paper.x), top: Math.round(g.paper.y), width: g.paper.w, height: g.paper.h }}>
            <Paper g={g} theme={theme} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.photo}
              data-viewer-photo=""
              src={media.src}
              alt={media.alt}
              width={Math.round(g.photoLocal.w)}
              height={Math.round(g.photoLocal.h)}
              style={{ left: g.photoLocal.x, top: g.photoLocal.y, width: g.photoLocal.w, height: g.photoLocal.h }}
              draggable={false}
              decoding="sync"
            />
            {g.caption ? (
              <figcaption className={styles.caption} data-viewer-caption="" style={{ left: g.caption.box.x, top: g.caption.box.y, width: g.caption.box.w, height: g.caption.box.h }}>
                {g.caption.lines.map((l, i) => (
                  <span
                    key={i}
                    className={styles.line}
                    data-viewer-caption-line=""
                    style={{ top: i * g.caption!.lineHeight, height: g.caption!.lineHeight, fontSize: g.caption!.fontSize, lineHeight: `${g.caption!.lineHeight}px` }}
                  >
                    {l.text}
                  </span>
                ))}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          data-viewer-close=""
          aria-label={C.close.label}
          style={g ? { top: g.close.offset, right: g.close.offset } : { top: 28, right: 28 }}
          onClick={() => void close("button")}
        >
          <span aria-hidden="true">{C.close.glyph}</span>
        </button>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

/**
 * Host helper shared by the Gallery and the Album: remembers the trigger
 * (the focused print at activation) and its container, renders the Viewer
 * and unmounts it once closed.
 */
export function useMemoryViewer(onReport?: (r: ViewerReport) => void) {
  const [req, setReq] = useState<{ media: MemoryViewerMedia; theme: ViewerTheme; origin: ViewerOrigin; trigger: HTMLElement | null; container: HTMLElement | null; n: number } | null>(null);
  const count = useRef(0);
  const open = useCallback((media: MemoryViewerMedia, theme: ViewerTheme, origin: ViewerOrigin, trigger?: HTMLElement | null) => {
    const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const t = trigger ?? active;
    const container = t?.closest<HTMLElement>(origin === "album" ? "[data-testid=album-memory-table]" : "[data-testid=a13-pilot-scene]") ?? null;
    count.current += 1;
    setReq({ media, theme, origin, trigger: t, container, n: count.current });
  }, []);
  const onClosed = useCallback(() => setReq(null), []);
  const node = req ? <MemoryViewer key={req.n} media={req.media} theme={req.theme} origin={req.origin} trigger={req.trigger} container={req.container} onClosed={onClosed} onReport={onReport} /> : null;
  return { open, node, isOpen: req !== null };
}
