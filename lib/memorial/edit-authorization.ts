import type { SectionId } from "@/config/sections";
import type { MemorialStatus } from "@/types/memorial";

/**
 * Security V1, lot 1 — the pure policy for family-facing memorial edits.
 *
 * This module does not authenticate a request and does not make any Server
 * Action safe by itself. A future adapter must resolve the actor and the
 * memorial facts on the server, compute the real diff against the stored
 * value, then submit every changed target here. An interface hidden in the
 * browser is never an authorization boundary.
 *
 * Targets deliberately name persisted business fields instead of granting a
 * whole `MemorialContent` object. Unknown kinds and targets fail closed. A
 * composite request is atomic from the policy's point of view: one refused
 * target refuses the complete request.
 */

export const MEMORIAL_CONTENT_EDIT_TARGETS = [
  "hero.displayName",
  "hero.birth",
  "hero.death",
  "hero.shortPhrase",
  "hero.photo.mediaId",
  "hero.photo.crop",
  "deathNotice.announcementText",
  "deathNotice.precisions.generalLocation",
  "deathNotice.precisions.familyMessage",
  "deathNotice.precisions.thought",
  "deathNotice.precisions.quote",
  "deathNotice.precisions.other",
  "ceremony.date",
  "ceremony.time",
  "ceremony.venueName",
  "ceremony.address",
  "ceremony.access",
  "ceremony.note",
  "ceremony.programme",
  "personWords.text",
  "lovedThings.text",
  "legacy.text",
  "traditions.entries",
  "gallery.items",
  "guidedFlow.T04",
  "guidedFlow.T05",
  "guidedFlow.T06",
  "guidedFlow.T07",
  "guidedFlow.T08",
  "guidedFlow.A00",
  "guidedFlow.A01",
  "guidedFlow.A02",
  "guidedFlow.A03",
  "guidedFlow.A04",
  "guidedFlow.A05",
  "guidedFlow.A06",
  "guidedFlow.A07",
  "guidedFlow.A08",
  "guidedFlow.A09",
  "guidedFlow.A10",
  "guidedFlow.A11",
  "guidedFlow.A12",
  "guidedFlow.A13",
  "guidedFlow.A14",
] as const;

export type MemorialContentEditTarget = (typeof MEMORIAL_CONTENT_EDIT_TARGETS)[number];

export const MEMORIAL_MEDIA_EDIT_TARGETS = [
  "hero.reserve",
  "hero.finalize",
  "hero.retire",
  "gallery.reserve",
  "gallery.finalize",
  "gallery.retire",
] as const;

export type MemorialMediaEditTarget = (typeof MEMORIAL_MEDIA_EDIT_TARGETS)[number];

export const MEMORIAL_CONFIGURATION_EDIT_TARGETS = ["language", "skinVariant"] as const;
export type MemorialConfigurationEditTarget = (typeof MEMORIAL_CONFIGURATION_EDIT_TARGETS)[number];

/** Hero is mandatory and Footer is not a section id. Every other current
 * section is visibility-only here: hiding it neither deletes nor unlocks its
 * content. The existing composition rules remain the final applicability
 * check when this policy is wired. */
export const MEMORIAL_VISIBILITY_EDIT_TARGETS = [
  "deathNotice",
  "story",
  "ceremony",
  "traditions",
  "gallery",
  "testimonials",
  "condolences",
  "video",
  "memoryMessage",
] as const satisfies readonly Exclude<SectionId, "hero">[];

export type MemorialVisibilityEditTarget = (typeof MEMORIAL_VISIBILITY_EDIT_TARGETS)[number];

export type MemorialEditActorKind = "owner" | "administrator" | "system" | "unknown";
export type CeremonyEditLock = "open" | "closed" | "unknown";

/** Runtime-shaped on purpose: the future diff adapter will be crossing a
 * security boundary, so the policy must be able to refuse strings the TypeScript
 * union did not predict. */
export interface MemorialMutationClaim {
  kind: string;
  target: string;
}

