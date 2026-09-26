"use client";

import { useEffect, useRef, useState } from "react";
import { A13_STATE_SLOTS } from "@/config/gallery-a13-multi-state-manifests";
import { G3_TERRITORY_SLOTS } from "@/config/gallery-a13-g3-territory";
import { composeSlots, obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { layoutCaption } from "@/lib/memorial/gallery/caption-layout";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { solveG3Territory, type G3Result, type TitleZone } from "@/lib/memorial/gallery/g3-territory";
import { measureTitleZone, type TitleInk } from "@/lib/memorial/gallery/title-ink";
import { MATRIX_CAPTION_STATES, MATRIX_RATIOS, matrixCaption, type MatrixCaptionState } from "@/lib/memorial/gallery/calibration-matrix";
import { A13_PILOT_TITLE, rotateMatrixMedia } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13CaptionFontProbe, A13PilotScene, type A13PilotSceneEntry } from "@/components/memorial/gallery/A13PilotScene";
import styles from "../etats/page.module.css";

/**
 * G3 slot-territory pilot. Views (`?vue=`):
 * - `planche` (default): Master witness position vs six hard runtime
 *   solutions (every cyclic ratio permutation), artistic render only;
 * - `diagnostic`: the same solutions with territories, witness/chosen
 *   centres, displacements, contours and the measured title protection;
 * - `matrice`: the 30 QA cases (6 rotations × 5 caption states), exposed as
 *   JSON in `[data-testid=g3-matrix-json]`.
 * `?captions=` picks the caption state of the board (default 32 chars).
 */

const G3 = A13_STATE_SLOTS.G3;
const ROT_LABEL = (r: number) => [0, 1, 2].map((i) => MATRIX_RATIOS[(i + r) % 6].name).join(" · ");

interface Case {
  rotation: number;
  captions: MatrixCaptionState;
  result: G3Result;
  ms: number;
}

function sceneEntries(rotation: number, captions: MatrixCaptionState, result: G3Result | null, witness: boolean, font: ReturnType<typeof useCaptionMeasurer>): A13PilotSceneEntry[] {
  const media = rotateMatrixMedia(rotation, 3);
  if (witness || !result || result.status !== "solved") {
    // Master witness: the V1 G3 manifest as is (centres, s = 1), V2.1 engine.
    const composed = composeSlots(G3.map((slot, i) => ({ slot, source: media[i] })));
    return composed.map(({ slot, layout }, i) => {
      const text = matrixCaption(captions, i);
      return {
        slot,
        layout,
        src: media[i].src,
        alt: `Photo ${i + 1}`,
        caption: font && text ? layoutCaption(slot, layout!, text, font.measurer, obstaclesAbove(composed, slot)) : null,
      };
    });
  }
  return result.slots.map((s, i) => ({ slot: s.slot, layout: s.layout, src: media[i].src, alt: `Photo ${i + 1}`, caption: s.caption }));
}

