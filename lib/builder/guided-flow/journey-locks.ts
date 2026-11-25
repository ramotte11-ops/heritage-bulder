import type { MemorialStatus } from "@/types/memorial";
import { authorizeMemorialEdit, type MemorialMutationClaim } from "@/lib/memorial/edit-authorization";
import { JOURNEY_SCREEN_IDS, type JourneyLocks, type JourneyScreenId } from "./journey";

/**
 * Chef 03 / O04 — which « Mon parcours » screens the server would refuse
 * to save right now, so that none is offered for revision (no « Revoir »,
 * no « Modifier mon choix », no « Changer l'ambiance ») only to end in a
 * refused save.
 *
 * Pure, and deliberately NOT a policy of its own: every answer comes from
 * `authorizeMemorialEdit` (Security V1, lib/memorial/edit-authorization.ts)
 * — the very function `saveDraftAction` and the media and configuration
 * actions apply — fed with the same lifecycle facts they use
 * (lib/memorial/persist-edit.ts): the owner, the memorial's status, and
 * `ceremony: "unknown"` (no durable ceremony-closure fact exists yet, so
 * the ceremony is refused after publication). Nothing here relaxes,
 * bypasses or duplicates a rule: the navigation only stops promising what
 * the server would refuse. The server keeps refusing on its own.
 *
 * Each screen is described by the writes its own « Continuer » performs:
 * its Guided Flow record and the matter it edits. A screen is locked when
 * the policy refuses that set.
 */
const SCREEN_MUTATIONS: Readonly<Record<JourneyScreenId, readonly MemorialMutationClaim[]>> = {
  identity: [{ kind: "content", target: "hero.displayName" }, { kind: "content", target: "guidedFlow.T04" }],
  announcementChoice: [{ kind: "content", target: "guidedFlow.A00" }],
  phrase: [{ kind: "content", target: "hero.shortPhrase" }, { kind: "content", target: "guidedFlow.T05" }],
  photo: [{ kind: "media", target: "hero.finalize" }, { kind: "content", target: "guidedFlow.T06" }],
  crop: [{ kind: "content", target: "hero.photo.crop" }, { kind: "content", target: "guidedFlow.T07" }],
  reveal: [{ kind: "configuration", target: "skinVariant" }, { kind: "content", target: "guidedFlow.T08" }],
  announcementText: [{ kind: "content", target: "deathNotice.announcementText" }, { kind: "content", target: "guidedFlow.A01" }],
  announcementDetails: [
    { kind: "content", target: "deathNotice.precisions.generalLocation" },
    { kind: "content", target: "guidedFlow.A02" },
  ],
  announcementPreview: [{ kind: "content", target: "guidedFlow.A03" }],
  ceremonyMoment: [{ kind: "content", target: "guidedFlow.A04" }],
  ceremonyDateTime: [{ kind: "content", target: "ceremony.date" }, { kind: "content", target: "guidedFlow.A05" }],
  ceremonyVenue: [{ kind: "content", target: "ceremony.venueName" }, { kind: "content", target: "guidedFlow.A06" }],
  ceremonyAddress: [{ kind: "content", target: "ceremony.address" }, { kind: "content", target: "guidedFlow.A07" }],
  ceremonyProgramme: [{ kind: "content", target: "ceremony.programme" }, { kind: "content", target: "guidedFlow.A14" }],
  ceremonyNote: [{ kind: "content", target: "ceremony.note" }, { kind: "content", target: "guidedFlow.A08" }],
  traditions: [{ kind: "content", target: "traditions.entries" }, { kind: "content", target: "guidedFlow.A09" }],
  personSheet: [{ kind: "content", target: "personWords.text" }, { kind: "content", target: "guidedFlow.A10" }],
  gallery: [{ kind: "content", target: "gallery.items" }, { kind: "content", target: "guidedFlow.A13" }],
  contributions: [{ kind: "content", target: "contributions.features" }, { kind: "content", target: "guidedFlow.A15" }],
  video: [{ kind: "content", target: "video.items" }, { kind: "content", target: "guidedFlow.A16" }],
};

/** The lifecycle facts the Builder route already holds (`memorials.status`). */
export interface JourneyLockFacts {
  status: MemorialStatus;
}

/**
 * `memorials.status` stands for the publication fact the policy reads:
 * `published` / `editing` (and `archived`) exist only after a first
 * publication, `draft` / `ready` only before it — the same pairing the
 * policy itself checks (`publicationPhase`). Before publication nothing is
 * locked.
 */
export function lockedJourneyScreens(facts: JourneyLockFacts): JourneyLocks {
  const firstPublicationExists = facts.status !== "draft" && facts.status !== "ready";
  const context = {
    actor: "owner" as const,
    status: facts.status,
    firstPublicationExists,
    locks: { ceremony: "unknown" as const },
  };
  return JOURNEY_SCREEN_IDS.filter(
    (id) => authorizeMemorialEdit(context, SCREEN_MUTATIONS[id]).decision === "DENY",
  );
}
