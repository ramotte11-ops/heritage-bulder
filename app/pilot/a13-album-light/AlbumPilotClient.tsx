"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13GalleryScene";
import { AlbumMemoryTable, type AlbumMemoryTableMedia } from "@/components/memorial/album/AlbumMemoryTable";
import { useMemoryViewer } from "@/components/memorial/viewer/MemoryViewer";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { layoutAlbum, albumPrintQa, albumSeamQa, albumGeometrySnapshot, verifyAlbumDeterminism, type AlbumLayout } from "@/lib/memorial/album/album-layout";
import { domGeometrySnapshot, sceneMaterialReport } from "@/lib/memorial/gallery/theme-dom-snapshot";
import type { AlbumTheme } from "@/config/album-a13-dark-material";
import { partitionSizes } from "@/lib/memorial/album/album-partition";
import {
  ALBUM_CAPTION_SETS,
  ALBUM_RATIO_SETS,
  ALBUM_TEST_PHOTOS,
  albumFixture,
  type AlbumCaptionSet,
  type AlbumFixtureMedia,
  type AlbumRatioSet,
} from "@/lib/memorial/album/album-pilot-fixtures";
import styles from "./page.module.css";

/**
 * A13 Album Desktop Light — runtime pilot harness.
 *
 * `?n=7|10|11|20|40…&ratios=…&captions=…` (+ `qa=1` overlays, `planche=1`
 * the Album alone for boards). Every print is interactive: the witness
 * callback records the resolved `mediaId` (no Viewer is built). Captions are
 * laid out once La Belle Aurore is confirmed; the geometry does not depend
 * on them (the same layout is computed before and after the font).
 *
 * Album Desktop Dark V1 (material only): `theme=dark` renders the SAME
 * layout with the Dark material; `vue=snapshot` publishes the RENDERED
 * geometry snapshot of the table (`domGeometrySnapshot`, the Gallery Dark
 * parity instrument) and its material report on `window.__albumSnapshot`.
 * The QA loads the Light and the Dark page of the same media separately
 * (same page position — no sub-pixel offset between the two tables) and
 * compares the two snapshots → `GEOMETRY DIVERGENCE LIGHT/DARK: NONE` or
 * `THEME_GEOMETRY_PARITY_STOP` with the first differing path.
 * `negatif=transform|padding|filter` injects a deliberate Dark leak
 * (negative control, QA only).
 *
 * Viewer Desktop V2: activating a print opens the shared `MemoryViewer`
 * in the Album's theme (Album origin); the witness callback is kept and
 * the reports are published on `window.__viewerQa`. The table is unchanged.
 */

declare global {
  interface Window {
    __albumPilot?: {
      summary: unknown;
      activations: { mediaId: string; mediaIndex: number }[];
      fontReady: boolean;
    };
    __albumSnapshot?: {
      theme: AlbumTheme;
      geometry: unknown;
      engine: string;
      photosProcessed: number;
      negative: string | null;
    };
  }
}

const COUNTS = [7, 10, 11, 20, 40];

