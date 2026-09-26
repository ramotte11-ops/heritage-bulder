"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { A13_PILOT_CANVAS, A13_PILOT_CAPTION, A13_PILOT_D1_LEFT_EXTENT } from "@/config/gallery-a13-pilot-manifest";
import {
  A13_CTA_7PLUS,
  A13_CTA_7PLUS_PILOT_LABELS,
  A13_STATE_SLOTS,
} from "@/config/gallery-a13-multi-state-manifests";
import { LANGUAGES, type Language } from "@/config/languages";
import { measureComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { buildGalleryState } from "@/lib/memorial/gallery/gallery-state";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import {
  A13_PILOT_MEDIA_LANDSCAPE_3X2,
  A13_PILOT_MEDIA_POOL,
  A13_PILOT_TITLE,
  PILOT_CAPTION_MODES,
  type PilotCaptionMode,
  type PilotMedia,
} from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13CaptionFontProbe, A13PilotScene } from "@/components/memorial/gallery/A13PilotScene";
import styles from "./page.module.css";

/**
 * QA harness — A13 Desktop Light MULTI-STATE (engine V2.1 unchanged).
 *
 * Inputs only: media COUNT (selects the manifest), caption state, CTA
 * language, overlays, local photos. Everything else is what the closed
 * manifest + V2.1 engine produced; nothing is adjusted here.
 *
 * URL presets: `?medias=7&lang=en&captions=24&qa=1&paysage=3x2`.
 */

const CAPTION_LABEL: Record<PilotCaptionMode, string> = {
  aucune: "absente",
  "une-ligne": "une ligne",
  "24": "24 caractères",
  "32": "32 caractères",
};

const LANG_LABEL: Record<Language, string> = { fr: "FR", en: "EN", es: "ES" };

function fmt(n: number, d = 1) {
  return n.toFixed(d);
}

