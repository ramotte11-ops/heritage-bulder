"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LETTER_MASTERS, letterLayout, letterSlices, type LetterLayout, type LetterRect } from "@/config/contributions-letter-v1";
import styles from "./LetterCard.module.css";

/**
 * M8-E6-A — « La lettre des proches » : le décor (Master du Studio) et ses
 * zones de lecture sûres. Aucune logique de dépôt ici.
 *
 * Le Master est dessiné tel quel dans un <canvas>, à la résolution de
 * l'écran, avec UNE seule échelle (aucune déformation). Sur Mobile, quand le
 * contenu est long, la lettre s'allonge par bandeaux en miroir pris dans le
 * Master lui-même (config/contributions-letter-v1.ts) ; au-delà de la
 * hauteur disponible, le contenu défile dans sa zone.
 */

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = cached ?? new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (!cached) {
      imageCache.set(src, img);
      img.src = src;
    }
  });
}

function zoneStyle(rect: LetterRect, layout: LetterLayout, shift: { top: number; bottom: number }): CSSProperties {
  const s = layout.scale;
  return {
    left: rect.left * s,
    top: rect.top * s + shift.top,
    width: (rect.right - rect.left) * s,
    height: (rect.bottom - rect.top) * s + (shift.bottom - shift.top),
  };
}

export interface LetterCardProps {
  header: ReactNode;
  body: ReactNode;
  footer: ReactNode;
  close: ReactNode;
  /** Change à chaque étape : la hauteur de la lettre est recalculée. */
  stepKey: string;
}

export function LetterCard({ header, body, footer, close, stepKey }: LetterCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Hauteur de fenêtre STABLE (capturée à l'ouverture) : l'ouverture du clavier
  // sur Mobile ne raccourcit pas la lettre pendant la saisie ; la fenêtre défile.
  const stableHeight = useRef<number | null>(null);
  // La fenêtre n'existe que dans le navigateur (portail ouvert après le montage) :
  // une géométrie provisoire est connue dès le premier rendu, affinée ensuite.
  const [layout, setLayout] = useState<LetterLayout | null>(() =>
    typeof window === "undefined"
      ? null
      : letterLayout({ viewportWidth: document.documentElement.clientWidth || window.innerWidth, viewportHeight: window.innerHeight, contentOverflow: 0 }),
  );
  const [ready, setReady] = useState(false);
  const [scrolls, setScrolls] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      if (stableHeight.current === null || window.innerHeight > stableHeight.current) stableHeight.current = window.innerHeight;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const first = letterLayout({ viewportWidth, viewportHeight: stableHeight.current, contentOverflow: 0 });
      const m = LETTER_MASTERS[first.frame];
      const available = (m.body.bottom - m.body.top) * first.scale;
      const need = contentRef.current ? contentRef.current.scrollHeight : 0;
      const next = letterLayout({ viewportWidth, viewportHeight: stableHeight.current, contentOverflow: need - available });
      const zone = bodyRef.current;
      setScrolls(zone ? zone.scrollHeight > zone.clientHeight + 1 : false);
      setLayout((prev) =>
        prev && prev.frame === next.frame && prev.width === next.width && prev.extensions === next.extensions ? prev : next,
      );
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (ro && contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stepKey]);

  useEffect(() => {
    if (!layout) return;
    const m = LETTER_MASTERS[layout.frame];
    let cancelled = false;
    loadImage(m.src)
      .then((img) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const k = (layout.width * dpr) / m.width;
        canvas.width = Math.round(layout.width * dpr);
        canvas.height = Math.round(layout.height * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = "high";
        let y = 0;
        for (const slice of letterSlices(layout.frame, layout.extensions)) {
          const h = slice.bottom - slice.top;
          // Destination en pixels entiers, arrondie de façon cumulative : aucun interstice.
          const dy0 = Math.round(y * k);
          const dy1 = Math.round((y + h) * k);
          if (slice.flip) {
            ctx.save();
            ctx.translate(0, dy1);
            ctx.scale(1, -1);
            ctx.drawImage(img, 0, slice.top, m.width, h, 0, 0, canvas.width, dy1 - dy0);
            ctx.restore();
          } else {
            ctx.drawImage(img, 0, slice.top, m.width, h, 0, dy0, canvas.width, dy1 - dy0);
          }
          y += h;
        }
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, [layout]);

  const m = layout ? LETTER_MASTERS[layout.frame] : LETTER_MASTERS.mobile;
  const ext = layout?.extensionPx ?? 0;
  const below = (rect: LetterRect) => (m.band && rect.top >= m.band.bottom ? ext : 0);
  const style: CSSProperties | undefined = layout ? { width: layout.width, height: layout.height } : undefined;

  return (
    <div
      className={`${styles.card} ${layout ? styles[`frame-${layout.frame}`] : ""} ${ready ? styles.ready : ""}`}
      style={style}
      data-letter-frame={layout?.frame}
      data-letter-extensions={layout?.extensions ?? 0}
    >
      <canvas ref={canvasRef} className={styles.paper} aria-hidden="true" />
      {layout ? (
        <>
          <div className={styles.zoneHeader} style={zoneStyle(m.header, layout, { top: 0, bottom: 0 })} data-letter-zone="header">
            {header}
          </div>
          <div ref={bodyRef} className={styles.zoneBody} style={zoneStyle(m.body, layout, { top: 0, bottom: ext })} data-letter-zone="body" data-scrolls={scrolls}>
            <div ref={contentRef} className={styles.bodyContent}>
              {body}
            </div>
          </div>
          <div className={styles.zoneFooter} style={zoneStyle(m.footer, layout, { top: below(m.footer), bottom: below(m.footer) })} data-letter-zone="footer">
            {footer}
          </div>
          <div className={styles.zoneClose} style={zoneStyle(m.close, layout, { top: 0, bottom: 0 })}>
            {close}
          </div>
        </>
      ) : null}
    </div>
  );
}
