import type { SectionId } from "@/config/sections";
import type { MemorialContent } from "@/types/memorial";
import { readGuidedFlowState } from "./flow-state";
import {
  isPageBComplete,
  isPageCComplete,
  isPageDComplete,
  isPageEComplete,
  needsPageA,
  needsPageB,
  needsPageC,
  needsPageD,
  needsPageE,
} from "./hero-step";
import { isAnnouncementChosen, needsA00, readAnnouncementChoice } from "./announcement-choice-step";
import { isA01Complete, isA02Resolved, isA03Complete, needsA01, needsA02, needsA03 } from "./death-notice-step";
import {
  isA04Complete,
  isA14Resolved,
  needsA04,
  needsA05,
  needsA06,
  needsA07,
  needsA14,
  needsA08,
  readCeremonyMomentAnswer,
} from "./ceremony-step";
import { isA09Resolved, needsA09 } from "./traditions-step";
import { isPersonSheetResolved, needsPersonSheet } from "./person-sheet-step";
import { isA13Resolved, needsA13 } from "./gallery-step";

/**
 * B03 — « Mon parcours »: the family-facing table of contents of the
 * Guided Flow, and the one rule deciding which screen may be reopened
 * for revision.
 *
 * Pure, framework-free, no I/O — same discipline as every other module
 * in this folder. It invents no progression of its own:
 *
 *   - `needs` is EXACTLY the gate `app/builder/[memorialId]/page.tsx`
 *     evaluates, in the same order, so `currentJourneyScreen` is the
 *     screen the route would show (journey.test.ts guards the order);
 *   - `resolved` is each step's own existing "done" predicate, read
 *     independently of the gates (a gate is also false before its step
 *     is reachable, so `!needs` alone never means "done");
 *   - `applicable` repeats the conditional rules already in force (A00
 *     for the death notice and A09, A04 for A05-A08).
 *
 * ## Revision never deletes
 *
 * Reopening a screen is a navigation, never a write: the screen is
 * shown with what is stored, and only its own "Continuer" commits —
 * through the same commit functions as the first time. Nothing here
 * clears a record (unlike A03's `reopenA01`, which deliberately
 * un-marks A01): a screen that becomes hidden (A00 → "Non", A04 →
 * "Non") keeps its content and records, and simply reads `hidden`.
 *
 * ## Accessible vs future
 *
 * A screen may be reopened only once it is genuinely reached — already
 * resolved, or the current one — and only while applicable. A future
 * screen that depends on answers not given yet is never reachable from
 * here (B03 brief: no arbitrary jump forward).
 *
 * ## After publication
 *
 * Nothing here reads the memorial's status: « Gérer mon hommage » (a
 * later mission) can reuse this catalog and add its own per-screen
 * locks (the Hero's name, dates and main photograph) without changing
 * how the Guided Flow computes progress.
 */

export const JOURNEY_SECTIONS = ["person", "deathNotice", "ceremony", "traditions", "personSheet", "gallery"] as const;
export type JourneySection = (typeof JOURNEY_SECTIONS)[number];

/**
 * The memorial section each « Mon parcours » block builds — what
 * « Gérer les rubriques visibles » hides or shows. `person` builds the
 * Hero, which is never hidden.
 *
 * Adding a rubrique to « Mon parcours » = one id here, its screens in
 * `JOURNEY_SCREENS`, one label per language (`journey.section.<id>`).
 * The panel renders whatever this catalog holds, and never a block
 * without a screen — an announced but unbuilt rubrique stays invisible.
 */
export const JOURNEY_SECTION_MEMORIAL_SECTION: Readonly<Record<JourneySection, SectionId>> = {
  person: "hero",
  deathNotice: "deathNotice",
  ceremony: "ceremony",
  traditions: "traditions",
  personSheet: "story",
  gallery: "gallery",
};

export const JOURNEY_SCREEN_IDS = [
  "identity",
  "announcementChoice",
  "phrase",
  "photo",
  "crop",
  "reveal",
  "announcementText",
  "announcementDetails",
  "announcementPreview",
  "ceremonyMoment",
  "ceremonyDateTime",
  "ceremonyVenue",
  "ceremonyAddress",
  "ceremonyProgramme",
  "ceremonyNote",
  "traditions",
  "personSheet",
  "gallery",
] as const;
export type JourneyScreenId = (typeof JOURNEY_SCREEN_IDS)[number];

interface JourneyScreenDefinition {
  id: JourneyScreenId;
  section: JourneySection;
  /** The route's own gate for this screen (page.tsx), same order. */
  needs: (content: MemorialContent) => boolean;
  /** Already treated once, whichever way — read independently of the gates. */
  resolved: (content: MemorialContent) => boolean;
  /** Part of the route given the family's current answers —
   * `"undecided"` while the question it depends on (A00, A04) has not
   * been answered yet: neither hidden nor offered, simply upcoming;
   * `"deferred"` when the family answered A00 « Plus tard »: still to be
   * decided, never presented as required nor as not concerned. */
  applicable: (content: MemorialContent) => boolean | "undecided" | "deferred";
}

