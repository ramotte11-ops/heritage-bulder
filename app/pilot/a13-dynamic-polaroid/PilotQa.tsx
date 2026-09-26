"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_PILOT_CANVAS, A13_PILOT_PHOTO_POLICY, A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots, layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { measureComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import {
  A13_PILOT_MEDIA,
  A13_PILOT_TITLE,
  PILOT_CAPTION_MODES,
  type PilotCaptionMode,
  type PilotMedia,
} from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13PilotScene } from "@/components/memorial/gallery/A13PilotScene";
import styles from "./page.module.css";

/**
 * QA harness around the pilot scene. It only switches INPUTS (caption
 * mode, focal points on/off, local photos) and reports what the pure
 * layout produced — it never adjusts a tirage.
 *
 * URL presets (for reproducible screenshots): `?qa=1&captions=deux-lignes&focal=0`.
 */

interface Measures {
  viewport: number;
  canvas: number;
  lines: Record<string, number>;
}

const CAPTION_LABEL: Record<PilotCaptionMode, string> = {
  mixte: "mixte (absente / 1 ligne / 2 lignes)",
  aucune: "aucune caption",
  "une-ligne": "une ligne",
  "deux-lignes": "deux lignes (≤ 32 car.)",
};

function fmt(n: number, d = 1) {
  return n.toFixed(d);
}

function loadLocalFiles(files: File[]): Promise<PilotMedia[]> {
  return Promise.all(
    files.slice(0, A13_PILOT_SLOTS.length).map(
      (file, i) =>
        new Promise<PilotMedia>((resolve, reject) => {
          const src = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () =>
            resolve({
              src,
              label: `${i + 1} · ${file.name}`,
              width: img.naturalWidth,
              height: img.naturalHeight,
              focal: null,
              captions: A13_PILOT_MEDIA[i].captions,
            });
          img.onerror = () => reject(new Error(file.name));
          img.src = src;
        }),
    ),
  );
}

