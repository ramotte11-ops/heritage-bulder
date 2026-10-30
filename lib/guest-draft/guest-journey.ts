import {
  journeySectionForScreen,
  resolveJourney,
  resolveJourneyScreens,
  type JourneyOverrides,
  type JourneyScreenId,
  type JourneySection,
  type JourneySnapshot,
} from "@/lib/builder/guided-flow/journey";
import type { GuestDraftV3 } from "./guest-draft-v3";
import {
  resolveGuestBuilderStage,
  resolveGuestPostHeroScreen,
  type GuestBuilderStage,
} from "./guest-builder-runtime";
import { isGuestHeroCropComplete, isGuestHeroPhotoComplete, isGuestHeroRevealComplete } from "./guest-hero-media";

/**
 * QG 005-B — « Mon parcours » for the guest Builder: the SAME journey the
 * authenticated route computes (`resolveJourney`, one catalog, one set of
 * status rules), read from the local V3 draft.
 *
 * The only local reading is the Hero media: T06-T08 are completed in the
 * local draft (its hero photo reference, crop and ambiance), never through
 * the server media references the route's Hero gates read. The current
 * screen therefore comes from the guest stage, and T06-T08 completion from
 * the local Hero contract; every other screen keeps the catalog's own
 * predicates.
 */

const STAGE_SCREEN: Partial<Record<GuestBuilderStage, JourneyScreenId>> = {
  identity: "identity",
  announcementChoice: "announcementChoice",
  phrase: "phrase",
  heroPhoto: "photo",
  heroCrop: "crop",
  heroReveal: "reveal",
};

/** The journey is offered from T01's answer and the Welcome on, exactly
 * like the route (no « Mon parcours » on the language or Welcome screens). */
export function hasGuestJourney(draft: GuestDraftV3): boolean {
  const stage = resolveGuestBuilderStage(draft);
  return stage !== "language" && stage !== "welcome";
}

/** The catalog screen the draft rests on; `null` once every built screen
 * is behind the family. Meaningful only when `hasGuestJourney`. */
export function guestCurrentJourneyScreen(draft: GuestDraftV3): JourneyScreenId | null {
  const stage = resolveGuestBuilderStage(draft);
  if (stage === "postRevealPending") return resolveGuestPostHeroScreen(draft);
  return STAGE_SCREEN[stage] ?? null;
}

export function guestJourneyOverrides(draft: GuestDraftV3): JourneyOverrides {
  return {
    current: guestCurrentJourneyScreen(draft),
    resolved: {
      photo: isGuestHeroPhotoComplete(draft),
      crop: isGuestHeroCropComplete(draft),
      reveal: isGuestHeroRevealComplete(draft),
    },
  };
}

export function resolveGuestJourney(
  draft: GuestDraftV3,
  revising: JourneyScreenId | null = null,
  reviewingSection: JourneySection | null = revising === null ? null : journeySectionForScreen(revising),
): JourneySnapshot {
  return resolveJourney(draft.content, revising, reviewingSection, guestJourneyOverrides(draft));
}

/** Same rule as the route's `resolveRevisionTarget`: a screen accessible
 * now and not the current one (which is shown anyway); anything else →
 * `null`, and the current screen is shown. */
export function resolveGuestRevisionTarget(draft: GuestDraftV3, id: JourneyScreenId | null): JourneyScreenId | null {
  if (id === null) return null;
  const state = resolveJourneyScreens(draft.content, guestJourneyOverrides(draft)).find((s) => s.id === id);
  if (state === undefined || !state.accessible || state.status === "current") return null;
  return id;
}

/** Same rule as the route's `resolveReviewingSection`: kept only while the
 * rubrique still holds an accessible screen. */
export function resolveGuestReviewingSection(
  draft: GuestDraftV3,
  section: JourneySection | null,
): JourneySection | null {
  if (section === null) return null;
  return resolveJourneyScreens(draft.content, guestJourneyOverrides(draft))
    .some((screen) => screen.section === section && screen.accessible)
    ? section
    : null;
}