const always = () => true;
const announcement = (content: MemorialContent) => {
  const choice = readAnnouncementChoice(content);
  if (choice === null) return "undecided";
  if (choice === "later") return "deferred";
  return isAnnouncementChosen(content);
};
const ceremonyPlanned = (content: MemorialContent) => {
  const answer = readCeremonyMomentAnswer(content);
  return answer === null ? "undecided" : answer === "yes";
};
const recordResolved = (stepId: "A05" | "A06" | "A07" | "A08") => (content: MemorialContent) => {
  const status = readGuidedFlowState(content)[stepId]?.status;
  return status === "completed" || status === "skipped";
};

export const JOURNEY_SCREENS: readonly JourneyScreenDefinition[] = [
  { id: "identity", section: "person", needs: needsPageA, resolved: (c) => !needsPageA(c), applicable: always },
  {
    id: "announcementChoice",
    section: "person",
    needs: needsA00,
    // A pre-A00 draft that validated its notice reads "yes" (derived):
    // resolved too, and still reopenable to change the answer.
    resolved: (c) => readAnnouncementChoice(c) !== null,
    applicable: always,
  },
  { id: "phrase", section: "person", needs: needsPageB, resolved: isPageBComplete, applicable: always },
  { id: "photo", section: "person", needs: needsPageC, resolved: isPageCComplete, applicable: always },
  { id: "crop", section: "person", needs: needsPageD, resolved: isPageDComplete, applicable: always },
  { id: "reveal", section: "person", needs: needsPageE, resolved: isPageEComplete, applicable: always },
  {
    id: "announcementText",
    section: "deathNotice",
    needs: (c) => isAnnouncementChosen(c) && needsA01(c),
    resolved: isA01Complete,
    applicable: announcement,
  },
  {
    id: "announcementDetails",
    section: "deathNotice",
    needs: (c) => isAnnouncementChosen(c) && needsA02(c),
    resolved: isA02Resolved,
    applicable: announcement,
  },
  {
    id: "announcementPreview",
    section: "deathNotice",
    needs: (c) => isAnnouncementChosen(c) && needsA03(c),
    resolved: isA03Complete,
    applicable: announcement,
  },
  { id: "ceremonyMoment", section: "ceremony", needs: needsA04, resolved: isA04Complete, applicable: always },
  { id: "ceremonyDateTime", section: "ceremony", needs: needsA05, resolved: recordResolved("A05"), applicable: ceremonyPlanned },
  { id: "ceremonyVenue", section: "ceremony", needs: needsA06, resolved: recordResolved("A06"), applicable: ceremonyPlanned },
  { id: "ceremonyAddress", section: "ceremony", needs: needsA07, resolved: recordResolved("A07"), applicable: ceremonyPlanned },
  { id: "ceremonyProgramme", section: "ceremony", needs: needsA14, resolved: isA14Resolved, applicable: ceremonyPlanned },
  { id: "ceremonyNote", section: "ceremony", needs: needsA08, resolved: recordResolved("A08"), applicable: ceremonyPlanned },
  { id: "traditions", section: "traditions", needs: needsA09, resolved: isA09Resolved, applicable: announcement },
  { id: "personSheet", section: "personSheet", needs: needsPersonSheet, resolved: isPersonSheetResolved, applicable: always },
  { id: "gallery", section: "gallery", needs: needsA13, resolved: isA13Resolved, applicable: always },
];

export function isJourneyScreenId(value: unknown): value is JourneyScreenId {
  return typeof value === "string" && (JOURNEY_SCREEN_IDS as readonly string[]).includes(value);
}

/** The screen the route shows right now (the first open gate), or
 * `null` once every built screen is behind the family. */
export function currentJourneyScreen(content: MemorialContent): JourneyScreenId | null {
  return JOURNEY_SCREENS.find((screen) => screen.needs(content))?.id ?? null;
}

/**
 * The first open screen strictly after an already completed catalog screen.
 *
 * Local runtimes can own media completion without manufacturing the server
 * media references read by the earlier Hero gates. Starting after the locally
 * completed screen preserves the canonical order and every existing `needs`
 * predicate for the remainder of the one Builder journey.
 */
export function currentJourneyScreenAfter(
  content: MemorialContent,
  completedScreen: JourneyScreenId,
): JourneyScreenId | null {
  const completedIndex = JOURNEY_SCREENS.findIndex((screen) => screen.id === completedScreen);
  return JOURNEY_SCREENS.slice(completedIndex + 1).find((screen) => screen.needs(content))?.id ?? null;
}

/**
 * - `done`: treated once (completed or explicitly skipped);
 * - `current`: the screen the route shows right now;
 * - `toComplete`: reached but not (or no longer) done — e.g. the
 *   announcement preview after the text was edited;
 * - `upcoming`: not reached yet — never reopenable;
 * - `deferred`: depends on A00 answered « Plus tard » — « À décider »,
 *   never reopenable from here (the family changes A00 instead);
 * - `hidden`: not part of the route given the current answers — its
 *   content is kept, never presented as a required step.
 */