export function PilotQa() {
  const [media, setMedia] = useState<readonly PilotMedia[]>(A13_PILOT_MEDIA);
  const [captionMode, setCaptionMode] = useState<PilotCaptionMode>("mixte");
  const [focalOn, setFocalOn] = useState(true);
  const [qa, setQa] = useState(false);
  const [measures, setMeasures] = useState<Measures | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  // URL presets, read once on mount (client only).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    if (q.get("qa") === "1") setQa(true);
    if (q.get("focal") === "0") setFocalOn(false);
    const c = q.get("captions") as PilotCaptionMode | null;
    if (c && PILOT_CAPTION_MODES.includes(c)) setCaptionMode(c);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const entries = useMemo(
    () =>
      assignMediaToSlots(A13_PILOT_SLOTS, media).map(({ slot, media: m }) => ({
        slot,
        media: m,
        layout: m ? layoutDynamicPolaroid(slot, { width: m.width, height: m.height, focal: focalOn ? m.focal : null }) : null,
      })),
    [media, focalOn],
  );
  const metrics = useMemo(() => measureComposition(entries), [entries]);

  // Real rendered widths + measured caption lines (proof, not layout).
  useEffect(() => {
    const root = sceneRef.current;
    if (!root) return;
    const measure = () => {
      const canvas = root.querySelector("[data-testid=a13-pilot-scene]") as HTMLElement | null;
      const lines: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>("[data-testid^=caption-]").forEach((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        lines[el.dataset.testid!.replace("caption-", "")] = lh ? Math.round(el.scrollHeight / lh) : 0;
      });
      setMeasures({ viewport: window.innerWidth, canvas: canvas?.getBoundingClientRect().width ?? 0, lines });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [entries, captionMode]);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    try {
      setMedia(await loadLocalFiles(Array.from(list)));
    } catch (e) {
      window.alert(`Image illisible : ${(e as Error).message}`);
    }
  };

  const k = measures ? measures.canvas / A13_PILOT_CANVAS.width : null;

  return (
    <main className={styles.page}>
      <div className={styles.banner}>
        A13 · Dynamic Polaroid · Desktop Light — PILOTE QG · Foreground O1/O2 : DEFERRED (hors Gate)
      </div>

      <div ref={sceneRef}>
        <A13PilotScene
          qa={qa}
          title={A13_PILOT_TITLE.title}
          subtitle={A13_PILOT_TITLE.subtitle}
          entries={entries.map(({ slot, media: m, layout }) => ({
            slot,
            layout,
            src: m?.src ?? null,
            alt: m ? `Photo ${slot.mediaIndex + 1}` : "",
            caption: m?.captions[captionMode] ?? null,
          }))}
        />
      </div>

      <section className={styles.panel} aria-label="Contrôles QA">
        <div className={styles.controls}>
          <label>
            Captions{" "}
            <select value={captionMode} onChange={(e) => setCaptionMode(e.target.value as PilotCaptionMode)}>
              {PILOT_CAPTION_MODES.map((m) => (
                <option key={m} value={m}>
                  {CAPTION_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={focalOn} onChange={(e) => setFocalOn(e.target.checked)} /> Points focaux
          </label>
          <label>
            <input type="checkbox" checked={qa} onChange={(e) => setQa(e.target.checked)} /> Calques QA (enveloppes,
            ancres, cadre source)
          </label>
          <label className={styles.file}>
            Tester 6 photos locales (ordre de sélection = media[0…5]){" "}
            <input type="file" accept="image/*" multiple onChange={(e) => void onFiles(e.target.files)} />
          </label>
          <button type="button" onClick={() => setMedia(A13_PILOT_MEDIA)}>
            Revenir aux 6 photos test
          </button>
          <span className={styles.proof} data-testid="width-proof">
            viewport {measures?.viewport ?? "…"} px · canvas {measures ? fmt(measures.canvas, 0) : "…"} px · échelle{" "}
            {k ? fmt(k, 4) : "…"}
          </span>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Slot</th>
              <th>media</th>
              <th>Photo</th>
              <th>Source (px)</th>
              <th>Ratio</th>
              <th>Tirage (px @1670)</th>
              <th>Ratio tirage</th>
              <th>Fenêtre photo</th>
              <th>Mode image</th>
              <th>Crop</th>
              <th>Échelle photo (upscale si &gt; 1)</th>
              <th>Enveloppe inutilisée</th>
              <th>Ancrage (ax, ay)</th>
              <th>Photo masquée par tirages sup.</th>
              <th>Bande caption masquée</th>
              <th>Dans l’enveloppe</th>
              <th>Dépasse du canvas</th>
              <th>Caption</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ slot, media: m, layout }) => {
              const s = metrics.slots.find((x) => x.slotId === slot.slotId);
              const cap = m?.captions[captionMode] ?? null;
              return (
                <tr key={slot.slotId}>
                  <td>{slot.slotId}</td>
                  <td>
                    [{slot.mediaIndex}] {m && A13_PILOT_MEDIA.includes(m) ? "✓" : m ? "local" : "—"}
                  </td>
                  <td>{m?.label ?? "—"}</td>
                  {layout && m ? (
                    <>
                      <td>
                        {m.width}×{m.height}
                      </td>
                      <td>{fmt(layout.sourceRatio, 3)}</td>
                      <td>
                        {fmt(layout.outer.width)}×{fmt(layout.outer.height)}
                      </td>
                      <td>
                        {fmt(layout.outerRatio, 3)}
                        {layout.outerBounded ? " (borné)" : ""}
                      </td>
                      <td>
                        {fmt(layout.window.width)}×{fmt(layout.window.height)}
                      </td>
                      <td>{layout.mode}</td>
                      <td>
                        {layout.cropAxis === "none"
                          ? "aucun (100 % visible)"
                          : `${fmt(layout.visibleFraction * 100)} % visible (axe ${layout.cropAxis})`}
                      </td>
                      <td>
                        ×{fmt(layout.upscale, 3)}{" "}
                        {layout.upscale <= A13_PILOT_PHOTO_POLICY.upscale.acceptedMax
                          ? "OK"
                          : layout.upscale <= A13_PILOT_PHOTO_POLICY.upscale.warningMax
                            ? "alerte"
                            : "HORS LIMITE"}
                      </td>
                      <td>{fmt(layout.envelopeUnusedFraction * 100)} %</td>
                      <td>
                        {layout.pins.ax}, {layout.pins.ay}
                      </td>
                      <td>
                        {s ? `${fmt(s.photoOccludedFraction * 100)} %${s.occludedBy.length ? ` (${s.occludedBy.join(", ")})` : ""}` : "—"}
                      </td>
                      <td>
                        {s ? `${fmt(s.bandOccludedFraction * 100)} %${s.bandOccludedBy.length ? ` (${s.bandOccludedBy.join(", ")})` : ""}` : "—"}
                      </td>
                      <td>{s?.insideEnvelope ? "oui" : "NON"}</td>
                      <td>{s && s.canvasOverflow > 0.5 ? `${fmt(s.canvasOverflow)} px` : "non"}</td>
                      <td>
                        {cap ? `${[...cap].length} car. · ${measures?.lines[slot.slotId] ?? "…"} l.` : "absente (bande conservée)"}
                      </td>
                    </>
                  ) : (
                    <td colSpan={15}>slot vide</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Paire (dessous → dessus)</th>
              <th>Chevauchement tirages (px²)</th>
              <th>Prescrit (enveloppes +12 px se chevauchent)</th>
              <th>Statut collision</th>
            </tr>
          </thead>
          <tbody>
            {metrics.pairs
              .filter((p) => p.overlapArea > 0.5 || p.prescribed)
              .map((p) => (
                <tr key={`${p.lower}-${p.upper}`}>
                  <td>
                    {p.lower} → {p.upper}
                  </td>
                  <td>{fmt(p.overlapArea, 0)}</td>
                  <td>{p.prescribed ? "oui" : "non"}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
