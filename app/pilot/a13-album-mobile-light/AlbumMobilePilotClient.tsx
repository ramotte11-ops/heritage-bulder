"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LANGUAGES, type Language } from "@/config/languages";
import { A13_ALBUM_MOBILE_HANDOFF_ID } from "@/config/album-a13-mobile-light";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import {
  albumMobileAccess,
  albumMobileCaptionInk,
  albumMobileMaterialPlan,
  albumMobileNegativeControls,
  albumMobileSnapshot,
  layoutAlbumMobile,
  solveAlbumMobileGeometry,
  verifyAlbumMobile,
  type AlbumMobileFinding,
  type AlbumMobileLayout,
  type AlbumMobileNegativeResult,
} from "@/lib/memorial/album/album-mobile-layout";
import {
  ALBUM_MOBILE_CAPTION_SETS,
  ALBUM_MOBILE_COUNTS,
  ALBUM_MOBILE_RATIO_SETS,
  albumMobileFixture,
  type AlbumMobileCaptionSet,
  type AlbumMobileFixtureMedia,
  type AlbumMobileRatioSet,
} from "@/lib/memorial/album/album-mobile-pilot-fixtures";
import { ALBUM_TEST_PHOTOS } from "@/lib/memorial/album/album-pilot-fixtures";
import type { ViewerReport } from "@/components/memorial/viewer/MemoryViewer";
import { A13MobileFullAlbum } from "@/components/memorial/album/A13MobileFullAlbum";
import { AlbumMobileTable } from "@/components/memorial/album/AlbumMobileTable";
import { AlbumMobileMatrixRunner } from "./AlbumMobileMatrixRunner";
import styles from "./page.module.css";

/**
 * A13 Full Album Mobile Light — pilot (PILOT ONLY, QA harness).
 *
 * `?n=7…200&ratios=witness|3x4|4x3|1x1|9x16|16x9|natural-mix&captions=aucune|12|24|32|une-ligne|deux-lignes&lang=fr|en|es&qa=1&planche=1`
 * — or `?matrice=1`: the whole QA matrix run in the browser
 * (`AlbumMobileMatrixRunner`). Open at a 375–430 px viewport.
 * `qa=1` draws the groups, the crossfade bands and the paper end;
 * `planche=1` shows the Album alone; `negatif=couture` (negative control,
 * QA only) draws the same page with NO crossfade (hard material seams). Every print opens the shared Viewer;
 * QA: `window.__albumMobile` (layout, contract findings, negative
 * controls, determinism, activations, Viewer reports).
 */

declare global {
  interface Window {
    __albumMobile?: {
      handoff: string;
      n: number;
      ratios: AlbumMobileRatioSet;
      captions: AlbumMobileCaptionSet;
      lang: Language;
      viewportWidth: number;
      layout: AlbumMobileLayout | null;
      findings: AlbumMobileFinding[];
      negatives: AlbumMobileNegativeResult[];
      /** Reachability of every print as drawn (caption bands included), page frame. */
      access: ReturnType<typeof albumMobileAccess>;
      captionInk: (number | null)[];
      determinism: "PASS" | "FAIL" | null;
      activations: { mediaId: string; mediaIndex: number }[];
      viewer: ViewerReport[];
    };
  }
}