function useCroppedSources(media: AlbumFixtureMedia[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = media.map((m) => `${m.photo}:${m.cropToRatio ?? ""}`).join("|");
  useEffect(() => {
    let alive = true;
    const need = [...new Set(media.filter((m) => m.cropToRatio).map((m) => `${m.photo}@${m.cropToRatio}`))];
    const out: Record<string, string> = {};
    void Promise.all(
      need.map(async (id) => {
        const [photo, r] = id.split("@");
        const img = new Image();
        img.src = ALBUM_TEST_PHOTOS[photo as keyof typeof ALBUM_TEST_PHOTOS].src;
        await img.decode();
        const ratio = Number(r);
        const cw = Math.min(img.naturalWidth, img.naturalHeight * ratio);
        const ch = cw / ratio;
        const c = document.createElement("canvas");
        c.width = 1400;
        c.height = Math.round(1400 / ratio);
        c.getContext("2d")!.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, 0, 0, c.width, c.height);
        out[id] = c.toDataURL("image/jpeg", 0.88);
      }),
    ).then(() => {
      if (alive) setUrls(out);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

function summaryOf(layout: AlbumLayout) {
  const ms = layout.groups.reduce((a, g) => a + g.stats.ms, 0);
  const scales = layout.prints.map((p) => p.scale);
  return {
    count: layout.count,
    status: layout.status,
    partition: layout.groups.map((g) => g.size),
    grammars: layout.groups.map((g) => g.grammar),
    height: Math.round(layout.height),
    layoutMs: Math.round(ms * 10) / 10,
    maxGroupMs: Math.round(Math.max(...layout.groups.map((g) => g.stats.ms)) * 10) / 10,
    scaleRange: [Math.min(...scales), Math.max(...scales)],
    lastGroup: layout.groups[layout.groups.length - 1]?.size ?? null,
    groups: layout.groups.map((g) => ({
      index: g.index,
      grammar: g.grammar,
      size: g.size,
      start: g.start,
      status: g.status,
      detail: g.detail,
      visualTop: Math.round(g.visualTop),
      visualBottom: Math.round(g.visualBottom),
      seam: g.seam ? { state: g.seam.state, dx: g.seam.dx, dy: Math.round(g.seam.dy * 10) / 10, overlap: Math.round(g.seam.overlap), contact: g.seam.contactLanes, seed: g.seam.seed, code: g.seam.transitionCode, trials: g.seam.trials.map((t) => `${t.state} ${t.dx}: ${t.failure ?? "OK"}`) } : null,
      ...g.stats,
      ms: Math.round(g.stats.ms * 10) / 10,
    })),
    seams: albumSeamQa(layout).map((s) => ({ ...s, overlap: Math.round(s.overlap), maxGap: s.maxGap === null ? null : Math.round(s.maxGap), maxCentralPairGap: s.maxCentralPairGap === null ? null : Math.round(s.maxCentralPairGap), crossOverlapPx2: Math.round(s.crossOverlapPx2) })),
    order: layout.prints.map((p) => p.mediaId),
  };
}

export function AlbumPilotClient() {
  const q = useSearchParams();
  const n = Math.max(0, Math.min(200, Number(q.get("n") ?? 7) || 7));
  const ratios = (ALBUM_RATIO_SETS as readonly string[]).includes(q.get("ratios") ?? "") ? (q.get("ratios") as AlbumRatioSet) : "natural-mix";
  const captions = (ALBUM_CAPTION_SETS as readonly string[]).includes(q.get("captions") ?? "") ? (q.get("captions") as AlbumCaptionSet) : "mixed";
  const qa = q.get("qa") === "1";
  const board = q.get("planche") === "1";
  // Pilot only: one distinct URL per print, so network requests prove lazy loading.
  const unique = q.get("unique") === "1";
  const theme: AlbumTheme = q.get("theme") === "dark" ? "dark" : "light";
  const snapshotView = q.get("vue") === "snapshot";
  const negative = ["transform", "padding", "filter"].includes(q.get("negatif") ?? "") ? (q.get("negatif") as string) : null;
  const tableRef = useRef<HTMLDivElement>(null);

  const root = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(root);
  const media = useMemo(() => albumFixture(n, ratios, captions), [n, ratios, captions]);
  const cropped = useCroppedSources(media);
  const [last, setLast] = useState<string | null>(null);

  const layout = useMemo(() => layoutAlbum(media, font?.measurer ?? null), [media, font]);
  const measures = q.get("mesures") === "1";
  const summary = useMemo(() => {
    const base = summaryOf(layout);
    if (!measures || layout.status === "ALBUM_ABSENT") return base;
    // QA only (Handoff: caption visibility measured, never a rule).
    const pq = albumPrintQa(layout);
    const ink = pq.map((x) => x.captionVisibleInk).filter((v): v is number => v !== null);
    return {
      ...base,
      // V1.1 ALBUM_NONDETERMINISM_STOP check: two cold computations.
      determinism: verifyAlbumDeterminism(media, font?.measurer ?? null),
      printQa: {
        minVisiblePhoto: Math.min(...pq.map((x) => x.visiblePhoto)),
        minVisibleOuter: Math.min(...pq.map((x) => x.visibleOuter)),
        minHitTargetSide: Math.min(...pq.map((x) => x.hitTargetSide)),
        captions: ink.length,
        captionInkMin: ink.length ? Math.min(...ink) : null,
        captionInkMean: ink.length ? ink.reduce((a, b) => a + b, 0) / ink.length : null,
        captionsFullyVisible: ink.filter((v) => v > 0.999).length,
        captionsBelow60: ink.filter((v) => v < 0.6).length,
        captionsBelow40: ink.filter((v) => v < 0.4).length,
        captionUnresolved: layout.prints.filter((p) => p.caption?.status === "CAPTION_COLLISION_UNRESOLVED").length,
      },
    };
  }, [layout, measures, media, font]);

  useEffect(() => {
    const prev = window.__albumPilot?.activations ?? [];
    window.__albumPilot = { summary, activations: prev, fontReady: !!font };
  }, [summary, font]);

  const tableMedia: AlbumMemoryTableMedia[] = media.map((m, i) => ({
    mediaId: m.mediaId,
    src: m.cropToRatio ? (cropped[`${m.photo}@${m.cropToRatio}`] ?? "data:image/gif;base64,R0lGODlhAQABAAAAACw=") : `${ALBUM_TEST_PHOTOS[m.photo].src}${unique ? `?m=${m.mediaId}` : ""}`,
    alt: `Photo de test ${i + 1}`,
  }));

  const viewer = useMemoryViewer((r) => {
    window.__viewerQa ??= { reports: [], validation: null, media: null };
    window.__viewerQa.reports.push(r);
  });

  const onActivate = (mediaId: string, mediaIndex: number) => {
    setLast(`${mediaId} (média ${mediaIndex + 1})`);
    window.__albumPilot?.activations.push({ mediaId, mediaIndex });
    const m = media[mediaIndex];
    const natural = m.cropToRatio ? { w: 1400, h: Math.round(1400 / m.cropToRatio) } : { w: m.width, h: m.height };
    viewer.open({ mediaId, src: tableMedia[mediaIndex].src, alt: tableMedia[mediaIndex].alt, naturalWidth: natural.w, naturalHeight: natural.h, caption: m.caption }, theme, "album", "fr");
  };

  const href = (p: Record<string, string | number>) => {
    const s = new URLSearchParams({ n: String(n), ratios, captions, ...(qa ? { qa: "1" } : {}), ...Object.fromEntries(Object.entries(p).map(([a, b]) => [a, String(b)])) });
    return `?${s.toString()}`;
  };

  // Snapshot view: publish the RENDERED geometry of this table once the
  // caption font is confirmed and every photo is decoded.
  useEffect(() => {
    if (!snapshotView || !font || layout.status === "ALBUM_ABSENT") return;
    let alive = true;
    const t = window.setTimeout(async () => {
      const scene = tableRef.current?.querySelector<HTMLElement>("[data-testid=album-memory-table]");
      if (!scene) return;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      if (!alive) return;
      window.scrollTo(0, 0);
      window.__albumSnapshot = {
        theme,
        // Hit tests run per theme in the browser QA, not in this snapshot.
        geometry: domGeometrySnapshot(scene, Number.MAX_SAFE_INTEGER),
        engine: albumGeometrySnapshot(layout),
        photosProcessed: sceneMaterialReport(scene).photos.filter((p) => p.processed).length,
        negative,
      };
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [snapshotView, font, layout, negative, theme]);

  return (
    <div ref={root} className={`${styles.page} ${board ? (theme === "dark" ? styles.boardDark : styles.board) : ""}`}>
      {negative ? (
        // QA negative control ONLY: a deliberate Dark leak the parity check must catch.
        <style>{negative === "transform" ? `[data-a13-theme="dark"] [data-print]{transform:translateY(2px)}` : negative === "padding" ? `[data-a13-theme="dark"] [data-print]{padding:3px}` : `[data-a13-theme="dark"] [data-print] img{filter:saturate(0.8)}`}</style>
      ) : null}
      <A13CaptionFontProbe />
      {board ? null : (
        <div className={styles.panel}>
          <h1 className={styles.h1}>A13 · Album complet Desktop Light · table de souvenirs extensible — pilote runtime V1 (Light uniquement)</h1>
          <div className={styles.controls}>
            <span>
              médias :{" "}
              {COUNTS.map((c) => (
                <a key={c} href={href({ n: c })} aria-current={c === n}>
                  {c}{" "}
                </a>
              ))}
            </span>
            <span>
              ratios :{" "}
              {ALBUM_RATIO_SETS.map((r) => (
                <a key={r} href={href({ ratios: r })} aria-current={r === ratios}>
                  {r}{" "}
                </a>
              ))}
            </span>
            <span>
              captions :{" "}
              {ALBUM_CAPTION_SETS.map((c) => (
                <a key={c} href={href({ captions: c })} aria-current={c === captions}>
                  {c}{" "}
                </a>
              ))}
            </span>
            <a href={href({ qa: qa ? 0 : 1 })}>{qa ? "masquer QA" : "calques QA"}</a>
            <span className={styles.log} data-testid="album-activation">
              dernier tirage activé : {last ?? "—"}
            </span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>partition</th>
                <th>statut</th>
                <th>hauteur (px @1670)</th>
                <th>layout total</th>
                <th>groupe le plus coûteux</th>
                <th>échelles</th>
                <th>police captions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {n} → {partitionSizes(n).join(" + ") || "Album absent"}
                </td>
                <td className={layout.status === "PASS" ? undefined : styles.stop}>{layout.status}</td>
                <td>{summary.height}</td>
                <td>{summary.layoutMs} ms</td>
                <td>{summary.maxGroupMs} ms</td>
                <td>{summary.scaleRange.map((s) => s.toFixed(3)).join(" – ")}</td>
                <td>{font ? `${font.fontFamily} · check ${String(font.fontCheck)}` : "en attente (captions non posées)"}</td>
              </tr>
            </tbody>
          </table>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>groupe</th>
                <th>grammaire</th>
                <th>médias</th>
                <th>raccord V1.1 (état · dx · chevauchement · lanes de contact)</th>
                <th>rang local</th>
                <th>candidats joints</th>
                <th>cache</th>
                <th>coût</th>
                <th>statut</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((g) => (
                <tr key={g.index}>
                  <td>g{g.index}</td>
                  <td>{g.grammar}</td>
                  <td>
                    {g.start + 1}–{g.start + g.size}
                  </td>
                  <td>{g.seam ? `${g.seam.state} · dx ${g.seam.dx} · ${g.seam.overlap} · ${g.seam.contact} lanes${g.seam.seed !== null ? ` · seed ${g.seam.seed}` : ""}` : "tête (position Master)"}</td>
                  <td>
                    {g.candidateRank}
                    {g.repaired ? " (réparation locale)" : ""}
                  </td>
                  <td>{g.jointEvaluated}</td>
                  <td>{g.cacheHit ? "hit" : "—"}</td>
                  <td>{g.ms} ms</td>
                  <td className={g.status === "PASS" ? undefined : styles.stop}>
                    {g.status}
                    {g.detail ? ` — ${g.detail}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {layout.status === "ALBUM_ABSENT" ? null : (
        <div ref={tableRef}>
          <AlbumMemoryTable layout={layout} media={tableMedia} onActivate={onActivate} qa={qa} theme={theme} language="fr" />
        </div>
      )}
      {board ? null : (
        <div className={styles.panel}>
          <pre className={styles.pre} data-testid="album-summary-json">
            {JSON.stringify(summary, null, 1)}
          </pre>
        </div>
      )}
      {viewer.node}
    </div>
  );
}
