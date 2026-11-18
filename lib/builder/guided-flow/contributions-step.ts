import type { MemorialContent } from "@/types/memorial";
import { readHero } from "@/lib/memorial/hero";
import {
  hasOpenContributionFeature,
  inspectContributionsSettings,
  writeContributionsSettings,
  type ContributionsFeatures,
} from "@/lib/memorial/contributions/contributions-settings";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";
import { isA13Resolved } from "./gallery-step";

/**
 * M7 — A15 « Contributions des proches » : la famille choisit ce qu'elle
 * ouvre à ses proches (condoléances, récits et anecdotes, photographies).
 * Même discipline que A13 (`gallery-step.ts`) : l'étape vient une fois la
 * précédente derrière la famille, jusqu'à ce que son propre `StepRecord`
 * existe ; elle se rouvre depuis « Mon parcours ».
 *
 * Ce module ne possède que le `StepRecord` d'A15 ; les choix eux-mêmes
 * (`content.contributions`, lib/memorial/contributions/contributions-settings.ts)
 * sont un contenu de rubrique : les modifier ne dépend pas de l'étape.
 *
 *  - « Continuer » : `completed` si au moins une fonctionnalité est
 *    ouverte, `skipped` sinon (même règle que A13 et la fiche) ; jamais
 *    bloqué ;
 *  - « Passer cette étape » : `skipped`, les choix déjà enregistrés restent.
 * Les deux refusent sur des choix illisibles plutôt que de résoudre l'étape
 * par-dessus. Aucun exemple de démonstration n'est jamais écrit.
 */

export type ContributionsStepEditState = { status: "ready"; features: ContributionsFeatures } | { status: "corrupted" };

export function readContributionsForEditing(content: MemorialContent): ContributionsStepEditState {
  const read = inspectContributionsSettings(content);
  return read.status === "corrupted" ? { status: "corrupted" } : { status: "ready", features: read.features };
}

/** L'étape a-t-elle été traitée une fois, d'une manière ou d'une autre ? */
export function isA15Resolved(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).A15?.status;
  return status === "completed" || status === "skipped";
}

/** Après la Galerie (A13), jusqu'à ce que A15 ait été traitée une fois. */
export function needsA15(content: MemorialContent): boolean {
  if (!isA13Resolved(content)) return false;
  return !isA15Resolved(content);
}

export function contributionsStepProgress(content: MemorialContent): number {
  return guidedFlowProgress(humanFlowDefinition(), resolveHeroFlowState(content, readHero(content)));
}

export type ContributionsStepWriteResult = { ok: true; content: MemorialContent } | { ok: false; reason: "corrupted" };

function writeA15(content: MemorialContent, record: StepRecord): MemorialContent {
  return writeGuidedFlowState(content, { ...readGuidedFlowState(content), A15: record });
}

/** « Continuer » : enregistre les trois choix, puis l'étape. */
export function commitA15(content: MemorialContent, features: ContributionsFeatures): ContributionsStepWriteResult {
  if (readContributionsForEditing(content).status !== "ready") return { ok: false, reason: "corrupted" };
  const withSettings = writeContributionsSettings(content, features);
  return { ok: true, content: writeA15(withSettings, { status: hasOpenContributionFeature(features) ? "completed" : "skipped" }) };
}

/** « Passer cette étape » : rien n'est changé aux choix déjà enregistrés. */
export function skipA15(content: MemorialContent): ContributionsStepWriteResult {
  if (readContributionsForEditing(content).status !== "ready") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeA15(content, { status: "skipped" }) };
}
