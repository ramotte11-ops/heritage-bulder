import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { A13_PILOT_BACKGROUND_SRC, A13_PILOT_LAYER_Z } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { CaptionLayout } from "@/lib/memorial/gallery/caption-layout";
import { A13_CTA_7PLUS } from "@/config/gallery-a13-multi-state-manifests";
import type { Language } from "@/config/languages";
import { ebGaramond, ebGaramondItalic, laBelleAurore } from "@/components/builder/fonts";
import { DynamicPolaroid } from "./DynamicPolaroid";
import styles from "./A13PilotScene.module.css";

/**
 * A13 Desktop Light — scene: the ONE common photo-free GREEN background +
 * the state's `DynamicPolaroid`s + runtime title (+ the 7+ CTA). Nothing
 * else. Used unchanged by every state (G2…G6, G6 Signature 7+).
 *
 * - FOREGROUND O1/O2: DEFERRED — POST PILOT (QG). Not rendered, not approximated.
 * - One canvas, 1670 × 941, scaled uniformly with the rendered width and
 *   capped at 1670 (`.stage` max-width): `--k = 100cqw / 1670`.
 * - Slots render in manifest order; stacking is the manifest z-index only
 *   (V2: D1 30 → D6 35 → D2 40 → D4 50 → D3 60 → D5 70).
 */

export interface A13PilotSceneEntry {
  slot: A13Slot;
  layout: PolaroidLayout | null;
  src: string | null;
  alt: string;
  caption: CaptionLayout | null;
}

/** `CTA_7PLUS_V1` — only ever passed for the G6 Signature 7+ state. */
export interface A13SceneCta {
  label: string;
  lang: Language;
  onActivate?: () => void;
}

export interface A13PilotSceneProps {
  entries: A13PilotSceneEntry[];
  title: string;
  subtitle: string;
  /** Manifest state rendered (diagnostic attribute only). */
  stateId?: string;
  cta?: A13SceneCta | null;
  qa?: boolean;
  /** QA only (calibration V1.1): slot envelopes [x0, y0, x1, y1] and the
   * protected title zone, drawn as diagnostic outlines. */
  qaEnvelopes?: { slotId: string; envelope: readonly [number, number, number, number] }[];
  qaProtectedZone?: { x: number; y: number; width: number; height: number } | null;
  /** QA only (G3 territory study): territories, witness and chosen
   * centres, displacement and the measured title protection. */
  qaTerritories?: {
    slotId: string;
    territory: { xMin: number; xMax: number; yMin: number; yMax: number };
    witness: { x: number; y: number };
    chosen: { x: number; y: number } | null;
  }[];
  qaTitleInk?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Gallery V2 pilot (G2–G5): every print opens its memory. Absent for G6 / 7+. */
  onActivate?: (slotId: string) => void;
  /** QA only (V2.1 title authority): dilated real-glyph mask as pixel rows. */
  qaTitleMaskRects?: { x: number; y: number; width: number; height: number }[];
  /** QA only (G3 coupled territory): couple-centre territory, witness and
   * chosen couple centres, witness and chosen D2→D3 vectors, and the
   * relative ellipse drawn around the chosen D2 (admissible D3 centres). */
  qaCouple?: {
    territory: { xMin: number; xMax: number; yMin: number; yMax: number };
    witness: { d2: { x: number; y: number }; d3: { x: number; y: number }; center: { x: number; y: number } };
    chosen: { d2: { x: number; y: number }; d3: { x: number; y: number }; center: { x: number; y: number } } | null;
    ellipse: { center: { x: number; y: number }; radiusX: number; radiusY: number };
  } | null;
}

const g = A13_CTA_7PLUS.geometry;

