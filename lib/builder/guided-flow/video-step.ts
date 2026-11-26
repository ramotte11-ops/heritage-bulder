import type { MemorialContent } from "@/types/memorial";
import { readHero } from "@/lib/memorial/hero";
import { inspectVideoContent, writeVideoItems, type VideoDraftItem } from "@/lib/memorial/video/video-content";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";
import { isA15Resolved } from "./contributions-step";

/**
 * VID-06 — A16 « Vos souvenirs en vidéo » : la famille prépare jusqu'à trois
 * vidéos (dix minutes au total) pour la rubrique « Des instants pour se
 * souvenir ». Même discipline que A15 (`contributions-step.ts`) : l'étape
 * vient une fois la précédente derrière la famille (ordre produit :
 * Offrandes → Contributions des proches → Vidéo), jusqu'à ce que son propre
 * `StepRecord` existe ; elle se rouvre depuis « Mon parcours ».
 *
 * Ce module ne possède que le `StepRecord` d'A16 ; les vidéos elles-mêmes
 * (`content.video`, lib/memorial/video/video-content.ts) sont un contenu de
 * rubrique, enregistré au fil de l'eau par l'écran :
 *  - « Continuer » : `completed` s'il y a au moins une vidéo, `skipped`
 *    sinon ; jamais bloqué, même quand une durée reste à vérifier ;
 *  - « Passer cette étape » : `skipped`, les vidéos déjà préparées restent.
 * Les deux refusent sur un contenu illisible plutôt que de résoudre l'étape
 * par-dessus.
 */

export type VideoStepEditState = { status: "ready"; items: readonly VideoDraftItem[] } | { status: "corrupted" };

export function readVideoForEditing(content: MemorialContent): VideoStepEditState {
  const read = inspectVideoContent(content);
  return read.status === "corrupted" ? { status: "corrupted" } : { status: "ready", items: read.items };
}

/** L'étape a-t-elle été traitée une fois, d'une manière ou d'une autre ? */
export function isA16Resolved(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).A16?.status;
  return status === "completed" || status === "skipped";
}

/** Après les Contributions des proches (A15), jusqu'à ce que A16 ait été traitée une fois. */
export function needsA16(content: MemorialContent): boolean {
  if (!isA15Resolved(content)) return false;
  return !isA16Resolved(content);
}

export function videoStepProgress(content: MemorialContent): number {
  return guidedFlowProgress(humanFlowDefinition(), resolveHeroFlowState(content, readHero(content)));
}

export type VideoStepWriteResult = { ok: true; content: MemorialContent } | { ok: false; reason: "corrupted" };

function writeA16(content: MemorialContent, record: StepRecord): MemorialContent {
  return writeGuidedFlowState(content, { ...readGuidedFlowState(content), A16: record });
}

/** « Continuer » : enregistre la liste telle qu'à l'écran, puis l'étape. */
export function commitA16(content: MemorialContent, items: readonly VideoDraftItem[]): VideoStepWriteResult {
  if (readVideoForEditing(content).status !== "ready") return { ok: false, reason: "corrupted" };
  const withItems = writeVideoItems(content, items);
  return { ok: true, content: writeA16(withItems, { status: items.length > 0 ? "completed" : "skipped" }) };
}

/** « Passer cette étape » : rien n'est changé aux vidéos déjà préparées. */
export function skipA16(content: MemorialContent): VideoStepWriteResult {
  if (readVideoForEditing(content).status !== "ready") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeA16(content, { status: "skipped" }) };
}
