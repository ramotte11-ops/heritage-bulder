"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LANGUAGES, type Language } from "@/config/languages";
import type { A13Theme } from "@/config/gallery-a13-dark-material";
import { A13_MOBILE_HANDOFF_ID } from "@/config/gallery-a13-mobile-manifest";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import type { MobileGalleryRun } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { measureMobileTitleInk, type MobileTitleInkMeasure } from "@/lib/memorial/gallery/mobile-title-ink";
import {
  A13_MOBILE_CAPTION_SETS,
  A13_MOBILE_PILOT_TITLE,
  A13_MOBILE_RATIO_SETS,
  a13MobileFixture,
  type A13MobileCaptionSet,
  type A13MobileRatioSet,
} from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";
import { A13MobileGallery } from "@/components/memorial/gallery/A13MobileGallery";
import { MobileMatrixRunner } from "./MobileMatrixRunner";
import styles from "./page.module.css";

/**
 * A13 Mobile Light — Gallery pilot (PILOT ONLY, QA harness).
 *
 * `?n=0…40&ratios=mixte|3x4|4x3|1x1|9x16|16x9|239&captions=aucune|courte|24|32|deux-lignes|etroit-fr|etroit-en|etroit-es&lang=fr|en|es&theme=light|dark&qa=1&planche=1`
 * — or `?matrice=1`: the whole QA matrix run in the browser (`MobileMatrixRunner`).
 *
 * Open at a 375–430 px viewport (the Mobile profile). `qa=1` draws the
 * protected title block, the centre territories, the witnesses, the chosen
 * and pivot centres, the caption safe zones, the 44 px targets and the CTA
 * safe box; `planche=1` shows the Gallery alone. QA: `window.__a13Mobile`
 * (run, rendered title-block measure, activations).
 */

declare global {
  interface Window {
    __a13Mobile?: {
      handoff: string;
      n: number;
      ratios: A13MobileRatioSet;
      captions: A13MobileCaptionSet;
      lang: Language;
      theme?: A13Theme;
      viewportWidth: number;
      run: MobileGalleryRun<A13FamilyMedia> | null;
      title: MobileTitleInkMeasure | null;
      activations: { kind: "memory" | "cta"; mediaIndex?: number }[];
    };
  }
}

const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12];

export function MobileGalleryPilotClient() {
  const q = useSearchParams();
  return q.get("matrice") === "1" ? <MobileMatrixRunner /> : <MobileGalleryPilot />;
}

function MobileGalleryPilot() {
  const q = useSearchParams();
  const n = Math.max(0, Math.min(40, Math.floor(Number(q.get("n") ?? 7)) || 0));
  const ratios: A13MobileRatioSet = (A13_MOBILE_RATIO_SETS as readonly string[]).includes(q.get("ratios") ?? "") ? (q.get("ratios") as A13MobileRatioSet) : "mixte";
  const captions: A13MobileCaptionSet = (A13_MOBILE_CAPTION_SETS as readonly string[]).includes(q.get("captions") ?? "") ? (q.get("captions") as A13MobileCaptionSet) : "32";
  const lang: Language = (LANGUAGES as readonly string[]).includes(q.get("lang") ?? "") ? (q.get("lang") as Language) : "fr";
  const qa = q.get("qa") === "1";
  const board = q.get("planche") === "1";
  const theme: A13Theme = q.get("theme") === "dark" ? "dark" : "light";
  const media = useMemo(() => a13MobileFixture(n, ratios, captions), [n, ratios, captions]);
  const texts = A13_MOBILE_PILOT_TITLE[lang];
  const [status, setStatus] = useState("…");
  const [activations, setActivations] = useState<{ kind: "memory" | "cta"; mediaIndex?: number }[]>([]);

  const record = useCallback((a: { kind: "memory" | "cta"; mediaIndex?: number }) => {
    setActivations((l) => {
      const next = [...l, a];
      if (window.__a13Mobile) window.__a13Mobile.activations = next;
      return next;
    });
  }, []);

  const onRun = useCallback(
    (run: MobileGalleryRun<A13FamilyMedia>) => {
      const qa: NonNullable<Window["__a13Mobile"]> = { handoff: A13_MOBILE_HANDOFF_ID, n, ratios, captions, lang, theme, viewportWidth: window.innerWidth, run, title: null, activations: [] };
      window.__a13Mobile = qa;
      setActivations([]);
      setStatus(`${run.stateId ?? "—"} · ${run.outcome} · ${run.status} · ${run.stageWidth.toFixed(0)} px`);
      // The rendered title block (the scene is committed with this run).
      const scene = document.querySelector<HTMLElement>("[data-testid=a13-mobile-gallery] [data-testid=a13-mobile-scene]:not([data-state=pending])");
      if (scene) void measureMobileTitleInk(scene).then((t) => {
        qa.title = t;
      });
    },
    [n, ratios, captions, lang, theme],
  );

  const href = (p: Record<string, string | number>) => {
    const s = new URLSearchParams({ n: String(n), ratios, captions, lang, ...(theme === "dark" ? { theme } : {}), ...(qa ? { qa: "1" } : {}), ...(board ? { planche: "1" } : {}) });
    for (const [a, b] of Object.entries(p)) s.set(a, String(b));
    return `?${s.toString()}`;
  };

  return (
    <div className={`${styles.page} ${board ? styles.board : ""}${board && theme === "dark" ? ` ${styles.boardDark}` : ""}`} data-testid="a13-mobile-pilot">
      <A13MobileGallery
        media={media}
        title={texts.title}
        subtitle={texts.subtitle}
        language={lang}
        qa={qa}
        theme={theme}
        onRun={onRun}
        onSeeMore={() => record({ kind: "cta" })}
        onActivateMemory={(mediaIndex) => record({ kind: "memory", mediaIndex })}
      />
      {board ? null : (
        <div className={styles.panel}>
          <h1 className={styles.h1}>A13 · Mobile Light · Galerie (pilote, {A13_MOBILE_HANDOFF_ID})</h1>
          <div className={styles.controls}>
            {COUNTS.map((c) => (
              <a key={c} href={href({ n: c })} aria-current={c === n}>
                {c}
              </a>
            ))}
          </div>
          <div className={styles.controls}>
            {A13_MOBILE_RATIO_SETS.map((r) => (
              <a key={r} href={href({ ratios: r })} aria-current={r === ratios}>
                {r}
              </a>
            ))}
          </div>
          <div className={styles.controls}>
            {A13_MOBILE_CAPTION_SETS.map((c) => (
              <a key={c} href={href({ captions: c })} aria-current={c === captions}>
                {c}
              </a>
            ))}
            {LANGUAGES.map((l) => (
              <a key={l} href={href({ lang: l })} aria-current={l === lang}>
                {l}
              </a>
            ))}
            <a href={qa ? href({ qa: 0 }) : href({ qa: 1 })}>{qa ? "QA off" : "QA on"}</a>
            <a href={href({ theme: theme === "dark" ? "light" : "dark" })}>{theme === "dark" ? "Light" : "Dark"}</a>
          </div>
          <span className={styles.log} data-testid="mobile-status">
            {status}
          </span>
          <span className={styles.log} data-testid="mobile-activations">
            {activations.map((a) => (a.kind === "cta" ? "CTA" : `m${a.mediaIndex}`)).join(" · ") || "aucune activation"}
          </span>
        </div>
      )}
    </div>
  );
}
