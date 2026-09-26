"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_STATE_SLOTS, A13_CTA_7PLUS_PILOT_LABELS } from "@/config/gallery-a13-multi-state-manifests";
import { LANGUAGES, type Language } from "@/config/languages";
import { buildGalleryState } from "@/lib/memorial/gallery/gallery-state";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import {
  A13_PILOT_MEDIA_POOL,
  A13_PILOT_TITLE,
  PILOT_CAPTION_MODES,
  type PilotCaptionMode,
} from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13CaptionFontProbe, A13PilotScene } from "@/components/memorial/gallery/A13PilotScene";
import styles from "./page.module.css";

/**
 * Runtime board: the same pool of test media, cut at 2…7 items, each cut
 * rendered by the real gallery runtime (state selection → closed manifest →
 * V2.1 engine). Nothing here is a screenshot or a mock-up.
 *
 * URL presets: `?lang=en&captions=32`.
 */

const COUNTS = [2, 3, 4, 5, 6, 7] as const;

export function StatesBoard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [lang, setLang] = useState<Language>("fr");
  const [captionMode, setCaptionMode] = useState<PilotCaptionMode>("24");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    const l = q.get("lang");
    if (l && (LANGUAGES as readonly string[]).includes(l)) setLang(l as Language);
    const c = q.get("captions") as PilotCaptionMode | null;
    if (c && PILOT_CAPTION_MODES.includes(c)) setCaptionMode(c);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const states = useMemo(
    () =>
      COUNTS.map((n) =>
        buildGalleryState(A13_PILOT_MEDIA_POOL.slice(0, n), (m) => m.captions[captionMode], font?.measurer ?? null)!,
      ),
    [captionMode, font],
  );

  return (
    <main className={styles.page} ref={rootRef}>
      <A13CaptionFontProbe />
      <header className={styles.head}>
        <h1 className={styles.h1}>A13 · Desktop Light · planche runtime multi-états</h1>
        <div className={styles.controls}>
          <label>
            Langue CTA{" "}
            <select value={lang} onChange={(e) => setLang(e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Captions{" "}
            <select value={captionMode} onChange={(e) => setCaptionMode(e.target.value as PilotCaptionMode)}>
              {PILOT_CAPTION_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <span data-testid="board-font">{font?.fontCheck ? "La Belle Aurore chargée" : "police en attente…"}</span>
        </div>
      </header>
      <div className={styles.grid}>
        {states.map((s) => (
          <section key={s.stateId} className={styles.cell} data-testid={`board-${s.stateId}`}>
            <h2 className={styles.label}>
              {s.mediaCount} médias → {s.stateId} · {s.entries.length} Polaroids ·{" "}
              {s.hasCta ? "CTA" : "sans CTA"} · manifest {A13_STATE_SLOTS[s.stateId].length} slots
              {(() => {
                const stop = s.entries.filter((e) => e.caption?.status === "CAPTION_COLLISION_UNRESOLVED");
                return stop.length ? (
                  <span className={styles.stop} data-testid={`board-stop-${s.stateId}`}>
                    {" "}
                    · CAPTION_COLLISION_UNRESOLVED_STOP ({stop.map((e) => e.slot.slotId).join(", ")})
                  </span>
                ) : null;
              })()}
            </h2>
            <A13PilotScene
              stateId={s.stateId}
              title={A13_PILOT_TITLE.title}
              subtitle={A13_PILOT_TITLE.subtitle}
              entries={s.entries.map(({ slot, layout, media, caption }) => ({
                slot,
                layout,
                src: media.src,
                alt: `Photo ${slot.mediaIndex + 1}`,
                caption,
              }))}
              cta={s.hasCta ? { label: A13_CTA_7PLUS_PILOT_LABELS[lang].text, lang } : null}
            />
          </section>
        ))}
      </div>
    </main>
  );
}
