"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  A13_PILOT_CANVAS,
  A13_PILOT_CAPTION,
  A13_PILOT_D1_LEFT_EXTENT,
  A13_PILOT_SLOTS,
} from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { composeSlots, measureComposition, obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { layoutCaption, type CaptionLayout } from "@/lib/memorial/gallery/caption-layout";
import { createCaptionMeasurer, type MeasurerReady } from "@/lib/memorial/gallery/caption-measurer";
import {
  A13_PILOT_MEDIA,
  A13_PILOT_MEDIA_LANDSCAPE_3X2,
  A13_PILOT_TITLE,
  PILOT_CAPTION_MODES,
  type PilotCaptionMode,
  type PilotMedia,
} from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13PilotScene } from "@/components/memorial/gallery/A13PilotScene";
import styles from "./page.module.css";

/**
 * QA harness around the pilot scene (CALIBRATION V2.1). It only switches
 * INPUTS (caption state, local photos, overlays) and reports what the pure
 * layout and `layoutCaption` produced — it never adjusts a tirage.
 *
 * Captions are laid out only once La Belle Aurore is confirmed loaded
 * (`createCaptionMeasurer`). URL presets for reproducible screenshots:
 * `?qa=1&captions=32&paysage=3x2`.
 */

const CAPTION_LABEL: Record<PilotCaptionMode, string> = {
  aucune: "absente",
  "une-ligne": "une ligne",
  "24": "24 caractères",
  "32": "32 caractères",
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

interface DomProof {
  viewport: number;
  canvas: number;
  /** |SVG computed text length − canvas advance|, source px, per slot. */
  advanceDrift: Record<string, number>;
}

export function PilotQa() {
  const [media, setMedia] = useState<readonly PilotMedia[]>(A13_PILOT_MEDIA);
  const [captionMode, setCaptionMode] = useState<PilotCaptionMode>("24");
  const [qa, setQa] = useState(false);
  const [font, setFont] = useState<MeasurerReady | null>(null);
  const [proof, setProof] = useState<DomProof | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  // URL presets, read once on mount (client only).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    if (q.get("qa") === "1") setQa(true);
    const c = q.get("captions") as PilotCaptionMode | null;
    if (c && PILOT_CAPTION_MODES.includes(c)) setCaptionMode(c);
    if (q.get("paysage") === "3x2") setMedia(A13_PILOT_MEDIA.map((m, i) => (i === 1 ? A13_PILOT_MEDIA_LANDSCAPE_3X2 : m)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Caption measurer — only after La Belle Aurore is confirmed loaded.
  useEffect(() => {
    const probe = sceneRef.current?.querySelector<HTMLElement>("[data-caption-probe]");
    if (!probe) return;
    let alive = true;
    void createCaptionMeasurer(probe).then((ready) => {
      if (alive) setFont(ready);
    });
    return () => {
      alive = false;
    };
  }, []);

  const entries = useMemo(
    () =>
      composeSlots(
        assignMediaToSlots(A13_PILOT_SLOTS, media).map(({ slot, media: m }) => ({
          slot,
          source: m ? { width: m.width, height: m.height, focal: m.focal } : null,
        })),
      ),
    [media],
  );
  const metrics = useMemo(() => measureComposition(entries), [entries]);

  const captions = useMemo(() => {
    const out: Record<string, CaptionLayout | null> = {};
    for (const { slot, layout } of entries) {
      const text = media[slot.mediaIndex]?.captions[captionMode] ?? null;
      out[slot.slotId] =
        font && layout && text ? layoutCaption(slot, layout, text, font.measurer, obstaclesAbove(entries, slot)) : null;
    }
    return out;
  }, [entries, media, captionMode, font]);

  // DOM proof: real widths + SVG text length vs canvas advance.
  useEffect(() => {
    const root = sceneRef.current;
    if (!root) return;
    const measure = () => {
      const canvas = root.querySelector("[data-testid=a13-pilot-scene]") as HTMLElement | null;
      const advanceDrift: Record<string, number> = {};
      root.querySelectorAll<SVGSVGElement>("svg[data-testid^=caption-]").forEach((svg) => {
        const id = svg.dataset.testid!.replace("caption-", "");
        const cap = captions[id];
        let drift = 0;
        svg.querySelectorAll("text").forEach((t, i) => {
          if (cap?.lines[i]) drift = Math.max(drift, Math.abs(t.getComputedTextLength() - cap.lines[i].metrics.width));
        });
        advanceDrift[id] = drift;
      });
      setProof({ viewport: window.innerWidth, canvas: canvas?.getBoundingClientRect().width ?? 0, advanceDrift });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [captions]);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    try {
      setMedia(await loadLocalFiles(Array.from(list)));
    } catch (e) {
      window.alert(`Image illisible : ${(e as Error).message}`);
    }
  };

  const k = proof ? proof.canvas / A13_PILOT_CANVAS.width : null;
  const d1 = metrics.slots.find((s) => s.slotId === "D1");
  const d1Pass = d1 ? Math.abs(d1.extents.minX - A13_PILOT_D1_LEFT_EXTENT.minX) <= A13_PILOT_D1_LEFT_EXTENT.tolerance : false;
  const unresolved = Object.entries(captions).filter(([, c]) => c?.status === "CAPTION_COLLISION_UNRESOLVED");
  const placedCaptions = Object.values(captions).filter((c): c is CaptionLayout => c !== null);

  return (
    <main className={styles.page}>
      <div className={styles.banner}>
        A13 · Dynamic Polaroid · Desktop Light — PILOTE QG · CALIBRATION V2.1 · Foreground O1/O2 : DEFERRED — POST
        PILOT
      </div>

      <div ref={sceneRef}>
        <A13PilotScene
          qa={qa}
          title={A13_PILOT_TITLE.title}
          subtitle={A13_PILOT_TITLE.subtitle}
          entries={entries.map(({ slot, layout }) => {
            const m = media[slot.mediaIndex];
            return {
              slot,
              layout,
              src: m?.src ?? null,
              alt: m ? `Photo ${slot.mediaIndex + 1}` : "",
              caption: captions[slot.slotId] ?? null,
            };
          })}
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
            <input type="checkbox" checked={qa} onChange={(e) => setQa(e.target.checked)} /> Diagnostic (boîtes de
            référence, ancres, cadre source, encre + marge)
          </label>
          <label className={styles.file}>
            Tester 6 photos locales (ordre de sélection = media[0…5]){" "}
            <input type="file" accept="image/*" multiple onChange={(e) => void onFiles(e.target.files)} />
          </label>
          <button type="button" onClick={() => setMedia(A13_PILOT_MEDIA)}>
            Revenir aux 6 photos test
          </button>
          <span className={styles.proof} data-testid="width-proof">
            viewport {proof?.viewport ?? "…"} px · canvas {proof ? fmt(proof.canvas, 0) : "…"} px · échelle{" "}
            {k ? fmt(k, 4) : "…"}
          </span>
        </div>

        <div className={styles.summary} data-testid="qa-summary">
          <span className={font?.fontCheck ? styles.pass : styles.red}>
            Police : {font ? (font.fontCheck ? "La Belle Aurore chargée" : "NON chargée") : "en attente…"}
          </span>
          <span className={unresolved.length ? styles.red : styles.pass}>
            {unresolved.length
              ? `CAPTION_COLLISION_UNRESOLVED_STOP (${unresolved.map(([id]) => id).join(", ")})`
              : `Captions : ${placedCaptions.length} placées, 0 collision de glyphes`}
          </span>
          <span className={d1Pass ? styles.pass : styles.red}>
            D1 minX {d1 ? fmt(d1.extents.minX, 2) : "…"} px (cible −12 ± 3)
          </span>
        </div>

        <h3 className={styles.h}>Ratios et géométrie</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Slot</th>
              <th>media</th>
              <th>Photo</th>
              <th>Source (px)</th>
              <th>Ratio média</th>
              <th>Classe</th>
              <th>Mode</th>
              <th>Ratio fenêtre</th>
              <th>Fenêtre</th>
              <th>Padding · bande</th>
              <th>Extérieur</th>
              <th>Ratio ext. (résultat)</th>
              <th>Surface / cible</th>
              <th>Rotation · z</th>
              <th>Dérive ancre</th>
              <th>Emprise x</th>
              <th>Photo visible</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ slot, layout }) => {
              const m = media[slot.mediaIndex];
              const s = metrics.slots.find((x) => x.slotId === slot.slotId);
              return (
                <tr key={slot.slotId}>
                  <td>{slot.slotId}</td>
                  <td>
                    [{slot.mediaIndex}] {m ? (A13_PILOT_MEDIA.includes(m) || m === A13_PILOT_MEDIA_LANDSCAPE_3X2 ? "✓" : "local") : "—"}
                  </td>
                  <td>{m?.label ?? "—"}</td>
                  {layout && m && s ? (
                    <>
                      <td>
                        {m.width}×{m.height}
                      </td>
                      <td>{fmt(layout.mediaRatio, 3)}</td>
                      <td>{layout.mediaClass === "inside" ? "dans 0,67–1,78" : layout.mediaClass === "below" ? "< 0,67" : "> 1,78"}</td>
                      <td>{layout.mode}</td>
                      <td>{fmt(layout.windowRatio, 3)}</td>
                      <td>
                        {fmt(layout.window.width)}×{fmt(layout.window.height)}
                      </td>
                      <td>
                        {fmt(layout.margin)} · {fmt(layout.bottomBand)}
                        {slot.bottomBandOverridePx ? " (fixe V2.1)" : ""}
                      </td>
                      <td>
                        {fmt(layout.outer.width)}×{fmt(layout.outer.height)}
                      </td>
                      <td>{fmt(layout.outerRatio, 3)}</td>
                      <td>{fmt(((layout.outer.width * layout.outer.height) / slot.targetOuterArea) * 100, 2)} %</td>
                      <td>
                        {slot.rotationDeg}° · {slot.zIndex}
                      </td>
                      <td>{fmt(s.anchorDriftPx, 2)} px</td>
                      <td>
                        {fmt(s.extents.minX, 1)} → {fmt(s.extents.maxX, 1)}
                      </td>
                      <td>{fmt(layout.visibleFraction * 100, 0)} %</td>
                    </>
                  ) : (
                    <td colSpan={14}>slot vide</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className={styles.h}>Captions (glyphes réels, marge 6/4 px)</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Texte</th>
              <th>Car.</th>
              <th>Lignes</th>
              <th>Largeur utile</th>
              <th>Ligne max (avance)</th>
              <th>Encre (l×h)</th>
              <th>Boîte protégée dans la bande</th>
              <th>Décalage X texte</th>
              <th>Candidats</th>
              <th>Collision glyphes</th>
              <th>Écart SVG/canvas</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ slot, layout }) => {
              const text = media[slot.mediaIndex]?.captions[captionMode] ?? null;
              const c = captions[slot.slotId];
              return (
                <tr key={slot.slotId}>
                  <td>{slot.slotId}</td>
                  {!text ? (
                    <td colSpan={12}>absente — bande basse conservée ({layout ? fmt(layout.bottomBand) : "—"} px)</td>
                  ) : !c || !layout ? (
                    <td colSpan={12}>mesure en attente du chargement de la police…</td>
                  ) : (
                    <>
                      <td>{c.lines.map((l) => `« ${l.text} »`).join(" / ")}</td>
                      <td>{[...text].length}</td>
                      <td>{c.lines.length}</td>
                      <td>{fmt(layout.window.width)}</td>
                      <td className={c.exceedsUsefulWidth ? styles.red : undefined}>
                        {fmt(Math.max(...c.lines.map((l) => l.metrics.width)))}
                      </td>
                      <td>
                        {fmt(c.ink.width)}×{fmt(c.ink.height)}
                      </td>
                      <td className={c.fitsBandHeight ? undefined : styles.warn}>
                        {c.fitsBandHeight
                          ? "oui"
                          : `non (${fmt(c.protectedBox.height)} px pour ${fmt(layout.bottomBand)} px)`}
                      </td>
                      <td>
                        {c.shiftX === 0 ? "0" : `${c.shiftX > 0 ? "+" : ""}${c.shiftX} px`} (max ±{fmt(c.maxShift)})
                      </td>
                      <td>{c.candidatesTried}</td>
                      <td className={c.collisionAreaPx2 > 0 ? styles.red : styles.pass}>
                        {c.status === "placed"
                          ? "0 px²"
                          : `${fmt(c.collisionAreaPx2, 0)} px² (${c.collidingWith.join(", ")})`}
                      </td>
                      <td>{proof?.advanceDrift[slot.slotId] !== undefined ? `${fmt(proof.advanceDrift[slot.slotId], 2)} px` : "…"}</td>
                      <td className={c.status === "placed" ? styles.pass : styles.red}>{c.status}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className={styles.h}>Preuve de chargement de la police</h3>
        <p className={styles.note} data-testid="font-proof">
          {font
            ? `document.fonts.check(« 400 ${A13_PILOT_CAPTION.fontSizePx}px ${font.fontFamily} ») = ${font.fontCheck} · FontFace : ${font.faces.join(" ; ") || "—"}`
            : "en attente…"}
        </p>

        <h3 className={styles.h}>Chevauchements entre tirages (composition V2, inchangée)</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Paire (dessous → dessus)</th>
              <th>Chevauchement (px²)</th>
            </tr>
          </thead>
          <tbody>
            {metrics.pairs
              .filter((p) => p.overlapArea > 0.5)
              .map((p) => (
                <tr key={`${p.lower}-${p.upper}`}>
                  <td>
                    {p.lower} → {p.upper}
                  </td>
                  <td>{fmt(p.overlapArea, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