export function A13PilotScene({
  entries,
  title,
  subtitle,
  stateId,
  cta = null,
  qa = false,
  qaEnvelopes = [],
  qaProtectedZone = null,
  qaTerritories = [],
  qaTitleInk = null,
  qaCouple = null,
  onActivate,
  qaTitleMaskRects = [],
}: A13PilotSceneProps) {
  return (
    <div
      className={`${styles.stage} ${laBelleAurore.variable}`}
      data-testid="a13-pilot-scene"
      data-state={stateId}
    >
      <div className={styles.canvas}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={A13_PILOT_BACKGROUND_SRC}
          alt=""
          aria-hidden="true"
          className={styles.background}
          style={{ zIndex: A13_PILOT_LAYER_Z.background }}
          draggable={false}
        />
        {entries.map(({ slot, layout, src, alt, caption }, i) =>
          layout && src ? (
            <DynamicPolaroid
              key={slot.slotId}
              slot={slot}
              layout={layout}
              src={src}
              alt={alt}
              caption={caption}
              qa={qa}
              {...(onActivate
                ? {
                    onActivate: () => onActivate(slot.slotId),
                    // V2.1: caption when present, otherwise a position label.
                    activateLabel: caption?.lines.length ? caption.lines.map((l) => l.text).join(" ") : `Souvenir ${i + 1} sur ${entries.length}`,
                  }
                : {})}
            />
          ) : null,
        )}
        <header className={styles.titleBlock} style={{ zIndex: A13_PILOT_LAYER_Z.runtimeText }}>
          <h2 className={`${styles.title} ${ebGaramond.className}`}>{title}</h2>
          <p className={`${styles.subtitle} ${ebGaramondItalic.className}`}>{subtitle}</p>
        </header>
        {qa && !qaProtectedZone && !qaTitleInk && !qaTitleMaskRects.length ? <div className={styles.qaTitleZone} aria-hidden="true" /> : null}
        {qa && qaProtectedZone ? (
          <div
            className={styles.qaProtectedZone}
            aria-hidden="true"
            style={{
              left: `calc(${qaProtectedZone.x} * var(--k))`,
              top: `calc(${qaProtectedZone.y} * var(--k))`,
              width: `calc(${qaProtectedZone.width} * var(--k))`,
              height: `calc(${qaProtectedZone.height} * var(--k))`,
            }}
          />
        ) : null}
        {qa && (qaTerritories.length || qaTitleInk || qaCouple || qaTitleMaskRects.length) ? (
          <svg className={styles.qaTerritoryLayer} viewBox="0 0 1670 941" aria-hidden="true" data-testid="qa-territories">
            {qaTitleInk ? (
              <rect
                className={styles.qaTitleInk}
                x={qaTitleInk.x0}
                y={qaTitleInk.y0}
                width={qaTitleInk.x1 - qaTitleInk.x0}
                height={qaTitleInk.y1 - qaTitleInk.y0}
              />
            ) : null}
            {qaTitleMaskRects.length ? (
              <path
                className={styles.qaTitleInk}
                d={qaTitleMaskRects.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}z`).join("")}
                data-testid="qa-title-mask"
              />
            ) : null}
            {qaTerritories.map(({ slotId, territory: t, witness: w, chosen: c }) => (
              <g key={slotId}>
                <rect className={styles.qaTerritory} x={t.xMin} y={t.yMin} width={t.xMax - t.xMin} height={t.yMax - t.yMin} />
                <text className={styles.qaTerritoryLabel} x={t.xMin + 4} y={t.yMin + 14}>
                  {slotId}
                </text>
                <circle className={styles.qaWitness} cx={w.x} cy={w.y} r={7} />
                {c ? (
                  <>
                    <line className={styles.qaMove} x1={w.x} y1={w.y} x2={c.x} y2={c.y} />
                    <circle className={styles.qaChosen} cx={c.x} cy={c.y} r={6} />
                  </>
                ) : null}
              </g>
            ))}
            {qaCouple ? (
              <g data-testid="qa-couple">
                <rect
                  className={styles.qaCoupleTerritory}
                  x={qaCouple.territory.xMin}
                  y={qaCouple.territory.yMin}
                  width={qaCouple.territory.xMax - qaCouple.territory.xMin}
                  height={qaCouple.territory.yMax - qaCouple.territory.yMin}
                />
                <text className={styles.qaCoupleLabel} x={qaCouple.territory.xMin + 4} y={qaCouple.territory.yMax - 6}>
                  C
                </text>
                <line
                  className={styles.qaCoupleWitnessVector}
                  x1={qaCouple.witness.d2.x}
                  y1={qaCouple.witness.d2.y}
                  x2={qaCouple.witness.d3.x}
                  y2={qaCouple.witness.d3.y}
                />
                <rect className={styles.qaCoupleWitnessCenter} x={qaCouple.witness.center.x - 6} y={qaCouple.witness.center.y - 6} width={12} height={12} />
                {qaCouple.chosen ? (
                  <>
                    <ellipse
                      className={styles.qaCoupleEllipse}
                      cx={qaCouple.chosen.d2.x + qaCouple.ellipse.center.x}
                      cy={qaCouple.chosen.d2.y + qaCouple.ellipse.center.y}
                      rx={qaCouple.ellipse.radiusX}
                      ry={qaCouple.ellipse.radiusY}
                    />
                    <line
                      className={styles.qaCoupleVector}
                      x1={qaCouple.chosen.d2.x}
                      y1={qaCouple.chosen.d2.y}
                      x2={qaCouple.chosen.d3.x}
                      y2={qaCouple.chosen.d3.y}
                    />
                    <rect className={styles.qaCoupleCenter} x={qaCouple.chosen.center.x - 5} y={qaCouple.chosen.center.y - 5} width={10} height={10} />
                  </>
                ) : null}
              </g>
            ) : null}
          </svg>
        ) : null}
        {qa
          ? qaEnvelopes.map(({ slotId, envelope: [x0, y0, x1, y1] }) => (
              <div
                key={slotId}
                className={styles.qaEnvelope}
                aria-hidden="true"
                style={{
                  left: `calc(${x0} * var(--k))`,
                  top: `calc(${y0} * var(--k))`,
                  width: `calc(${x1 - x0} * var(--k))`,
                  height: `calc(${y1 - y0} * var(--k))`,
                }}
              >
                <span>{slotId}</span>
              </div>
            ))
          : null}
        {cta ? (
          /*
           * CTA_7PLUS_V1 — a real <button>, runtime text, never baked. Box =
           * contract geometry (x 616, y 848, 440 × 74, inset 24/10); one
           * line, no ellipsis, no auto-shrink (overflow is a QG STOP, measured
           * by the QA harness). Hover/active change nothing geometric; focus
           * is an outline, which never takes layout space.
           */
          <button
            type="button"
            className={`${styles.cta} ${ebGaramondItalic.className}`}
            lang={cta.lang}
            data-testid="cta-7plus"
            style={{
              left: `calc(${g.x} * var(--k))`,
              top: `calc(${g.y} * var(--k))`,
              width: `calc(${g.width} * var(--k))`,
              height: `calc(${g.height} * var(--k))`,
              padding: `calc(${g.contentInset.y} * var(--k)) calc(${g.contentInset.x} * var(--k))`,
              zIndex: A13_CTA_7PLUS.zIndex,
            }}
            onClick={cta.onActivate}
          >
            <span className={styles.ctaLabel} data-testid="cta-7plus-label">
              {cta.label}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Resolves `--heritage-caption-hand` (La Belle Aurore) for the caption
 * measurer, independently of any rendered state — so the font is confirmed
 * even while the gallery is absent (0–1 media).
 */
export function A13CaptionFontProbe() {
  return (
    <span className={`${styles.probeHost} ${laBelleAurore.variable}`} aria-hidden="true">
      <span className={styles.captionProbe} data-caption-probe="">
        Aa
      </span>
    </span>
  );
}