export function G3TerritoryClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleSceneRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [view, setView] = useState<"planche" | "diagnostic" | "matrice">("planche");
  const [captions, setCaptions] = useState<MatrixCaptionState>("32-une-ligne");
  const [title, setTitle] = useState<TitleInk | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    const v = q.get("vue");
    if (v === "diagnostic" || v === "matrice") setView(v);
    const c = q.get("captions") as MatrixCaptionState | null;
    if (c && MATRIX_CAPTION_STATES.includes(c)) setCaptions(c);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Title protection: measured on the rendered witness scene, fonts loaded.
  useEffect(() => {
    if (!font?.fontCheck || !titleSceneRef.current) return;
    let alive = true;
    void measureTitleZone(titleSceneRef.current).then((t) => {
      if (alive) setTitle(t);
    });
    return () => {
      alive = false;
    };
  }, [font]);

  // Solve the cases incrementally (one per task) so the page stays live.
  useEffect(() => {
    if (!font?.fontCheck || !title) return;
    const todo: { rotation: number; captions: MatrixCaptionState }[] =
      view === "matrice"
        ? MATRIX_RATIOS.flatMap((_, rotation) => MATRIX_CAPTION_STATES.map((c) => ({ rotation, captions: c })))
        : MATRIX_RATIOS.map((_, rotation) => ({ rotation, captions }));
    let alive = true;
    const out: Case[] = [];
    /* eslint-disable react-hooks/set-state-in-effect -- incremental solver progress */
    setCases([]);
    setDone(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    const step = (i: number) => {
      if (!alive) return;
      if (i >= todo.length) {
        setDone(true);
        return;
      }
      const t = todo[i];
      const media = rotateMatrixMedia(t.rotation, 3);
      const t0 = performance.now();
      const result = solveG3Territory({
        slots: G3,
        sources: media,
        captions: [0, 1, 2].map((k) => matrixCaption(t.captions, k)),
        measurer: font.measurer,
        title: title.zone as TitleZone,
      });
      out.push({ ...t, result, ms: Math.round(performance.now() - t0) });
      setCases([...out]);
      setTimeout(() => step(i + 1), 0);
    };
    setTimeout(() => step(0), 0);
    return () => {
      alive = false;
    };
  }, [font, title, view, captions]);

  const diag = view === "diagnostic";
  const territories = (result: G3Result | null) =>
    G3_TERRITORY_SLOTS.map((t, i) => ({
      slotId: t.slotId,
      territory: t.centerTerritory,
      witness: t.witnessCenter,
      chosen: result && result.status === "solved" ? result.slots[i].center : null,
    }));

  const panel = (label: string, entries: A13PilotSceneEntry[], result: G3Result | null, key: string, ref?: React.Ref<HTMLDivElement>) => (
    <section key={key} className={styles.cell} data-testid={`g3-${key}`} ref={ref}>
      <h2 className={styles.label}>{label}</h2>
      <A13PilotScene
        stateId="G3"
        title={A13_PILOT_TITLE.title}
        subtitle={A13_PILOT_TITLE.subtitle}
        entries={entries}
        qa={diag}
        qaTerritories={diag ? territories(result) : []}
        qaTitleInk={diag && title ? title.zone : null}
      />
    </section>
  );

  const solvedLabel = (c: Case) => {
    const r = c.result;
    if (r.status !== "solved") return `r${c.rotation} · ${ROT_LABEL(c.rotation)} · G3_SLOT_TERRITORY_UNRESOLVED_STOP`;
    return `r${c.rotation} · ${ROT_LABEL(c.rotation)} · phase ${r.phase} · ${r.slots
      .map((s) => `${s.slotId.slice(3)} s ${s.scale.toFixed(3)} Δ(${s.delta.x.toFixed(1)}, ${s.delta.y.toFixed(1)})`)
      .join(" · ")}`;
  };

  return (
    <main className={styles.page} ref={rootRef}>
      <A13CaptionFontProbe />
      {/* Title protection is always measured on a hidden scene rendered at
          the canonical 1670 px (scale 1:1), whatever the visible panel size:
          glyph rasterisation varies slightly with the rendered size. */}
      <div ref={titleSceneRef} style={{ position: "absolute", width: 1670, left: -20000, top: 0 }} aria-hidden="true">
        <A13PilotScene stateId="G3" title={A13_PILOT_TITLE.title} subtitle={A13_PILOT_TITLE.subtitle} entries={[]} />
      </div>
      <header className={styles.head}>
        <h1 className={styles.h1}>A13 · G3 Desktop Light · territoires de slot — {view}</h1>
        <div className={styles.controls}>
          <span data-testid="g3-font">{font?.fontCheck ? "La Belle Aurore chargée" : "police en attente…"}</span>
          <span data-testid="g3-title">
            {title
              ? `titre encre ${title.ink.x0.toFixed(1)}…${title.ink.x1.toFixed(1)} × ${title.ink.y0.toFixed(1)}…${title.ink.y1.toFixed(1)} · zone ${title.zone.x0.toFixed(1)}…${title.zone.x1.toFixed(1)} × ${title.zone.y0.toFixed(1)}…${title.zone.y1.toFixed(1)} · écart canvas/DOM ${title.advanceDriftPx.toFixed(2)} px`
              : "titre en mesure…"}
          </span>
          <span data-testid="g3-progress">{done ? `terminé (${cases.length})` : `calcul ${cases.length}…`}</span>
        </div>
      </header>

      {view !== "matrice" ? (
        <div className={styles.grid}>
          {panel(
            `MASTER · position témoin (manifest G3 V1, s = 1) · ${ROT_LABEL(0)}`,
            sceneEntries(0, captions, null, true, font),
            null,
            "witness",
          )}
          {cases.map((c) => panel(solvedLabel(c), sceneEntries(c.rotation, c.captions, c.result, false, font), c.result, `r${c.rotation}`))}
        </div>
      ) : (
        <>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th>Cas</th>
                <th>Statut</th>
                <th>Centres finaux · Δ · s · surface</th>
                <th>Titre (px²)</th>
                <th>Occl. D2</th>
                <th>D2–D3</th>
                <th>D1↔droite</th>
                <th>Glyphes (px²)</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const r = c.result;
                const m = r.metrics;
                return (
                  <tr key={`${c.rotation}-${c.captions}`}>
                    <td>
                      r{c.rotation} ({ROT_LABEL(c.rotation)}) · {c.captions}
                    </td>
                    <td>{r.status === "solved" ? `OK · phase ${r.phase}` : r.status}</td>
                    <td>
                      {r.slots.map((s) => (
                        <div key={s.slotId}>
                          {s.slotId} ({s.center.x.toFixed(1)}, {s.center.y.toFixed(1)}) Δ({s.delta.x.toFixed(1)}, {s.delta.y.toFixed(1)}) s {s.scale.toFixed(3)}
                          {s.belowSoftFloor ? " < 0,90" : ""} · {Math.round(s.area)} px²
                        </div>
                      ))}
                    </td>
                    <td>{m ? m.titleIntersectionPx2.map((v) => v.toFixed(0)).join(" / ") : "—"}</td>
                    <td>{m ? `${m.d2PhotoOcclusionPercent.toFixed(1)} %` : "—"}</td>
                    <td>{m ? (m.d2d3OverlapPx2 > 0 ? `chevauch. ${Math.round(m.d2d3OverlapPx2)} px²` : `écart ${m.d2d3GapPx.toFixed(1)} px`) : "—"}</td>
                    <td>{m ? `${m.d1RightWindowGapPx.toFixed(1)} px` : "—"}</td>
                    <td>{m ? m.captionCollisionPx2.map((v) => v.toFixed(0)).join(" / ") : "—"}</td>
                    <td>{c.ms}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {done ? (
            <pre hidden data-testid="g3-matrix-json">
              {JSON.stringify(
                cases.map((c) => ({
                  rotation: c.rotation,
                  ratios: ROT_LABEL(c.rotation),
                  captions: c.captions,
                  status: c.result.status,
                  phase: c.result.phase,
                  ms: c.ms,
                  slots: c.result.slots.map((s) => ({
                    slotId: s.slotId,
                    center: s.center,
                    delta: s.delta,
                    scale: s.scale,
                    area: s.area,
                    belowSoftFloor: s.belowSoftFloor,
                    captionLines: s.caption?.lines.length ?? null,
                    captionShift: s.caption?.shiftX ?? null,
                    captionStatus: s.caption?.status ?? null,
                  })),
                  metrics: c.result.metrics,
                  title: title,
                })),
              )}
            </pre>
          ) : null}
        </>
      )}
    </main>
  );
}
