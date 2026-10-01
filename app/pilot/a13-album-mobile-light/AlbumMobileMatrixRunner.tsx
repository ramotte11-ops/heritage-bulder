"use client";

import { useEffect, useRef, useState } from "react";
import { A13_ALBUM_MOBILE_CAPTION as CAP, A13_ALBUM_MOBILE_MINIMUMS as MIN, a13AlbumMobileActive } from "@/config/album-a13-mobile-light";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { partitionAlbumMobile } from "@/lib/memorial/album/album-partition";
import {
  albumMobileAccess,
  albumMobileCaptionInk,
  albumMobileNegativeControls,
  albumMobileSnapshot,
  layoutAlbumMobile,
  solveAlbumMobileGeometry,
  verifyAlbumMobile,
  type AlbumMobileGeometry,
} from "@/lib/memorial/album/album-mobile-layout";
import { ALBUM_MOBILE_CAPTION_SETS, ALBUM_MOBILE_COUNTS, ALBUM_MOBILE_RATIO_SETS, albumMobileFixture } from "@/lib/memorial/album/album-mobile-pilot-fixtures";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";

/**
 * QA matrix (PILOT ONLY): 7 / 8 / 11 / 20 / 40 media × 7 ratio sets × 6
 * caption sets, laid out IN THE BROWSER at the current width with the real
 * La Belle Aurore measurer, then every contract rule re-checked
 * (`verifyAlbumMobile`) plus the V1.1 measures: dominant / secondary short
 * sides, photo window identical with and without caption, band heights,
 * caption typography, page end, materials, determinism, and the geometry
 * digest (source px) compared across widths and counts by the QA script.
 * Result: `window.__albumMobileMatrix`.
 */

export interface AlbumMobileMatrixRow {
  width: number;
  n: number;
  ratios: string;
  captions: string;
  status: string;
  stops: string[];
  partition: number[];
  canonical: number[];
  scale: number;
  heightCss: number;
  paperBottomCss: number;
  endBreathingCss: number;
  layers: number;
  dominantShortCss: number;
  minSecondaryShortCss: number;
  secondaryRequiredCss: number;
  unreached: { mediaIndex: number; slot: string; shortCss375: number }[];
  windowInvariant: boolean;
  outerTopInvariant: boolean;
  bandCss: number[];
  bandOk: boolean;
  fontCss: number;
  lineHeightCss: number;
  maxLines: number;
  maxChars: number;
  occludedCaptions: number;
  /** Visible glyph-ink share of each caption (QA observation). */
  captionInk: number[];
  minVisiblePhoto: number;
  minVisibleAreaCss375: number;
  minHitCss375: number;
  minHitCssAfterCaptions: number;
  determinism: boolean;
  geometryDigest: string;
  groupDigests: string[];
  negatives: { injection: string; pass: boolean; raised: string[] }[] | null;
  ms: number;
}

declare global {
  interface Window {
    __albumMobileMatrix?: { width: number; done: boolean; rows: AlbumMobileMatrixRow[] };
  }
}

