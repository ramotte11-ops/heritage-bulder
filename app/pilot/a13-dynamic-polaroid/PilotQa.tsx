"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_PILOT_CANVAS, A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots, type Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { captionTextHits, measureComposition, resolveComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
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
 * QA harness around the pilot scene (CALIBRATION V2). It only switches
 * INPUTS (caption state, local photos, overlays) and reports what the pure
 * layout + `resolveComposition` produced — it never adjusts a tirage.
 *
 * URL presets (reproducible screenshots): `?qa=1&captions=longue`.
 */

interface CaptionMeasure {
  /** Text box relative to the print's outer top-left, source px. */
  rect: Rect;
  lines: number;
  /** Text box taller or wider than the caption safe zone. */
  exceedsSafeZone: boolean;
}

interface Measures {
  viewport: number;
  canvas: number;
  captions: Record<string, CaptionMeasure>;
}

const CAPTION_LABEL: Record<PilotCaptionMode, string> = {
  courte: "20–24 caractères",
  longue: "32 caractères",
  aucune: "absente",
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
  const [captionMode, setCaptionMode] = useState<PilotCaptionMode>("courte");
  const [qa, setQa] = useState(false);
  const [measures, setMeasures] = useState<Measures | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  // URL presets, read once on mount (client only).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    if (q.get("qa") === "1") setQa(true);
    const c = q.get("captions") as PilotCaptionMode | null;
    if (c && PILOT_CAPTION_MODES.includes(c)) setCaptionMode(c);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const resolved = useMemo(
    () =>
      resolveComposition(
        assignMediaToSlots(A13_PILOT_SLOTS, media).map(({ slot, media: m }) => ({
          slot,
          source: m ? { width: m.width, height: m.height, focal: m.focal } : null,
        })),
      ),
    [media],
  );
  const entries = resolved.entries;
  const metrics = useMemo(() => measureComposition(entries), [entries]);

  // Real rendered widths + caption text boxes (proof, never layout input).
  useEffect(() => {
    const root = sceneRef.current;
    if (!root) return;
    const measure = () => {
      const canvas = root.querySelector("[data-testid=a13-pilot-scene]") as HTMLElement | null;
      const canvasW = canvas?.getBoundingClientRect().width ?? 0;
      const k = canvasW / A13_PILOT_CANVAS.width;
      const captions: Record<string, CaptionMeasure> = {};
      root.querySelectorAll<HTMLElement>("[data-testid^=caption-]").forEach((el) => {
        const zone = el.parentElement as HTMLElement;
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        captions[el.dataset.testid!.replace("caption-", "")] = {
          rect: {
            x: (zone.offsetLeft + el.offsetLeft) / k,
            y: (zone.offsetTop + el.offsetTop) / k,
            width: el.offsetWidth / k,
            height: el.offsetHeight / k,
          },
          lines: lh ? Math.round(el.scrollHeight / lh) : 0,
          exceedsSafeZone: el.offsetHeight > zone.clientHeight + 0.5 || el.offsetWidth > zone.clientWidth + 0.5,
        };
      });
      setMeasures({ viewport: window.innerWidth, canvas: canvasW, captions });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [entries, captionMode]);

  const textHits = useMemo(
    () =>
      measures
        ? captionTextHits(entries, Object.fromEntries(Object.entries(measures.captions).map(([id, c]) => [id, c.rect])))
        : {},
    [entries, measures],
  );

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
        A13 · Dynamic Polaroid · Desktop Light — PILOTE QG · CALIBRATION V2 · Foreground O1/O2 : DEFERRED — POST
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
              caption: m?.captions[captionMode] ?? null,
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
            <input type="checkbox" checked={qa} onChange={(e) => setQa(e.target.checked)} /> Calques QA (boîtes de
            référence, ancres, safe zones, cadre source)
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
              <th>Mode image</th>
              <th>Tirage (px @1670)</th>
              <th>Référence</th>
              <th>Surface / cible</th>
              <th>Ratio tirage</th>
              <th>Fenêtre photo</th>
              <th>Marge · bande</th>
              <th>Respiration papier</th>
              <th>Rotation</th>
              <th>Dérive ancre</th>
              <th>Emprise x (canvas)</th>
              <th>Photo masquée</th>
              <th>Safe zone couverte (tirage au-dessus)</th>
              <th>Caption</th>
              <th>Texte masqué</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ slot, layout }) => {
              const m = media[slot.mediaIndex];
              const s = metrics.slots.find((x) => x.slotId === slot.slotId);
              const cap = m?.captions[captionMode] ?? null;
              const cm = measures?.captions[slot.slotId];
              const zoneHits = metrics.safeZoneHits.filter((h) => h.covered === slot.slotId && h.above);
              const th = textHits[slot.slotId];
              return (
                <tr key={slot.slotId}>
                  <td>{slot.slotId}</td>
                  <td>
                    [{slot.mediaIndex}] {m && A13_PILOT_MEDIA.includes(m) ? "✓" : m ? "local" : "—"}
                  </td>
                  <td>{m?.label ?? "—"}</td>
                  {layout && m && s ? (
                    <>
                      <td>
                        {m.width}×{m.height}
                      </td>
                      <td>{fmt(layout.sourceRatio, 3)}</td>
                      <td>{layout.mode}</td>
                      <td>
                        {fmt(layout.outer.width)}×{fmt(layout.outer.height)}
                      </td>
                      <td>
                        {slot.referenceSize.width}×{slot.referenceSize.height}
                      </td>
                      <td>
                        {fmt(layout.areaFactor * 100)} % ({s.areaZone === "comfortable" ? "confort" : s.areaZone === "hard" ? "limite dure" : "HORS"})
                      </td>
                      <td>
                        {fmt(layout.outerRatio, 3)}
                        {layout.outerBounded ? " (borné)" : ""}
                      </td>
                      <td>
                        {fmt(layout.window.width)}×{fmt(layout.window.height)}
                      </td>
                      <td>
                        {fmt(layout.margin)} · {fmt(layout.bottomBand)}
                      </td>
                      <td>
                        {layout.mode === "contain-paper"
                          ? `${fmt(layout.photo.x)} (côtés) · ${fmt(layout.photo.y)} (haut/bas)`
                          : "—"}
                      </td>
                      <td>{slot.rotationDeg}°</td>
                      <td>{fmt(s.anchorDriftPx, 2)} px</td>
                      <td>
                        {fmt(s.extents.minX)} → {fmt(s.extents.maxX)}
                      </td>
                      <td>
                        {fmt(s.photoOccludedFraction * 100)} %{s.photoOccludedBy.length ? ` (${s.photoOccludedBy.join(", ")})` : ""}
                      </td>
                      <td className={zoneHits.length ? styles.red : undefined}>
                        {zoneHits.length ? zoneHits.map((h) => `${h.by} ${fmt(h.areaPx2, 0)} px²`).join(", ") : "0 px²"}
                      </td>
                      <td>
                        {cap
                          ? `${[...cap].length} car. · ${cm?.lines ?? "…"} l.${cm?.exceedsSafeZone ? " · DÉBORDE la safe zone" : ""}`
                          : "absente (bande conservée)"}
                      </td>
                      <td className={th && th.areaPx2 > 0 ? styles.red : undefined}>
                        {cap ? (th ? (th.areaPx2 > 0 ? `${fmt(th.areaPx2, 0)} px² (${th.by.join(", ")})` : "0 px²") : "…") : "—"}
                      </td>
                    </>
                  ) : (
                    <td colSpan={17}>slot vide</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Réduction de surface appliquée (§3/§5)</th>
              <th>Facteur</th>
              <th>Pour protéger la safe zone de</th>
            </tr>
          </thead>
          <tbody>
            {resolved.reductions.length ? (
              resolved.reductions.map((r) => (
                <tr key={r.slotId}>
                  <td>{r.slotId}</td>
                  <td>{fmt(r.areaFactor * 100)} %</td>
                  <td>{r.protects.join(", ")}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>aucune</td>
              </tr>
            )}
            {resolved.unresolved.map((h) => (
              <tr key={`${h.covered}-${h.by}`} className={styles.red}>
                <td>
                  RED — {h.by} couvre encore la safe zone {h.covered}
                </td>
                <td>{fmt(h.areaPx2, 0)} px²</td>
                <td>{h.by} est à son minimum dur ; aucun déplacement autorisé</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Paire (dessous → dessus)</th>
              <th>Chevauchement tirages (px²)</th>
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
