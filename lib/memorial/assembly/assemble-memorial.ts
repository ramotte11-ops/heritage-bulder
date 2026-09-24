import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SectionId } from "@/config/sections";
import type { Skin, SkinVariant } from "@/config/skins";
import type { RendererKey } from "@/config/memorial-section-renderers";
import {
  composeMemorial,
  type MemorialComposition,
  type MemorialCompositionInput,
} from "@/lib/memorial/composition/compose-memorial";
import type { MediaResolver } from "./media-resolver";
import {
  RENDERER_ADAPTERS,
  type AdapterContext,
  type AdapterResult,
  type AssembledSection,
  type AssemblyFailureReason,
  type RendererAdapter,
} from "./renderer-adapters";

/**
 * Étape 2 — Assembleur du Memorial.
 *
 * The one mechanism that turns a memorial's content into the real,
 * assembled Memorial: which real renderers, in which order, with which
 * props. The same assembly serves the Preview (the Memorial being
 * created) and, later, publication (that same Memorial made public) —
 * never a second rendering system, never a fake Preview.
 *
 * ## Consumes `composeMemorial`, never re-decides it
 *
 * `composeMemorial` is called HERE, on the very `content` being
 * assembled — the assembler never accepts a composition computed
 * elsewhere, which could be stale or come from other content. Only
 * sections the composition marks `renderable` are assembled, in
 * `composition.renderable` order, with the `rendererKey` the
 * composition resolved (never re-resolved, never another skin).
 * `pending`, `optional`, `noRenderer` and `notRelevant` never render.
 *
 * ## Pure except for the injected media resolver
 *
 * No React, no Next, no Supabase. The only I/O is `deps.resolveMedia`,
 * supplied by the caller (./media-resolver.ts): the assembler has no
 * notion of Preview vs. publication, of the actor, or of the memorial id.
 *
 * ## Fail closed (QG D1)
 *
 * - A non-Hero section whose adapter refuses is omitted and recorded in
 *   `failures` — no placeholder, no false content, no other skin.
 * - The Hero is structural and mandatory: when it is not assembled —
 *   its adapter refused, or it is not `renderable` at all — the whole
 *   Memorial is `unavailable` and NO section is returned.
 *
 * Total, like `composeMemorial`: never throws (a throwing adapter or
 * resolver is a failure, not an exception) and never mutates its input.
 */

export interface AssembleMemorialInput extends MemorialCompositionInput {
  /** The memorial's language — narrowed non-null by the caller. */
  language: Language;
}

export interface AssembleMemorialDeps {
  resolveMedia: MediaResolver;
}

export interface AssemblyFailure {
  sectionId: SectionId;
  rendererKey: RendererKey | null;
  reason: AssemblyFailureReason;
}

export interface AssembledMemorial {
  /** `"assembled"` only when the Hero was assembled (QG D1). */
  status: "assembled" | "unavailable";
  /** The composition this assembly was built from, as is. */
  composition: MemorialComposition;
  editorialContext: EditorialContext;
  skin: Skin | null;
  skinVariant: SkinVariant;
  language: Language;
  /** In composition order. Always empty when `unavailable`. */
  sections: AssembledSection[];
  /** Renderable sections that could not be assembled, in order. */
  failures: AssemblyFailure[];
}

/** The section every assembled Memorial must carry (QG D1). */
export const STRUCTURAL_SECTION_ID: SectionId = "hero";

async function runAdapter<K extends RendererKey>(
  adapter: RendererAdapter<K> | undefined,
  context: AdapterContext,
): Promise<AdapterResult<K>> {
  if (adapter === undefined) return { ok: false, reason: "noAdapter" };
  try {
    return await adapter(context);
  } catch {
    return { ok: false, reason: "adapterError" };
  }
}

export async function assembleMemorial(
  input: AssembleMemorialInput,
  deps: AssembleMemorialDeps,
): Promise<AssembledMemorial> {
  const { language, ...compositionInput } = input;
  const composition = composeMemorial(compositionInput);

  const context: AdapterContext = {
    content: input.content,
    editorialContext: composition.editorialContext,
    skin: composition.skin,
    skinVariant: composition.skinVariant,
    language,
    resolveMedia: deps.resolveMedia,
  };

  const sections: AssembledSection[] = [];
  const failures: AssemblyFailure[] = [];

  for (const composed of composition.sections) {
    if (composed.state !== "renderable") continue;

    const rendererKey = composed.rendererKey;
    if (rendererKey === null) {
      failures.push({ sectionId: composed.sectionId, rendererKey, reason: "noAdapter" });
      continue;
    }

    const adapter = RENDERER_ADAPTERS[rendererKey] as RendererAdapter<typeof rendererKey> | undefined;
    const result = await runAdapter(adapter, context);
    if (result.ok) {
      sections.push({ sectionId: composed.sectionId, rendererKey, props: result.props } as AssembledSection);
    } else {
      failures.push({ sectionId: composed.sectionId, rendererKey, reason: result.reason });
    }
  }

  const heroAssembled = sections.some((section) => section.sectionId === STRUCTURAL_SECTION_ID);

  return {
    status: heroAssembled ? "assembled" : "unavailable",
    composition,
    editorialContext: composition.editorialContext,
    skin: composition.skin,
    skinVariant: composition.skinVariant,
    language,
    sections: heroAssembled ? sections : [],
    failures,
  };
}