/** Witness media: the test photo centre-cropped to the witness ratio (never distorted). */
function useCroppedSources(media: AlbumMobileFixtureMedia[]) {
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

export function AlbumMobilePilotClient() {
  const q = useSearchParams();
  return q.get("matrice") === "1" ? <AlbumMobileMatrixRunner /> : <AlbumMobilePilot />;
}

function AlbumMobilePilot() {
  const q = useSearchParams();
  const n = Math.max(0, Math.min(200, Math.floor(Number(q.get("n") ?? 11)) || 0));
  const ratios: AlbumMobileRatioSet = (ALBUM_MOBILE_RATIO_SETS as readonly string[]).includes(q.get("ratios") ?? "") ? (q.get("ratios") as AlbumMobileRatioSet) : "natural-mix";
  const captions: AlbumMobileCaptionSet = (ALBUM_MOBILE_CAPTION_SETS as readonly string[]).includes(q.get("captions") ?? "") ? (q.get("captions") as AlbumMobileCaptionSet) : "32";
  const lang: Language = (LANGUAGES as readonly string[]).includes(q.get("lang") ?? "") ? (q.get("lang") as Language) : "fr";
  const qa = q.get("qa") === "1";
  const board = q.get("planche") === "1";
  const hardSeam = q.get("negatif") === "couture";
  const fixture = useMemo(() => albumMobileFixture(n, ratios, captions), [n, ratios, captions]);
  const cropped = useCroppedSources(fixture);
  const ready = fixture.every((m) => !m.cropToRatio || cropped[`${m.photo}@${m.cropToRatio}`]);
  const media: A13FamilyMedia[] = useMemo(
    () =>
      fixture.map((m, i) => ({
        mediaId: m.mediaId,
        width: m.width,
        height: m.height,
        caption: m.caption,
        alt: `Souvenir de famille ${i + 1}`,
        src: m.cropToRatio ? (cropped[`${m.photo}@${m.cropToRatio}`] ?? "") : ALBUM_TEST_PHOTOS[m.photo].src,
      })),
    [fixture, cropped],
  );
  const [status, setStatus] = useState("…");
  const qaRef = useRef<NonNullable<Window["__albumMobile"]> | null>(null);

  useEffect(() => {
    qaRef.current = { handoff: A13_ALBUM_MOBILE_HANDOFF_ID, n, ratios, captions, lang, viewportWidth: window.innerWidth, layout: null, findings: [], negatives: [], access: [], captionInk: [], determinism: null, activations: [], viewer: [] };
    window.__albumMobile = qaRef.current;
  }, [n, ratios, captions, lang]);

  const onLayout = useCallback(
    (layout: AlbumMobileLayout) => {
      const albumMedia = media.map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption }));
      const findings = verifyAlbumMobile({ media: albumMedia, layout });
      const negatives = albumMobileNegativeControls(albumMedia, layout);
      // Determinism: two cold computations, byte-identical.
      const a = albumMobileSnapshot(layoutAlbumMobile(albumMedia, null, layout.stageWidth, solveAlbumMobileGeometry(albumMedia)));
      const b = albumMobileSnapshot(layoutAlbumMobile(albumMedia, null, layout.stageWidth, solveAlbumMobileGeometry(albumMedia)));
      const qaState = qaRef.current;
      const access = albumMobileAccess(layout.prints, (p) => (p as (typeof layout.prints)[number]).drawnOuter);
      if (qaState) Object.assign(qaState, { layout, findings, negatives, access, captionInk: albumMobileCaptionInk(layout), determinism: a === b ? "PASS" : "FAIL", viewportWidth: window.innerWidth });
      setStatus(
        `${layout.status} · ${layout.geometry.groups.map((g) => g.size).join("+")} · s ${layout.scale.toFixed(4)} · hauteur ${(layout.height * layout.scale).toFixed(0)} px · STOP ${findings.length ? findings.map((f) => f.stop).join(", ") : "aucun"} · négatifs ${negatives.filter((x) => x.pass).length}/${negatives.length}`,
      );
    },
    [media],
  );

  if (hardSeam) return ready ? <HardSeamPage media={media} lang={lang} /> : null;

  const page = (
    <div data-testid="album-mobile-pilot-album">
      {ready ? (
        <A13MobileFullAlbum
          media={media}
          language={lang}
          qa={qa}
          onLayout={onLayout}
          onActivateMemory={(mediaId, mediaIndex) => qaRef.current?.activations.push({ mediaId, mediaIndex })}
          onViewerReport={(r) => qaRef.current?.viewer.push(r)}
        />
      ) : null}
    </div>
  );

  if (board) return <main className={`${styles.page} ${styles.board}`}>{page}</main>;
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ n: String(n), ratios, captions, lang, ...(qa ? { qa: "1" } : {}), ...patch });
    return `?${p.toString()}`;
  };
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <h1 className={styles.h1}>A13 · Album complet Mobile Light · pilote (Handoff V1.1)</h1>
        <div className={styles.controls}>
          {ALBUM_MOBILE_COUNTS.map((c) => (
            <a key={c} href={link({ n: String(c) })} aria-current={c === n}>
              {c}
            </a>
          ))}
        </div>
        <div className={styles.controls}>
          {ALBUM_MOBILE_RATIO_SETS.map((r) => (
            <a key={r} href={link({ ratios: r })} aria-current={r === ratios}>
              {r}
            </a>
          ))}
        </div>
        <div className={styles.controls}>
          {ALBUM_MOBILE_CAPTION_SETS.map((c) => (
            <a key={c} href={link({ captions: c })} aria-current={c === captions}>
              {c}
            </a>
          ))}
        </div>
        <span className={styles.log} data-testid="album-mobile-status">
          {status}
        </span>
      </div>
      {page}
    </main>
  );
}

/** Negative control (QA only): the same page with hard material seams (no crossfade). */
function HardSeamPage({ media, lang }: { media: A13FamilyMedia[]; lang: Language }) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const neg = useMemo(() => {
    if (width === null) return null;
    const l = layoutAlbumMobile(media.map(({ mediaId, width: w, height: h, caption }) => ({ mediaId, width: w, height: h, caption })), null, width);
    return { ...l, materials: albumMobileMaterialPlan(l.height, { topBody: 0, bodyBody: 0 }) };
  }, [media, width]);
  return (
    <main ref={ref} className={`${styles.page} ${styles.board}`} data-negative="couture">
      {neg ? <AlbumMobileTable layout={neg} media={media} language={lang} /> : null}
    </main>
  );
}