export type JourneyScreenStatus = "done" | "current" | "toComplete" | "upcoming" | "deferred" | "hidden";

export interface JourneyScreenState {
  id: JourneyScreenId;
  section: JourneySection;
  status: JourneyScreenStatus;
  /** May be reopened for revision right now. */
  accessible: boolean;
}

export type JourneySectionStatus = "done" | "inProgress" | "upcoming" | "deferred" | "hidden";

export interface JourneySectionState {
  id: JourneySection;
  status: JourneySectionStatus;
  screens: JourneyScreenState[];
}

/** Serializable — handed by the Server Component to the client entry. */
export interface JourneySnapshot {
  sections: JourneySectionState[];
  current: JourneyScreenId | null;
  /** The screen being revised, when the route shows one out of order. */
  revising: JourneyScreenId | null;
  /** The rubrique whose list remains open between successive revisions. */
  reviewingSection: JourneySection | null;
}

export function resolveJourneyScreens(content: MemorialContent): JourneyScreenState[] {
  const current = currentJourneyScreen(content);
  const currentIndex = current === null ? JOURNEY_SCREENS.length : JOURNEY_SCREENS.findIndex((s) => s.id === current);

  return JOURNEY_SCREENS.map((screen, index): JourneyScreenState => {
    const applicable = screen.applicable(content);
    let status: JourneyScreenStatus;
    if (applicable === false) status = "hidden";
    else if (applicable === "undecided") status = "upcoming";
    else if (applicable === "deferred") status = "deferred";
    else if (screen.id === current) status = "current";
    else if (screen.resolved(content)) status = "done";
    else status = index < currentIndex ? "toComplete" : "upcoming";
    const accessible = status === "done" || status === "current" || status === "toComplete";
    return { id: screen.id, section: screen.section, status, accessible };
  });
}

function sectionStatus(screens: JourneyScreenState[]): JourneySectionStatus {
  const visible = screens.filter((s) => s.status !== "hidden" && s.status !== "deferred");
  if (visible.length === 0) return screens.some((s) => s.status === "deferred") ? "deferred" : "hidden";
  if (visible.every((s) => s.status === "done")) return "done";
  if (visible.every((s) => s.status === "upcoming")) return "upcoming";
  return "inProgress";
}

export function journeySectionForScreen(id: JourneyScreenId): JourneySection {
  return JOURNEY_SCREENS.find((screen) => screen.id === id)!.section;
}

export function resolveJourney(
  content: MemorialContent,
  revising: JourneyScreenId | null = null,
  reviewingSection: JourneySection | null = revising === null ? null : journeySectionForScreen(revising),
): JourneySnapshot {
  const screens = resolveJourneyScreens(content);
  const sections = JOURNEY_SECTIONS.map((id): JourneySectionState => {
    const own = screens.filter((s) => s.section === id);
    return { id, status: sectionStatus(own), screens: own };
  }).filter((section) => section.screens.length > 0);
  return { sections, current: currentJourneyScreen(content), revising, reviewingSection };
}

/**
 * A raw `?rubrique=` value is only a navigation hint. Keep it when it
 * names a known rubrique that still contains at least one server-resolved
 * accessible screen; otherwise ignore it.
 */
export function resolveReviewingSection(content: MemorialContent, raw: unknown): JourneySection | null {
  if (typeof raw !== "string" || !JOURNEY_SECTIONS.includes(raw as JourneySection)) return null;
  const section = raw as JourneySection;
  return resolveJourneyScreens(content).some((screen) => screen.section === section && screen.accessible)
    ? section
    : null;
}

/**
 * The revision target the route may honor for a raw `?etape=` value —
 * a client claim, so validated here against the server's own reading
 * of the draft: a known screen, accessible now, and not the current
 * screen (which the route shows anyway). Anything else → `null`, and
 * the route simply shows the current screen.
 */
export function resolveRevisionTarget(content: MemorialContent, raw: unknown): JourneyScreenId | null {
  if (!isJourneyScreenId(raw)) return null;
  const state = resolveJourneyScreens(content).find((s) => s.id === raw);
  if (state === undefined || !state.accessible || state.status === "current") return null;
  return raw;
}

/** Validates the pair supplied by the browser and derives the rubrique
 * from the fixed catalog. A mismatched `?rubrique=` can never move a
 * screen into another rubrique. Legacy `?etape=` links remain valid. */
export function resolveRevisionContext(
  content: MemorialContent,
  rawScreen: unknown,
  rawSection: unknown,
): { screen: JourneyScreenId; section: JourneySection } | null {
  const screen = resolveRevisionTarget(content, rawScreen);
  if (screen === null) return null;
  const section = journeySectionForScreen(screen);
  if (rawSection !== undefined && rawSection !== section) return null;
  return { screen, section };
}