export interface MemorialEditContext {
  /** Must be resolved from the validated server session, never a client value. */
  actor: MemorialEditActorKind;
  status: MemorialStatus;
  /** The persisted `memorials.first_published_at`, represented only by its
   * security-relevant fact in this pure layer. */
  firstPublicationExists: boolean;
  locks: {
    /** No ceremony schema is invented in lot 1. `unknown` fails closed after
     * publication until a future server adapter supplies a durable fact. */
    ceremony: CeremonyEditLock;
  };
}

export type MemorialEditAllowReason =
  | "pre_publication_edit"
  | "post_publication_content_edit"
  | "post_publication_gallery_media_edit"
  | "section_visibility_edit"
  | "all_mutations_allowed";

export type MemorialEditDenyReason =
  | "no_mutation"
  | "actor_unknown"
  | "administrator_explicit_authorization_required"
  | "system_explicit_authorization_required"
  | "archived_restricted"
  | "inconsistent_publication_state"
  | "unknown_mutation_kind"
  | "unknown_mutation_target"
  | "hero_locked_after_publication"
  | "ceremony_closed"
  | "ceremony_lock_unknown"
  | "death_notice_presence_after_publication_unresolved"
  | "language_after_publication_unresolved"
  | "contribution_policy_is_separate";

export type MemorialEditDecision =
  | { decision: "ALLOW"; reason: MemorialEditAllowReason }
  | {
      decision: "DENY";
      reason: MemorialEditDenyReason;
      /** Index and value are returned only for a refused composite request. */
      mutationIndex?: number;
      mutation?: MemorialMutationClaim;
    };

type ContentDomain = "hero" | "deathNotice" | "deathNoticePresence" | "ceremony" | "story" | "traditions" | "gallery";

const CONTENT_DOMAIN: Readonly<Record<MemorialContentEditTarget, ContentDomain>> = {
  "hero.displayName": "hero",
  "hero.birth": "hero",
  "hero.death": "hero",
  "hero.shortPhrase": "hero",
  "hero.photo.mediaId": "hero",
  "hero.photo.crop": "hero",
  "deathNotice.announcementText": "deathNotice",
  "deathNotice.precisions.generalLocation": "deathNotice",
  "deathNotice.precisions.familyMessage": "deathNotice",
  "deathNotice.precisions.thought": "deathNotice",
  "deathNotice.precisions.quote": "deathNotice",
  "deathNotice.precisions.other": "deathNotice",
  "ceremony.date": "ceremony",
  "ceremony.time": "ceremony",
  "ceremony.venueName": "ceremony",
  "ceremony.address": "ceremony",
  "ceremony.access": "ceremony",
  "ceremony.note": "ceremony",
  "ceremony.programme": "ceremony",
  "personWords.text": "story",
  "lovedThings.text": "story",
  "legacy.text": "story",
  "traditions.entries": "traditions",
  "gallery.items": "gallery",
  "guidedFlow.T04": "hero",
  "guidedFlow.T05": "hero",
  "guidedFlow.T06": "hero",
  "guidedFlow.T07": "hero",
  "guidedFlow.T08": "hero",
  "guidedFlow.A00": "deathNoticePresence",
  "guidedFlow.A01": "deathNotice",
  "guidedFlow.A02": "deathNotice",
  "guidedFlow.A03": "deathNotice",
  "guidedFlow.A04": "ceremony",
  "guidedFlow.A05": "ceremony",
  "guidedFlow.A06": "ceremony",
  "guidedFlow.A07": "ceremony",
  "guidedFlow.A08": "ceremony",
  "guidedFlow.A09": "traditions",
  "guidedFlow.A10": "story",
  "guidedFlow.A11": "story",
  "guidedFlow.A12": "story",
  "guidedFlow.A13": "gallery",
  "guidedFlow.A14": "ceremony",
};

