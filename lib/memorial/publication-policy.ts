import type { MessageType } from "@/config/messages";
import {
  resolveSectionRenderer,
  type RendererKey,
} from "@/config/memorial-section-renderers";
import type { SectionId } from "@/config/sections";
import { readGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import { A00_ANSWERS, A04_ANSWERS } from "@/lib/builder/guided-flow/human-steps";
import { inspectCeremony } from "@/lib/memorial/ceremony";
import { inspectDeathNotice } from "@/lib/memorial/death-notice";
import { deathNoticePreviewFingerprint } from "@/lib/builder/guided-flow/death-notice-step";
import { inspectGallery } from "@/lib/memorial/gallery-content";
import { inspectHero } from "@/lib/memorial/hero";
import { inspectLegacy } from "@/lib/memorial/legacy";
import { inspectLovedThings } from "@/lib/memorial/loved-things";
import { inspectPersonWords } from "@/lib/memorial/person-words";
import {
  ARCHIVABLE_SECTIONS,
  readHiddenSections,
} from "@/lib/memorial/section-visibility";
import { resolveSkinRuntime } from "@/lib/memorial/skin-runtime";
import { inspectTraditions } from "@/lib/memorial/traditions";
import type { GalleryContent, GalleryItem } from "@/types/gallery";
import type { MemorialContent } from "@/types/memorial";

/**
 * M1-B1 — pure publication policy, with no persistence and no UI.
 *
 * M1-A remains the only authority for the `avis | complet` right. This
 * module deliberately accepts an untrusted `unknown` value instead of
 * exporting another access-level type: the future server caller will pass
 * the access level it has re-read from M1-A's authoritative persistence,
 * and this boundary still rejects every other value at runtime.
 *
 * The private draft is never edited. The returned content is a new,
 * allow-listed public projection built through the repository's existing
 * content parsers. Unknown top-level keys and unknown nested keys therefore
 * cannot hitch a ride into a public snapshot.
 *
 * The commercial clocks (10-day free choice, 45-day preparation, 45-day
 * free publication, one free publication per verified address over 12
 * months, one active free draft) remain M1-A responsibilities. There is no
 * second clock or entitlement engine here.
 */

export const FREE_PUBLICATION_GALLERY_LIMIT = 6;

type ValidatedAccessLevel = "avis" | "complet";

/**
 * Renderers that are already valid for a public Memorial. The symbolic
 * offerings renderer is intentionally absent: its current contract is
 * Builder Preview only. Video, condolences, testimonials and memoryMessage
 * have no renderer at all and fail closed before this list is consulted.
 *
 * V1 rollback renderers stay accepted so a renderer-key rollback does not
 * accidentally make a previously operational section commercially absent.
 */
const PUBLIC_RENDERERS: ReadonlySet<RendererKey> = new Set([
  "HeroIntemporel",
  "DeathNoticeIntemporel",
  "DeathNoticeV2",
  "CeremonyIntemporel",
  "CeremonyV2",
  "RecitDeVieIntemporel",
  "RecitDeVieV2",
  "TraditionsV2",
  "GalleryIntemporel",
]);

const PREMIUM_SECTION_IDS: ReadonlySet<SectionId> = new Set([
  "testimonials",
  "video",
  "memoryMessage",
]);

const FREE_MESSAGE_TYPES: readonly MessageType[] = ["condolence"];
const COMPLETE_MESSAGE_TYPES: readonly MessageType[] = [
  "condolence",
  "memory_message",
  "testimonial",
];

export interface PublicationProjectionInput {
  /** Complete private source. It is read only and never returned by reference. */
  draft: MemorialContent;
  /** Untrusted at this boundary. A real publication must obtain it server-side. */
  accessLevel: unknown;
  /** Stored skin value, revalidated exactly like Memorial composition does. */
  skin: unknown;
  /** Ordered media ids explicitly chosen by the family for an `avis` gallery. */
  gallerySelection?: unknown;
}

export interface PublicationProjection {
  /** Allow-listed public content. Never the input object and never a mutation of it. */
  content: MemorialContent;
  /** Commercially allowed visitor-message categories, not a claim that their UI exists. */
  allowedMessageTypes: readonly MessageType[];
}

export type PublicationProjectionError =
  | { code: "unsupported_access_level" }
  | { code: "unsupported_skin" }
  | { code: "invalid_gallery" }
  | { code: "gallery_selection_required" }
  | { code: "invalid_gallery_selection" }
  | { code: "too_many_gallery_media"; maximum: number }
  | { code: "duplicate_gallery_media"; mediaId: string }
  | { code: "unknown_gallery_media"; mediaId: string }
  | { code: "invalid_section_content"; sectionId: SectionId };

export type PublicationProjectionResult =
  | { ok: true; projection: PublicationProjection }
  | { ok: false; error: PublicationProjectionError };

function validateAccessLevel(value: unknown): ValidatedAccessLevel | null {
  if (value === "avis" || value === "complet") return value;
  return null;
}

function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

function hasOwn(content: MemorialContent, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(content, key);
}

function isCommerciallyAllowed(sectionId: SectionId, accessLevel: ValidatedAccessLevel): boolean {
  return accessLevel === "complet" || !PREMIUM_SECTION_IDS.has(sectionId);
}

function isOperationalForPublication(sectionId: SectionId, skin: Parameters<typeof resolveSectionRenderer>[1]): boolean {
  const renderer = resolveSectionRenderer(sectionId, skin);
  return renderer !== null && PUBLIC_RENDERERS.has(renderer);
}

function sectionMayEnterSnapshot(
  sectionId: SectionId,
  accessLevel: ValidatedAccessLevel,
  skin: Parameters<typeof resolveSectionRenderer>[1],
  hidden: ReadonlySet<SectionId>,
): boolean {
  if (!isCommerciallyAllowed(sectionId, accessLevel)) return false;
  if (!isOperationalForPublication(sectionId, skin)) return false;
  return !hidden.has(sectionId) || ARCHIVABLE_SECTIONS.includes(sectionId);
}

type SelectionResult =
  | { ok: true; items: GalleryItem[] }
  | { ok: false; error: PublicationProjectionError };

function selectFreeGallery(gallery: GalleryContent, rawSelection: unknown): SelectionResult {
  if (rawSelection === undefined) {
    if (gallery.items.length > FREE_PUBLICATION_GALLERY_LIMIT) {
      return { ok: false, error: { code: "gallery_selection_required" } };
    }
    return { ok: true, items: cloneJsonValue(gallery.items) };
  }

  if (!Array.isArray(rawSelection) || !rawSelection.every((value) => typeof value === "string")) {
    return { ok: false, error: { code: "invalid_gallery_selection" } };
  }
  if (rawSelection.length > FREE_PUBLICATION_GALLERY_LIMIT) {
    return {
      ok: false,
      error: {
        code: "too_many_gallery_media",
        maximum: FREE_PUBLICATION_GALLERY_LIMIT,
      },
    };
  }
  if (gallery.items.length > FREE_PUBLICATION_GALLERY_LIMIT && rawSelection.length === 0) {
    return { ok: false, error: { code: "gallery_selection_required" } };
  }

  const seen = new Set<string>();
  for (const mediaId of rawSelection) {
    if (seen.has(mediaId)) {
      return { ok: false, error: { code: "duplicate_gallery_media", mediaId } };
    }
    seen.add(mediaId);
  }

  const byId = new Map(gallery.items.map((item) => [item.mediaId, item]));
  for (const mediaId of rawSelection) {
    if (!byId.has(mediaId)) {
      return { ok: false, error: { code: "unknown_gallery_media", mediaId } };
    }
  }

  // The selection array is the family's explicit publication order.
  return {
    ok: true,
    items: rawSelection.map((mediaId) => cloneJsonValue(byId.get(mediaId)!)),
  };
}

function addGuidedFlowProjection(draft: MemorialContent, target: Record<string, unknown>): void {
  const guidedFlow = readGuidedFlowState(draft);
  const sanitized: Record<string, { status: "completed" | "skipped"; answer?: string }> = {};

  for (const [stepId, record] of Object.entries(guidedFlow)) {
    if (record === undefined) continue;
    if (stepId === "A00") {
      if (
        record.answer !== undefined &&
        (A00_ANSWERS as readonly string[]).includes(record.answer) &&
        ((record.answer === "later" && record.status === "skipped") ||
          (record.answer !== "later" && record.status === "completed"))
      ) {
        sanitized[stepId] = { status: record.status, answer: record.answer };
      }
      continue;
    }
    if (stepId === "A04") {
      if (
        record.status === "completed" &&
        record.answer !== undefined &&
        (A04_ANSWERS as readonly string[]).includes(record.answer)
      ) {
        sanitized[stepId] = { status: record.status, answer: record.answer };
      }
      continue;
    }
    if (stepId === "A03") {
      if (
        record.status === "completed" &&
        record.answer === deathNoticePreviewFingerprint(draft)
      ) {
        sanitized[stepId] = { status: record.status, answer: record.answer };
      }
      continue;
    }

    // Every other current step stores progress only. An opaque `answer`
    // supplied under one of those known ids is not publication data.
    sanitized[stepId] = { status: record.status };
  }

  if (Object.keys(sanitized).length > 0) {
    target.guidedFlow = sanitized;
  }
}

function addPresentationProjection(
  hidden: ReadonlySet<SectionId>,
  accessLevel: ValidatedAccessLevel,
  skin: Parameters<typeof resolveSectionRenderer>[1],
  target: Record<string, unknown>,
): void {
  const hiddenSections = [...hidden].filter(
    (sectionId) =>
      isCommerciallyAllowed(sectionId, accessLevel) &&
      isOperationalForPublication(sectionId, skin),
  );
  if (hiddenSections.length > 0) target.presentation = { hiddenSections };
}

/**
 * Builds the deterministic public projection for one draft.
 *
 * This is deliberately not wired to `publishMemorial` or to a database
 * RPC. The future server transaction must re-read the access level, call
 * this policy, and atomically persist only `projection.content`.
 */
export function projectMemorialPublication(
  input: PublicationProjectionInput,
): PublicationProjectionResult {
  const accessLevel = validateAccessLevel(input.accessLevel);
  if (accessLevel === null) return { ok: false, error: { code: "unsupported_access_level" } };

  const skinResolution = resolveSkinRuntime(input.skin);
  if (skinResolution.status !== "resolved") {
    return { ok: false, error: { code: "unsupported_skin" } };
  }
  const skin = skinResolution.skin;
  const hidden = new Set(readHiddenSections(input.draft));
  const content: Record<string, unknown> = {};

  if (sectionMayEnterSnapshot("hero", accessLevel, skin, hidden) && hasOwn(input.draft, "hero")) {
    const hero = inspectHero(input.draft);
    if (hero.status === "corrupted") {
      return { ok: false, error: { code: "invalid_section_content", sectionId: "hero" } };
    }
    if (hero.status === "valid") content.hero = cloneJsonValue(hero.hero);
  }

  if (
    sectionMayEnterSnapshot("deathNotice", accessLevel, skin, hidden) &&
    hasOwn(input.draft, "deathNotice")
  ) {
    const deathNotice = inspectDeathNotice(input.draft);
    if (deathNotice.status === "corrupted") {
      return {
        ok: false,
        error: { code: "invalid_section_content", sectionId: "deathNotice" },
      };
    }
    if (deathNotice.status === "valid") {
      content.deathNotice = cloneJsonValue(deathNotice.deathNotice);
    }
  }

  if (sectionMayEnterSnapshot("ceremony", accessLevel, skin, hidden) && hasOwn(input.draft, "ceremony")) {
    const ceremony = inspectCeremony(input.draft);
    if (ceremony.status === "corrupted") {
      return { ok: false, error: { code: "invalid_section_content", sectionId: "ceremony" } };
    }
    if (ceremony.status === "valid") content.ceremony = cloneJsonValue(ceremony.ceremony);
  }

  if (
    sectionMayEnterSnapshot("traditions", accessLevel, skin, hidden) &&
    hasOwn(input.draft, "traditions")
  ) {
    const traditions = inspectTraditions(input.draft);
    if (traditions.status === "corrupted") {
      return {
        ok: false,
        error: { code: "invalid_section_content", sectionId: "traditions" },
      };
    }
    if (traditions.status === "valid") {
      content.traditions = cloneJsonValue(traditions.traditions);
    }
  }

  if (sectionMayEnterSnapshot("story", accessLevel, skin, hidden)) {
    const personWords = inspectPersonWords(input.draft);
    const lovedThings = inspectLovedThings(input.draft);
    const legacy = inspectLegacy(input.draft);
    if (
      personWords.status === "corrupted" ||
      lovedThings.status === "corrupted" ||
      legacy.status === "corrupted"
    ) {
      return { ok: false, error: { code: "invalid_section_content", sectionId: "story" } };
    }
    if (personWords.status === "valid") {
      content.personWords = cloneJsonValue(personWords.personWords);
    }
    if (lovedThings.status === "valid") {
      content.lovedThings = cloneJsonValue(lovedThings.lovedThings);
    }
    if (legacy.status === "valid") content.legacy = cloneJsonValue(legacy.legacy);
  }

  if (sectionMayEnterSnapshot("gallery", accessLevel, skin, hidden) && hasOwn(input.draft, "gallery")) {
    const gallery = inspectGallery(input.draft);
    if (gallery.status === "corrupted") {
      return { ok: false, error: { code: "invalid_gallery" } };
    }
    if (gallery.status === "valid") {
      if (accessLevel === "avis") {
        const selection = selectFreeGallery(gallery.gallery, input.gallerySelection);
        if (!selection.ok) return selection;
        content.gallery = { items: selection.items };
      } else {
        content.gallery = cloneJsonValue(gallery.gallery);
      }
    }
  }

  addGuidedFlowProjection(input.draft, content);
  addPresentationProjection(hidden, accessLevel, skin, content);

  return {
    ok: true,
    projection: {
      content: content as MemorialContent,
      allowedMessageTypes:
        accessLevel === "avis" ? [...FREE_MESSAGE_TYPES] : [...COMPLETE_MESSAGE_TYPES],
    },
  };
}