function loadLocalFiles(files: File[]): Promise<PilotMedia[]> {
  return Promise.all(
    files.map(
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
              captions: A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length].captions,
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
  advanceDrift: Record<string, number>;
  /** CTA label rendered width, source px (null = no CTA). */
  ctaLabelWidth: number | null;
}

export function PilotQa() {
  const [pool, setPool] = useState<readonly PilotMedia[]>(A13_PILOT_MEDIA_POOL);
  const [count, setCount] = useState(6);
  const [captionMode, setCaptionMode] = useState<PilotCaptionMode>("24");
  const [lang, setLang] = useState<Language>("fr");
  const [qa, setQa] = useState(false);
  const [ctaLog, setCtaLog] = useState<string[]>([]);
  const [proof, setProof] = useState<DomProof | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);

  // URL presets, read once on mount (client only).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    if (q.get("qa") === "1") setQa(true);
    const c = q.get("captions") as PilotCaptionMode | null;
    if (c && PILOT_CAPTION_MODES.includes(c)) setCaptionMode(c);
    const l = q.get("lang");
    if (l && (LANGUAGES as readonly string[]).includes(l)) setLang(l as Language);
    const n = Number(q.get("medias"));
    if (q.has("medias") && Number.isInteger(n) && n >= 0 && n <= A13_PILOT_MEDIA_POOL.length) setCount(n);
    if (q.get("paysage") === "3x2") setPool(A13_PILOT_MEDIA_POOL.map((m, i) => (i === 1 ? A13_PILOT_MEDIA_LANDSCAPE_3X2 : m)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const media = useMemo(() => pool.slice(0, count), [pool, count]);
  const state = useMemo(
    () => buildGalleryState(media, (m) => m.captions[captionMode], font?.measurer ?? null),
    [media, captionMode, font],
  );
  const metrics = useMemo(
    () => (state ? measureComposition(state.entries.map(({ slot, layout }) => ({ slot, layout }))) : null),
    [state],
  );
  const ctaLabel = A13_CTA_7PLUS_PILOT_LABELS[lang];

  // DOM proof: real widths, SVG text vs canvas advance, CTA label width.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const canvas = root.querySelector("[data-testid=a13-pilot-scene]") as HTMLElement | null;
      const canvasW = canvas?.getBoundingClientRect().width ?? 0;
      const k = canvasW / A13_PILOT_CANVAS.width || 1;
      const advanceDrift: Record<string, number> = {};
      root.querySelectorAll<SVGSVGElement>("svg[data-testid^=caption-]").forEach((svg) => {
        const id = svg.dataset.testid!.replace("caption-", "");
        const cap = state?.entries.find((e) => e.slot.slotId === id)?.caption;
        let drift = 0;
        svg.querySelectorAll("text").forEach((t, i) => {
          if (cap?.lines[i]) drift = Math.max(drift, Math.abs(t.getComputedTextLength() - cap.lines[i].metrics.width));
        });
        advanceDrift[id] = drift;
      });
      const label = root.querySelector<HTMLElement>("[data-testid=cta-7plus-label]");
      setProof({
        viewport: window.innerWidth,
        canvas: canvasW,
        advanceDrift,
        ctaLabelWidth: label ? label.getBoundingClientRect().width / k : null,
      });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [state, lang]);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    try {
      const files = await loadLocalFiles(Array.from(list));
      setPool(files);
      setCount(files.length);
    } catch (e) {
      window.alert(`Image illisible : ${(e as Error).message}`);
    }
  };

  const k = proof && proof.canvas ? proof.canvas / A13_PILOT_CANVAS.width : null;
  const unresolved = state?.entries.filter((e) => e.caption?.status === "CAPTION_COLLISION_UNRESOLVED") ?? [];
  const ctaOverflow = proof?.ctaLabelWidth != null && proof.ctaLabelWidth > A13_CTA_7PLUS.maxRenderedWidthPx;
  const d1 = state?.stateId === "G6" ? metrics?.slots.find((s) => s.slotId === "D1") : undefined;

  return (
    <main className={styles.page} ref={rootRef}>
      <A13CaptionFontProbe />
      <div className={styles.banner}>
        A13 · Dynamic Polaroid · Desktop Light — MULTI-ÉTATS (moteur V2.1) · Foreground O1/O2 : DEFERRED — POST PILOT
      </div>

      {state ? (
        <A13PilotScene
          qa={qa}
          stateId={state.stateId}
          title={A13_PILOT_TITLE.title}
          subtitle={A13_PILOT_TITLE.subtitle}
          entries={state.entries.map(({ slot, layout, media: m, caption }) => ({
            slot,
            layout,
            src: m.src,
            alt: `Photo ${slot.mediaIndex + 1}`,
            caption,
          }))}
          cta={
            state.hasCta
              ? {
                  label: ctaLabel.text,
                  lang,
                  onActivate: () =>
                    setCtaLog((log) => [...log.slice(-4), `activé (${new Date().toLocaleTimeString("fr-FR")})`]),
                }
              : null
          }
        />
      ) : (
        <p className={styles.absent} data-testid="gallery-absent" data-state="none">
          {count} média{count > 1 ? "s" : ""} → Galerie absente (0–1 média).
        </p>
      )}

      <section className={styles.panel} aria-label="Contrôles QA">
        <div className={styles.controls}>
          <label>
            Médias{" "}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: pool.length + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
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
            Langue CTA{" "}
            <select value={lang} onChange={(e) => setLang(e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={qa} onChange={(e) => setQa(e.target.checked)} /> Diagnostic
          </label>
          <label className={styles.file}>
            Photos locales (ordre de sélection = media[0…]){" "}
            <input type="file" accept="image/*" multiple onChange={(e) => void onFiles(e.target.files)} />
          </label>
          <button type="button" onClick={() => setPool(A13_PILOT_MEDIA_POOL)}>
            Photos test
          </button>
          <span className={styles.proof} data-testid="width-proof">
            viewport {proof?.viewport ?? "…"} px · canvas {proof ? fmt(proof.canvas, 0) : "…"} px · échelle{" "}
            {k ? fmt(k, 4) : "…"}
          </span>
        </div>

        <div className={styles.summary} data-testid="qa-summary">
          <span className={styles.pass} data-testid="qa-state">
            {count} média{count > 1 ? "s" : ""} → {state ? state.stateId : "Galerie absente"} ·{" "}
            {state ? `${state.entries.length} Polaroid(s)` : "0 Polaroid"}
          </span>
          <span className={font?.fontCheck ? styles.pass : styles.red}>
            Police captions : {font ? (font.fontCheck ? "La Belle Aurore chargée" : "NON chargée") : "en attente…"}
          </span>
          {state ? (
            <span className={unresolved.length ? styles.red : styles.pass} data-testid="qa-captions">
              {unresolved.length
                ? `CAPTION_COLLISION_UNRESOLVED_STOP (${unresolved.map((e) => e.slot.slotId).join(", ")})`
                : `Captions : ${state.entries.filter((e) => e.caption).length} placées, 0 collision de glyphes`}
            </span>
          ) : null}
          <span className={state?.hasCta ? (ctaOverflow ? styles.red : styles.pass) : styles.pass} data-testid="qa-cta">
            {state?.hasCta
              ? `CTA présent · ${LANG_LABEL[lang]} « ${ctaLabel.text} » (${ctaLabel.status === "witness" ? "témoin" : "candidat pilote"}) · ${
                  proof?.ctaLabelWidth != null ? fmt(proof.ctaLabelWidth) : "…"
                } / ${A13_CTA_7PLUS.maxRenderedWidthPx} px${ctaOverflow ? " · QG STOP (dépassement)" : ""}`
              : "CTA absent (état sans CTA)"}
          </span>
          {d1 ? (
            <span className={styles.pass}>
              D1 minX {fmt(d1.extents.minX, 2)} px (déviation pilote acceptée ; contrat {A13_PILOT_D1_LEFT_EXTENT.minX} ± {A13_PILOT_D1_LEFT_EXTENT.tolerance})
            </span>
          ) : null}
          {state?.hasCta ? (
            <span className={styles.note} data-testid="cta-log">
              Journal CTA : {ctaLog.length ? ctaLog.join(" · ") : "aucune activation"}
            </span>
          ) : null}
        </div>

        {state && metrics ? (
          <>
            <h3 className={styles.h}>
              {state.stateId} — manifest fermé ({A13_STATE_SLOTS[state.stateId].length} slots), media[i] → slot[i]
            </h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>media</th>
                  <th>Photo</th>
                  <th>Ratio média</th>
                  <th>Classe · mode</th>
                  <th>Fenêtre</th>
                  <th>Padding · bande</th>
                  <th>Extérieur</th>
                  <th>Réf.</th>
                  <th>Surface / cible</th>
                  <th>Centre</th>
                  <th>Rot.</th>
                  <th>z</th>
                  <th>Ancre · dérive</th>
                  <th>Visible</th>
                  <th>Caption</th>
                  <th>Collision</th>
                  <th>SVG/canvas</th>
                </tr>
              </thead>
              <tbody>
                {state.entries.map(({ slot, layout, media: m, caption }) => {
                  const s = metrics.slots.find((x) => x.slotId === slot.slotId)!;
                  return (
                    <tr key={slot.slotId}>
                      <td>{slot.slotId}</td>
                      <td>[{slot.mediaIndex}]</td>
                      <td>{m.label}</td>
                      <td>{fmt(layout.mediaRatio, 3)}</td>
                      <td>
                        {layout.mediaClass === "inside" ? "plage" : layout.mediaClass === "below" ? "< 0,67" : "> 1,78"} ·{" "}
                        {layout.mode}
                      </td>
                      <td>
                        {fmt(layout.window.width)}×{fmt(layout.window.height)}
                      </td>
                      <td>
                        {fmt(layout.margin)} · {fmt(layout.bottomBand)}
                        {slot.bottomBandOverridePx ? " fixe" : ""}
                      </td>
                      <td>
                        {fmt(layout.outer.width)}×{fmt(layout.outer.height)}
                      </td>
                      <td>
                        {slot.referenceSize.width}×{slot.referenceSize.height}
                      </td>
                      <td>{fmt(((layout.outer.width * layout.outer.height) / slot.targetOuterArea) * 100, 2)} %</td>
                      <td>
                        {slot.center.x}, {slot.center.y}
                      </td>
                      <td>{slot.rotationDeg}°</td>
                      <td>{slot.zIndex}</td>
                      <td>
                        {slot.anchor} · {fmt(s.anchorDriftPx, 2)} px
                      </td>
                      <td>{fmt(layout.visibleFraction * 100, 0)} %</td>
                      <td>
                        {caption
                          ? `${caption.lines.length} l.${caption.shiftX ? ` · ${caption.shiftX > 0 ? "+" : ""}${caption.shiftX} px` : ""}${
                              caption.fitsBandHeight ? "" : " · hors bande"
                            }`
                          : m.captions[captionMode]
                            ? "…"
                            : "absente"}
                      </td>
                      <td className={caption && caption.collisionAreaPx2 > 0 ? styles.red : undefined}>
                        {caption ? (caption.status === "placed" ? "0 px²" : `${fmt(caption.collisionAreaPx2, 0)} px²`) : "—"}
                      </td>
                      <td>{proof?.advanceDrift[slot.slotId] !== undefined ? `${fmt(proof.advanceDrift[slot.slotId], 2)} px` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : null}

        <h3 className={styles.h}>Preuve de chargement de la police des captions</h3>
        <p className={styles.note} data-testid="font-proof">
          {font
            ? `document.fonts.check(« 400 ${A13_PILOT_CAPTION.fontSizePx}px ${font.fontFamily} ») = ${font.fontCheck} · FontFace : ${font.faces.join(" ; ") || "—"}`
            : "en attente…"}
        </p>
      </section>
    </main>
  );
}
