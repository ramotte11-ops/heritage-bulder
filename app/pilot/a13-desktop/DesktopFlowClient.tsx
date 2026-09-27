"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { A13_CTA_7PLUS_PILOT_LABELS } from "@/config/gallery-a13-multi-state-manifests";
import { LANGUAGES, type Language } from "@/config/languages";
import { A13_PILOT_TITLE } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13_FLOW_CAPTION_SETS, a13FamilyFixture, type A13FlowCaptionSet } from "@/lib/memorial/a13-desktop-flow-fixtures";
import type { A13FamilyMedia, DesktopGalleryRun } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13DesktopGallery } from "@/components/memorial/gallery/A13DesktopGallery";
import { A13DesktopFullAlbum } from "@/components/memorial/album/A13DesktopFullAlbum";
import type { ViewerReport } from "@/components/memorial/viewer/MemoryViewer";
import styles from "../a13-album-light/page.module.css";

/**
 * A13 Desktop — functional flow pilot (PILOT ONLY).
 *
 * `?n=0…60&theme=light|dark&lang=fr|en|es&captions=mixte|aucune|32&vue=galerie|album`
 *
 * One family media list (`a13FamilyFixture`) feeds BOTH views:
 * - `vue=galerie`: the Gallery Desktop section (`A13DesktopGallery`): 0–1
 *   media → no Gallery; 2…6 → G2…G6 exact; ≥ 7 → Signature 7+ (six shown,
 *   CTA). Every visible print opens the shared Viewer.
 * - `vue=album`: the Full Album (`A13DesktopFullAlbum`) of ALL the media.
 * The Signature 7+ CTA navigates `galerie → album` for the same list, the
 * same theme and language (history entry: Back returns to the Gallery).
 * This URL switch is the PILOT's navigation: in production, where the Full
 * Album lives (route, section, anchor) is decided by the memorial page —
 * outside A13; the Gallery only exposes `onSeeMore`.
 *
 * QA: `window.__a13Desktop` (view, state, visible media, CTA, album count)
 * and `window.__viewerQa.reports`; `planche=1` hides the panel.
 */

declare global {
  interface Window {
    __a13Desktop?: {
      view: "galerie" | "album";
      n: number;
      theme: "light" | "dark";
      lang: Language;
      mediaIds: string[];
      gallery: null | {
        stateId: string | null;
        status: string;
        hasCta: boolean;
        ctaLabel: { text: string; status: string; lang: Language };
        visible: { slotId: string; mediaId: string; mediaIndex: number; src: string; caption: string | null }[];
      };
    };
  }
}

const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 40];

