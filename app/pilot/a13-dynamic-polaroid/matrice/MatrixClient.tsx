"use client";

import { useMemo, useRef } from "react";
import { A13_CALIBRATION_STATES } from "@/config/gallery-a13-calibration-v1-1";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import {
  MATRIX_CAPTION_STATES,
  MATRIX_RATIOS,
  runCalibrationMatrix,
  type MatrixRun,
} from "@/lib/memorial/gallery/calibration-matrix";
import { A13CaptionFontProbe } from "@/components/memorial/gallery/A13PilotScene";
import styles from "../page.module.css";

/**
 * Renders the V1.1 QA matrix once La Belle Aurore is confirmed loaded.
 * Read-only diagnostics; the raw result is also exposed as JSON
 * (`[data-testid=matrix-json]`) for the QG report.
 */

const pct = (n: number) => `${n.toFixed(1)} %`;

function ratiosOf(rotation: number, n: number) {
  return Array.from({ length: n }, (_, i) => MATRIX_RATIOS[(i + rotation) % MATRIX_RATIOS.length].name).join(" · ");
}

export function MatrixClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const runs = useMemo(() => (font?.fontCheck ? runCalibrationMatrix(font.measurer) : null), [font]);

  const find = (state: string, rotation: number, captions: string) =>
    runs?.find((r) => r.state === state && r.rotation === rotation && r.captions === captions) as MatrixRun;

  return (
    <main className={styles.page} ref={rootRef}>
      <A13CaptionFontProbe />
      <div className={styles.banner}>A13 · Desktop Light · calibration V1.1 — matrice QA (G2–G5)</div>
      <section className={styles.panel}>
        {!runs ? (
          <p data-testid="matrix-status">Chargement de La Belle Aurore…</p>
        ) : (
          <>
            <p className={styles.summary} data-testid="matrix-status">
              <span className={runs.every((r) => r.pass) ? styles.pass : styles.red}>
                {runs.filter((r) => r.pass).length} / {runs.length} exécutions PASS
              </span>
              {A13_CALIBRATION_STATES.map((s) => {
                const rs = runs.filter((r) => r.state === s);
                const ok = rs.filter((r) => r.pass).length;
                return (
                  <span key={s} className={ok === rs.length ? styles.pass : styles.red}>
                    {s} : {ok} / {rs.length}
                  </span>
                );
              })}
            </p>

            {A13_CALIBRATION_STATES.map((state) => {
              const n = runs.find((r) => r.state === state)!.slots.length;
              return (
                <div key={state}>
                  <h3 className={styles.h}>{state}</h3>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Rotation</th>
                        <th>Ratios (slot 1 → {n})</th>
                        <th>Facteurs s (min)</th>
                        <th>Occlusions (plafond)</th>
                        {MATRIX_CAPTION_STATES.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MATRIX_RATIOS.map((_, rotation) => {
                        const base = find(state, rotation, "absente");
                        return (
                          <tr key={rotation}>
                            <td>r{rotation}</td>
                            <td>{ratiosOf(rotation, n)}</td>
                            <td>
                              {base.slots.map((s) => (
                                <div key={s.slotId} className={s.status === "placed" ? undefined : styles.red}>
                                  {s.slotId} {s.scale.toFixed(3)} ({s.minScale}){s.status === "placed" ? "" : " STOP"}
                                  {s.limitedBy.length ? ` — ${s.limitedBy.join(" ; ")}` : ""}
                                </div>
                              ))}
                            </td>
                            <td>
                              {base.occlusions.map((o) => (
                                <div
                                  key={`${o.occluder}-${o.photo}`}
                                  className={o.percent > o.cap || o.aggregate > o.aggregateCap ? styles.red : undefined}
                                >
                                  {o.occluder}→{o.photo} {pct(o.percent)} ({o.cap}) · agr. {pct(o.aggregate)} ({o.aggregateCap})
                                </div>
                              ))}
                            </td>
                            {MATRIX_CAPTION_STATES.map((c) => {
                              const r = find(state, rotation, c);
                              return (
                                <td key={c} className={r.pass ? styles.pass : styles.red}>
                                  {r.pass ? "PASS" : r.failures.join(" ; ")}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            <pre hidden data-testid="matrix-json">
              {JSON.stringify(runs)}
            </pre>
          </>
        )}
      </section>
    </main>
  );
}
