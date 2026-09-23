import type { EditorialContext } from "@/config/memorial";
import type { SectionId } from "@/config/sections";
import type { Skin, SkinVariant } from "@/config/skins";
import { MEMORIAL_SECTION_ORDER } from "@/config/memorial-section-order";
import { resolveSectionRenderer, type RendererKey } from "@/config/memorial-section-renderers";
import type { MemorialContent } from "@/types/memorial";
import {
  isSectionApplicable,
  resolveSectionSelectionStatus,
  type SectionSelectionStatus,
} from "@/lib/memorial/section-selection";
import { resolveSkinRuntime } from "@/lib/memorial/skin-runtime";
import { inspectDeathNotice } from "@/lib/memorial/death-notice";
import { inspectTraditions } from "@/lib/memorial/traditions";
import { inspectPersonWords } from "@/lib/memorial/person-words";
import { inspectLovedThings } from "@/lib/memorial/loved-things";
import { inspectLegacy } from "@/lib/memorial/legacy";
import { readHero } from "@/lib/memorial/hero";
import { isPageEComplete, resolveHeroFlowState } from "@/lib/builder/guided-flow/hero-step";
import { isA03Complete } from "@/lib/builder/guided-flow/death-notice-step";
import {
  isA04Complete,
  needsA04,
  needsA05,
  needsA06,
  needsA07,
  needsA08,
} from "@/lib/builder/guided-flow/ceremony-step";
import { isA09Resolved } from "@/lib/builder/guided-flow/traditions-step";
import { isPersonSheetResolved } from "@/lib/builder/guided-flow/person-sheet-step";

/**
 * Fondation Memorial assemblé — the pure composition model.
 *
 * Answers ONE question for a memorial: "which sections compose it right
 * now, in which order, with which selection status, are they ready to be
 * shown, and which renderer is expected?" It renders nothing: no React,
 * no Next, no Supabase, no I/O. The future Preview (and, later,
 * publication) consume this structure; neither exists as a dependency
 * here.
 *
 * ## One relevance logic — Mission 027's
 *
 * Whether a section is relevant/applicable is decided ONLY by
 * `resolveSectionSelectionStatus` (lib/memorial/section-selection.ts) —
 * Hero structural, context filtering, Ceremony through A04 are never
 * re-implemented here. This module's only contribution to that decision
 * is finally computing the generic `explicitContentSectionIds` signal
 * Mission 027 left for "a future caller that holds the content"
 * (`resolveExplicitContentSectionIds` below). No skin, no offer is ever
 * handed to section-selection.
 *
 * ## One source of progress — the content
 *
 * The Guided Flow state is recomputed from `content` itself
 * (`resolveHeroFlowState`, exactly as the Builder route and
 * `isPreviewUnlocked` derive it), never taken as a separate input that
 * could disagree with the content.
 *
 * ## Readiness — a matter joins the Memorial once its block is finished
 *
 * `SECTION_READINESS` holds one explicit rule per section, built only
 * from the Guided Flow's own existing predicates. A section without a
 * rule is never ready (fail closed); a future section (A13 Galerie, …)
 * adds its own rule here. A section is never shown on the mere presence
 * of accidental or partial data: it must satisfy its readiness rule.
 *
 * QG decision (Récit de vie entièrement vide): once the family has
 * resolved the A10–A12 sheet, the Récit is ready EVEN IF all three of the
 * family's own matters are empty — `RecitDeVieIntemporel` then shows its
 * validated HERITAGE fallbacks, which are part of that renderer's
 * editorial contract. An unresolved sheet is never shown.
 *
 * ## Out of scope, deliberately
 *
 * `memorials.enabled_sections` (legacy) is neither read nor written —
 * it still serves the legacy Builder shell and the messages RLS; its
 * reconciliation with this computed selection belongs to publication.
 */

export type SectionCompositionState =
  /** Section-selection says the section has no place here. */
  | "notRelevant"
  /** Exists for this context (`recommended`/`optionalAvailable`) but has
   * no real matter yet. */
  | "optional"
  /** Applicable, but its block is not finished yet. */
  | "pending"
  /** Applicable and ready, but no validated renderer for this skin. */
  | "noRenderer"
  /** Applicable, ready, and a renderer exists. */
  | "renderable";

export interface ComposedSection {
  sectionId: SectionId;
  /** Mission 027's raw status, copied verbatim. */
  selection: SectionSelectionStatus;
  ready: boolean;
  rendererKey: RendererKey | null;
  state: SectionCompositionState;
}

export interface MemorialCompositionInput {
  /** Non-null: the caller narrows it (a memorial past T02). */
  editorialContext: EditorialContext;
  /** `memorials.skin_id` as read from the database — re-validated here,
   * never trusted as a bare TS type crossing that boundary. */
  skin: unknown;
  skinVariant: SkinVariant;
  /** The draft content today; a published snapshot's content later. */
  content: MemorialContent;
  /** Test seam only. Defaults to `MEMORIAL_SECTION_ORDER`. */
  order?: readonly SectionId[];
}