export function DesktopFlowClient() {
  const q = useSearchParams();
  const router = useRouter();
  const n = Math.max(0, Math.min(60, Math.floor(Number(q.get("n") ?? 7)) || 0));
  const theme = q.get("theme") === "dark" ? "dark" : "light";
  const lang: Language = (LANGUAGES as readonly string[]).includes(q.get("lang") ?? "") ? (q.get("lang") as Language) : "fr";
  const captions: A13FlowCaptionSet = (A13_FLOW_CAPTION_SETS as readonly string[]).includes(q.get("captions") ?? "") ? (q.get("captions") as A13FlowCaptionSet) : "mixte";
  const view = q.get("vue") === "album" ? "album" : "galerie";
  const board = q.get("planche") === "1";
  const media = useMemo(() => a13FamilyFixture(n, captions), [n, captions]);
  const cta = A13_CTA_7PLUS_PILOT_LABELS[lang];
  const [run, setRun] = useState<DesktopGalleryRun<A13FamilyMedia> | null>(null);

  const href = useCallback(
    (p: Record<string, string | number>) => {
      const s = new URLSearchParams({ n: String(n), theme, lang, captions, vue: view, ...(board ? { planche: "1" } : {}), ...Object.fromEntries(Object.entries(p).map(([a, b]) => [a, String(b)])) });
      return `?${s.toString()}`;
    },
    [n, theme, lang, captions, view, board],
  );

  const publish = useCallback(
    (r: DesktopGalleryRun<A13FamilyMedia> | null) => {
      window.__a13Desktop = {
        view,
        n,
        theme,
        lang,
        mediaIds: media.map((m) => m.mediaId),
        gallery: r
          ? {
              stateId: r.stateId,
              status: r.status,
              hasCta: r.hasCta,
              ctaLabel: { text: cta.text, status: cta.status, lang },
              visible: r.entries.map((e) => ({ slotId: e.slot.slotId, mediaId: e.media.mediaId, mediaIndex: e.mediaIndex, src: e.media.src, caption: e.media.caption })),
            }
          : null,
      };
    },
    [view, n, theme, lang, media, cta],
  );

  const onRun = useCallback(
    (r: DesktopGalleryRun<A13FamilyMedia>) => {
      setRun(r);
      publish(r);
    },
    [publish],
  );
  const onViewerReport = useCallback((r: ViewerReport) => {
    window.__viewerQa ??= { reports: [], validation: null, media: null };
    window.__viewerQa.reports.push(r);
  }, []);

  useEffect(() => {
    if (view === "album") publish(null);
  }, [view, publish]);

  return (
    <div className={`${styles.page} ${board ? (theme === "dark" ? styles.boardDark : styles.board) : ""}`} data-testid="a13-desktop-flow" data-view={view}>
      {board ? null : (
        <div className={styles.panel}>
          <h1 className={styles.h1}>A13 · Desktop · parcours fonctionnel — Galerie → Viewer · Signature 7+ → Album complet → Viewer (pilote)</h1>
          <div className={styles.controls}>
            <span>
              médias :{" "}
              {COUNTS.map((c) => (
                <a key={c} href={href({ n: c, vue: "galerie" })} aria-current={c === n}>
                  {c}{" "}
                </a>
              ))}
            </span>
            <span>
              thème :{" "}
              {(["light", "dark"] as const).map((t) => (
                <a key={t} href={href({ theme: t })} aria-current={t === theme}>
                  {t}{" "}
                </a>
              ))}
            </span>
            <span>
              CTA :{" "}
              {LANGUAGES.map((l) => (
                <a key={l} href={href({ lang: l })} aria-current={l === lang}>
                  {l}{" "}
                </a>
              ))}
              ({cta.status})
            </span>
            <span>
              captions :{" "}
              {A13_FLOW_CAPTION_SETS.map((c) => (
                <a key={c} href={href({ captions: c })} aria-current={c === captions}>
                  {c}{" "}
                </a>
              ))}
            </span>
            <span className={styles.log} data-testid="flow-status">
              {view === "album"
                ? `album complet · ${n} médias (ordre famille)`
                : run
                  ? run.stateId
                    ? `${n} médias → ${run.stateId} · ${run.entries.length} tirages interactifs · ${run.hasCta ? "CTA" : "sans CTA"} · ${run.status}`
                    : `${n} média(s) → Galerie absente`
                  : "…"}
            </span>
            {view === "album" ? <a href={href({ vue: "galerie" })}>retour galerie</a> : null}
          </div>
        </div>
      )}
      {view === "album" ? (
        <A13DesktopFullAlbum media={media} theme={theme} onViewerReport={onViewerReport} />
      ) : (
        <>
          {run && !run.stateId ? (
            <p className={styles.panel} data-testid="gallery-absent">
              Galerie absente ({n} média{n === 1 ? "" : "s"}) — contrat produit : 0–1 média, aucune Galerie.
            </p>
          ) : null}
          <div style={{ maxWidth: 1670, margin: "0 auto" }}>
            <A13DesktopGallery
              media={media}
              theme={theme}
              title={A13_PILOT_TITLE.title}
              subtitle={A13_PILOT_TITLE.subtitle}
              ctaLabel={{ text: cta.text, lang }}
              onSeeMore={() => router.push(href({ vue: "album" }))}
              onViewerReport={onViewerReport}
              onRun={onRun}
            />
          </div>
        </>
      )}
    </div>
  );
}
