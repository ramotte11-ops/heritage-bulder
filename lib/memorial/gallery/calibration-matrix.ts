import { A13_STATE_SLOTS } from "@/config/gallery-a13-multi-state-manifests";
import {
  A13_CALIBRATION_STATES,
  A13_OCCLUSION_CAPS,
  A13_SLOT_CALIBRATION,
  type A13CalibratedStateId,
} from "@/config/gallery-a13-calibration-v1-1";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { buildGalleryState } from "@/lib/memorial/gallery/gallery-state";
import { convexIntersectionArea, measureComposition } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { TITLE_ZONE_POLYGON, occlusionPercent, outerQuad } from "@/lib/memorial/gallery/manifest-calibration";

/**
 * A13 calibration V1.1 — the QA matrix prescribed by the QG, as data.
 *
 * For each state G2–G5: the six ratios 3:4, 4:3, 1:1, 9:16, 16:9 and
 * 2.39:1, cyclically permuted (rotation r gives slot i the ratio
 * (i + r) mod 6 — family order untouched), × five caption states. Every run
 * goes through the real runtime path (`buildGalleryState`) and is then
 * checked against every V1.1 assertion. Read-only: nothing is corrected.
 */

export const MATRIX_RATIOS = [
  { name: "3:4", w: 3, h: 4 },
  { name: "4:3", w: 4, h: 3 },
  { name: "1:1", w: 1, h: 1 },
  { name: "9:16", w: 9, h: 16 },
  { name: "16:9", w: 16, h: 9 },
  { name: "2.39:1", w: 2.39, h: 1 },
] as const;

export const MATRIX_CAPTION_STATES = ["absente", "courte", "24", "32-une-ligne", "32-deux-lignes"] as const;
export type MatrixCaptionState = (typeof MATRIX_CAPTION_STATES)[number];

/** Short one-line captions per slot index; 24-char and the two 32-char tests. */
const SHORT = ["Maman", "Tous les deux", "Son chapeau", "Sous l'arche", "Le ponton"];
const C24 = ["Maman, un soir à Gordes.", "Tous deux sur la colline", "Son chapeau, l'été 1982.", "Sous l'arche de la ferme", "Le ponton du lac, été 98"];
/** 32 characters, narrow glyphs (312.8 px at 27 px): one line where it fits. */
export const C32_ONE_LINE = "Lili et Lola, l'été, à Tillières";
/** 32 characters, wide glyphs (573.1 px at 27 px): two lines. */
export const C32_TWO_LINES = "MAMAN ET MAMIE, À MIMIZAN, 1966.";

export function matrixCaption(state: MatrixCaptionState, index: number): string | null {
  switch (state) {
    case "absente":
      return null;
    case "courte":
      return SHORT[index % SHORT.length];
    case "24":
      return C24[index % C24.length];
    case "32-une-ligne":
      return C32_ONE_LINE;
    case "32-deux-lignes":
      return C32_TWO_LINES;
  }
}

export interface MatrixSlotResult {
  slotId: string;
  ratio: string;
  scale: number;
  minScale: number;
  status: string;
  limitedBy: string[];
  titlePx2: number;
  envelopeExcessPx: number;
  photoVisible: number;
  distortion: number;
  anchorDriftPx: number;
  captionLines: number | null;
  captionShift: number | null;
  captionStatus: string | null;
  captionCollisionPx2: number;
}

export interface MatrixOcclusion {
  occluder: string;
  photo: string;
  percent: number;
  cap: number;
  aggregate: number;
  aggregateCap: number;
}

export interface MatrixRun {
  state: A13CalibratedStateId;
  rotation: number;
  captions: MatrixCaptionState;
  slots: MatrixSlotResult[];
  occlusions: MatrixOcclusion[];
  pass: boolean;
  failures: string[];
}

