"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_STATE_SLOTS, A13_CTA_7PLUS_PILOT_LABELS } from "@/config/gallery-a13-multi-state-manifests";
import { LANGUAGES, type Language } from "@/config/languages";
import { buildGalleryState } from "@/lib/memorial/gallery/gallery-state";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { isCalibratedState } from "@/config/gallery-a13-calibration-v1-1";
import {
  A13_PILOT_MEDIA_POOL,
  rotateMatrixMedia,
  A13_PILOT_TITLE,
  PILOT_CAPTION_MODES,
  type PilotCaptionMode,
} from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13CaptionFontProbe, A13PilotScene } from "@/components/memorial/gallery/A13PilotScene";
import styles from "./page.module.css";

/**
 * Runtime board: the same pool of test media, cut at 2…7 items, each cut
 * rendered by the real gallery runtime (state selection → closed manifest →
 * V2.1 engine, + V1.1 calibration for G2–G5). Nothing here is a
 * screenshot or a mock-up.
 *
 * G2–G5 take the V1.1 QA ratio set at rotation `?rotation=r` (default 0:
 * 3:4, 4:3, 1:1, 9:16, 16:9 — the hard set); G6 exact and 7+ keep their
 * GREEN reference media. URL presets: `?lang=en&captions=32&rotation=1`.
 */

const COUNTS = [2, 3, 4, 5, 6, 7] as const;

export function StatesBoard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [lang, setLang] = useState<Language>("fr");
  const [captionMode, setCaptionMode] = useState<PilotCaptionMode>("24");
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    const l = q.get("lang");
    if (l && (LANGUAGES as readonly string[]).includes(l)) setLang(l as Language);
    const c = q.get("captions") as PilotCaptionMode | null;
    if (c && PILOT_CAPTION_MODES.includes(c)) setCaptionMode(c);
    const r = Number(q.get("rotation"));
    if (Number.isInteger(r) && r >= 0 && r < 6) setRotation(r);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const states = useMemo(
    () =>
      COUNTS.map((n) =>
        buildGalleryState(
          n <= 5 ? rotateMatrixMedia(rotation, n) : A13_PILOT_MEDIA_POOL.slice(0, n),
          (m) => m.captions[captionMode],
          font?.measurer ?? null,
        )!,
      ),
    [captionMode, font, rotation],
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
          <label>
            Rotation ratios G2–G5{" "}
            <select value={rotation} onChange={(e) => setRotation(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  r{r}
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
              {isCalibratedState(s.stateId) ? (
                <span>
                  {" "}
                  · s = {s.entries.map((e) => e.calibration!.scale.toFixed(3)).join(" / ")}
                </span>
              ) : (
                <span> · référence GREEN inchangée</span>
              )}
              {(() => {
                const env = s.entries.filter((e) => e.calibration && e.calibration.status !== "placed");
                return env.length ? (
                  <span className={styles.stop} data-testid={`board-envstop-${s.stateId}`}>
                    {" "}
                    · MANIFEST_ENVELOPE_UNRESOLVED_STOP ({env.map((e) => e.slot.slotId).join(", ")})
                  </span>
                ) : null;
              })()}
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