export interface MemorialComposition {
  editorialContext: EditorialContext;
  /** `null` when the stored skin is not a known skin — every section is
   * then `noRenderer` at best (fail closed). */
  skin: Skin | null;
  skinVariant: SkinVariant;
  /** Every section of the order, in order. */
  sections: ComposedSection[];
  /** The ordered subset whose state is `renderable`. */
  renderable: SectionId[];
}

type ReadinessRule = (content: MemorialContent) => boolean;

/**
 * "Prête à être montrée" — one rule per section, existing predicates
 * only.
 *
 * - hero: T08 completed (`isPageEComplete` also re-checks the stored
 *   Hero is readable and complete, so a corrupted Hero is never ready).
 * - deathNotice: A03 verified for the CURRENT content (`isA03Complete`
 *   compares its fingerprint): editing A01/A02 after A03 takes the
 *   section back to `pending` until re-verified.
 * - ceremony: A04 answered AND A05–A08 resolved. `!needsA04` is required
 *   as well as `isA04Complete`: `needsA04` is also true on a corrupted
 *   Ceremony, and each `needsA0x` returns `false` BEFORE its step is
 *   reachable — so `!needsA05…A08` alone would read "resolved" too early.
 *   (Whether the section applies at all is A04 = "yes", decided by
 *   section-selection, not here.)
 * - story: the A10–A12 sheet resolved (QG decision above).
 * - traditions: A09 resolved — it will surface as `noRenderer` until a
 *   renderer exists.
 */
export const SECTION_READINESS: Readonly<Partial<Record<SectionId, ReadinessRule>>> = {
  hero: isPageEComplete,
  deathNotice: isA03Complete,
  ceremony: (content) =>
    isA04Complete(content) &&
    !needsA04(content) &&
    !needsA05(content) &&
    !needsA06(content) &&
    !needsA07(content) &&
    !needsA08(content),
  story: isPersonSheetResolved,
  traditions: isA09Resolved,
};

function hasText(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

/**
 * Mission 027's generic "this section now has real matter" signal,
 * computed from content through the existing fail-safe readers. A
 * corrupted matter never counts (fail closed).
 *
 * - deathNotice: the announcement text exists.
 * - traditions: at least one confirmed entry.
 * - story: none of the three matters is corrupted, AND either the family
 *   wrote at least one of them or the sheet has been resolved (QG
 *   decision: a resolved, entirely empty sheet is still the Récit's
 *   matter — rendered with HERITAGE fallbacks).
 * - ceremony is not listed: A04 decides it inside section-selection,
 *   before this signal is ever consulted. hero is structural.
 */
export function resolveExplicitContentSectionIds(content: MemorialContent): SectionId[] {
  const ids: SectionId[] = [];

  const deathNotice = inspectDeathNotice(content);
  if (deathNotice.status === "valid" && hasText(deathNotice.deathNotice.announcementText)) {
    ids.push("deathNotice");
  }

  const traditions = inspectTraditions(content);
  if (traditions.status === "valid" && traditions.traditions.entries.length > 0) {
    ids.push("traditions");
  }

  const personWords = inspectPersonWords(content);
  const lovedThings = inspectLovedThings(content);
  const legacy = inspectLegacy(content);
  if (personWords.status !== "corrupted" && lovedThings.status !== "corrupted" && legacy.status !== "corrupted") {
    const familyWrote =
      hasText(personWords.personWords.text) || hasText(lovedThings.lovedThings.text) || hasText(legacy.legacy.text);
    if (familyWrote || isPersonSheetResolved(content)) ids.push("story");
  }

  return ids;
}

function compositionState(selection: SectionSelectionStatus, ready: boolean, rendererKey: RendererKey | null): SectionCompositionState {
  if (selection === "notRelevant") return "notRelevant";
  if (!isSectionApplicable(selection)) return "optional";
  if (!ready) return "pending";
  return rendererKey === null ? "noRenderer" : "renderable";
}

/** The composition of one memorial. Total: never throws on any
 * `content`, and never mutates its input. */
export function composeMemorial(input: MemorialCompositionInput): MemorialComposition {
  const { editorialContext, skinVariant, content } = input;
  const order = input.order ?? MEMORIAL_SECTION_ORDER[editorialContext];

  const skinResolution = resolveSkinRuntime(input.skin);
  const skin = skinResolution.status === "resolved" ? skinResolution.skin : null;

  const flowState = resolveHeroFlowState(content, readHero(content));
  const explicitContentSectionIds = resolveExplicitContentSectionIds(content);

  const sections = order.map((sectionId): ComposedSection => {
    const selection = resolveSectionSelectionStatus(sectionId, {
      editorialContext,
      flowState,
      explicitContentSectionIds,
    });
    const rule = SECTION_READINESS[sectionId];
    const ready = rule !== undefined && rule(content);
    const rendererKey = resolveSectionRenderer(sectionId, skin);
    return { sectionId, selection, ready, rendererKey, state: compositionState(selection, ready, rendererKey) };
  });

  return {
    editorialContext,
    skin,
    skinVariant,
    sections,
    renderable: sections.filter((section) => section.state === "renderable").map((section) => section.sectionId),
  };
}