export function runCalibrationMatrix(measurer: CaptionMeasurer | null): MatrixRun[] {
  const runs: MatrixRun[] = [];
  for (const state of A13_CALIBRATION_STATES) {
    const slots = A13_STATE_SLOTS[state];
    for (let rotation = 0; rotation < MATRIX_RATIOS.length; rotation++) {
      for (const captions of MATRIX_CAPTION_STATES) {
        const media = slots.map((_, i) => {
          const r = MATRIX_RATIOS[(i + rotation) % MATRIX_RATIOS.length];
          return { width: r.w * 1000, height: r.h * 1000, ratio: r.name, text: matrixCaption(captions, i) };
        });
        const st = buildGalleryState(media, (m) => m.text, measurer)!;
        const comp = measureComposition(st.entries.map(({ slot, layout }) => ({ slot, layout })));
        const failures: string[] = [];

        const slotResults: MatrixSlotResult[] = st.entries.map(({ slot, layout, media: m, caption, calibration }) => {
          const cal = A13_SLOT_CALIBRATION[slot.slotId];
          const q = outerQuad(slot, layout);
          const xs = q.map((p) => p.x);
          const ys = q.map((p) => p.y);
          const [x0, y0, x1, y1] = cal.envelope;
          const envelopeExcessPx = Math.max(0, x0 - Math.min(...xs), y0 - Math.min(...ys), Math.max(...xs) - x1, Math.max(...ys) - y1);
          const titlePx2 = convexIntersectionArea(q, TITLE_ZONE_POLYGON);
          const drift = comp.slots.find((s) => s.slotId === slot.slotId)!.anchorDriftPx;
          const distortion = Math.abs(layout.photo.width / layout.photo.height - m.width / m.height);
          const r: MatrixSlotResult = {
            slotId: slot.slotId,
            ratio: m.ratio,
            scale: calibration!.scale,
            minScale: calibration!.minScale,
            status: calibration!.status,
            limitedBy: calibration!.limitedBy.map((f) => `${f.id}${f.detail ? ` (${f.detail})` : ""}: +${f.excess.toFixed(2)}`),
            titlePx2,
            envelopeExcessPx,
            photoVisible: layout.visibleFraction,
            distortion,
            anchorDriftPx: drift,
            captionLines: caption ? caption.lines.length : null,
            captionShift: caption ? caption.shiftX : null,
            captionStatus: caption ? caption.status : null,
            captionCollisionPx2: caption ? caption.collisionAreaPx2 : 0,
          };
          if (r.status !== "placed") failures.push(`${slot.slotId} MANIFEST_ENVELOPE_UNRESOLVED_STOP`);
          if (titlePx2 > 1e-6) failures.push(`${slot.slotId} zone titre ${titlePx2.toFixed(0)} px²`);
          if (envelopeExcessPx > 1e-9) failures.push(`${slot.slotId} enveloppe +${envelopeExcessPx.toFixed(1)} px`);
          if (r.scale < r.minScale - 1e-9) failures.push(`${slot.slotId} s < minScale`);
          if (r.photoVisible !== 1 || distortion > 1e-9) failures.push(`${slot.slotId} photo`);
          if (drift > 1e-9) failures.push(`${slot.slotId} ancre`);
          if (caption && caption.status !== "placed") failures.push(`${slot.slotId} CAPTION_COLLISION_UNRESOLVED`);
          return r;
        });

        const byId = new Map(st.entries.map((e) => [e.slot.slotId, e]));
        const occlusions: MatrixOcclusion[] = A13_OCCLUSION_CAPS.filter((c) => c.state === state).map((c) => {
          const lower = byId.get(c.protectedPhoto)!;
          const upper = byId.get(c.occluder)!;
          const percent = occlusionPercent(lower.slot, lower.layout, [outerQuad(upper.slot, upper.layout)]);
          const covers = st.entries.filter((e) => e.slot.zIndex > lower.slot.zIndex).map((e) => outerQuad(e.slot, e.layout));
          const aggregate = occlusionPercent(lower.slot, lower.layout, covers);
          if (percent > c.maxPercent + 1e-9) failures.push(`${c.occluder}→${c.protectedPhoto} ${percent.toFixed(1)} % > ${c.maxPercent} %`);
          if (aggregate > c.aggregateMaxPercent + 1e-9) failures.push(`agrégé ${c.protectedPhoto} ${aggregate.toFixed(1)} % > ${c.aggregateMaxPercent} %`);
          return { occluder: c.occluder, photo: c.protectedPhoto, percent, cap: c.maxPercent, aggregate, aggregateCap: c.aggregateMaxPercent };
        });

        runs.push({ state, rotation, captions, slots: slotResults, occlusions, pass: failures.length === 0, failures: [...new Set(failures)] });
      }
    }
  }
  return runs;
}