/** FNV-1a, 32 bit — a short digest for comparisons in the QA script. */
function digest(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const geomKey = (g: AlbumMobileGeometry) => JSON.stringify(g.prints.map((p) => [p.slot.center, p.slot.zIndex, p.scale, p.layout.outer, p.layout.window, p.layout.photo]));

export function AlbumMobileMatrixRunner() {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [width, setWidth] = useState<number | null>(null);
  const [progress, setProgress] = useState("…");

  useEffect(() => {
    if (rootRef.current) setWidth(rootRef.current.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    if (!font?.fontCheck || width === null || !a13AlbumMobileActive(width)) return;
    let alive = true;
    void (async () => {
      const rows: AlbumMobileMatrixRow[] = [];
      window.__albumMobileMatrix = { width, done: false, rows };
      const s = width / 1024;
      for (const n of ALBUM_MOBILE_COUNTS)
        for (const ratios of ALBUM_MOBILE_RATIO_SETS) {
          const geometry = solveAlbumMobileGeometry(albumMobileFixture(n, ratios, "aucune"));
          for (const captions of ALBUM_MOBILE_CAPTION_SETS) {
            const t0 = performance.now();
            const media = albumMobileFixture(n, ratios, captions).map(({ mediaId, width: w, height: h, caption }) => ({ mediaId, width: w, height: h, caption }));
            // The geometry never reads a caption: solved again WITH the captioned media, it must be the same.
            const g2 = solveAlbumMobileGeometry(media);
            const layout = layoutAlbumMobile(media, font.measurer, width, g2);
            const ms = performance.now() - t0;
            const findings = verifyAlbumMobile({ media, layout });
            const bare = layoutAlbumMobile(media, null, width, geometry);
            const win = (r: { x: number; y: number; width: number; height: number }) => [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 1e6)).join(",");
            const windowInvariant = layout.prints.every((p, i) => win(p.drawn.window) === win(bare.prints[i].drawn.window) && win(p.drawn.photo) === win(bare.prints[i].drawn.photo)) && geomKey(g2) === geomKey(geometry);
            const outerTopInvariant = layout.prints.every((p, i) => {
              const a = p.drawn.outer;
              const b = bare.prints[i].drawn.outer;
              return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.width - b.width) < 1e-9 && a.height >= b.height - 1e-9;
            });
            const thin = layout.prints.length ? layout.prints[0].layout.band.height * s : 0;
            const bandOk = layout.prints.every((p) => {
              const want = p.captionLines === 0 ? thin : Math.max(thin, p.captionLines === 1 ? CAP.bandHeightCssPx.oneLine : CAP.bandHeightCssPx.twoLinesMax);
              return Math.abs(p.bandCss - want) < 1e-6 && Math.abs(p.drawn.band.height * s - want) < 1e-6;
            });
            const short = (p: (typeof layout.prints)[number]) => Math.min(p.layout.outer.width, p.layout.outer.height) * s;
            const dom = layout.prints.filter((p) => p.role === "dominant");
            const sec = layout.prints.filter((p) => p.role === "secondary");
            const acc = albumMobileAccess(layout.prints);
            const accCap = albumMobileAccess(layout.prints, (p) => (p as (typeof layout.prints)[number]).drawnOuter);
            const a = albumMobileSnapshot(layoutAlbumMobile(media, null, width, solveAlbumMobileGeometry(media)));
            const b = albumMobileSnapshot(layoutAlbumMobile(media, null, width, solveAlbumMobileGeometry(media)));
            rows.push({
              width,
              n,
              ratios,
              captions,
              status: layout.status,
              stops: [...new Set(findings.map((f) => `${f.stop}: ${f.detail}`))],
              partition: layout.geometry.groups.map((x) => x.size),
              canonical: partitionAlbumMobile(n).map((x) => x.size),
              scale: layout.scale,
              heightCss: layout.height * s,
              paperBottomCss: layout.paperBottom * s,
              endBreathingCss: (layout.height - layout.paperBottom) * s,
              layers: layout.materials.length,
              dominantShortCss: dom.length ? Math.min(...dom.map(short)) : 0,
              minSecondaryShortCss: sec.length ? Math.min(...sec.map(short)) : 0,
              secondaryRequiredCss: (MIN.secondaryOuterPaperShortSideCssPxAt375 * width) / 375,
              unreached: layout.prints.filter((p) => !p.minimumReached).map((p) => ({ mediaIndex: p.mediaIndex, slot: p.witnessSlot, shortCss375: p.shortSideCss375 })),
              windowInvariant,
              outerTopInvariant,
              bandCss: [...new Set(layout.prints.map((p) => Math.round(p.bandCss * 1000) / 1000))],
              bandOk,
              fontCss: layout.captionFontPx * s,
              lineHeightCss: layout.captionFontPx * s * (CAP.lineHeightCssPx / CAP.fontSizeCssPx),
              maxLines: Math.max(0, ...layout.prints.map((p) => p.caption?.lines.length ?? 0)),
              maxChars: Math.max(0, ...media.map((m) => [...(m.caption ?? "")].length)),
              occludedCaptions: layout.prints.filter((p) => p.caption?.status === "CAPTION_COLLISION_UNRESOLVED").length,
              captionInk: albumMobileCaptionInk(layout).filter((v): v is number => v !== null),
              minVisiblePhoto: Math.min(...acc.map((x) => x.visiblePhoto)),
              minVisibleAreaCss375: Math.min(...acc.map((x) => x.visibleAreaCss375)),
              minHitCss375: Math.min(...acc.map((x) => x.hitSideCss375)),
              minHitCssAfterCaptions: Math.min(...accCap.map((x) => x.hitSideCss375)),
              determinism: a === b,
              geometryDigest: digest(geomKey(g2)),
              groupDigests: layout.geometry.groups.map((grp) => digest(JSON.stringify(layout.prints.filter((p) => p.groupIndex === grp.index).map((p) => [p.slot.center, p.scale, p.layout.outer])))),
              negatives: captions === "aucune" ? albumMobileNegativeControls(media, layout).map((x) => ({ injection: x.injection, pass: x.pass, raised: x.raised })) : null,
              ms,
            });
            setProgress(`${rows.length} albums…`);
            await new Promise((r) => setTimeout(r, 0));
            if (!alive) return;
          }
        }
      window.__albumMobileMatrix = { width, done: true, rows };
      setProgress(`${rows.length} albums — terminé`);
    })();
    return () => {
      alive = false;
    };
  }, [font, width]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }} data-testid="album-mobile-matrix">
      <A13CaptionFontProbe />
      <p style={{ font: "12px ui-monospace, monospace", padding: 12 }} data-testid="matrix-progress">
        QA matrice Album Mobile : {width !== null && !a13AlbumMobileActive(width) ? `profil Mobile inactif (${width} px)` : progress}
      </p>
    </div>
  );
}