const contentTargets = new Set<string>(MEMORIAL_CONTENT_EDIT_TARGETS);
const mediaTargets = new Set<string>(MEMORIAL_MEDIA_EDIT_TARGETS);
const configurationTargets = new Set<string>(MEMORIAL_CONFIGURATION_EDIT_TARGETS);
const visibilityTargets = new Set<string>(MEMORIAL_VISIBILITY_EDIT_TARGETS);

function deny(reason: MemorialEditDenyReason): MemorialEditDecision {
  return { decision: "DENY", reason };
}

function allow(reason: MemorialEditAllowReason): MemorialEditDecision {
  return { decision: "ALLOW", reason };
}

function publicationPhase(context: MemorialEditContext): "before" | "after" | "invalid" {
  if (context.status === "draft" || context.status === "ready") {
    return context.firstPublicationExists ? "invalid" : "before";
  }
  if (context.status === "published" || context.status === "editing") {
    return context.firstPublicationExists ? "after" : "invalid";
  }
  return "after";
}

function decideKnownMutation(
  context: MemorialEditContext,
  phase: "before" | "after",
  mutation: MemorialMutationClaim,
): MemorialEditDecision {
  if (mutation.kind === "visibility") {
    if (!visibilityTargets.has(mutation.target)) return deny("unknown_mutation_target");
    return allow(phase === "before" ? "pre_publication_edit" : "section_visibility_edit");
  }

  if (mutation.kind === "configuration") {
    if (!configurationTargets.has(mutation.target)) return deny("unknown_mutation_target");
    if (phase === "before") return allow("pre_publication_edit");
    return deny(mutation.target === "language" ? "language_after_publication_unresolved" : "hero_locked_after_publication");
  }

  if (mutation.kind === "media") {
    if (!mediaTargets.has(mutation.target)) return deny("unknown_mutation_target");
    if (phase === "before") return allow("pre_publication_edit");
    return mutation.target.startsWith("gallery.")
      ? allow("post_publication_gallery_media_edit")
      : deny("hero_locked_after_publication");
  }

  if (mutation.kind === "contribution") {
    // Contributions keep their existing, separate visitor/moderation policy.
    // This family-edit policy must neither grant nor revoke those rights.
    return deny("contribution_policy_is_separate");
  }

  if (mutation.kind !== "content") return deny("unknown_mutation_kind");
  if (!contentTargets.has(mutation.target)) return deny("unknown_mutation_target");
  if (phase === "before") return allow("pre_publication_edit");

  const domain = CONTENT_DOMAIN[mutation.target as MemorialContentEditTarget];
  if (domain === "hero") return deny("hero_locked_after_publication");
  if (domain === "deathNoticePresence") return deny("death_notice_presence_after_publication_unresolved");
  if (domain === "ceremony") {
    if (context.locks.ceremony === "closed") return deny("ceremony_closed");
    if (context.locks.ceremony === "unknown") return deny("ceremony_lock_unknown");
  }
  return allow("post_publication_content_edit");
}

/**
 * Decides one or more changes as one request. No partial authorization:
 * callers must reject the entire write when this returns `DENY`.
 */
export function authorizeMemorialEdit(
  context: MemorialEditContext,
  mutations: readonly MemorialMutationClaim[],
): MemorialEditDecision {
  if (mutations.length === 0) return deny("no_mutation");
  if (context.actor === "administrator") return deny("administrator_explicit_authorization_required");
  if (context.actor === "system") return deny("system_explicit_authorization_required");
  if (context.actor !== "owner") return deny("actor_unknown");
  if (context.status === "archived") return deny("archived_restricted");

  const phase = publicationPhase(context);
  if (phase === "invalid") return deny("inconsistent_publication_state");

  const allowedReasons: MemorialEditAllowReason[] = [];
  for (const [mutationIndex, mutation] of mutations.entries()) {
    const decision = decideKnownMutation(context, phase, mutation);
    if (decision.decision === "DENY") {
      return { ...decision, mutationIndex, mutation };
    }
    allowedReasons.push(decision.reason);
  }

  return allowedReasons.length === 1 ? allow(allowedReasons[0]!) : allow("all_mutations_allowed");
}
